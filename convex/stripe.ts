import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";

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

    // Rate limit par email DANS l'action (pas seulement sur la route HTTP) :
    // createSubscription est une action publique, donc appelable directement
    // via le client Convex en contournant le rate-limit du handler /api. On
    // limite à 5 créations d'abonnement/min par email pour bloquer le spam de
    // customers + subscriptions Stripe.
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, {
      key: `createSubscription:${normalizedEmail}`,
      max: 5,
    });
    if (!rl.allowed) {
      throw new Error("Trop de tentatives. Attends une minute et réessaie.");
    }

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
 * Action publique : UPSELL Communauté → Coaching depuis l'écran de fin
 * d'onboarding (/onboarding/[token], step community_ready). Débite +100€
 * one-time (off-session) sur la carte déjà enregistrée du membre, puis bascule
 * son abonnement sur le price coaching (sans proration : le +100€ couvre le
 * passage, coaching mensuel dès le prochain cycle).
 *
 * Garde-fous PAIEMENT :
 *  - Fenêtre stricte : upgradeOfferExpiresAt doit être dans le futur.
 *  - Idempotence : si déjà coaching → { ok, already } SANS débit.
 *  - Rate-limit : 5 tentatives/min par token.
 *  - PaymentIntent confirm:true off_session — si status ≠ succeeded, on throw
 *    (v1 : pas de relance SCA via Elements) et on NE bascule PAS l'abonnement.
 */
export const upgradeToCoaching = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ ok: true; already?: boolean }> => {
    // 1) Charge l'onboarding + purchase + contact (accès db via internalQuery).
    const data = await ctx.runQuery(internal.onboardings._obByToken, { token });
    if (!data) throw new Error("Offre expirée ou non éligible.");

    // 2) IDEMPOTENCE — déjà coaching (onboarding OU purchase) : aucun débit.
    if (data.tier === "coaching" || data.purchaseTier === "coaching") {
      return { ok: true, already: true };
    }

    // 3) Éligibilité stricte (tier/step/fenêtre).
    if (
      data.tier !== "communaute" ||
      data.step !== "community_ready" ||
      !data.upgradeOfferExpiresAt ||
      Date.now() >= data.upgradeOfferExpiresAt
    ) {
      throw new Error("Offre expirée ou non éligible.");
    }

    // 4) Rate-limit par token (action publique → appelable directement).
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, {
      key: `upgrade:${token}`,
      max: 5,
    });
    if (!rl.allowed) {
      throw new Error("Trop de tentatives. Attends une minute et réessaie.");
    }

    // 5) Besoin d'un abonnement + customer Stripe.
    const subId = data.stripeSubscriptionId;
    const customerId = data.stripeCustomerId;
    if (!subId || !customerId) {
      throw new Error("Aucun abonnement Stripe à mettre à niveau.");
    }

    const coachingPriceId = priceForTier("coaching");
    const stripe = await stripeClient();

    // 6) Récupère l'abonnement + le moyen de paiement par défaut.
    const sub = await stripe.subscriptions.retrieve(subId);

    const pmFromSub =
      typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : sub.default_payment_method?.id;
    let paymentMethodId: string | undefined = pmFromSub;
    if (!paymentMethodId) {
      const cust = await stripe.customers.retrieve(customerId);
      if (!cust.deleted) {
        const dpm = cust.invoice_settings?.default_payment_method;
        paymentMethodId = typeof dpm === "string" ? dpm : dpm?.id;
      }
    }
    if (!paymentMethodId) {
      throw new Error("Aucune carte enregistrée pour l'upgrade.");
    }

    // 7) Débit one-time +100€ off-session (carte déjà enregistrée).
    // ⚠️ idempotencyKey par token : si une étape ULTÉRIEURE plante (bascule sub
    // ou patch Convex) et que le membre réessaie, Stripe renvoie LE MÊME
    // PaymentIntent au lieu de re-débiter. Garde-fou anti double-débit.
    let pi;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: 10000,
          currency: "eur",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: "Upgrade Communauté → Coaching (+100€)",
          metadata: { type: "upgrade", token, userId: data.userId },
        },
        { idempotencyKey: `upgrade-pi:${token}` }
      );
    } catch (err) {
      // Off-session : une carte refusée / nécessitant une 3DS lève une erreur
      // Stripe ici. Rien n'est encaissé. Message propre (pas de flux SCA v1).
      console.warn("⚠️ upgrade PI échec:", err instanceof Error ? err.message : err);
      throw new Error(
        "Le paiement n'a pas pu être validé (carte refusée ou validation requise). Réessaie ou contacte le support."
      );
    }
    if (pi.status !== "succeeded") {
      // Carte nécessitant une authentification (3DS) : on n'a pas de flux SCA
      // côté Elements en v1 → on ne bascule PAS l'abonnement. Le débit n'est
      // pas capturé (requires_action) donc rien n'est encaissé.
      throw new Error(
        "Ta carte demande une validation. Réessaie ou contacte le support."
      );
    }

    // 8) Bascule l'abonnement sur le price coaching, sans proration.
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error("Subscription Stripe sans item.");
    await stripe.subscriptions.update(subId, {
      items: [{ id: itemId, price: coachingPriceId }],
      proration_behavior: "none",
      metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: "1mois" },
    });

    // 9) Applique l'upgrade côté Convex (purchase + onboarding + rôle Discord).
    if (data.purchaseId) {
      await ctx.runMutation(internal.onboardings._applyUpgradePurchase, {
        purchaseId: data.purchaseId,
        stripePriceId: coachingPriceId,
      });
    }
    await ctx.runMutation(internal.onboardings._applyUpgradeOnboarding, {
      onboardingId: data.onboardingId,
    });
    if (data.discordId) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: data.discordId,
        email: data.email ?? "",
        tier: "coaching",
      });
    }

    return { ok: true };
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
 * Mutation interne : « claim » un event Stripe pour garantir l'idempotence du
 * webhook. Insère l'event.id ; renvoie { duplicate: true } s'il était déjà
 * traité (retry Stripe). Transactionnel → check-and-insert atomique, donc deux
 * livraisons concurrentes du même event ne peuvent pas être traitées 2 fois.
 */
