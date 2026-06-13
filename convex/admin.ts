import {
  query,
  mutation,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { logEvent } from "./lib/events";

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

    // Inclure les soft-deleted (l'UI affiche un statut + bouton Restaurer/Hard delete)
    const members = await Promise.all(
      users.map(async (user) => {
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
 * HARD DELETE — efface définitivement un user et toutes ses données liées.
 *
 * ⚠ Irréversible. Utilise removeMember (soft) pour un delete restaurable.
 *
 * Ce qui est effacé :
 *  - user record
 *  - sessions Convex Auth (authSessions, authRefreshTokens, authAccounts)
 *  - progression (progress, badges, streaks implicit)
 *  - contenu utilisateur (notes, commentaires, responses)
 *  - notifications
 *  - onboardingNotes
 *
 * Ce qui est préservé (pour audit comptable) :
 *  - purchases → le champ userId est mis à null mais le record reste
 *
 * Un admin ne peut pas se hard-delete lui-même.
 */
export const hardDeleteMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: adminId } = await requireAdmin(ctx);
    if (userId === adminId) throw new Error("Tu ne peux pas te supprimer toi-même");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User introuvable");

    // 1. Sessions Convex Auth — supprime refresh tokens via session index
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const rt of refreshTokens) await ctx.db.delete(rt._id);
      await ctx.db.delete(session._id);
    }

    // 2. authAccounts (liens OAuth providers)
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const a of accounts) await ctx.db.delete(a._id);

    // 3. Progression : progress
    const progressRecords = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of progressRecords) await ctx.db.delete(p._id);

    // 4. Badges
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const b of badges) await ctx.db.delete(b._id);

    // 5. Exercice responses
    const responses = await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of responses) await ctx.db.delete(r._id);

    // 6. Notes
    const notes = await ctx.db
      .query("notes")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    for (const n of notes) await ctx.db.delete(n._id);

    // 7. Commentaires (hard-delete : supprime tout le thread du user)
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);

    // 8. Notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const n of notifications) await ctx.db.delete(n._id);

    // 9. Onboarding notes
    const onboardingNotes = await ctx.db
      .query("onboardingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const o of onboardingNotes) await ctx.db.delete(o._id);

    // 10. Purchases : unlink (préserve le record comptable)
    if (user.purchaseId) {
      const purchase = await ctx.db.get(user.purchaseId);
      if (purchase && purchase.userId === userId) {
        await ctx.db.patch(user.purchaseId, { userId: undefined });
      }
    }

    // 11. Finalement : le user lui-même
    await ctx.db.delete(userId);

    return { ok: true };
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
 * SAV — Lier un compte Discord à un paiement, SANS OAuth.
 *
 * Cas d'usage : un client se présente sur Discord avec un compte qui n'est PAS
 * lié à son paiement (mauvais compte choisi à l'OAuth, compte recréé…). Le coach
 * lie manuellement le discordId au purchase. Sert aussi à tester le flux sans
 * jongler avec les comptes Discord.
 *
 * Si le discordId n'a pas encore de user → on crée un user minimal (PAS
 * d'authAccount). Ce user sera ADOPTÉ — pas dupliqué — quand le client fera
 * réellement l'OAuth Discord (cf. dédup par discordId dans convex/auth.ts).
 */
export const adminLinkDiscordToPurchase = mutation({
  args: {
    discordId: v.string(),
    purchaseId: v.id("purchases"),
  },
  handler: async (ctx, { discordId, purchaseId }) => {
    await requireAdmin(ctx);
    const trimmedDiscordId = discordId.trim();
    if (!trimmedDiscordId) throw new Error("Discord ID requis");

    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) throw new Error("Paiement introuvable");

    const now = Date.now();

    // User existant pour ce discordId ?
    let user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", trimmedDiscordId))
      .first();

    let userCreated = false;
    if (!user) {
      // Pas d'authAccount — sera adopté à l'OAuth (dédup par discordId).
      const userId = await ctx.db.insert("users", {
        discordId: trimmedDiscordId,
        email: purchase.email,
        role: "member",
        xp: 0,
        streakDays: 0,
        createdAt: now,
        lastActiveAt: now,
      });
      user = await ctx.db.get(userId);
      userCreated = true;
    }
    if (!user) throw new Error("Échec création user");

    // Liaison bidirectionnelle purchase ↔ user.
    await ctx.db.patch(purchase._id, { userId: user._id });
    if (!user.purchaseId) {
      await ctx.db.patch(user._id, { purchaseId: purchase._id });
    }

    // Onboarding (idempotent côté createForPurchase) si le purchase a un tier.
    if (purchase.tier) {
      await ctx.scheduler.runAfter(0, internal.onboardings.createForPurchase, {
        userId: user._id,
        tier: purchase.tier,
      });
    }

    // Rôle Discord si le paiement est vivant (active / past_due / paid).
    const isLive =
      purchase.status === "active" ||
      purchase.status === "past_due" ||
      purchase.status === "paid";
    if (isLive) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: trimmedDiscordId,
        email: purchase.email,
        tier: purchase.tier ?? undefined,
      });
    }

    await logEvent(ctx, {
      userId: user._id,
      type: "purchase.linked_manually",
      title: "Compte Discord lié manuellement à un paiement",
      actor: "admin",
      meta: {
        discordId: trimmedDiscordId,
        purchaseId: purchase._id,
        tier: purchase.tier ?? null,
        userCreated,
      },
    });

    return { ok: true as const, userCreated, tier: purchase.tier ?? null };
  },
});

