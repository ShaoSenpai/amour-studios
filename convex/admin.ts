import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================================================
// Amour Studios — Admin queries & mutations
// ============================================================================

/**
 * Retourne TOUS les users (admins inclus) avec état onboarding + purchase.
 */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Non authentifié");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin uniquement");

    const users = await ctx.db.query("users").collect();

    const members = await Promise.all(
      users
        .filter((u) => !u.deletedAt)
        .map(async (user) => {
          const onboarding = await ctx.db
            .query("onboardingNotes")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .first();

          const purchase = user.purchaseId
            ? await ctx.db.get(user.purchaseId)
            : null;

          return {
            ...user,
            onboarding,
            purchase,
          };
        })
    );

    return members;
  },
});

/**
 * Changer le rôle d'un user (admin ↔ member).
 */
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { userId, role }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { role });
  },
});

/**
 * Soft-delete un user (le désactive sans supprimer les données).
 */
export const removeMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: adminId } = await requireAdmin(ctx);
    if (userId === adminId) throw new Error("Tu ne peux pas te supprimer toi-même");
    await ctx.db.patch(userId, { deletedAt: Date.now() });
  },
});

/**
 * Réactiver un user soft-deleted.
 */
export const restoreMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { deletedAt: undefined });
  },
});

/**
 * Lier manuellement un purchase à un user (si les emails ne matchent pas).
 */
export const linkPurchase = mutation({
  args: {
    userId: v.id("users"),
    purchaseId: v.id("purchases"),
  },
  handler: async (ctx, { userId, purchaseId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { purchaseId });
    await ctx.db.patch(purchaseId, { userId });
  },
});

/**
 * Offrir / ajouter un accès à un membre.
 * Mode "email" : match par email (pré-user, se liera au prochain login Discord).
 * Mode "discordId" : match par Discord ID (user déjà loggué sur le serveur).
 * Trace qui offre, pourquoi, et la durée optionnelle.
 */
export const addMember = mutation({
  args: {
    mode: v.union(v.literal("email"), v.literal("discordId")),
    email: v.optional(v.string()),
    discordId: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
    reason: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { mode, email, discordId, name, role, reason, expiresAt }) => {
    const { userId: adminUserId } = await requireAdmin(ctx);
    const now = Date.now();

    const trimmedEmail = email?.trim().toLowerCase();
    const trimmedDiscordId = discordId?.trim();

    if (mode === "email" && !trimmedEmail) throw new Error("Email requis");
    if (mode === "discordId" && !trimmedDiscordId) throw new Error("Discord ID requis");

    // Match user existant par mode choisi
    const existing =
      mode === "email"
        ? await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("email"), trimmedEmail))
            .first()
        : await ctx.db
            .query("users")
            .withIndex("by_discord", (q) => q.eq("discordId", trimmedDiscordId!))
            .first();

    const buildPurchasePayload = (targetUserId?: Id<"users">) => ({
      email: trimmedEmail ?? existing?.email ?? "",
      stripeSessionId: `manual_${now}`,
      stripePaymentIntentId: `manual_${now}`,
      amount: 0,
      currency: "eur",
      status: "paid" as const,
      createdAt: now,
      paidAt: now,
      source: "gift" as const,
      grantedByUserId: adminUserId,
      grantReason: reason?.trim() || undefined,
      expiresAt,
      ...(targetUserId ? { userId: targetUserId } : {}),
    });

    // User existant (actif ou soft-deleted) → upgrade/restaure
    if (existing) {
      let purchaseId = existing.purchaseId;
      if (!purchaseId) {
        purchaseId = await ctx.db.insert("purchases", buildPurchasePayload(existing._id));
      }
      await ctx.db.patch(existing._id, {
        ...(existing.deletedAt ? { deletedAt: undefined } : {}),
        role,
        name: name?.trim() || existing.name,
        purchaseId,
        lastActiveAt: now,
      });
      return existing._id;
    }

    // Pas d'user existant → créer pré-user + purchase offert
    const purchaseId = await ctx.db.insert("purchases", buildPurchasePayload());

    const userId = await ctx.db.insert("users", {
      email: trimmedEmail,
      discordId: trimmedDiscordId,
      name: name?.trim() || undefined,
      role,
      purchaseId,
      xp: 0,
      streakDays: 0,
      lastActiveAt: now,
      createdAt: now,
    });

    await ctx.db.patch(purchaseId, { userId });
    return userId;
  },
});

/**
 * Révoquer l'accès VIP d'un user (sans le supprimer).
 * Marque le purchase comme revoked et dé-link du user.
 */
export const revokeAccess = mutation({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { userId, reason }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User introuvable");
    if (!user.purchaseId) throw new Error("Aucun accès à révoquer");

    const now = Date.now();
    await ctx.db.patch(user.purchaseId, {
      revokedAt: now,
      revokedReason: reason?.trim() || undefined,
      status: "refunded",
    });
    await ctx.db.patch(userId, { purchaseId: undefined });
  },
});

