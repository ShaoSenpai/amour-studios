import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Claim tokens — clé secrète à usage unique liée à un PaymentIntent.
// ----------------------------------------------------------------------------
// Durée de vie : 7 jours.
// Sécurise le /claim contre le hijack de PI ID (impossible à deviner).
// ============================================================================

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Interne : crée un claim token pour un PaymentIntent donné.
 * Appelé depuis `stripe.createSubscription` (action).
 */
export const create = internalMutation({
  args: {
    token: v.string(),
    paymentIntentId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { token, paymentIntentId, email }) => {
    const now = Date.now();
    return await ctx.db.insert("claimTokens", {
      token,
      paymentIntentId,
      email: email || undefined,
      expiresAt: now + TOKEN_TTL_MS,
      createdAt: now,
    });
  },
});

/**
 * Query publique : retourne le purchase associé au token (si valide).
 * Utilisée par la page /claim pour valider le token sans révéler le PI.
 */
export const purchaseForToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!claim) return null;
    if (claim.expiresAt < Date.now()) return { expired: true } as const;

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", claim.paymentIntentId)
      )
      .first();
    if (!purchase) return null;

    return {
      _id: purchase._id,
      status: purchase.status,
      email: purchase.email,
      hasUser: !!purchase.userId,
      alreadyClaimedByMe: false, // renseigné côté mutation
    };
  },
});

/**
 * Mutation publique : lie un purchase au user courant via un claim token valide.
 * - Vérifie que le token existe, n'est pas expiré, pas déjà utilisé.
 * - Lie le purchase au user.
 * - Marque le token comme claimé.
 */
export const claimByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!claim) throw new Error("Lien invalide ou expiré");
    if (claim.expiresAt < Date.now()) {
      throw new Error("Ce lien d'activation a expiré (valide 7 jours)");
    }
    if (claim.claimedAt && claim.claimedByUserId !== userId) {
      throw new Error("Ce lien a déjà été utilisé sur un autre compte");
    }

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", claim.paymentIntentId)
      )
      .first();
    if (!purchase) {
      throw new Error("Paiement introuvable — le webhook Stripe n'est peut-être pas encore arrivé");
    }
    // Abonnements : on accepte "active" et "incomplete" (paiement en cours de
    // confirmation) en plus de "paid" (legacy). On refuse les statuts terminaux.
    const linkable =
      purchase.status === "paid" ||
      purchase.status === "active" ||
      purchase.status === "incomplete";
    if (!linkable) {
      throw new Error(`Ce paiement n'est pas valide (statut : ${purchase.status})`);
    }
    if (purchase.userId && purchase.userId !== userId) {
      throw new Error("Ce paiement est déjà lié à un autre compte");
    }

    // Link purchase ↔ user
    if (!purchase.userId) {
      await ctx.db.patch(purchase._id, { userId });
    }
    const user = await ctx.db.get(userId);
    if (user && !user.purchaseId) {
      await ctx.db.patch(userId, { purchaseId: purchase._id });
    }

    // Burn le token (single-use)
    await ctx.db.patch(claim._id, {
      claimedAt: Date.now(),
      claimedByUserId: userId,
    });

    // Schedule Discord role assignment selon le palier (fail-silent).
    // Uniquement si l'accès est effectif (paid/active). Si "incomplete", le
    // webhook invoice.paid attribuera le rôle dès la confirmation du paiement.
    const accessGranted =
      purchase.status === "paid" || purchase.status === "active";
    if (accessGranted && user?.discordId && user?.email) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: user.discordId,
        email: user.email,
        tier: purchase.tier ?? undefined,
      });
    }

    // Crée l'onboarding directement depuis le tier du purchase LIÉ. Indispensable
    // quand l'email Stripe ≠ email Discord : `ensureForUser` cherche le purchase
    // par email et échouerait, laissant l'élève bloqué en « accès limité » à vie.
    // Ici on a le purchase en main, donc on bypass le matching email.
    // createForPurchase est idempotent (no-op si l'onboarding existe déjà).
    if (accessGranted && purchase.tier) {
      await ctx.scheduler.runAfter(0, internal.onboardings.createForPurchase, {
        userId,
        tier: purchase.tier,
      });
    }

    return { ok: true, purchaseId: purchase._id };
  },
});

/**
 * Interne : garantit un token de claim VALIDE pour un PaymentIntent. Si le
 * token existant est expiré ou absent, en crée un neuf (TTL 7j) et le renvoie.
 * Utilisé par le cron de relance des paiements non activés (le 1er token a pu
 * expirer avant que l'élève ne crée son compte).
 */
export const refreshForPaymentIntent = internalMutation({
  args: { paymentIntentId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, { paymentIntentId, email }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("claimTokens")
      .withIndex("by_payment_intent", (q) =>
        q.eq("paymentIntentId", paymentIntentId)
      )
      .first();
    // Token encore valide et non utilisé → on le réutilise.
    if (existing && !existing.claimedAt && existing.expiresAt > now) {
      return existing.token;
    }
    // Sinon on en génère un neuf.
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.insert("claimTokens", {
      token,
      paymentIntentId,
      email: email || existing?.email || undefined,
      expiresAt: now + TOKEN_TTL_MS,
      createdAt: now,
    });
    return token;
  },
});

/**
 * Interne : retrouve le token d'un PaymentIntent (pour l'email webhook).
 */
export const byPaymentIntent = internalQuery({
  args: { paymentIntentId: v.string() },
  handler: async (ctx, { paymentIntentId }) => {
    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_payment_intent", (q) =>
        q.eq("paymentIntentId", paymentIntentId)
      )
      .first();
    return claim?.token ?? null;
  },
});
