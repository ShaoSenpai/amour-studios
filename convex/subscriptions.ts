import { v } from "convex/values";
import { query, action, internalQuery, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { logEvent } from "./lib/events";
import { stripeClient, priceForTier, coachingPortalConfig, communityPortalConfig } from "./stripe";
import { LEGAL_VERSION } from "./lib/legal";

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
    // Même logique que _purchaseForUser : on bascule sur l'abo actif le plus
    // récent (by_email) dès que l'achat lié est absent OU n'est plus actif (ex.
    // reprise coaching après résiliation → nouvel abo). Sinon /compte resterait
    // figé sur l'ancien abo annulé (et ré-afficherait le bouton « Continuer »).
    const ACTIVE = ["active", "past_due", "paid"];
    const linkedStale = !purchase || !purchase.stripeSubscriptionId || !ACTIVE.includes(purchase.status);
    if (linkedStale && user.email) {
      const list = await ctx.db.query("purchases")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase())).collect();
      purchase = list
        .filter((p) => p.stripeSubscriptionId && (p.status === "active" || p.status === "past_due" || p.status === "paid"))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    if (!purchase || !purchase.stripeSubscriptionId)
      return {
        authed: true as const,
        hasSubscription: false as const,
        name: user.name ?? null,
        email: user.email ?? null,
        discordUsername: user.discordUsername ?? null,
        image: user.image ?? null,
      };

    const isCoaching = purchase.tier === "coaching";

    // ── needsFirstRdv ──────────────────────────────────────────────────────
    // Coaching seulement : true tant que le membre n'a pas réservé son 1er RDV.
    // L'onboarding coaching termine à `step:"rdv_booked"` (cf. onboardings.ts :
    // awaiting_presentation → link_sent → form_done → rdv_booked). Tout step
    // AVANT rdv_booked ⇒ RDV encore à faire. Pas d'onboarding row ⇒ false.
    // L'URL Calendly elle-même est fournie côté FRONT (NEXT_PUBLIC_CALENDLY_URL,
    // inlinée au build Vercel) — PAS ici : l'env Convex n'a pas cette var, donc
    // la calculer côté backend divergerait du lien réel du flow onboarding.
    let needsFirstRdv = false;
    if (isCoaching) {
      const ob = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      needsFirstRdv = !!ob && ob.step !== "rdv_booked";
    }

    // ── nextRdvAt ──────────────────────────────────────────────────────────
    // Début du prochain RDV coaching futur (table coachingSessions, index
    // by_user). Future = status "scheduled" ET scheduledAt >= maintenant ;
    // on prend le plus proche. Même critère que coaching.ts (nextSession).
    let nextRdvAt: number | null = null;
    if (isCoaching) {
      const now = Date.now();
      const sessions = await ctx.db
        .query("coachingSessions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const next = sessions
        .filter((s) => s.status === "scheduled" && s.scheduledAt >= now)
        .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
      nextRdvAt = next?.scheduledAt ?? null;
    }

    // canResumeCoaching : un coaché dont l'engagement 3 mois s'est terminé
    // (status "canceled" après cancel_at) peut reprendre en mensuel. Distinct de
    // canTakeCoaching (upsell Communauté→Coaching).
    const canResumeCoaching = isCoaching && purchase.status === "canceled";
    // canResumeCommunity : tout abo résilié (ex-coaché OU ex-communauté) peut
    // reprendre en Communauté 79€/mois en 1 clic (réutilise le client Stripe).
    // Cœur du win-back « fin de coaching → Communauté ».
    const canResumeCommunity = purchase.status === "canceled";

    return {
      authed: true as const,
      hasSubscription: true as const,
      tier: purchase.tier ?? null,
      status: purchase.status,
      amountEur: Math.round((purchase.amount ?? 0) / 100),
      currentPeriodEnd: purchase.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: purchase.cancelAtPeriodEnd ?? false,
      canTakeCoaching: purchase.tier === "communaute" && purchase.status !== "canceled",
      canResumeCoaching,
      canResumeCommunity,
      needsFirstRdv,
      nextRdvAt,
      name: user.name ?? null,
      email: user.email ?? null,
      discordUsername: user.discordUsername ?? null,
      image: user.image ?? null,
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
    const ACTIVE = ["active", "past_due", "paid"];
    const linkedStale = !purchase || !purchase.stripeSubscriptionId || !ACTIVE.includes(purchase.status);
    if (linkedStale && user.email) {
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

// 3) Upgrade Communauté → Coaching : offre unique 3 mois (179€/mois, cap 90j).
//    Engagement 3 mois : cancel_at posé sur l'abonnement (fin auto après ~90j).
export const upgradeMySubscription = action({
  args: {
    recording: v.boolean(),
    confidentiality: v.boolean(),
    testimonial: v.boolean(),
  },
  handler: async (
    ctx,
    { recording, confidentiality, testimonial }
  ): Promise<{ ok: true; already?: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    // Consentements RGPD obligatoires AVANT toute bascule coaching (le membre
    // self-service n'a pas de wizard onboarding → on les recueille ici).
    if (!recording || !confidentiality) {
      throw new Error("Consentements enregistrement et confidentialité obligatoires.");
    }
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
    //     immédiatement une facture de 179€ (premier mois plein).
    //   - `cancel_at` (+90j) → engagement 3 mois, l'abonnement se termine seul.
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
    // du customer (que `startCardUpdate` permet de changer au préalable).
    try {
      await stripe.subscriptions.update(p.subscriptionId, {
        items: [{ id: itemId, price: coachingPrice }],
        proration_behavior: "none",
        billing_cycle_anchor: "now",
        payment_behavior: "error_if_incomplete",
        // ⚠️ Retire le coupon d'entrée Communauté (-30€) : sinon 179 − 30 = 149€
        // au lieu de 179€ plein pour le coaching.
        discounts: [],
        cancel_at: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
        metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: "3mois" },
      });
    } catch (err) {
      console.warn("⚠️ upgrade self-service échec:", err instanceof Error ? err.message : err);
      throw new Error(
        "Le paiement de la différence n'a pas pu être validé (carte refusée ou validation requise). Réessaie ou contacte le support."
      );
    }
    await ctx.runMutation(internal.subscriptions._applyUpgrade, { purchaseId: p.purchaseId, userId, coachingPrice, recording, confidentiality, testimonial });
    // cancel_at (pas cancel_at_period_end) = l'engagement 3 mois ne s'affiche
    // pas comme « résiliation programmée » ; on remet cancelAtPeriodEnd à false.
    await ctx.runMutation(internal.stripe.patchPurchase, { purchaseId: p.purchaseId, cancelAtPeriodEnd: false });
    if (p.discordId) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, { discordId: p.discordId, email: p.email ?? "", tier: "coaching" });
    }
    return { ok: true };
  },
});

