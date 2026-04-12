import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Lessons CRUD
// ============================================================================

export const listByModule = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    return await ctx.db
      .query("lessons")
      .withIndex("by_module_order", (q) => q.eq("moduleId", moduleId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const get = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    return await ctx.db.get(lessonId);
  },
});

/**
 * Recherche de leçons par titre ou description (case-insensitive).
 * Retourne max 20 résultats avec les infos du module associé.
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query: searchQuery }) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return [];

    const allLessons = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const matches = allLessons
      .filter(
        (lesson) =>
          lesson.title.toLowerCase().includes(term) ||
          lesson.description.toLowerCase().includes(term)
      )
      .slice(0, 20);

    // Enrichir avec les infos module
    const results = await Promise.all(
      matches.map(async (lesson) => {
        const module = await ctx.db.get(lesson.moduleId);
        return {
          ...lesson,
          moduleTitle: module?.title ?? "",
          moduleBadgeLabel: module?.badgeLabel ?? "",
        };
      })
    );

    return results;
  },
});

export const create = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    xpReward: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    // Auto-order dans le module
    const existing = await ctx.db
      .query("lessons")
      .withIndex("by_module_order", (q) => q.eq("moduleId", args.moduleId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const order = existing.length;

    const lessonId = await ctx.db.insert("lessons", {
      moduleId: args.moduleId,
      title: args.title,
      slug: args.slug,
      description: args.description,
      order,
      muxAssetId: args.muxAssetId ?? "placeholder",
      muxPlaybackId: args.muxPlaybackId ?? "placeholder",
      durationSeconds: args.durationSeconds ?? 0,
      xpReward: args.xpReward ?? 100,
      createdAt: now,
      updatedAt: now,
    });

    // Fanout notifications in-app à tous les membres qui ont payé.
    // On s'appuie sur `purchaseId` (lié dans auth.ts ou fulfillPayment) pour
    // filtrer les clients actifs sans scanner toute la table users.
    const members = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "member"))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const mod = await ctx.db.get(args.moduleId);
    const message = `Nouvelle leçon : ${args.title}${mod ? ` — ${mod.title}` : ""}`;

    for (const member of members) {
      if (!member.purchaseId) continue;
      await ctx.db.insert("notifications", {
        userId: member._id,
        type: "new_content",
        message,
        read: false,
        lessonId,
        createdAt: now,
      });
    }

    // Annonce Discord (fail silent)
    await ctx.scheduler.runAfter(0, internal.stripe.announceToDiscord, {
      type: "new_content",
      payload: {
        lessonTitle: args.title,
        moduleTitle: mod?.title,
        lessonId,
      },
    });

    return lessonId;
  },
});

export const update = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    muxAssetId: v.optional(v.string()),
    muxPlaybackId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    xpReward: v.optional(v.number()),
  },
  handler: async (ctx, { lessonId, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(lessonId, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(lessonId, { deletedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    lessonIds: v.array(v.id("lessons")),
  },
  handler: async (ctx, { lessonIds }) => {
    await requireAdmin(ctx);
    for (let i = 0; i < lessonIds.length; i++) {
      await ctx.db.patch(lessonIds[i], { order: i, updatedAt: Date.now() });
    }
  },
});

/**
 * Retourne les leçons précédente et suivante pour la navigation.
 * Gère la navigation cross-module (dernière leçon module N → première leçon module N+1).
 */
export const getNavigation = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return { prev: null, next: null };

    // Toutes les leçons du même module, triées par order
    const moduleLessons = await ctx.db
      .query("lessons")
      .withIndex("by_module_order", (q) => q.eq("moduleId", lesson.moduleId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const currentIndex = moduleLessons.findIndex((l) => l._id === lessonId);

    let prev = currentIndex > 0 ? moduleLessons[currentIndex - 1] : null;
    let next = currentIndex < moduleLessons.length - 1 ? moduleLessons[currentIndex + 1] : null;

    // Cross-module navigation
    const module = await ctx.db.get(lesson.moduleId);
    if (!module) return { prev: prev ? { _id: prev._id, title: prev.title } : null, next: next ? { _id: next._id, title: next.title } : null };

    if (!prev && module.order > 0) {
      // Chercher le module précédent
      const prevModules = await ctx.db
        .query("modules")
        .withIndex("by_order")
        .filter((q) => q.and(
          q.lt(q.field("order"), module.order),
          q.eq(q.field("deletedAt"), undefined)
        ))
        .collect();
      const prevModule = prevModules[prevModules.length - 1];
      if (prevModule) {
        const prevModuleLessons = await ctx.db
          .query("lessons")
          .withIndex("by_module_order", (q) => q.eq("moduleId", prevModule._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        if (prevModuleLessons.length > 0) {
          prev = prevModuleLessons[prevModuleLessons.length - 1];
        }
      }
    }

    if (!next) {
      // Chercher le module suivant
      const nextModules = await ctx.db
        .query("modules")
        .withIndex("by_order")
        .filter((q) => q.and(
          q.gt(q.field("order"), module.order),
          q.eq(q.field("deletedAt"), undefined)
        ))
        .collect();
      const nextModule = nextModules[0];
      if (nextModule) {
        const nextModuleLessons = await ctx.db
          .query("lessons")
          .withIndex("by_module_order", (q) => q.eq("moduleId", nextModule._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        if (nextModuleLessons.length > 0) {
          next = nextModuleLessons[0];
        }
      }
    }

    return {
      prev: prev ? { _id: prev._id, title: prev.title } : null,
      next: next ? { _id: next._id, title: next.title } : null,
    };
  },
});
