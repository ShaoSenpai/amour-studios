import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";

// ============================================================================
// Amour Studios — Stripe actions & mutations
// ----------------------------------------------------------------------------
// createPaymentIntent : appelé par le frontend pour initier un paiement
// fulfillPayment      : mutation interne appelée par le webhook après succès
// ============================================================================

/**
 * Crée un PaymentIntent (1×) ou une Subscription (3×) Stripe.
 * Retourne le clientSecret pour Stripe Elements côté frontend.
 *
 * Mode "1x" : PaymentIntent simple de 497 €.
 * Mode "3x" : Customer + Subscription mensuelle 166 € × 3 cycles
 *             (cancel_at = +90j → 3 paiements puis stop auto).
 */
export const createPaymentIntent = action({
  args: {
    email: v.string(),
    mode: v.optional(v.union(v.literal("1x"), v.literal("3x"))),
  },
  handler: async (_ctx, { email, mode = "1x" }) => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });

    const normalizedEmail = email.trim().toLowerCase();
    // Email optionnel même en 3× : Stripe accepte un Customer sans email.
    // Il sera collecté au confirmPayment via billing_details côté frontend.
    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      throw new Error("Email invalide");
    }

    if (mode === "1x") {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 49700,
        currency: "eur",
        // Card inclut auto Apple Pay + Google Pay. `allow_redirects: never`
        // exclut Bancontact/iDEAL/Klarna/Wero/EPS (tous redirect-based).
        // PayPal à réactiver dès que le compte Stripe l'a enabled côté dashboard.
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        receipt_email: normalizedEmail || undefined,
        description: "AMOURstudios® — Le Programme Créateur (1×)",
        metadata: {
          product: "amourstudios_programme_createur",
          mode: "1x",
          source: "amourstudios.fr/paiement",
          email: normalizedEmail,
        },
      });
      return {
        clientSecret: paymentIntent.client_secret,
        amount: 49700,
        currency: "eur",
        mode: "1x",
      };
    }

    // ─── 3× mode : Subscription ────────────────────────────────
    const PRICE_3X = process.env.STRIPE_PRICE_ID_3X;
    if (!PRICE_3X) {
      throw new Error("STRIPE_PRICE_ID_3X non configuré côté Convex");
    }

    // Réutilise un Customer existant si email fourni, sinon crée (avec ou sans email)
    let customer;
    if (normalizedEmail) {
      const existing = await stripe.customers.list({
        email: normalizedEmail,
        limit: 1,
      });
      customer =
        existing.data.length > 0
          ? existing.data[0]
          : await stripe.customers.create({
              email: normalizedEmail,
              description: "AMOURstudios® — inscription 3× paiement",
              metadata: { source: "amourstudios.fr/paiement" },
            });
    } else {
      customer = await stripe.customers.create({
        description: "AMOURstudios® — inscription 3× paiement (email à confirmer)",
        metadata: { source: "amourstudios.fr/paiement" },
      });
    }

    const threeMonthsFromNow =
      Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_3X }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      // Stripe API ≥ 2024-11 : payment_intent est déprécié sur invoice.
      // On expand les 2 chemins et on fallback : confirmation_secret (nouveau)
      // puis payment_intent (legacy).
      expand: [
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
      ],
      cancel_at: threeMonthsFromNow,
      description: "AMOURstudios® — Le Programme Créateur (3×)",
      metadata: {
        product: "amourstudios_programme_createur",
        mode: "3x",
        source: "amourstudios.fr/paiement",
      },
    });

    const invoice = subscription.latest_invoice as
      | {
          confirmation_secret?: { client_secret?: string | null } | null;
          payment_intent?: { client_secret?: string | null } | string | null;
        }
      | null;

    let clientSecret: string | null = null;
    if (invoice && typeof invoice === "object") {
      // 1) Nouveau champ (Stripe API ≥ 2024-11)
      if (
        invoice.confirmation_secret &&
        typeof invoice.confirmation_secret === "object" &&
        invoice.confirmation_secret.client_secret
      ) {
        clientSecret = invoice.confirmation_secret.client_secret;
      }
      // 2) Ancien champ (backward compat)
      if (
        !clientSecret &&
        invoice.payment_intent &&
        typeof invoice.payment_intent === "object" &&
        invoice.payment_intent.client_secret
      ) {
        clientSecret = invoice.payment_intent.client_secret;
      }
    }

    if (!clientSecret) {
      throw new Error(
        "Subscription créée mais payment_intent manquant côté Stripe"
      );
    }

    return {
      clientSecret,
      amount: 16600,
      currency: "eur",
      mode: "3x",
      subscriptionId: subscription.id,
    };
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