// 3b) Reprendre le coaching en MENSUEL (récurrent, sans engagement) après la fin
//     de l'engagement 3 mois (status "canceled"). Un abo Stripe annulé n'est PAS
//     réactivable → on en crée un NOUVEAU sur le customer existant. Le webhook
//     `customer.subscription.created` (recordSubscription) rattache le purchase à
//     l'user par email, rétablit l'accès /exos et le rôle Discord — même chemin
//     éprouvé qu'un nouvel abonnement. Pas de cancel_at → mensuel sans fin.
export const resumeCoachingMonthly = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true } | { error: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "not_authed" };
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) return { error: "no_subscription" };
    // Déjà coaching actif → succès idempotent.
    if (p.tier === "coaching" && (p.status === "active" || p.status === "past_due")) {
      return { ok: true };
    }
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, { key: `resumeCoaching:${userId}`, max: 5 });
    if (!rl.allowed) return { error: "rate_limited" };

    const stripe = await stripeClient();
    // Customer récupéré depuis l'ancien abonnement (annulé mais retrievable),
    // même pattern que startCardUpdate.
    const oldSub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer = typeof oldSub.customer === "string" ? oldSub.customer : oldSub.customer?.id;
    if (!customer) return { error: "no_customer" };

    const coachingPrice = priceForTier("coaching");
    const email = (p.email ?? "").toLowerCase();
    try {
      // error_if_incomplete = ATOMIQUE : si la carte par défaut est refusée ou
      // exige une 3DS, Stripe lève une erreur et NE crée pas d'abo bancal.
      await stripe.subscriptions.create({
        customer,
        items: [{ price: coachingPrice }],
        payment_behavior: "error_if_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        // duree "3mois" = palier accès complet (M1+M2/M3), PAS un engagement ici
        // (aucun cancel_at) → mensuel récurrent. tier+email pilotent recordSubscription.
        metadata: { tier: "coaching", duree: "3mois", email, resume: "monthly" },
      }, { idempotencyKey: `resume-coaching:${userId}` });
    } catch (err) {
      console.warn("⚠️ resumeCoachingMonthly échec:", err instanceof Error ? err.message : err);
      return { error: "payment_failed" };
    }
    await ctx.runMutation(internal.subscriptions._logSelfService, {
      userId, type: "subscription.resume_coaching", title: "Reprise du coaching (mensuel)",
    });
    return { ok: true };
  },
});

