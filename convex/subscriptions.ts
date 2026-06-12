import { v } from "convex/values";
import { query, action, internalQuery, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { logEvent } from "./lib/events";
import { stripeClient, priceForTier } from "./stripe";

// ============================================================================
// Self-service abonnement (membre). Agit sur l'abonnement du user AUTHENTIFIÉ.
// ============================================================================

// 1) Query : état de l'abonnement du membre connecté (page /compte).
export const mySubscription = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authed: false as const };
    const user = await ctx.db.get(userId);
    if (!user) return { authed: false as const };
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !purchase.stripeSubscriptionId) && user.email) {
      const list = await ctx.db.query("purchases")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase())).collect();
      purchase = list
        .filter((p) => p.stripeSubscriptionId && (p.status === "active" || p.status === "past_due" || p.status === "paid"))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    if (!purchase || !purchase.stripeSubscriptionId) return { authed: true as const, hasSubscription: false as const };
    return {
      authed: true as const,
      hasSubscription: true as const,
      tier: purchase.tier ?? null,
      status: purchase.status,
      amountEur: Math.round((purchase.amount ?? 0) / 100),
      currentPeriodEnd: purchase.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: purchase.cancelAtPeriodEnd ?? false,
      canUpgrade: purchase.tier === "communaute" && purchase.status !== "canceled",
    };
  },
});

// Internal : résout le purchase + contact du user (appelé par les actions).
export const _purchaseForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !purchase.stripeSubscriptionId) && user.email) {
      const list = await ctx.db.query("purchases")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase())).collect();
      purchase = list
        .filter((p) => p.stripeSubscriptionId && (p.status === "active" || p.status === "past_due" || p.status === "paid"))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    if (!purchase || !purchase.stripeSubscriptionId) return null;
    return {
      purchaseId: purchase._id as Id<"purchases">,
      subscriptionId: purchase.stripeSubscriptionId,
      tier: purchase.tier ?? null,
      status: purchase.status,
      cancelAtPeriodEnd: purchase.cancelAtPeriodEnd ?? false,
      discordId: user.discordId ?? null,
      email: user.email ?? null,
    };
  },
});

export const _logSelfService = internalMutation({
  args: { userId: v.id("users"), type: v.string(), title: v.string() },
  handler: async (ctx, { userId, type, title }) => {
    await logEvent(ctx, { userId, type, title, actor: "member" });
  },
});

// 2) Annuler (fin de période) + réactiver.
export const cancelMySubscription = action({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, { reason }): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement à annuler.");
    if (p.cancelAtPeriodEnd) return { ok: true };
    const stripe = await stripeClient();
    await stripe.subscriptions.update(p.subscriptionId, {
      cancel_at_period_end: true,
      ...(reason ? { metadata: { cancel_reason: reason.slice(0, 200) } } : {}),
    });
    await ctx.runMutation(internal.stripe.patchPurchase, { purchaseId: p.purchaseId, cancelAtPeriodEnd: true });
    await ctx.runMutation(internal.subscriptions._logSelfService, {
      userId, type: "subscription.cancel_scheduled", title: "Annulation programmée (fin de période)",
    });
    return { ok: true };
  },
});

export const reactivateMySubscription = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement.");
    const stripe = await stripeClient();
    await stripe.subscriptions.update(p.subscriptionId, { cancel_at_period_end: false });
    await ctx.runMutation(internal.stripe.patchPurchase, { purchaseId: p.purchaseId, cancelAtPeriodEnd: false });
    return { ok: true };
  },
});

// 3) Upgrade Communauté → Coaching (proration immédiate).
export const upgradeMySubscription = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true; already?: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement à upgrader.");
    if (p.tier === "coaching") return { ok: true, already: true };
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, { key: `upgradeSelf:${userId}`, max: 5 });
    if (!rl.allowed) throw new Error("Trop de tentatives. Attends une minute.");
    const stripe = await stripeClient();
    const coachingPrice = priceForTier("coaching");
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error("Abonnement Stripe sans item.");
    await stripe.subscriptions.update(p.subscriptionId, {
      items: [{ id: itemId, price: coachingPrice }],
      proration_behavior: "always_invoice",
      metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: "1mois" },
    });
    await ctx.runMutation(internal.subscriptions._applyUpgrade, { purchaseId: p.purchaseId, userId, coachingPrice });
    if (p.discordId) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, { discordId: p.discordId, email: p.email ?? "", tier: "coaching" });
    }
    return { ok: true };
  },
});

export const _applyUpgrade = internalMutation({
  args: { purchaseId: v.id("purchases"), userId: v.id("users"), coachingPrice: v.string() },
  handler: async (ctx, { purchaseId, userId, coachingPrice }) => {
    await ctx.db.patch(purchaseId, { tier: "coaching", stripePriceId: coachingPrice, amount: 17900, duree: undefined });
    const ob = await ctx.db.query("onboardings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (ob && ob.tier === "communaute") {
      await ctx.db.patch(ob._id, { tier: "coaching", step: ob.step === "community_ready" ? "form_done" : ob.step, updatedAt: Date.now() });
    }
    await logEvent(ctx, { userId, type: "subscription.tier_changed", title: "Upgrade Communauté → Coaching (self-service /compte)", actor: "member", meta: { from: "communaute", to: "coaching", via: "self_service" } });
  },
});
