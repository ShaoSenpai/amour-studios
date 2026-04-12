import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Purchases queries
// ============================================================================

/**
 * Retourne le purchase lié au user courant, ou null.
 * Utilisé par le dashboard pour savoir si l'accès est débloqué.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || !user.purchaseId) return null;

    return await ctx.db.get(user.purchaseId);
  },
});