export const claimStripeEvent = internalMutation({
  args: { eventId: v.string(), type: v.string() },
  handler: async (ctx, { eventId, type }) => {
    const existing = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();
    if (existing) return { duplicate: true as const };
    await ctx.db.insert("processedStripeEvents", {
      eventId,
      type,
      processedAt: Date.now(),
    });
    return { duplicate: false as const };
  },
});

/**
 * Mutation interne : upsert d'un abonnement (clé = stripeSubscriptionId).
 * Idempotent : si l'abonnement existe déjà, on patch ; sinon on insère.
 * Lie au user si un user avec cet email existe déjà (dans les DEUX branches).
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

      // Lier au user si pas encore lié : le webhook subscription.updated /
      // invoice.paid arrive souvent APRÈS la création du user (login Discord),
      // donc la liaison de la branche insert ci-dessous ne suffit pas.
      if (args.email) {
        const linkUser = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", args.email))
          .first();
        if (linkUser && !linkUser.purchaseId) {
          await ctx.db.patch(linkUser._id, { purchaseId: existing._id });
        }
      }
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
    // past_due inclus : cohérent avec isActiveStatus (lib/access) — un impayé
    // en cours de retry Stripe garde son palier (sinon le fallback retombait
    // sur "communaute" pour un coaching past_due sans tier explicite).
    const live = purchases.filter(
      (p) =>
        p.status === "active" || p.status === "paid" || p.status === "past_due"
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
    // Compteur de tentatives (retry auto via scheduler). 0 au 1er appel.
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { discordId, email, tier, attempt }) => {
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

    const tryNum = attempt ?? 0;
    const MAX_RETRIES = 3; // 1er essai + 3 retries = 4 tentatives au total
    // Retry programmé : un élève payant ne doit pas rester sans rôle si le bot
    // est momentanément down (403 hiérarchie, 404 membre pas encore arrivé…).
    const scheduleRetry = async (reason: string) => {
      if (tryNum < MAX_RETRIES) {
        const delayMs = (tryNum + 1) * 60_000; // 1min, 2min, 3min
        await ctx.scheduler.runAfter(delayMs, internal.stripe.assignDiscordRole, {
          discordId,
          email,
          tier: resolvedTier,
          attempt: tryNum + 1,
        });
        console.warn(`⚠️ Discord role sync retry ${tryNum + 1}/${MAX_RETRIES} dans ${delayMs / 1000}s (${reason})`);
      } else {
        // Échec définitif → alerte Walid pour action manuelle.
        await ctx.runAction(internal.discord.postAlertToStaff, {
          content:
            `🛑 **Attribution de rôle Discord échouée** — ${email} (${discordId})\n` +
            `Après ${MAX_RETRIES + 1} tentatives : ${reason}.\n` +
            `→ Assigne le rôle manuellement ou vérifie la hiérarchie du bot.`,
        }).catch(() => {});
      }
    };

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
        await scheduleRetry(`HTTP ${res.status} ${data.error ?? res.statusText}`);
      }
    } catch (err) {
      await scheduleRetry(`bot injoignable (${err instanceof Error ? err.message : "network"})`);
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

// ============================================================================
// SAV admin — actions Stripe pour la fiche élève /studio
// ----------------------------------------------------------------------------
// cancelSubscription / refundLastInvoice / createCustomerPortalLink /
// changeTier / forceSyncFromStripe.
// Toutes admin-only (requireAdmin sur la mutation interne d'autorisation, le
// gating est fait en début d'action via requireAdminPing).
// ============================================================================

/** Query interne : ping admin-only (gating d'autorisation des actions SAV). */
export const requireAdminPing = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return true;
  },
});

