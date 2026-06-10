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
// Amour Studios — Stripe : abonnements (Communauté 79€ / Coaching 179€)
// ----------------------------------------------------------------------------
// createSubscription : appelé par le frontend pour initier un abonnement.
// recordSubscription / setSubscriptionStatus : maj internes (webhook).
// assignDiscordRole / removeDiscordRoles : pilotage des rôles Discord par palier.
//
// Modèle :
//   communaute        → abonnement mensuel récurrent (79€) sans fin.
//   coaching + 1mois   → abonnement mensuel récurrent (179€), résiliable.
//   coaching + 3mois   → abonnement 179€/mois avec cancel_at ≈ 90j (fin auto).
//   Le 179 inclut la communauté → rôles Discord : Membre (+ Coaching).
// ============================================================================

const EMAIL_RE =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

type Tier = "communaute" | "coaching";

function priceForTier(tier: Tier): string {
  const price =
    tier === "coaching"
      ? process.env.STRIPE_PRICE_COACHING
      : process.env.STRIPE_PRICE_COMMUNITY;
  if (!price) {
    throw new Error(
      `Prix Stripe non configuré pour le palier "${tier}" (STRIPE_PRICE_${tier === "coaching" ? "COACHING" : "COMMUNITY"})`
    );
  }
  return price;
}

/**
 * Action publique : crée (ou réutilise) un Customer Stripe + une Subscription
 * en mode `default_incomplete`, et renvoie le clientSecret du PaymentIntent
 * de la première facture pour Stripe Elements côté frontend.
 *
 * Pré-crée le purchase (status "incomplete") avec l'ID du PaymentIntent, pour
 * que le /claim fonctionne même avant l'arrivée du webhook.
 */
export const createSubscription = action({
  args: {
    offre: v.union(v.literal("communaute"), v.literal("coaching")),
    duree: v.optional(v.union(v.literal("1mois"), v.literal("3mois"))),
    email: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { offre, duree, email, phone }) => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      throw new Error("Email invalide");
    }
    if (normalizedEmail.length > 254) throw new Error("Email trop long");

    const tier: Tier = offre === "coaching" ? "coaching" : "communaute";
    const priceId = priceForTier(tier);
    const cleanPhone =
      typeof phone === "string" && phone.trim() ? phone.trim().slice(0, 32) : undefined;

    // Réutiliser le Customer existant (par email) ou en créer un.
    const found = await stripe.customers.list({ email: normalizedEmail, limit: 1 });
    const customer =
      found.data[0] ??
      (await stripe.customers.create({
        email: normalizedEmail,
        phone: cleanPhone,
        metadata: { source: "amourstudios.fr/paiement" },
      }));

    const claimToken = generateClaimToken();

    // Coaching 3 mois = engagement : l'abonnement se termine seul après ~90j.
    const cancelAt =
      tier === "coaching" && duree === "3mois"
        ? Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
        : undefined;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        // Limite aux cartes (inclut Apple Pay + Google Pay qui sont des wallets
        // par-dessus la card). Exclut Klarna, Amazon Pay, Link, virements.
        payment_method_types: ["card"],
      },
      // Depuis l'API 2026-03-25.dahlia, le PaymentIntent n'est plus exposé sur
      // `latest_invoice.payment_intent`. On expand `confirmation_secret` qui
      // contient { client_secret, type } — le client_secret a la forme
      // "pi_xxx_secret_yyy", on en extrait l'ID PI pour le claim token.
      expand: ["latest_invoice.confirmation_secret"],
      ...(cancelAt ? { cancel_at: cancelAt } : {}),
      metadata: {
        tier,
        duree: duree ?? "",
        email: normalizedEmail,
        claim_token: claimToken,
        source: "amourstudios.fr/paiement",
      },
    });

    // Récupère le client_secret depuis confirmation_secret (nouvelle API).
    const invoice = subscription.latest_invoice as unknown as {
      confirmation_secret?: { client_secret?: string | null; type?: string } | null;
    } | null;
    const cs = invoice?.confirmation_secret?.client_secret ?? null;
    if (!cs || !cs.startsWith("pi_") || !cs.includes("_secret_")) {
      throw new Error("Stripe: confirmation_secret introuvable sur la première facture");
    }
    const piId = cs.split("_secret_")[0];
    const pi = { id: piId, client_secret: cs };

    // Claim token lié au PaymentIntent (sécurise /claim).
    await ctx.runMutation(internal.claimTokens.create, {
      token: claimToken,
      paymentIntentId: pi.id,
      email: normalizedEmail,
    });

    // Pré-enregistre l'abonnement (incomplete) pour que /claim trouve le purchase.
    const priceAmount =
      typeof subscription.items.data[0]?.price?.unit_amount === "number"
        ? subscription.items.data[0].price.unit_amount!
        : 0;
    await ctx.runMutation(internal.stripe.recordSubscription, {
      email: normalizedEmail,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customer.id,
      stripePaymentIntentId: pi.id,
      stripePriceId: priceId,
      tier,
      duree: duree,
      amount: priceAmount,
      currency: subscription.currency ?? "eur",
      status: "incomplete",
      phone: cleanPhone,
    });

    return {
      clientSecret: pi.client_secret,
      claimToken,
      tier,
    };
  },
});