// 3c) Reprendre / rejoindre la COMMUNAUTÉ en mensuel (79€, sans engagement) après
//     une résiliation (status "canceled"). Cœur du win-back « fin de coaching →
//     Communauté ». Comme resumeCoachingMonthly : un abo annulé n'est pas
//     réactivable → on en crée un NOUVEAU sur le customer existant (réutilise sa
//     carte, pas de re-checkout). Le webhook recordSubscription rattache par email
//     et rétablit le rôle Discord. Pas de cancel_at (mensuel récurrent), pas de
//     coupon d'entrée (79€ plein).
export const resumeCommunityMonthly = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true } | { error: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "not_authed" };
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) return { error: "no_subscription" };
    // Déjà un abo actif (communauté OU coaching) → rien à faire (succès idempotent).
    if (p.status === "active" || p.status === "past_due") {
      return { ok: true };
    }
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, { key: `resumeCommunity:${userId}`, max: 5 });
    if (!rl.allowed) return { error: "rate_limited" };

    const stripe = await stripeClient();
    const oldSub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer = typeof oldSub.customer === "string" ? oldSub.customer : oldSub.customer?.id;
    if (!customer) return { error: "no_customer" };

    const communityPrice = priceForTier("communaute");
    const email = (p.email ?? "").toLowerCase();
    try {
      // error_if_incomplete = ATOMIQUE : carte refusée / 3DS → erreur, pas d'abo bancal.
      await stripe.subscriptions.create({
        customer,
        items: [{ price: communityPrice }],
        payment_behavior: "error_if_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card"],
        },
        // tier communaute + email → recordSubscription rattache + rôle Discord.
        metadata: { tier: "communaute", email, resume: "monthly" },
      }, { idempotencyKey: `resume-community:${userId}` });
    } catch (err) {
      console.warn("⚠️ resumeCommunityMonthly échec:", err instanceof Error ? err.message : err);
      return { error: "payment_failed" };
    }
    await ctx.runMutation(internal.subscriptions._logSelfService, {
      userId, type: "subscription.resume_community", title: "Reprise de la Communauté (mensuel)",
    });
    return { ok: true };
  },
});