// ============================================================================
// Cockpit admin — stats, activity, watchlist, broadcast
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stats globales du cockpit : membres, nouveaux 7j, actifs 7j, complétion.
 */
export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();

    const users = await ctx.db.query("users").collect();
    const active = users.filter((u) => !u.deletedAt);
    const vip = active.filter((u) => !!u.purchaseId);
    const pending = active.filter((u) => !u.purchaseId);

    const createdSince7d = active.filter(
      (u) => (u.createdAt ?? 0) > now - 7 * DAY_MS
    ).length;
    const createdBetween7and14 = active.filter(
      (u) =>
        (u.createdAt ?? 0) > now - 14 * DAY_MS &&
        (u.createdAt ?? 0) <= now - 7 * DAY_MS
    ).length;

    const activeSince7d = active.filter(
      (u) => (u.lastActiveAt ?? 0) > now - 7 * DAY_MS
    ).length;
    const activeSince30d = active.filter(
      (u) => (u.lastActiveAt ?? 0) > now - 30 * DAY_MS
    ).length;

    // Complétion moyenne : XP total / (lessons total × 100 XP)
    const lessons = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const progress = await ctx.db.query("progress").collect();
    const completedByUser = new Map<string, number>();
    for (const p of progress) {
      if (p.lessonCompletedAt) {
        completedByUser.set(
          p.userId,
          (completedByUser.get(p.userId) ?? 0) + 1
        );
      }
    }
    const completionRates = vip.map((u) =>
      lessons.length > 0 ? (completedByUser.get(u._id) ?? 0) / lessons.length : 0
    );
    const avgCompletion = completionRates.length
      ? completionRates.reduce((a, b) => a + b, 0) / completionRates.length
      : 0;

    return {
      totalMembers: active.length,
      vipCount: vip.length,
      pendingCount: pending.length,
      new7d: createdSince7d,
      newPrev7d: createdBetween7and14,
      active7d: activeSince7d,
      active30d: activeSince30d,
      avgCompletionPercent: Math.round(avgCompletion * 100),
      totalLessons: lessons.length,
    };
  },
});

/**
 * Derniers events (paiements, onboardings, leçons complétées, badges, commentaires).
 * Agrège ~15 items récents tous types confondus.
 */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    await requireAdmin(ctx);

    const since = Date.now() - 30 * DAY_MS;

    const [purchases, progress, badges, comments, users] = await Promise.all([
      ctx.db.query("purchases").order("desc").take(50),
      ctx.db.query("progress").order("desc").take(100),
      ctx.db.query("badges").order("desc").take(50),
      ctx.db
        .query("comments")
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .order("desc")
        .take(50),
      ctx.db.query("users").collect(),
    ]);

    const userMap = new Map(users.map((u) => [u._id, u]));

    const events: {
      type: "payment" | "lesson_completed" | "badge" | "comment" | "new_member";
      at: number;
      userId?: string;
      userName?: string;
      label: string;
    }[] = [];

    for (const p of purchases) {
      if (p.status === "paid" && (p.paidAt ?? p.createdAt) > since) {
        const u = p.userId ? userMap.get(p.userId) : undefined;
        events.push({
          type: "payment",
          at: p.paidAt ?? p.createdAt,
          userId: p.userId,
          userName: u?.name ?? p.email,
          label: `Paiement validé — ${p.amount / 100}€`,
        });
      }
    }

    for (const pr of progress) {
      if (pr.lessonCompletedAt && pr.lessonCompletedAt > since) {
        const u = userMap.get(pr.userId);
        const lesson = await ctx.db.get(pr.lessonId);
        events.push({
          type: "lesson_completed",
          at: pr.lessonCompletedAt,
          userId: pr.userId,
          userName: u?.name ?? "—",
          label: `Leçon complétée — ${lesson?.title ?? ""}`,
        });
      }
    }

    for (const b of badges) {
      if (b.unlockedAt > since) {
        const u = userMap.get(b.userId);
        events.push({
          type: "badge",
          at: b.unlockedAt,
          userId: b.userId,
          userName: u?.name ?? "—",
          label: `Badge débloqué — ${b.label}`,
        });
      }
    }

    for (const c of comments) {
      if (c.createdAt > since) {
        const u = userMap.get(c.userId);
        events.push({
          type: "comment",
          at: c.createdAt,
          userId: c.userId,
          userName: u?.name ?? "—",
          label: `Commentaire : « ${c.content.slice(0, 60)}${c.content.length > 60 ? "…" : ""} »`,
        });
      }
    }

    for (const u of users) {
      if ((u.createdAt ?? 0) > since && !u.deletedAt) {
        events.push({
          type: "new_member",
          at: u.createdAt ?? 0,
          userId: u._id,
          userName: u.name ?? u.email ?? "—",
          label: `Nouveau membre`,
        });
      }
    }

    return events.sort((a, b) => b.at - a.at).slice(0, limit);
  },
});