/**
 * @deprecated Ancien flux « Programme Créateur » (paiement unique 497€), remplacé
 * par les abonnements (`createSubscription`). Conservé uniquement pour que le
 * composant in-app `components/payment/payment-modal.tsx` (plateforme vidéos EN
 * PAUSE) continue de compiler. Lève volontairement une erreur à l'exécution pour
 * éviter tout débit erroné tant que la plateforme n'est pas réactivée et migrée.
 */
export const createPaymentIntent = action({
  args: {
    email: v.string(),
    mode: v.optional(v.union(v.literal("1x"), v.literal("3x"))),
  },
  handler: async (): Promise<{
    clientSecret: string;
    claimToken: string;
    tier: string;
  }> => {
    throw new Error(
      "createPaymentIntent est déprécié — la plateforme vidéos est en pause. Utiliser createSubscription (abonnements)."
    );
  },
});

/**
 * Mutation interne : upsert d'un abonnement (clé = stripeSubscriptionId).
 * Idempotent : si l'abonnement existe déjà, on patch ; sinon on insère.
 * Lie au user si un user avec cet email existe déjà.
 */
export const recordSubscription = internalMutation({
  args: {
    email: v.string(),
    stripeSubscriptionId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    tier: v.optional(v.union(v.literal("communaute"), v.literal("coaching"))),
    duree: v.optional(v.union(v.literal("1mois"), v.literal("3mois"))),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete")
    ),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("purchases")
      .withIndex("by_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (existing) {
      // Patch sans écraser des champs déjà connus avec des undefined.
      const patch: Record<string, unknown> = { status: args.status };
      if (args.stripeCustomerId) patch.stripeCustomerId = args.stripeCustomerId;
      if (args.stripePaymentIntentId)
        patch.stripePaymentIntentId = args.stripePaymentIntentId;
      if (args.stripePriceId) patch.stripePriceId = args.stripePriceId;
      if (args.tier) patch.tier = args.tier;
      if (args.duree) patch.duree = args.duree;
      if (typeof args.amount === "number") patch.amount = args.amount;
      if (args.currency) patch.currency = args.currency;
      if (typeof args.currentPeriodEnd === "number")
        patch.currentPeriodEnd = args.currentPeriodEnd;
      if (typeof args.cancelAtPeriodEnd === "boolean")
        patch.cancelAtPeriodEnd = args.cancelAtPeriodEnd;
      if (args.phone) patch.phone = args.phone;
      if (args.status === "active" && !existing.paidAt) patch.paidAt = now;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const purchaseId = await ctx.db.insert("purchases", {
      email: args.email,
      stripeSessionId: args.stripeSubscriptionId,
      stripePaymentIntentId: args.stripePaymentIntentId ?? args.stripeSubscriptionId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      tier: args.tier,
      duree: args.duree,
      amount: args.amount ?? 0,
      currency: args.currency ?? "eur",
      status: args.status,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      phone: args.phone,
      source: "stripe",
      createdAt: now,
      paidAt: args.status === "active" ? now : undefined,
    });

    // Lier au user si déjà existant (sinon le /claim le fera).
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
 * Query interne : retrouve le purchase lié à un abonnement Stripe.
 */
export const findPurchaseBySubscription = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) => {
    return await ctx.db
      .query("purchases")
      .withIndex("by_subscription", (q) =>
        q.eq("stripeSubscriptionId", stripeSubscriptionId)
      )
      .first();
  },
});

