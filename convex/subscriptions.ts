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
    // 💶 DÉCISION PRODUIT (verrouillée) : l'upgrade self-service depuis /compte =
    // **179€ PLEIN, cycle remis à neuf aujourd'hui** — PAS de prorata.
    //   - `proration_behavior: "none"` → on ne facture AUCUN ajustement au
    //     prorata des jours Communauté déjà payés (ils sont perdus, c'est voulu).
    //   - `billing_cycle_anchor: "now"` → le cycle de facturation redémarre
    //     maintenant : le mois coaching démarre aujourd'hui et Stripe émet
    //     immédiatement une facture de 179€ (premier mois plein), puis 179€/mois.
    //   ⚠️ Ne PAS confondre avec l'upsell d'onboarding (`upgradeToCoaching` dans
    //     stripe.ts) qui, lui, débite un +100€ one-time (différentiel 79→179) car
    //     il intervient dans l'heure suivant le paiement Communauté. Le +100€
    //     prorata est RÉSERVÉ à l'onboarding ; ici (plus tard, /compte) c'est 179 plein.
    //
    // ⚠️ SÉCURITÉ PAIEMENT : `error_if_incomplete` rend l'opération ATOMIQUE — si
    // la carte (par défaut) est refusée ou exige une 3DS, Stripe lève une erreur
    // 402 et NE bascule PAS l'abonnement (pas de coaching impayé/past_due). On
    // capte l'erreur pour un message propre, et `_applyUpgrade` ne tourne donc
    // QUE si le débit des 179€ a réussi. Le débit frappe la default_payment_method
    // du customer (que Task 2 / `startCardUpdate` permet de changer au préalable).
    try {
      await stripe.subscriptions.update(p.subscriptionId, {
        items: [{ id: itemId, price: coachingPrice }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
        payment_behavior: "error_if_incomplete",
        metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: "1mois" },
      });
    } catch (err) {
      console.warn("⚠️ upgrade self-service échec:", err instanceof Error ? err.message : err);
      throw new Error(
        "Le paiement de la différence n'a pas pu être validé (carte refusée ou validation requise). Réessaie ou contacte le support."
      );
    }
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

    // ── Onboarding : basculer le membre Communauté vers l'état coaching
    // « RDV à réserver » ───────────────────────────────────────────────────────
    // Un membre Communauté qui upgrade est DÉJÀ dans Discord, a DÉJÀ posté sa
    // présentation et a DÉJÀ le rôle « Onboardé » (il a fini son flow communauté
    // jusqu'à `community_ready`). Il ne refait donc PAS la présentation/le form.
    // Il lui reste UNE chose pour activer le coaching : réserver son 1er RDV
    // Calendly (= leçon M1 L1).
    //
    // On le pose sur `step:"form_done"` qui, dans le state-machine coaching, est
    // précisément l'état « questionnaire fini, RDV à réserver » : c'est le step
    // depuis lequel `scenarioForStep` renvoie le scénario `rdv` (relances RDV) et
    // d'où une réservation Calendly mène à `rdv_booked`.
    //
    // ⚠️ On NE rappelle PAS `grantOnboarded` ici : le rôle Onboardé est déjà
    // posé (flow communauté), et pour le coaching il sera (ré)attribué à la
    // réservation Calendly via `markRdvBookedByUser` → `grantOnboarded`. Cette
    // bascule ne déclenche AUCUN appel Discord (sauf `assignDiscordRole` planifié
    // par l'action appelante pour ajouter le rôle Coaching).
    //
    // Robustesse : on ne fait QUE FAIRE AVANCER vers `form_done` les rows encore
    // en amont (awaiting_presentation / link_sent / community_ready). Si l'élève
    // est déjà plus loin dans un flow coaching (form_done / rdv_booked — cas d'un
    // re-traitement), on n'écrase pas son étape.
    const ob = await ctx.db.query("onboardings").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (ob) {
      const stepsToAdvance = ["awaiting_presentation", "link_sent", "community_ready"];
      const nextStep = stepsToAdvance.includes(ob.step) ? "form_done" : ob.step;
      await ctx.db.patch(ob._id, {
        tier: "coaching",
        step: nextStep,
        // Ferme une éventuelle fenêtre d'offre d'upsell encore ouverte (l'upgrade
        // a eu lieu autrement) pour éviter un double-chemin d'upgrade.
        upgradeOfferExpiresAt: undefined,
        updatedAt: Date.now(),
      });
    }
    await logEvent(ctx, { userId, type: "subscription.tier_changed", title: "Upgrade Communauté → Coaching (self-service /compte)", actor: "member", meta: { from: "communaute", to: "coaching", via: "self_service" } });
  },
});