/**
 * Liste des membres "à surveiller" : inactifs longtemps, sans Discord, etc.
 */
export const watchlist = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const active = users.filter((u) => !u.deletedAt);

    const inactive14 = active.filter(
      (u) =>
        !!u.purchaseId &&
        (u.lastActiveAt ?? 0) < now - 14 * DAY_MS &&
        (u.lastActiveAt ?? 0) > 0
    );
    const neverActive = active.filter(
      (u) => !!u.purchaseId && !u.lastActiveAt
    );
    const noOnboarding = active.filter(
      (u) => !!u.purchaseId && !u.onboardingCompletedAt
    );
    const vipNoDiscord = active.filter(
      (u) => !!u.purchaseId && !u.discordId
    );

    const lessons = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const progress = await ctx.db.query("progress").collect();
    const completedByUser = new Map<string, number>();
    for (const p of progress) {
      if (p.lessonCompletedAt) {
        completedByUser.set(
          p.userId,
          (completedByUser.get(p.userId) ?? 0) + 1
        );
      }
    }

    const formatUser = (u: (typeof active)[number]) => ({
      _id: u._id,
      name: u.name ?? u.email ?? "—",
      email: u.email,
      lastActiveAt: u.lastActiveAt,
      completed: completedByUser.get(u._id) ?? 0,
      totalLessons: lessons.length,
      discordUsername: u.discordUsername,
    });

    return {
      inactive14: inactive14.map(formatUser),
      neverActive: neverActive.map(formatUser),
      noOnboarding: noOnboarding.map(formatUser),
      vipNoDiscord: vipNoDiscord.map(formatUser),
    };
  },
});

/**
 * Broadcast notification in-app à un segment de membres.
 * Insert un notification row par destinataire.
 */
export const broadcastNotification = mutation({
  args: {
    scope: v.union(v.literal("all"), v.literal("vip"), v.literal("pending")),
    message: v.string(),
  },
  handler: async (ctx, { scope, message }) => {
    await requireAdmin(ctx);
    const msg = message.trim();
    if (!msg) throw new Error("Message vide");

    const users = await ctx.db.query("users").collect();
    const targets = users.filter((u) => {
      if (u.deletedAt) return false;
      if (scope === "all") return true;
      if (scope === "vip") return !!u.purchaseId;
      if (scope === "pending") return !u.purchaseId;
      return false;
    });

    const now = Date.now();
    for (const u of targets) {
      await ctx.db.insert("notifications", {
        userId: u._id,
        type: "new_content",
        message: msg,
        read: false,
        createdAt: now,
      });
    }

    return { sent: targets.length };
  },
});

/**
 * Vue aplatie de tout le contenu : modules + lessons (avec moduleTitle) +
 * exercises (avec lessonTitle et moduleTitle). Utilisé par /admin/content.
 */
export const allContent = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const modulesRaw = await ctx.db
      .query("modules")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const modules = modulesRaw.sort((a, b) => a.order - b.order);

    const lessonsRaw = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const exercisesRaw = await ctx.db
      .query("exercises")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const modById = new Map(modules.map((m) => [m._id, m]));
    const lessonById = new Map(lessonsRaw.map((l) => [l._id, l]));

    const lessons = lessonsRaw
      .map((l) => ({
        ...l,
        moduleTitle: modById.get(l.moduleId)?.title ?? "—",
        moduleOrder: modById.get(l.moduleId)?.order ?? 0,
      }))
      .sort((a, b) => a.moduleOrder - b.moduleOrder || a.order - b.order);

    const exercises = exercisesRaw
      .map((e) => {
        const lesson = lessonById.get(e.lessonId);
        const mod = lesson ? modById.get(lesson.moduleId) : undefined;
        return {
          ...e,
          lessonTitle: lesson?.title ?? "—",
          lessonOrder: lesson?.order ?? 0,
          moduleTitle: mod?.title ?? "—",
          moduleOrder: mod?.order ?? 0,
        };
      })
      .sort(
        (a, b) =>
          a.moduleOrder - b.moduleOrder ||
          a.lessonOrder - b.lessonOrder ||
          a._creationTime - b._creationTime
      );

    return {
      modules,
      lessons,
      exercises,
      counts: {
        modules: modules.length,
        lessons: lessons.length,
        exercises: exercises.length,
      },
    };
  },
});

// Satisfy linter — reserve room for future internal schedulers
export const _markActive = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { lastActiveAt: Date.now() });
  },
});
void internal;
