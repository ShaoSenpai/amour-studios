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
    if (!user) return null;

    // Admins have access without a purchase — return a synthetic paid stub
    // so the dashboard/lesson gates unlock.
    if (user.role === "admin" && !user.purchaseId) {
      return {
        _id: "admin_bypass" as never,
        _creationTime: user.createdAt ?? Date.now(),
        email: user.email ?? "",
        stripeSessionId: "admin_bypass",
        stripePaymentIntentId: "admin_bypass",
        amount: 0,
        currency: "eur",
        status: "paid" as const,
        userId: user._id,
        createdAt: user.createdAt ?? Date.now(),
        paidAt: user.createdAt ?? Date.now(),
      };
    }

    if (!user.purchaseId) return null;
    return await ctx.db.get(user.purchaseId);
  },
});