/** Query interne : retrouve un purchase par son Id Convex. */
export const findPurchaseById = internalQuery({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, { purchaseId }) => {
    return await ctx.db.get(purchaseId);
  },
});

/** Query interne : retrouve l'éventuel user lié à un purchase (via email). */
export const findUserByPurchase = internalQuery({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, { purchaseId }) => {
    const purchase = await ctx.db.get(purchaseId);
    if (!purchase) return null;
    const email = (purchase.email ?? "").trim().toLowerCase();
    if (!email) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    return user ?? null;
  },
});

/**
 * Mutation interne : patch optimiste d'un purchase (status / tier / duree /
 * cancelAtPeriodEnd / currentPeriodEnd / stripePriceId). Le webhook Stripe
 * écrasera/confirmera ces valeurs à l'arrivée — on les pose tôt pour UX.
 */
export const patchPurchase = internalMutation({
  args: {
    purchaseId: v.id("purchases"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("failed"),
        v.literal("active"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("incomplete")
      )
    ),
    tier: v.optional(v.union(v.literal("communaute"), v.literal("coaching"))),
    duree: v.optional(v.union(v.literal("1mois"), v.literal("3mois"))),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    currentPeriodEnd: v.optional(v.number()),
    stripePriceId: v.optional(v.string()),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, { purchaseId, ...rest }) => {
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(purchaseId, patch);
  },
});

// --- Helpers internes (factorisation des actions SAV) -----------------------

type PurchaseDoc = {
  _id: string;
  email: string;
  status: string;
  tier?: "communaute" | "coaching";
  duree?: "1mois" | "3mois";
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripePaymentIntentId?: string;
  stripePriceId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number;
};

async function stripeClient() {
  const Stripe = (await import("stripe")).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-03-25.dahlia",
  });
}

/**
 * Action admin : annule un abonnement Stripe (immédiatement ou à la fin de la
 * période). Si immédiat + coaching → retire les rôles Discord.
 */
