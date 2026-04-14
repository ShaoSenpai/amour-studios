import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Notifications
// ============================================================================

/**
 * Retourne les 20 notifications les plus récentes du user courant.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    return notifications;
  },
});

/**
 * Retourne le nombre de notifications non lues du user courant.
 */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", userId).eq("read", false)
      )
      .collect();

    return unread.length;
  },
});

/**
 * Marque une notification comme lue.
 */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Notification introuvable");
    }

    await ctx.db.patch(notificationId, { read: true });
  },
});

/**
 * Marque toutes les notifications du user courant comme lues.
 */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", userId).eq("read", false)
      )
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
  },
});

/**
 * Crée une notification (usage interne uniquement, appelé par d'autres mutations).
 */
export const createInternal = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("comment_reply"),
      v.literal("new_content"),
      v.literal("badge_earned"),
      v.literal("new_comment")
    ),
    message: v.string(),
    lessonId: v.optional(v.id("lessons")),
    commentId: v.optional(v.id("comments")),
  },
  handler: async (ctx, { userId, type, message, lessonId, commentId }) => {
    await ctx.db.insert("notifications", {
      userId,
      type,
      message,
      read: false,
      lessonId,
      commentId,
      createdAt: Date.now(),
    });
  },
});
