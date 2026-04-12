import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Badges
// ----------------------------------------------------------------------------
// Un badge est attribué automatiquement quand toutes les leçons d'un module
// sont complétées. Le label du badge = badgeLabel du module.
// ============================================================================

export const myBadges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

/**
 * Vérifie si un module est entièrement complété et attribue le badge.
 * Appelé après chaque complétion de leçon.
 */
export const checkAndAward = mutation({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    // Déjà obtenu ?
    const existing = await ctx.db
      .query("badges")
      .withIndex("by_user_module", (q) =>
        q.eq("userId", userId).eq("moduleId", moduleId)
      )
      .first();
    if (existing) return null;

    // Vérifier que toutes les leçons du module sont complétées
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module", (q) => q.eq("moduleId", moduleId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const progressList = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const progressMap = new Map(progressList.map((p) => [p.lessonId, p]));

    const allCompleted = lessons.every((l) => {
      const p = progressMap.get(l._id);
      return p?.lessonCompletedAt;
    });

    if (!allCompleted) return null;

    // Attribuer le badge
    const mod = await ctx.db.get(moduleId);
    if (!mod) return null;

    const badgeId = await ctx.db.insert("badges", {
      userId,
      moduleId,
      label: mod.badgeLabel,
      unlockedAt: Date.now(),
    });

    // Bonus XP pour complétion de module
    const user = await ctx.db.get(userId);
    if (user) {
      await ctx.db.patch(userId, { xp: (user.xp ?? 0) + 500 });
    }

    return badgeId;
  },
});
