import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  accessibleModules,
  moduleOrderOfExercise,
  maybeAutoUnlockNextModule,
} from "./lib/access";
import { logEvent } from "./lib/events";
import type { Id } from "./_generated/dataModel";

/** Vérifie que l'user authentifié peut écrire sur cet exercice (module
 *  accessible). Lève une erreur sinon. Admin → bypass. */
async function ensureCanWriteExercise(
  ctx: import("./_generated/server").MutationCtx,
  userId: Id<"users">,
  exerciseId: Id<"exercises">
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Non authentifié");
  if (user.role === "admin") return;
  const moduleOrder = await moduleOrderOfExercise(ctx, exerciseId);
  if (moduleOrder == null) throw new Error("Exercice introuvable");
  const allowed = await accessibleModules(ctx, user);
  if (!allowed.includes(moduleOrder)) {
    throw new Error("Module non débloqué pour cet utilisateur");
  }
}

/**
 * Get the user's response for an exercise.
 */
export const get = query({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", exerciseId)
      )
      .first();
  },
});

/**
 * Save/update exercise response (auto-save).
 */
export const save = mutation({
  args: {
    exerciseId: v.id("exercises"),
    data: v.string(),
    progressPercent: v.number(),
  },
  handler: async (ctx, { exerciseId, data, progressPercent }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    await ensureCanWriteExercise(ctx, userId, exerciseId);

    const existing = await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", exerciseId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        data,
        progressPercent,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("exerciseResponses", {
        userId,
        exerciseId,
        data,
        progressPercent,
        updatedAt: now,
      });
    }
  },
});

/**
 * Mark exercise as completed.
 */
export const complete = mutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (
    ctx,
    { exerciseId }
  ): Promise<{ autoUnlocked: number | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    await ensureCanWriteExercise(ctx, userId, exerciseId);

    const existing = await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", exerciseId)
      )
      .first();

    const now = Date.now();
    let wasNewlyCompleted = false;

    if (existing) {
      if (!existing.completedAt) {
        await ctx.db.patch(existing._id, {
          completedAt: now,
          progressPercent: 100,
          updatedAt: now,
        });
        wasNewlyCompleted = true;
      }
    } else {
      await ctx.db.insert("exerciseResponses", {
        userId,
        exerciseId,
        data: "{}",
        progressPercent: 100,
        completedAt: now,
        updatedAt: now,
      });
      wasNewlyCompleted = true;
    }

    // Trace + feed Discord : exercice terminé (1re fois seulement).
    if (wasNewlyCompleted) {
      const ex = await ctx.db.get(exerciseId);
      await logEvent(ctx, {
        userId,
        type: "exercise.completed",
        title: `Exercice terminé — ${ex?.title ?? "exercice"}`,
        actor: "student",
      });
    }

    // Auto-déblocage : si tous les exos du module courant sont completed,
    // ajoute le module suivant à `users.unlockedModules`. Idempotent.
    if (wasNewlyCompleted) {
      const res = await maybeAutoUnlockNextModule(ctx, userId, exerciseId);
      if (res) return { autoUnlocked: res.unlocked };
    }
    return { autoUnlocked: null };
  },
});
