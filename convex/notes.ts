import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Get all notes for a lesson (timestamped notes list).
 */
export const getForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("notes")
      .withIndex("by_user_lesson", (q) =>
        q.eq("userId", userId).eq("lessonId", lessonId)
      )
      .collect();
  },
});

/**
 * Save a new timestamped note.
 */
export const save = mutation({
  args: {
    lessonId: v.id("lessons"),
    content: v.string(),
    timestampSeconds: v.optional(v.number()),
  },
  handler: async (ctx, { lessonId, content, timestampSeconds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    return await ctx.db.insert("notes", {
      userId,
      lessonId,
      content: content.trim(),
      timestampSeconds,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update a note.
 */
export const update = mutation({
  args: {
    noteId: v.id("notes"),
    content: v.string(),
  },
  handler: async (ctx, { noteId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId) throw new Error("Non autorisé");
    await ctx.db.patch(noteId, { content: content.trim(), updatedAt: Date.now() });
  },
});

/**
 * Delete a note.
 */
export const remove = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const note = await ctx.db.get(noteId);
    if (!note || note.userId !== userId) throw new Error("Non autorisé");
    await ctx.db.delete(noteId);
  },
});