/**
 * Query interne : déduit le palier d'accès le plus élevé d'un email à partir de
 * ses achats actifs (coaching > communauté). Utilisé par assignDiscordRole quand
 * le tier n'est pas passé explicitement (ex : login Discord via auth.ts).
 */
export const latestTierForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const live = purchases.filter(
      (p) => p.status === "active" || p.status === "paid"
    );
    if (live.some((p) => p.tier === "coaching")) return "coaching" as const;
    if (live.some((p) => p.tier === "communaute")) return "communaute" as const;
    return null;
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

// ── Discord : pilotage des rôles par palier ─────────────────────────────────

/**
 * Action interne : synchronise les rôles Discord du membre pour matcher son
 * palier (communaute → Membre ; coaching → Membre + Coaching). Idempotent.
 * Appelé après paiement, au /claim, et sur upgrade/downgrade.
 * Fail-silent : ne bloque jamais le flux paiement si le bot est down.
 */
export const assignDiscordRole = internalAction({
  args: {
    discordId: v.string(),
    email: v.string(),
    tier: v.optional(v.union(v.literal("communaute"), v.literal("coaching"))),
  },
  handler: async (ctx, { discordId, email, tier }) => {
    const botEndpoint = process.env.DISCORD_BOT_ENDPOINT;
    const botSecret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!botEndpoint || !botSecret) {
      console.warn("Discord bot endpoint not configured, skipping role sync");
      return;
    }
    // Si le palier n'est pas fourni, le déduire des achats actifs du user.
    const resolvedTier =
      tier ??
      (await ctx.runQuery(internal.stripe.latestTierForEmail, { email })) ??
      "communaute";
    try {
      const res = await fetch(`${botEndpoint}/sync-roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ discordId, email, tier: resolvedTier }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`✅ Discord roles synced (${resolvedTier}): ${data.status ?? "ok"} (${data.member ?? discordId})`);
      } else {
        console.warn(`⚠️ Discord role sync failed: ${data.error ?? res.statusText}`);
      }
    } catch (err) {
      console.warn("⚠️ Discord bot unreachable (sync-roles):", err);
    }
  },
});

/**
 * Action interne : retire tous les rôles gérés (résiliation / fin d'engagement).
 * Fail-silent.
 */
export const removeDiscordRoles = internalAction({
  args: { discordId: v.string(), email: v.string() },
  handler: async (_ctx, { discordId, email }) => {
    const botEndpoint = process.env.DISCORD_BOT_ENDPOINT;
    const botSecret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!botEndpoint || !botSecret) {
      console.warn("Discord bot endpoint not configured, skipping role removal");
      return;
    }
    try {
      const res = await fetch(`${botEndpoint}/remove-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botSecret}`,
        },
        body: JSON.stringify({ discordId, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`✅ Discord roles removed: ${data.status ?? "ok"} (${discordId})`);
      } else {
        console.warn(`⚠️ Discord role removal failed: ${data.error ?? res.statusText}`);
      }
    } catch (err) {
      console.warn("⚠️ Discord bot unreachable (remove-role):", err);
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
