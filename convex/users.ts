import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

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

/**
 * Query interne : récupère le user courant depuis une action.
 * Retourne uniquement les champs utiles au flow Discord.
 */
export const getSelf = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.deletedAt !== undefined) return null;
    return {
      discordId: user.discordId,
      email: user.email,
      purchaseId: user.purchaseId,
    };
  },
});

/**
 * Action publique : le user demande une re-synchronisation du rôle Discord VIP.
 * Utile si l'assignation automatique a échoué (bot down, timing, etc.).
 */
export const requestDiscordRoleSync = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const self = await ctx.runQuery(internal.users.getSelf, { userId });
    if (!self?.discordId || !self?.email || !self?.purchaseId) {
      throw new Error("Compte non éligible (paiement ou Discord manquant)");
    }

    await ctx.runAction(internal.stripe.assignDiscordRole, {
      discordId: self.discordId,
      email: self.email,
    });

    return { ok: true };
  },
});