/**
 * SAV — Recherche de paiements pour l'UI « Lier un compte ».
 * Avec email → match `by_email`. Sans → les ~15 plus récents (createdAt desc).
 */
export const adminSearchPurchases = query({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, { email }) => {
    await requireAdmin(ctx);
    const trimmed = email?.trim().toLowerCase();

    const rows = trimmed
      ? await ctx.db
          .query("purchases")
          .withIndex("by_email", (q) => q.eq("email", trimmed))
          .collect()
      : (await ctx.db.query("purchases").order("desc").take(15));

    return rows
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .map((p) => ({
        purchaseId: p._id,
        email: p.email,
        tier: p.tier ?? null,
        status: p.status,
        hasUser: !!p.userId,
        pi: p.stripePaymentIntentId,
        createdAt: p.createdAt,
      }));
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

// One-off : liste les modules + nb leçons + nb exercices.
// Diagnostic pour aligner le mapping coaching ↔ formation.
export const _inspectModules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const modules = await ctx.db.query("modules").collect();
    modules.sort((a, b) => a.order - b.order);
    const out: Array<{
      order: number;
      title: string;
      lessons: number;
      exercises: number;
    }> = [];
    for (const m of modules) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_module", (q) => q.eq("moduleId", m._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();
      let exos = 0;
      for (const l of lessons) {
        const xs = await ctx.db
          .query("exercises")
          .withIndex("by_lesson", (q) => q.eq("lessonId", l._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        exos += xs.length;
      }
      out.push({
        order: m.order,
        title: m.title,
        lessons: lessons.length,
        exercises: exos,
      });
    }
    return out;
  },
});

// One-off : renomme un module par son `order`. Utilisé pour aligner les titres
// formation legacy avec le programme coaching head-to-head.
export const _renameModuleByOrder = internalMutation({
  args: { order: v.number(), title: v.string() },
  handler: async (ctx, { order, title }) => {
    const m = await ctx.db
      .query("modules")
      .filter((q) => q.eq(q.field("order"), order))
      .first();
    if (!m) return { ok: false as const, reason: "not_found" as const };
    const old = m.title;
    await ctx.db.patch(m._id, { title, updatedAt: Date.now() });
    return { ok: true as const, old, new: title };
  },
});

// One-off : dump tous les exercises avec leur contexte (titre, lesson, module,
// type, config). Sert à proposer un mapping exos legacy → exos coaching.
export const _inspectExercises = internalMutation({
  args: {},
  handler: async (ctx) => {
    const modules = await ctx.db.query("modules").collect();
    const moduleById = new Map(modules.map((m) => [m._id as unknown as string, m]));

    const lessons = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const lessonById = new Map(lessons.map((l) => [l._id as unknown as string, l]));

    const exos = await ctx.db
      .query("exercises")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const out: Array<{
      moduleOrder: number;
      moduleTitle: string;
      lessonOrder: number;
      lessonTitle: string;
      exoTitle: string;
      exoType: string;
      configType?: string;
      exerciseUrl?: string;
      hiddenFromCoaching?: boolean;
    }> = [];
    for (const x of exos) {
      const l = lessonById.get(x.lessonId as unknown as string);
      if (!l) continue;
      const m = moduleById.get(l.moduleId as unknown as string);
      if (!m) continue;
      let configType: string | undefined;
      try {
        if (x.config) {
          const c = JSON.parse(x.config) as { type?: string };
          if (typeof c?.type === "string") configType = c.type;
        }
      } catch {
        // ignore
      }
      out.push({
        moduleOrder: m.order,
        moduleTitle: m.title,
        lessonOrder: l.order,
        lessonTitle: l.title,
        exoTitle: x.title,
        exoType: x.type,
        configType,
        exerciseUrl: x.exerciseUrl,
        hiddenFromCoaching: x.hiddenFromCoaching,
      });
    }
    out.sort(
      (a, b) =>
        a.moduleOrder - b.moduleOrder ||
        a.lessonOrder - b.lessonOrder ||
        a.exoTitle.localeCompare(b.exoTitle)
    );
    return out;
  },
});

