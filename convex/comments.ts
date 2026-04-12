import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Comments
// ----------------------------------------------------------------------------
// 1 niveau de threading : un commentaire peut avoir un parentCommentId.
// Rate limit : max 10 commentaires par heure par user.
// ============================================================================

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1h

export const listByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Deduplicate user fetches
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!._id, u!]));

    const enriched = comments.map((comment) => {
      const user = userMap.get(comment.userId);
      return {
        ...comment,
        userName: user?.name ?? "Anonyme",
        userImage: user?.image,
        userRole: user?.role,
      };
    });

    // Organiser : top-level d'abord, puis réponses groupées par parent
    const topLevel = enriched
      .filter((c) => !c.parentCommentId)
      .sort((a, b) => b.createdAt - a.createdAt);

    const replies = enriched.filter((c) => c.parentCommentId);

    return topLevel.map((comment) => ({
      ...comment,
      replies: replies
        .filter((r) => r.parentCommentId === comment._id)
        .sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
});

export const create = mutation({
  args: {
    lessonId: v.id("lessons"),
    content: v.string(),
    parentCommentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, { lessonId, content, parentCommentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const trimmed = content.trim();
    if (!trimmed) throw new Error("Commentaire vide");
    if (trimmed.length > 2000) throw new Error("Commentaire trop long (max 2000 caractères)");

    // Rate limit
    const now = Date.now();
    const recentComments = await ctx.db
      .query("comments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gt(q.field("createdAt"), now - RATE_LIMIT_WINDOW_MS))
      .collect();

    if (recentComments.length >= RATE_LIMIT_MAX) {
      throw new Error("Trop de commentaires. Réessaie dans quelques minutes.");
    }

    const commentId = await ctx.db.insert("comments", {
      lessonId,
      userId,
      content: trimmed,
      parentCommentId,
      createdAt: now,
      updatedAt: now,
    });

    // Notifier l'auteur du commentaire parent si c'est une réponse
    if (parentCommentId) {
      const parentComment = await ctx.db.get(parentCommentId);
      if (parentComment && parentComment.userId !== userId) {
        const currentUser = await ctx.db.get(userId);
        await ctx.runMutation(internal.notifications.createInternal, {
          userId: parentComment.userId,
          type: "comment_reply",
          message: `${currentUser?.name ?? "Quelqu'un"} a répondu à votre commentaire`,
          lessonId,
          commentId,
        });
      }
    }

    return commentId;
  },
});

export const update = mutation({
  args: {
    commentId: v.id("comments"),
    content: v.string(),
  },
  handler: async (ctx, { commentId, content }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const comment = await ctx.db.get(commentId);
    if (!comment) throw new Error("Commentaire introuvable");

    // Seul l'auteur ou un admin peut modifier
    const user = await ctx.db.get(userId);
    if (comment.userId !== userId && user?.role !== "admin") {
      throw new Error("Non autorisé");
    }

    await ctx.db.patch(commentId, {
      content: content.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, { commentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const comment = await ctx.db.get(commentId);
    if (!comment) throw new Error("Commentaire introuvable");

    const user = await ctx.db.get(userId);
    if (comment.userId !== userId && user?.role !== "admin") {
      throw new Error("Non autorisé");
    }

    await ctx.db.patch(commentId, { deletedAt: Date.now() });
  },
});
