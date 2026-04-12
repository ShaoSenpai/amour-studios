import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Progression
// ----------------------------------------------------------------------------
// Règles d'unlock séquentiel :
//   - Leçon N+1 débloquée si leçon N est complétée
//   - Leçon complétée = vidéo vue ≥90% ET exercice complété (si il y en a)
//   - Première leçon de chaque module toujours débloquée (si module précédent terminé)
//   - Module N+1 débloqué si toutes les leçons du module N sont complétées
//   - Module 0 toujours débloqué
// ============================================================================

/**
 * Retourne toute la progression du user courant, indexée par lessonId.
 */
export const myProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return {};

    const progress = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const map: Record<string, (typeof progress)[number]> = {};
    for (const p of progress) {
      map[p.lessonId] = p;
    }
    return map;
  },
});

/**
 * Mettre à jour la progression vidéo d'une leçon.
 */
export const updateVideoProgress = mutation({
  args: {
    lessonId: v.id("lessons"),
    progressPct: v.number(),
  },
  handler: async (ctx, { lessonId, progressPct }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) =>
        q.eq("userId", userId).eq("lessonId", lessonId)
      )
      .first();

    const pct = Math.min(100, Math.max(0, progressPct));
    const isWatched = pct >= 90;

    if (existing) {
      // Ne jamais réduire la progression
      if (pct <= existing.videoProgressPct) return;

      const patch: Record<string, unknown> = { videoProgressPct: pct };
      if (isWatched && !existing.videoWatchedAt) {
        patch.videoWatchedAt = Date.now();
      }
      // Vérifier si leçon complète (vidéo + exercice)
      if (isWatched && existing.exerciseCompletedAt && !existing.lessonCompletedAt) {
        patch.lessonCompletedAt = Date.now();
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("progress", {
        userId,
        lessonId,
        videoProgressPct: pct,
        videoWatchedAt: isWatched ? Date.now() : undefined,
      });
    }
  },
});

/**
 * Compléter un exercice.
 */
export const completeExercise = mutation({
  args: {
    lessonId: v.id("lessons"),
    answer: v.optional(v.string()),
  },
  handler: async (ctx, { lessonId, answer }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const now = Date.now();

    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) =>
        q.eq("userId", userId).eq("lessonId", lessonId)
      )
      .first();

    if (existing) {
      if (existing.exerciseCompletedAt) return; // Déjà complété

      const patch: Record<string, unknown> = {
        exerciseCompletedAt: now,
        exerciseAnswer: answer,
      };
      // Vérifier si leçon complète
      if (existing.videoWatchedAt && !existing.lessonCompletedAt) {
        patch.lessonCompletedAt = now;
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("progress", {
        userId,
        lessonId,
        videoProgressPct: 0,
        exerciseCompletedAt: now,
        exerciseAnswer: answer,
      });
    }

    // Ajouter XP
    const lesson = await ctx.db.get(lessonId);
    if (lesson) {
      const user = await ctx.db.get(userId);
      if (user) {
        await ctx.db.patch(userId, {
          xp: (user.xp ?? 0) + lesson.xpReward,
          lastActiveAt: now,
        });
      }
    }
  },
});

/**
 * Retourne la progression globale du user : nombre de leçons complétées / total.
 */
export const globalProgress = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { completed: 0, total: 0, percent: 0 };

    // Toutes les leçons non supprimées
    const allLessons = await ctx.db
      .query("lessons")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const total = allLessons.length;
    if (total === 0) return { completed: 0, total: 0, percent: 0 };

    // Progression du user
    const progress = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const completed = progress.filter((p) => p.lessonCompletedAt != null).length;
    const percent = Math.round((completed / total) * 100);

    return { completed, total, percent };
  },
});

/**
 * Marquer une vidéo comme vue (shortcut pour ≥90%).
 */
export const markVideoWatched = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const now = Date.now();

    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) =>
        q.eq("userId", userId).eq("lessonId", lessonId)
      )
      .first();

    if (existing) {
      if (existing.videoWatchedAt) return;
      const patch: Record<string, unknown> = {
        videoProgressPct: 100,
        videoWatchedAt: now,
      };
      if (existing.exerciseCompletedAt && !existing.lessonCompletedAt) {
        patch.lessonCompletedAt = now;
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("progress", {
        userId,
        lessonId,
        videoProgressPct: 100,
        videoWatchedAt: now,
      });
    }
  },
});
