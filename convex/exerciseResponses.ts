import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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
  handler: async (ctx, { exerciseId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const existing = await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", exerciseId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      if (!existing.completedAt) {
        await ctx.db.patch(existing._id, { completedAt: now, progressPercent: 100 });
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
    }
  },
});