// One-off : inspecte un user par email + son onboarding.
export const _inspectUser = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const all = await ctx.db.query("users").collect();
    const u = all.find(
      (x) => (x.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (!u) return { found: false, scanned: all.length };
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .first();
    return {
      found: true,
      id: u._id,
      email: u.email,
      name: u.name,
      discordId: u.discordId ?? null,
      discordUsername: u.discordUsername ?? null,
      purchaseId: u.purchaseId ?? null,
      role: u.role ?? null,
      onboarding: ob
        ? {
            tier: ob.tier,
            step: ob.step,
            token: ob.token,
            presentedAt: ob.presentedAt,
            linkSentAt: ob.linkSentAt,
          }
        : null,
    };
  },
});

// One-off : dump les N derniers purchases (test webhook Stripe).
export const _inspectRecentPurchases = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("purchases").collect();
    all.sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0));
    return all.slice(0, 10).map((p) => ({
      id: p._id as unknown as string,
      email: p.email,
      tier: p.tier,
      status: p.status,
      duree: p.duree,
      stripeSubscriptionId: p.stripeSubscriptionId,
      stripePriceId: p.stripePriceId,
      createdAt: new Date(p._creationTime).toISOString(),
    }));
  },
});

// One-off : marque/démarque des exos comme `hiddenFromCoaching` en se basant
// sur leur titre exact. Sert à la curation du catalogue /exos coaching :
// certains exos legacy restent en BDD pour la formation mais n'apparaissent
// PAS dans le catalogue élève coaching.
export const _setHiddenFromCoachingByTitles = internalMutation({
  args: { titles: v.array(v.string()), hidden: v.boolean() },
  handler: async (ctx, { titles, hidden }) => {
    const titleSet = new Set(titles);
    const all = await ctx.db
      .query("exercises")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const matched: Array<{ title: string; id: string; was: boolean | undefined }> = [];
    for (const x of all) {
      if (!titleSet.has(x.title)) continue;
      matched.push({
        title: x.title,
        id: x._id as unknown as string,
        was: x.hiddenFromCoaching,
      });
      await ctx.db.patch(x._id, {
        hiddenFromCoaching: hidden,
        updatedAt: Date.now(),
      });
    }
    const found = new Set(matched.map((m) => m.title));
    const missing = titles.filter((t) => !found.has(t));
    return { ok: true as const, patched: matched.length, matched, missing };
  },
});

// ============================================================================
// Reset d'identité de test — rejouer le flux fallback « compte non lié » avec
// le MÊME compte Discord sans créer de nouveaux comptes.
// ============================================================================

/** Interne : appelle le bot Discord pour OUBLIER les caches de présentation
 *  d'un discordId (RECENT_PRESENTATIONS + RECENT_RECOVERY_DM). Sans ça, après
 *  un reset BDD, le bot resterait sur son cache 24h et ne re-DM/re-notifierait
 *  pas. Pattern calqué sur internal.stripe.removeOnboardedRole. Fail-silent. */