export const cancelSubscription = action({
  args: {
    purchaseId: v.id("purchases"),
    immediate: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { purchaseId, immediate, reason }): Promise<{ ok: true }> => {
    await ctx.runQuery(internal.stripe.requireAdminPing, {});
    const purchase = (await ctx.runQuery(internal.stripe.findPurchaseById, {
      purchaseId,
    })) as PurchaseDoc | null;
    if (!purchase) throw new Error("Achat introuvable");
    const subId = purchase.stripeSubscriptionId;
    if (!subId) throw new Error("Aucun abonnement Stripe lié à cet achat");

    const stripe = await stripeClient();
    if (immediate) {
      await stripe.subscriptions.cancel(subId);
      await ctx.runMutation(internal.stripe.patchPurchase, {
        purchaseId,
        status: "canceled",
        cancelAtPeriodEnd: false,
      });
    } else {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
      await ctx.runMutation(internal.stripe.patchPurchase, {
        purchaseId,
        cancelAtPeriodEnd: true,
      });
    }

    // Si annulation immédiate ET coaching → on retire les rôles Discord.
    // (Pour fin de période, on laisse l'accès jusqu'à expiration ; le webhook
    // customer.subscription.deleted fera le ménage à l'échéance.)
    if (immediate) {
      const user = await ctx.runQuery(internal.stripe.findUserByPurchase, {
        purchaseId,
      });
      if (user?.discordId) {
        await ctx.runAction(internal.stripe.removeDiscordRoles, {
          discordId: user.discordId,
          email: purchase.email,
        });
      }
    }

    await ctx.runMutation(internal.events.recordEventByEmail, {
      email: purchase.email,
      type: "subscription.canceled",
      title: immediate
        ? "Abonnement annulé (immédiat)"
        : "Abonnement annulé (fin de période)",
      meta: JSON.stringify({
        immediate,
        reason: reason ?? null,
        subscriptionId: subId,
      }),
      actor: "admin",
    });

    return { ok: true };
  },
});

/**
 * Action admin : rembourse la dernière facture (ou un montant partiel) d'un
 * abonnement. Cherche le PaymentIntent en priorité via le purchase, sinon via
 * la dernière facture Stripe du customer.
 */
export const refundLastInvoice = action({
  args: {
    purchaseId: v.id("purchases"),
    amount: v.optional(v.number()),
    reason: v.optional(
      v.union(
        v.literal("duplicate"),
        v.literal("fraudulent"),
        v.literal("requested_by_customer")
      )
    ),
  },
  handler: async (
    ctx,
    { purchaseId, amount, reason }
  ): Promise<{ ok: true; refundId: string; amount: number }> => {
    await ctx.runQuery(internal.stripe.requireAdminPing, {});
    const purchase = (await ctx.runQuery(internal.stripe.findPurchaseById, {
      purchaseId,
    })) as PurchaseDoc | null;
    if (!purchase) throw new Error("Achat introuvable");

    const stripe = await stripeClient();

    // Stratégie : 1) PI déjà connu sur le purchase ; 2) sinon, dernière invoice
    // payée du customer Stripe.
    let paymentIntentId: string | undefined = purchase.stripePaymentIntentId;
    if (paymentIntentId && !paymentIntentId.startsWith("pi_")) {
      // Sentinelle : recordSubscription stocke parfois le subId à la place.
      paymentIntentId = undefined;
    }
    if (!paymentIntentId) {
      const customerId = purchase.stripeCustomerId;
      if (!customerId) {
        throw new Error("Pas de PaymentIntent ni de customer Stripe pour cet achat");
      }
      // Depuis l'API 2026-03-25.dahlia, le PI n'est plus directement sur
      // `invoice.payment_intent` : il faut passer par `invoice.payments`
      // (expand requis) → `payment.payment_intent`.
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 5,
        status: "paid",
        expand: ["data.payments"],
      });
      for (const inv of invoices.data) {
        const payments =
          (inv as unknown as {
            payments?: {
              data?: Array<{
                payment?: { payment_intent?: string | { id: string } };
              }>;
            };
          }).payments?.data ?? [];
        for (const p of payments) {
          const pi = p?.payment?.payment_intent;
          if (typeof pi === "string") {
            paymentIntentId = pi;
            break;
          } else if (pi && typeof pi === "object" && "id" in pi) {
            paymentIntentId = pi.id;
            break;
          }
        }
        if (paymentIntentId) break;
      }
      if (!paymentIntentId) {
        throw new Error("Aucune facture payée trouvée pour le remboursement");
      }
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(typeof amount === "number" ? { amount } : {}),
      ...(reason ? { reason } : {}),
    });

    await ctx.runMutation(internal.events.recordEventByEmail, {
      email: purchase.email,
      type: "subscription.refunded",
      title:
        typeof amount === "number"
          ? `Remboursement partiel (${(amount / 100).toFixed(2)}€)`
          : "Remboursement intégral",
      meta: JSON.stringify({
        refundId: refund.id,
        amount: refund.amount ?? amount ?? null,
        reason: reason ?? null,
        paymentIntentId,
      }),
      actor: "admin",
    });

    return {
      ok: true,
      refundId: refund.id,
      amount: refund.amount ?? amount ?? 0,
    };
  },
});

