import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

// ============================================================================
// Amour Studios — Stripe actions & mutations
// ----------------------------------------------------------------------------
// createPaymentIntent : appelé par le frontend pour initier un paiement
// fulfillPayment      : mutation interne appelée par le webhook après succès
// ============================================================================

/**
 * Crée un PaymentIntent Stripe pour la formation (497 € one-shot).
 * Retourne le clientSecret pour Stripe Elements côté frontend.
 */
export const createPaymentIntent = action({
  args: {
    email: v.string(),
  },
  handler: async (_ctx, { email }) => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 49700, // 497,00 €
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      receipt_email: email,
      metadata: {
        product: "amourstudios_programme_createur",
        email,
      },
    });

    return { clientSecret: paymentIntent.client_secret };
  },
});

/**
 * Mutation interne : stocke un purchase après paiement validé par webhook.
 * Idempotent via stripePaymentIntentId (on ne crée pas de doublon).
 */
export const fulfillPayment = internalMutation({
  args: {
    email: v.string(),
    stripeSessionId: v.string(),
    stripePaymentIntentId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    // Idempotence — vérifier si on a déjà traité ce PaymentIntent
    const existing = await ctx.db
      .query("purchases")
      .filter((q) =>
        q.eq(q.field("stripePaymentIntentId"), args.stripePaymentIntentId)
      )
      .first();

    if (existing) return existing._id;

    const now = Date.now();
    const purchaseId = await ctx.db.insert("purchases", {
      email: args.email,
      stripeSessionId: args.stripeSessionId,
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeCustomerId: args.stripeCustomerId,
      amount: args.amount,
      currency: args.currency,
      status: "paid",
      createdAt: now,
      paidAt: now,
    });

    // Si un user avec cet email existe déjà → lier le purchase
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (user && !user.purchaseId) {
      await ctx.db.patch(user._id, { purchaseId });
    }

    return purchaseId;
  },
});

/**
 * Query interne : trouver un user par email (pour le webhook).
 */
export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
  },
});

/**
 * Action interne : appelle le bot Discord pour assigner le rôle VIP.
 * Appelé depuis le webhook après fulfillPayment.
 * Fail silently — ne bloque pas le paiement si le bot est down.
 */
export const assignDiscordRole = internalAction({
  args: {
    discordId: v.string(),
    email: v.string(),
  },
  handler: async (_ctx, { discordId, email }) => {
    const botEndpoint = process.env.DISCORD_BOT_ENDPOINT;
    const botSecret = process.env.DISCORD_BOT_ENDPOINT_SECRET;

    if (!botEndpoint || !botSecret) {
      console.warn("Discord bot endpoint not configured, skipping role assign");
      return;
    }

    try {
      const res = await fetch(`${botEndpoint}/assign-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ discordId, email }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`✅ Discord role assigned: ${data.status} (${data.member})`);
      } else {
        console.warn(`⚠️ Discord role assign failed: ${data.error}`);
      }
    } catch (err) {
      console.warn("⚠️ Discord bot unreachable:", err);
    }
  },
});

/**
 * Action interne : annonce un événement côté Discord (badge, nouveau contenu).
 * Appelle `POST ${DISCORD_BOT_ENDPOINT}/announce` avec Authorization Bearer.
 * Fail silent — ne bloque pas le flow métier si le bot est down ou pas encore
 * déployé (le contrat `/announce` est à ajouter côté bot par Florent).
 */
export const announceToDiscord = internalAction({
  args: {
    type: v.union(v.literal("badge_earned"), v.literal("new_content")),
    payload: v.object({
      userName: v.optional(v.string()),
      userDiscordId: v.optional(v.string()),
      badgeLabel: v.optional(v.string()),
      lessonTitle: v.optional(v.string()),
      moduleTitle: v.optional(v.string()),
      lessonId: v.optional(v.string()),
    }),
  },
  handler: async (_ctx, { type, payload }) => {
    const botEndpoint = process.env.DISCORD_BOT_ENDPOINT;
    const botSecret = process.env.DISCORD_BOT_ENDPOINT_SECRET;

    if (!botEndpoint || !botSecret) {
      console.warn("Discord bot endpoint not configured, skipping announce");
      return;
    }

    try {
      const res = await fetch(`${botEndpoint}/announce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ type, payload }),
      });

      if (res.ok) {
        console.log(`✅ Discord announce sent: ${type}`);
      } else {
        // Endpoint pas encore déployé côté bot → log discret, pas d'erreur.
        const data = await res.json().catch(() => ({}));
        console.warn(`⚠️ Discord announce failed (${res.status}):`, data.error ?? res.statusText);
      }
    } catch (err) {
      console.warn("⚠️ Discord bot unreachable (announce):", err);
    }
  },
});
