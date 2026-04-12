import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Amour Studios — User queries
// ----------------------------------------------------------------------------
// Voir prd.md section 4.1 et section 5 (Auth flow).
// ============================================================================

/**
 * Retourne le user actuellement connecté, ou `null` si non authentifié.
 * Utilisé par la plupart des écrans (header, dashboard, player, admin).
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.deletedAt !== undefined) return null;
    return user;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const updates: Record<string, string> = {};
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.email !== undefined) updates.email = args.email.trim().toLowerCase();
    await ctx.db.patch(userId, updates);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(userId, { customImage: storageId, image: url ?? undefined });
  },
});