/**
 * Action admin : ouvre une session du Customer Portal Stripe (auto-gestion par
 * le client : moyens de paiement, factures, annulation). Retourne l'URL à
 * ouvrir dans un nouvel onglet.
 */
export const createCustomerPortalLink = action({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, { purchaseId }): Promise<{ url: string }> => {
    await ctx.runQuery(internal.stripe.requireAdminPing, {});
    const purchase = (await ctx.runQuery(internal.stripe.findPurchaseById, {
      purchaseId,
    })) as PurchaseDoc | null;
    if (!purchase) throw new Error("Achat introuvable");
    if (!purchase.stripeCustomerId) {
      throw new Error("Pas de customer Stripe associé à cet achat");
    }

    const stripe = await stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: purchase.stripeCustomerId,
      return_url: "https://amour-studios.vercel.app/studio",
    });

    await ctx.runMutation(internal.events.recordEventByEmail, {
      email: purchase.email,
      type: "stripe.portal_opened",
      title: "Customer Portal Stripe ouvert (admin)",
      actor: "admin",
    });

    return { url: session.url };
  },
});

/**
 * Action admin : change le palier d'un abonnement (communauté ↔ coaching) en
 * modifiant l'item de la subscription Stripe. Re-syncs les rôles Discord pour
 * matcher le nouveau tier.
 */
export const changeTier = action({
  args: {
    purchaseId: v.id("purchases"),
    newTier: v.union(v.literal("communaute"), v.literal("coaching")),
    prorate: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { purchaseId, newTier, prorate }
  ): Promise<{ ok: true; from: string | null; to: string }> => {
    await ctx.runQuery(internal.stripe.requireAdminPing, {});
    const purchase = (await ctx.runQuery(internal.stripe.findPurchaseById, {
      purchaseId,
    })) as PurchaseDoc | null;
    if (!purchase) throw new Error("Achat introuvable");
    if (!purchase.stripeSubscriptionId) {
      throw new Error("Aucun abonnement Stripe lié à cet achat");
    }

    const from = purchase.tier ?? null;
    if (from === newTier) {
      throw new Error(`L'abonnement est déjà sur le palier "${newTier}"`);
    }

    const newPriceId = priceForTier(newTier);
    const stripe = await stripeClient();
    const sub = await stripe.subscriptions.retrieve(purchase.stripeSubscriptionId);
    const itemId = sub.items?.data?.[0]?.id;
    if (!itemId) throw new Error("Subscription Stripe sans item");

    await stripe.subscriptions.update(purchase.stripeSubscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: prorate === false ? "none" : "create_prorations",
      metadata: {
        ...(sub.metadata ?? {}),
        tier: newTier,
      },
    });

    const newAmount = newTier === "coaching" ? 17900 : 7900;
    await ctx.runMutation(internal.stripe.patchPurchase, {
      purchaseId,
      tier: newTier,
      stripePriceId: newPriceId,
      amount: newAmount,
    });

    // Re-sync rôles Discord pour matcher le nouveau palier.
    const user = await ctx.runQuery(internal.stripe.findUserByPurchase, {
      purchaseId,
    });
    if (user?.discordId) {
      await ctx.runAction(internal.stripe.assignDiscordRole, {
        discordId: user.discordId,
        email: purchase.email,
        tier: newTier,
      });
    }

    await ctx.runMutation(internal.events.recordEventByEmail, {
      email: purchase.email,
      type: "subscription.tier_changed",
      title: `Palier changé : ${from ?? "—"} → ${newTier}`,
      meta: JSON.stringify({
        from,
        to: newTier,
        prorate: prorate !== false,
      }),
      actor: "admin",
    });

    return { ok: true, from, to: newTier };
  },
});