export const forgetPresentationOnBot = internalAction({
  args: { discordId: v.string() },
  handler: async (_ctx, { discordId }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!endpoint || !secret) {
      console.warn(
        "forgetPresentationOnBot: DISCORD_BOT_ENDPOINT(_SECRET) absent — skip"
      );
      return { ok: false as const, reason: "missing_env" as const };
    }
    try {
      const res = await fetch(
        `${endpoint.replace(/\/$/, "")}/forget-presentation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ discordId }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(
          `🧹 forget-presentation bot ok (${discordId}, had=${data.had ?? "?"})`
        );
        return { ok: true as const };
      }
      console.warn(
        `⚠️ forget-presentation bot ${res.status}: ${data.error ?? res.statusText}`
      );
      return { ok: false as const };
    } catch (err) {
      console.warn("⚠️ forget-presentation bot injoignable:", err);
      return { ok: false as const };
    }
  },
});

/** Interne (TEST/DEV) : remet à zéro l'identité d'un email et/ou d'un discordId
 *  pour pouvoir rejouer le flux fallback bout-en-bout :
 *   - supprime les purchases (par email + ceux liés au user),
 *   - supprime les claimTokens de ces purchases,
 *   - supprime les onboardings du user,
 *   - délie le user du purchase (purchaseId undefined) et, si possible, retire
 *     ses rôles Discord (palier + Onboardé) via le bot,
 *   - demande au bot d'oublier la présentation (caches) pour ce discordId.
 *
 *  ⚠️ Outil de TEST. Ne supprime PAS le compte user lui-même (sessions auth
 *  intactes) — on veut pouvoir se reconnecter avec le même compte Discord.
 *
 *  Usage :
 *    npx convex run admin:resetTestIdentity '{"email":"x@y.z"}'
 *    npx convex run admin:resetTestIdentity '{"discordId":"123..."}'
 */
export const resetTestIdentity = internalMutation({
  args: {
    email: v.optional(v.string()),
    discordId: v.optional(v.string()),
  },
  handler: async (ctx, { email, discordId }) => {
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedDiscordId = discordId?.trim();
    if (!normalizedEmail && !normalizedDiscordId) {
      throw new Error("Fournis au moins email ou discordId");
    }

    const deleted = {
      purchases: 0,
      claimTokens: 0,
      onboardings: 0,
      usersUnlinked: 0,
    };
    const purchaseIds = new Set<Id<"purchases">>();
    const userIds = new Set<Id<"users">>();
    // discordIds dont on retire les rôles + oublie la présentation côté bot.
    const discordIds = new Set<string>();
    if (normalizedDiscordId) discordIds.add(normalizedDiscordId);

    // ── Résolution des cibles ──────────────────────────────────────────────
    // user par discordId
    if (normalizedDiscordId) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_discord", (q) => q.eq("discordId", normalizedDiscordId))
        .first();
      if (u) userIds.add(u._id);
    }
    // user(s) + purchases par email
    if (normalizedEmail) {
      const usersByEmail = (await ctx.db.query("users").collect()).filter(
        (u) => (u.email ?? "").toLowerCase() === normalizedEmail
      );
      for (const u of usersByEmail) {
        userIds.add(u._id);
        if (u.discordId) discordIds.add(u.discordId);
      }
      const purchasesByEmail = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .collect();
      for (const p of purchasesByEmail) purchaseIds.add(p._id);
    }
    // purchase lié à chacun des users ciblés
    for (const uid of userIds) {
      const u = await ctx.db.get(uid);
      if (u?.purchaseId) purchaseIds.add(u.purchaseId);
      if (u?.discordId) discordIds.add(u.discordId);
    }

    // ── Suppression claimTokens (par paymentIntent des purchases ciblés) ────
    for (const pid of purchaseIds) {
      const p = await ctx.db.get(pid);
      if (!p?.stripePaymentIntentId) continue;
      const tokens = await ctx.db
        .query("claimTokens")
        .withIndex("by_payment_intent", (q) =>
          q.eq("paymentIntentId", p.stripePaymentIntentId!)
        )
        .collect();
      for (const t of tokens) {
        await ctx.db.delete(t._id);
        deleted.claimTokens++;
      }
    }

    // ── Suppression onboardings des users ciblés ───────────────────────────
    for (const uid of userIds) {
      const obs = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      for (const o of obs) {
        await ctx.db.delete(o._id);
        deleted.onboardings++;
      }
    }

    // ── Délie les users du purchase ────────────────────────────────────────
    for (const uid of userIds) {
      const u = await ctx.db.get(uid);
      if (u?.purchaseId) {
        await ctx.db.patch(uid, { purchaseId: undefined });
        deleted.usersUnlinked++;
      }
    }

    // ── Suppression des purchases ──────────────────────────────────────────
    for (const pid of purchaseIds) {
      await ctx.db.delete(pid);
      deleted.purchases++;
    }

    // ── Nettoyage Discord (rôles + caches présentation) — fail-silent ───────
    for (const did of discordIds) {
      await ctx.scheduler.runAfter(0, internal.stripe.removeDiscordRoles, {
        discordId: did,
        email: normalizedEmail ?? "",
      });
      await ctx.scheduler.runAfter(0, internal.stripe.removeOnboardedRole, {
        discordId: did,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.admin.forgetPresentationOnBot,
        { discordId: did }
      );
    }

    return {
      ok: true as const,
      deleted,
      discordIds: Array.from(discordIds),
      userIds: Array.from(userIds).map((id) => id as unknown as string),
    };
  },
});
void internal;
