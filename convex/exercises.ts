import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Exercises CRUD
// ============================================================================

export const listByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    return await ctx.db
      .query("exercises")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const create = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.string(),
    contentMarkdown: v.string(),
    type: v.union(v.literal("checkbox"), v.literal("qcm"), v.literal("text")),
    qcmOptions: v.optional(
      v.array(v.object({ label: v.string(), isCorrect: v.boolean() }))
    ),
    exerciseUrl: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("exercises", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    exerciseId: v.id("exercises"),
    title: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    type: v.optional(
      v.union(v.literal("checkbox"), v.literal("qcm"), v.literal("text"))
    ),
    qcmOptions: v.optional(
      v.array(v.object({ label: v.string(), isCorrect: v.boolean() }))
    ),
    exerciseUrl: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, { exerciseId, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(exerciseId, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(exerciseId, { deletedAt: Date.now() });
  },
});
