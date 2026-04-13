import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Announcements (news admin sur dashboard user)
// ============================================================================

/**
 * Liste des announcements actifs pour le user courant (non-expirés, non-deleted,
 * scope correspondant à son statut, pas encore dismissés).
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    if (!user) return [];

    const now = Date.now();
    const all = await ctx.db
      .query("announcements")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    const dismissed = new Set(user.dismissedAnnouncements ?? []);
    const isVip = !!user.purchaseId;

    return all.filter((a) => {
      if (a.deletedAt) return false;
      if (a.expiresAt && a.expiresAt < now) return false;
      if (dismissed.has(a._id)) return false;
      if (a.scope === "all") return true;
      if (a.scope === "vip" && isVip) return true;
      if (a.scope === "pending" && !isVip) return true;
      return false;
    });
  },
});

/**
 * Le user dismisse une announcement (ajoute son id à dismissedAnnouncements).
 */
export const dismiss = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User introuvable");
    const current = user.dismissedAnnouncements ?? [];
    if (current.includes(announcementId)) return;
    await ctx.db.patch(userId, {
      dismissedAnnouncements: [...current, announcementId],
    });
  },
});

/**
 * ── Admin ──────────────────────────────────────────────────────────────────
 */

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("announcements")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    scope: v.union(v.literal("all"), v.literal("vip"), v.literal("pending")),
    accent: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    return await ctx.db.insert("announcements", {
      title: args.title.trim(),
      body: args.body.trim(),
      scope: args.scope,
      accent: args.accent,
      expiresAt: args.expiresAt,
      createdByAdminId: userId,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, { announcementId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(announcementId, { deletedAt: Date.now() });
  },
});