/**
 * Action admin : force la re-synchro d'un purchase depuis l'état actuel côté
 * Stripe (recovery si webhook raté). Re-sync aussi les rôles Discord.
 */
export const forceSyncFromStripe = action({
  args: { purchaseId: v.id("purchases") },
  handler: async (
    ctx,
    { purchaseId }
  ): Promise<{ ok: true; oldStatus: string; newStatus: string }> => {
    await ctx.runQuery(internal.stripe.requireAdminPing, {});
    const purchase = (await ctx.runQuery(internal.stripe.findPurchaseById, {
      purchaseId,
    })) as PurchaseDoc | null;
    if (!purchase) throw new Error("Achat introuvable");
    if (!purchase.stripeSubscriptionId) {
      throw new Error("Aucun abonnement Stripe lié à cet achat");
    }

    const stripe = await stripeClient();
    // Cast pour accéder à current_period_end (déplacé sur les items depuis
    // l'API 2026-03-25.dahlia ; on garde un fallback root pour compat).
    const sub = (await stripe.subscriptions.retrieve(
      purchase.stripeSubscriptionId
    )) as unknown as {
      status: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
      items?: {
        data?: Array<{
          current_period_end?: number;
          price?: { id?: string };
        }>;
      };
    };

    const mapStatus = (
      s: string
    ): "active" | "past_due" | "canceled" | "incomplete" => {
      switch (s) {
        case "active":
        case "trialing":
          return "active";
        case "past_due":
        case "unpaid":
          return "past_due";
        case "canceled":
          return "canceled";
        default:
          return "incomplete";
      }
    };

    const newStatus = mapStatus(sub.status);
    const periodEndSec =
      sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    const priceId = sub.items?.data?.[0]?.price?.id as string | undefined;

    let newTier: "communaute" | "coaching" | undefined;
    if (priceId === process.env.STRIPE_PRICE_COACHING) newTier = "coaching";
    else if (priceId === process.env.STRIPE_PRICE_COMMUNITY) newTier = "communaute";

    await ctx.runMutation(internal.stripe.patchPurchase, {
      purchaseId,
      status: newStatus,
      tier: newTier,
      stripePriceId: priceId,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd:
        typeof periodEndSec === "number" ? periodEndSec * 1000 : undefined,
    });

    // Re-sync rôles Discord.
    const user = await ctx.runQuery(internal.stripe.findUserByPurchase, {
      purchaseId,
    });
    if (user?.discordId) {
      if (newStatus === "active" && newTier) {
        await ctx.runAction(internal.stripe.assignDiscordRole, {
          discordId: user.discordId,
          email: purchase.email,
          tier: newTier,
        });
      } else if (newStatus === "canceled") {
        await ctx.runAction(internal.stripe.removeDiscordRoles, {
          discordId: user.discordId,
          email: purchase.email,
        });
      }
    }

    await ctx.runMutation(internal.events.recordEventByEmail, {
      email: purchase.email,
      type: "stripe.force_synced",
      title: `Sync Stripe forcée (${purchase.status} → ${newStatus})`,
      meta: JSON.stringify({
        oldStatus: purchase.status,
        newStatus,
        tier: newTier ?? null,
      }),
      actor: "admin",
    });

    return { ok: true, oldStatus: purchase.status, newStatus };
  },
});