// 4) Mettre à jour / choisir la carte de paiement (Stripe Checkout `mode:"setup"`).
//    Le membre peut vouloir payer son upgrade avec une AUTRE carte que celle en
//    place. On collecte/installe la carte via Checkout en mode "setup" — qui
//    n'effectue AUCUN débit — puis le webhook `checkout.session.completed`
//    (cf. convex/http.ts) la pose en `invoice_settings.default_payment_method`.
//    Ensuite, l'upgrade (`upgradeMySubscription`) débitera cette carte par défaut.
//    👉 UN SEUL point de débit = l'update de subscription, JAMAIS Checkout ici.
export const startCardUpdate = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement.");
    const stripe = await stripeClient();

    // `_purchaseForUser` n'expose pas le customerId → on le récupère depuis
    // l'abonnement Stripe (sub.customer). C'est le customer sur lequel la
    // Checkout setup posera la carte par défaut.
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customer) throw new Error("Customer Stripe introuvable pour cet abonnement.");

    // Même source de SITE_URL que le reste du backend (onboardings.ts).
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer,
      currency: "eur",
      // On transporte l'id d'abonnement jusqu'au webhook : la carte devra être
      // posée en défaut DE L'ABONNEMENT (pas seulement du customer), car
      // `createSubscription` pose `save_default_payment_method:"on_subscription"`
      // → la default_payment_method de l'abonnement PRIME pour ses factures.
      metadata: { subscriptionId: p.subscriptionId },
      success_url: `${site}/compte?card=updated`,
      cancel_url: `${site}/compte`,
    });
    if (!session.url) throw new Error("Stripe Checkout: URL de session manquante.");
    return { url: session.url };
  },
});

export const _applyUpgrade = internalMutation({
  args: {
    purchaseId: v.id("purchases"),
    userId: v.id("users"),
    coachingPrice: v.string(),
    recording: v.boolean(),
    confidentiality: v.boolean(),
    testimonial: v.boolean(),
  },
  handler: async (ctx, { purchaseId, userId, coachingPrice, recording, confidentiality, testimonial }) => {
    const now = Date.now();
    // duree="3mois" directement (offre coaching unique) → accès complet
    // immédiat, sans fenêtre M1-only avant que le webhook ne recolle la durée.
    // On grave aussi la PREUVE de consentement RGPD sur le purchase (le membre
    // self-service n'a pas forcément d'onboarding → la preuve vit ici).
    await ctx.db.patch(purchaseId, {
      tier: "coaching",
      stripePriceId: coachingPrice,
      amount: 17900,
      duree: "3mois",
      consentRecordingAt: recording ? now : undefined,
      consentConfidentialityAt: confidentiality ? now : undefined,
      consentTestimonialAt: testimonial ? now : undefined,
      consentVersion: LEGAL_VERSION,
    });

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

// Historique de facturation du membre connecté (lecture seule).
export const myInvoices = action({
  args: {},
  handler: async (
    ctx
  ): Promise<
    Array<{
      id: string;
      amountCents: number;
      currency: string;
      created: number;
      status: string | null;
      pdfUrl: string | null;
      hostedUrl: string | null;
    }>
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) return [];
    // Résilience : un sub périmé/archivé côté Stripe (donnée Convex stale) ou un
    // souci réseau ne doit pas crasher la page — on renvoie [] (section factures
    // vide) plutôt que de throw.
    try {
      const stripe = await stripeClient();
      const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customer) return [];
      const list = await stripe.invoices.list({ customer, limit: 24 });
      return list.data.map((inv) => ({
        id: inv.id,
        amountCents: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency ?? "eur",
        created: (inv.created ?? 0) * 1000,
        status: inv.status ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
        hostedUrl: inv.hosted_invoice_url ?? null,
      }));
    } catch (err) {
      console.warn("myInvoices: échec Stripe, renvoi []:", err instanceof Error ? err.message : err);
      return [];
    }
  },
});

// Ouvre le Portail Client Stripe (factures, carte, plan) — page hébergée Stripe.
export const startBillingPortal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement.");
    const stripe = await stripeClient();
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customer) throw new Error("Customer Stripe introuvable.");
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    // Coaching = engagement 3 mois non résiliable en self-service → on force la
    // config de portail « coaching » (résiliation OFF) si elle est posée. La
    // Communauté retombe sur la config par défaut du compte (résiliation active).
    // Config explicite par tier (ne dépend pas de la config par défaut du compte,
    // absente en live) : coaching = résiliation OFF (engagement), communauté = ON.
    const configuration =
      p.tier === "coaching" ? coachingPortalConfig() : communityPortalConfig();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${site}/compte`,
      ...(configuration ? { configuration } : {}),
    });
    return { url: session.url };
  },
});
