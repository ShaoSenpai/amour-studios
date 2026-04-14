import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// Génère un token aléatoire cryptographiquement sûr (32 octets = 64 chars hex).
function generateClaimToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Amour Studios — Stripe actions & mutations
// ----------------------------------------------------------------------------
// createPaymentIntent : appelé par le frontend pour initier un paiement
// fulfillPayment      : mutation interne appelée par le webhook après succès
// ============================================================================

/**
 * Crée un PaymentIntent Stripe (mode 1× ou 3×).
 * Retourne le clientSecret pour Stripe Elements côté frontend.
 *
 * Mode "1x" : PaymentIntent CB de 497 €.
 * Mode "3x" : PaymentIntent Klarna de 497 € (Klarna débite 3× 165,67 € côté client,
 *             nous on encaisse 497 € en une fois, Klarna prend le risque de défaut).
 */
export const createPaymentIntent = action({
  args: {
    email: v.string(),
    mode: v.optional(v.union(v.literal("1x"), v.literal("3x"))),
  },
  handler: async (ctx, { email, mode = "1x" }) => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });

    const normalizedEmail = email.trim().toLowerCase();
    // Email optionnel même en 3× : Stripe accepte un Customer sans email.
    // Il sera collecté au confirmPayment via billing_details côté frontend.
    // Regex RFC-ish stricte : 1 seul @, pas de multi-points consécutifs,
    // TLD min 2 chars, caractères autorisés uniquement.
    const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (normalizedEmail && !EMAIL_RE.test(normalizedEmail)) {
      throw new Error("Email invalide");
    }
    if (normalizedEmail && normalizedEmail.length > 254) {
      throw new Error("Email trop long");
    }

    if (mode === "1x") {
      const claimToken = generateClaimToken();
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
          claim_token: claimToken,
        },
      });
      await ctx.runMutation(internal.claimTokens.create, {
        token: claimToken,
        paymentIntentId: paymentIntent.id,
        email: normalizedEmail,
      });
      return {
        clientSecret: paymentIntent.client_secret,
        amount: 49700,
        currency: "eur",
        mode: "1x",
        claimToken,
      };
    }

    // ─── 3× mode : PaymentIntent Klarna ─────────────────────────
    // Klarna "Pay in 3" : client paie 3× sans frais, Stripe nous verse
    // les 497 € en une fois (J+1), Klarna assume le risque de défaut.
    // Redirection obligatoire vers l'UI Klarna pour l'autorisation.
    const claimToken = generateClaimToken();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 49700,
      currency: "eur",
      payment_method_types: ["klarna"],
      payment_method_options: {
        klarna: {
          preferred_locale: "fr-FR",
        },
      },
      receipt_email: normalizedEmail || undefined,
      description: "AMOURstudios® — Le Programme Créateur (3× Klarna)",
      metadata: {
        product: "amourstudios_programme_createur",
        mode: "3x",
        source: "amourstudios.fr/paiement",
        email: normalizedEmail,
        claim_token: claimToken,
      },
    });

    await ctx.runMutation(internal.claimTokens.create, {
      token: claimToken,
      paymentIntentId: paymentIntent.id,
      email: normalizedEmail,
    });

    return {
      clientSecret: paymentIntent.client_secret,
      amount: 49700,
      currency: "eur",
      mode: "3x",
      claimToken,
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
