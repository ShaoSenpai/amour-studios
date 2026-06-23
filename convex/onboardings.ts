import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";
import { logEvent } from "./lib/events";
import {
  linkDm,
  statusDm,
  grantedDm,
  linkedChannelMsg,
  relanceDm,
} from "./lib/discordMessages";
import { LEGAL_VERSION } from "./lib/legal";
import type { Id, Doc } from "./_generated/dataModel";

// Validators du payload embed brandé envoyé au bot Discord (cf. lib/discordMessages).
const EMBED_V = v.object({
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  footer: v.optional(v.string()),
});
const BUTTON_V = v.object({ label: v.string(), url: v.string() });

// ============================================================================
// Onboarding client post-paiement.
// Flux 179€ : awaiting_presentation → (bot Discord détecte présentation)
// → link_sent → (client remplit form + questionnaire) → form_done
// → (client réserve Calendly) → rdv_booked.
// Flux 79€ : awaiting_presentation → link_sent → community_ready (pas de RDV).
//
// Le `token` est un UUID v4 public qui identifie la row pour la page
// `/onboarding/[token]` (les mutations submit* ne demandent pas d'auth, elles
// trustent le token comme secret partagé).
// ============================================================================

const TIER = v.union(v.literal("coaching"), v.literal("communaute"));
const STEP = v.union(
  v.literal("awaiting_presentation"),
  v.literal("link_sent"),
  v.literal("consents"),
  v.literal("form_done"),
  v.literal("rdv_booked"),
  v.literal("community_ready")
);
const ANSWER = v.object({
  key: v.string(),
  label: v.string(),
  value: v.string(),
});

// Étape finale du flow selon le tier (pour savoir quand "stop").
const FINAL_STEP = {
  coaching: "rdv_booked" as const,
  communaute: "community_ready" as const,
};

/** Crée la row d'onboarding pour un user qui vient de payer. Idempotent.
 *  Appelé par le webhook Stripe (`recordSubscription` dans http.ts). */
export const createForPurchase = internalMutation({
  args: { userId: v.id("users"), tier: TIER },
  handler: async (ctx, { userId, tier }) => {
    const existing = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing._id;
    const now = Date.now();
    const token = crypto.randomUUID();
    const id = await ctx.db.insert("onboardings", {
      userId,
      tier,
      step: "awaiting_presentation",
      token,
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, {
      userId,
      type: "onboarding.created",
      title: "Onboarding créé (paiement)",
      actor: "stripe",
    });
    return id;
  },
});

/** Compte LIÉ (claim/activation) → démarre l'onboarding DIRECTEMENT et envoie le
 *  lien (DM + email + fallback public). Le membre a payé et explicitement lié son
 *  compte (souvent il s'est déjà présenté pour arriver ici via /lier) : on ne lui
 *  redemande PAS de se présenter, on le pousse direct sur l'onboarding. Crée la
 *  row si absente (step link_sent), ou avance awaiting_presentation → link_sent.
 *  Idempotent : si déjà link_sent ou au-delà, on ne fait que (re)pousser le lien. */
export const linkAndStartOnboarding = internalMutation({
  args: { userId: v.id("users"), tier: TIER },
  handler: async (ctx, { userId, tier }) => {
    const now = Date.now();
    let ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // On n'envoie le lien QUE si on crée la row ou qu'on avance depuis
    // awaiting_presentation → sûr à appeler en boucle (claim + chaque webhook).
    let shouldSend = false;
    if (!ob) {
      const token = crypto.randomUUID();
      const id = await ctx.db.insert("onboardings", {
        userId,
        tier,
        step: "link_sent",
        token,
        presentedAt: now,
        linkSentAt: now,
        createdAt: now,
        updatedAt: now,
      });
      ob = await ctx.db.get(id);
      shouldSend = true;
    } else if (ob.step === "awaiting_presentation") {
      await ctx.db.patch(ob._id, {
        step: "link_sent",
        presentedAt: ob.presentedAt ?? now,
        linkSentAt: now,
        updatedAt: now,
      });
      shouldSend = true;
    }
    // Déjà au-delà (link_sent / form_done / rdv_booked / community_ready) → no-op.
    if (!ob || !shouldSend) return;
    await logEvent(ctx, {
      userId,
      type: "onboarding.linked",
      title: "Compte lié → onboarding démarré",
      actor: "system",
    });
    await ctx.scheduler.runAfter(0, internal.onboardings.sendLink, {
      userId,
      token: ob.token,
      firstName: ob.firstName ?? null,
      tier: ob.tier,
    });
    // Liaison APRÈS coup (claim/code) → si le membre est déjà sur le serveur,
    // « Bravo, compte lié + étape » dans son salon privé (no-op sinon).
    await ctx.scheduler.runAfter(0, internal.onboardings.postLinkedStatusToChannel, {
      userId,
    });
  },
});

/** Vérifie qu'un user (qui vient de se logger ou de payer) a bien un
 *  onboarding row. Si purchase actif + tier connu + pas encore d'onboarding,
 *  crée la row. Idempotent. Appelée depuis auth.ts (à la connexion Discord)
 *  ET depuis le webhook Stripe (à la création d'une subscription). */
// Idempotent : crée OU démarre l'onboarding d'un user payant et ENVOIE le lien
// (DM + email). Remplace l'ancien comportement « créer la row à
// awaiting_presentation sans rien envoyer » : depuis le retrait de l'étape
// #présente-toi, c'était le trou qui laissait l'onboarding bloqué quand l'OAuth
// liait le purchase par email (le lien ne partait jamais). Appelé par les chemins
// OAuth (auth.ts) + le webhook Stripe. Rejoue sans risque (n'envoie qu'à la
// création ou depuis awaiting_presentation).
export const ensureForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ created: boolean }> => {
    const user = await ctx.db.get(userId);
    if (!user?.email) return { created: false };
    // Cherche un purchase actif/payé du même email avec un tier (subscription).
    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
      .collect();
    const active = purchases.find(
      (p) =>
        (p.status === "active" || p.status === "past_due" || p.status === "paid") &&
        (p.tier === "coaching" || p.tier === "communaute")
    );
    if (!active || !active.tier) return { created: false };

    const now = Date.now();
    const existing = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    // Déjà démarré (link_sent / form_done / rdv_booked / community_ready) → no-op.
    if (existing && existing.step !== "awaiting_presentation") {
      return { created: false };
    }

    let token: string;
    const created = !existing;
    if (existing) {
      // Row bloquée à awaiting_presentation → on la démarre (envoi du lien).
      token = existing.token;
      await ctx.db.patch(existing._id, {
        step: "link_sent",
        presentedAt: existing.presentedAt ?? now,
        linkSentAt: now,
        updatedAt: now,
      });
    } else {
      token = crypto.randomUUID();
      await ctx.db.insert("onboardings", {
        userId,
        tier: active.tier,
        step: "link_sent",
        token,
        presentedAt: now,
        linkSentAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    await logEvent(ctx, {
      userId,
      type: created ? "onboarding.created" : "onboarding.linked",
      title: created ? "Onboarding créé + lien envoyé" : "Onboarding démarré (lien envoyé)",
      actor: "system",
    });
    await ctx.scheduler.runAfter(0, internal.onboardings.sendLink, {
      userId,
      token,
      firstName: existing?.firstName ?? null,
      tier: active.tier,
    });
    // Liaison APRÈS coup (login OAuth qui auto-lie par email) → si le membre est
    // déjà sur le serveur, « Bravo, compte lié + étape » dans son salon privé.
    await ctx.scheduler.runAfter(0, internal.onboardings.postLinkedStatusToChannel, {
      userId,
    });
    return { created };
  },
});

/** Lit la row d'onboarding par token (page publique). Renvoie une vue
 *  minimale, jamais l'`_id` Convex en clair. */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) return null;
    // Email du user (pour pré-remplir Calendly côté page — évite que le
    // client retape un email différent qui casserait le matching).
    const user = await ctx.db.get(ob.userId);
    return {
      tier: ob.tier,
      step: ob.step,
      firstName: ob.firstName ?? null,
      lastName: ob.lastName ?? null,
      phone: ob.phone ?? null,
      email: user?.email ?? null,
      answers: ob.answers ?? [],
      formCompletedAt: ob.formCompletedAt ?? null,
      rdvBookedAt: ob.rdvBookedAt ?? null,
    };
  },
});

/** Onboarding du user CONNECTÉ (pour la page /onboarding/welcome qui deep-linke
 *  direct vers le wizard). Renvoie le minimum nécessaire ({ token, step, tier })
 *  ou null si pas connecté / pas encore de row (lag webhook post-paiement). */
export const myCurrent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!ob) return null;
    return { token: ob.token, step: ob.step, tier: ob.tier };
  },
});

/** Query publique : état de l'offre d'upsell Communauté → Coaching (+100€).
 *  Lue par l'écran de FIN d'onboarding communauté (/onboarding/[token], "done").
 *  Éligible UNIQUEMENT si : tier communaute, step community_ready, et on est
 *  encore dans la fenêtre d'1h (upgradeOfferExpiresAt dans le futur). */
export const upgradeOffer = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (
      !ob ||
      ob.tier !== "communaute" ||
      ob.step !== "community_ready" ||
      !ob.upgradeOfferExpiresAt ||
      Date.now() >= ob.upgradeOfferExpiresAt
    ) {
      return { eligible: false as const };
    }
    return {
      eligible: true as const,
      firstName: ob.firstName ?? null,
      // Communauté = offre d'entrée 49€ → on paie la différence (179 − 49 = 130)
      // pour un coaching à 179€ PLEIN (engagement 3 mois).
      currentEur: 49,
      coachingEur: 179,
      feeEur: 130,
      expiresAt: ob.upgradeOfferExpiresAt,
    };
  },
});

/** Internal query : récupère l'onboarding (par token) + le purchase lié + les
 *  coordonnées Discord/email du user. Sert à l'action `upgradeToCoaching`
 *  (convex/stripe.ts) qui n'a pas d'accès db direct. */
export const _obByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) return null;
    const user = await ctx.db.get(ob.userId);
    const email = (user?.email ?? "").trim().toLowerCase();
    // Purchase lié : prioritairement via le purchaseId du user, sinon le plus
    // récent abonnement (active/past_due/paid) du même email.
    let purchase = user?.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !purchase.stripeSubscriptionId) && email) {
      const purchases = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const candidate = purchases
        .filter(
          (p) =>
            p.stripeSubscriptionId &&
            (p.status === "active" ||
              p.status === "past_due" ||
              p.status === "paid")
        )
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      if (candidate) purchase = candidate;
    }
    return {
      onboardingId: ob._id,
      userId: ob.userId,
      tier: ob.tier,
      step: ob.step,
      firstName: ob.firstName ?? null,
      upgradeOfferExpiresAt: ob.upgradeOfferExpiresAt ?? null,
      discordId: user?.discordId ?? null,
      email: user?.email ?? null,
      purchaseId: purchase?._id ?? null,
      purchaseTier: purchase?.tier ?? null,
      stripeSubscriptionId: purchase?.stripeSubscriptionId ?? null,
      stripeCustomerId: purchase?.stripeCustomerId ?? null,
    };
  },
});

/** Internal mutation : applique l'upgrade Communauté → Coaching côté onboarding
 *  une fois le débit Stripe confirmé. Fait repasser le membre par le PARCOURS
 *  COACHING complet (questionnaire coaching → vidéo quick-win → RDV) au lieu de
 *  sauter direct au RDV : on pose step="link_sent" (la page route alors vers
 *  l'étape "questions" en tier=coaching). Ferme la fenêtre d'offre. Idempotent :
 *  ne re-log pas si déjà coaching et ne RÉTROGRADE pas une étape déjà avancée. */
export const _applyUpgradeOnboarding = internalMutation({
  args: { onboardingId: v.id("onboardings") },
  handler: async (ctx, { onboardingId }) => {
    const ob = await ctx.db.get(onboardingId);
    if (!ob) return;
    const alreadyCoaching = ob.tier === "coaching";
    // Upgrade Communauté → Coaching : (a) refaire passer par le parcours
    // (questionnaire + quick-win) ET (b) garantir le recueil des consentements RGPD.
    //  - Pas encore avancé → "link_sent" : le parcours coaching réintègre l'écran
    //    consentements via submitAnswers (questionnaire coaching → "consents").
    //  - Déjà avancé MAIS sans consentements recueillis → on force "consents".
    //  - Déjà avancé avec consentements OK → on ne régresse pas.
    const advanced = ob.step === "form_done" || ob.step === "rdv_booked";
    const nextStep = !advanced
      ? "link_sent"
      : ob.consentRecordingAt
        ? ob.step
        : "consents";
    await ctx.db.patch(onboardingId, {
      tier: "coaching",
      step: nextStep,
      upgradeOfferExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    if (!alreadyCoaching) {
      await logEvent(ctx, {
        userId: ob.userId,
        type: "subscription.tier_changed",
        title: "Upgrade Communauté → Coaching (+100€)",
        actor: "stripe",
        meta: { from: "communaute", to: "coaching", via: "onboarding_upsell" },
      });
    }
  },
});

/** Internal mutation : patch du purchase après upgrade (tier coaching, prix &
 *  montant coaching, duree="3mois" = offre coaching unique → accès complet
 *  immédiat). Le webhook Stripe (subscription.updated) confirmera ensuite. */
export const _applyUpgradePurchase = internalMutation({
  args: { purchaseId: v.id("purchases"), stripePriceId: v.string() },
  handler: async (ctx, { purchaseId, stripePriceId }) => {
    await ctx.db.patch(purchaseId, {
      tier: "coaching",
      stripePriceId,
      amount: 17900,
      duree: "3mois",
    });
  },
});

/** Étape 1 : prénom / nom / téléphone. */
export const submitContact = mutation({
  args: {
    token: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, { token, firstName, lastName, phone }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) throw new Error("Lien onboarding invalide.");
    const trim = (s: string) => s.trim();
    const fn = trim(firstName);
    const ln = trim(lastName);
    const ph = trim(phone);
    if (!fn || !ln || !ph) throw new Error("Champs manquants.");
    if (ph.length < 6) throw new Error("Numéro invalide.");
    await ctx.db.patch(ob._id, {
      firstName: fn,
      lastName: ln,
      phone: ph,
      updatedAt: Date.now(),
    });
    // Met à jour le user (nom complet + téléphone) pour qu'il apparaisse
    // proprement dans le studio.
    const user = await ctx.db.get(ob.userId);
    if (user) {
      const patch: Record<string, unknown> = {};
      if (!user.name) patch.name = `${fn} ${ln}`.trim();
      if (!user.phone) patch.phone = ph;
      if (Object.keys(patch).length > 0) await ctx.db.patch(ob.userId, patch);
    }
    return { ok: true };
  },
});

/** Étape 2 : questionnaire. `finalize` = vrai → on marque form_done
 *  (et community_ready pour le 79€, qui s'arrête là). */
export const submitAnswers = mutation({
  args: {
    token: v.string(),
    answers: v.array(ANSWER),
    finalize: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, answers, finalize }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) throw new Error("Lien onboarding invalide.");
    // Garde idempotence (FIX #9) : si l'onboarding est DÉJÀ dans un état final
    // (community_ready pour le 79€, rdv_booked pour le coaching), un rejeu du
    // token (token-only, mutation publique) ne doit PAS ré-écrire les réponses,
    // re-`grantOnboarded`, ni RÉ-OUVRIR la fenêtre d'upsell +100€
    // (`upgradeOfferExpiresAt = now+1h`). On retourne tôt sans effet de bord.
    if (ob.step === "community_ready" || ob.step === "rdv_booked") {
      return { ok: true, already: true };
    }
    const now = Date.now();
    // Capture l'étape AVANT patch (le doc `ob` pourrait être muté en mémoire) :
    // c'est elle qui détermine si on déclenche le DM boussole coaching.
    const prevStep = ob.step;
    const patch: Record<string, unknown> = { answers, updatedAt: now };
    if (finalize) {
      patch.formCompletedAt = now;
      if (ob.tier === "communaute") {
        patch.step = "community_ready";
        // Ouvre la fenêtre d'upsell Communauté → Coaching (+100€ one-time,
        // débit off-session 1-clic). Strictement 1h à partir de maintenant ;
        // au-delà, upgradeOffer renvoie { eligible: false }.
        patch.upgradeOfferExpiresAt = now + 60 * 60 * 1000;
      } else if (ob.step === "link_sent") {
        // Coaching : le questionnaire est rempli mais les consentements RGPD
        // (enregistrement + confidentialité) doivent être recueillis AVANT le
        // RDV (= avant tout enregistrement de session). On s'arrête donc à
        // l'étape "consents" ; submitConsents fera ensuite passer à "form_done"
        // (l'écran RDV). La communauté n'a pas de consentements (branche ci-dessus).
        patch.step = "consents";
      }
    }
    await ctx.db.patch(ob._id, patch);
    if (finalize) {
      await logEvent(ctx, {
        userId: ob.userId,
        type: "onboarding.form_done",
        title: "Onboarding rempli",
        actor: "system",
      });
      // 79€ : community_ready = final → marque la complétion + bot ajoute Onboardé
      if (ob.tier === "communaute") {
        await markOnboardingCompleted(ctx, ob.userId);
        await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, {
          userId: ob.userId,
        });
      }
      // Coaching : questionnaire validé mais RDV pas encore pris → DM boussole
      // « réserve ton RDV » (le seul moment sans confirmation jusqu'ici).
      // On se base sur `prevStep` (état AVANT patch) qui a déclenché le passage
      // à form_done. Le grantOnboarded communauté n'est PAS dupliqué ici.
      if (ob.tier === "coaching" && prevStep === "link_sent") {
        await ctx.scheduler.runAfter(0, internal.onboardings.sendStatusDm, {
          userId: ob.userId,
          context: "transition",
        });
      }
    }
    return { ok: true };
  },
});

/** Étape consentements RGPD (coaching uniquement) : recueille les 2 consentements
 *  OBLIGATOIRES (enregistrement des sessions + confidentialité) et 1 FACULTATIF
 *  (témoignage / droit à l'image). Stocke les timestamps comme preuve horodatée +
 *  la version des documents légaux. S'intercale entre le questionnaire ("consents")
 *  et le RDV ("form_done" = écran Calendly). Idempotent : si déjà au-delà de
 *  "consents", no-op (un rejeu du token ne ré-écrit pas la preuve). */
export const submitConsents = mutation({
  args: {
    token: v.string(),
    recording: v.boolean(),
    confidentiality: v.boolean(),
    testimonial: v.boolean(),
  },
  handler: async (ctx, { token, recording, confidentiality, testimonial }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) throw new Error("Lien onboarding invalide.");
    // Idempotence : déjà passé l'étape consentements → no-op (pas de ré-écriture).
    if (ob.step !== "consents") {
      return { ok: true as const, already: true as const };
    }
    if (!recording || !confidentiality) {
      throw new Error(
        "Les consentements enregistrement et confidentialité sont obligatoires."
      );
    }
    const now = Date.now();
    await ctx.db.patch(ob._id, {
      consentRecordingAt: now,
      consentConfidentialityAt: now,
      consentTestimonialAt: testimonial ? now : undefined,
      consentVersion: LEGAL_VERSION,
      // Consentements OK → étape RDV (form_done = écran Calendly côté front).
      step: "form_done",
      updatedAt: now,
    });
    await logEvent(ctx, {
      userId: ob.userId,
      type: "onboarding.consents",
      title: "Consentements RGPD recueillis",
      actor: "system",
      meta: { recording, confidentiality, testimonial, version: LEGAL_VERSION },
    });
    return { ok: true as const };
  },
});

/** Étape 3 (coaching) : appelée par la page après réservation Calendly OU
 *  par le webhook Calendly (cf. http.ts). */
export const markRdvBooked = mutation({
  args: {
    token: v.string(),
    sessionId: v.optional(v.id("coachingSessions")),
  },
  handler: async (ctx, { token, sessionId }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!ob) throw new Error("Lien onboarding invalide.");
    if (ob.step === "rdv_booked") return { ok: true };
    await ctx.db.patch(ob._id, {
      step: "rdv_booked",
      rdvBookedAt: Date.now(),
      rdvSessionId: sessionId,
      updatedAt: Date.now(),
    });
    await logEvent(ctx, {
      userId: ob.userId,
      type: "onboarding.rdv_booked",
      title: "1er RDV réservé (onboarding)",
      actor: "calendly",
    });
    // 179€ : rdv_booked = final → marque la complétion + bot ajoute Onboardé
    await markOnboardingCompleted(ctx, ob.userId);
    await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, {
      userId: ob.userId,
    });
    return { ok: true };
  },
});

/** Variante interne : appelée par le webhook Calendly (pas de token).
 *  Cherche l'onboarding du user et marque l'étape. */
export const markRdvBookedByUser = internalMutation({
  args: {
    userId: v.id("users"),
    sessionId: v.optional(v.id("coachingSessions")),
  },
  handler: async (ctx, { userId, sessionId }) => {
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!ob || ob.step === "rdv_booked") return;
    await ctx.db.patch(ob._id, {
      step: "rdv_booked",
      rdvBookedAt: Date.now(),
      rdvSessionId: sessionId,
      updatedAt: Date.now(),
    });
    await markOnboardingCompleted(ctx, userId);
    await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, {
      userId,
    });
    await logEvent(ctx, {
      userId,
      type: "onboarding.rdv_booked",
      title: "1er RDV réservé (onboarding)",
      actor: "calendly",
    });
  },
});

/** Bot Discord → marque qu'un user s'est présenté.
 *  Idempotent : ne fait rien si l'étape n'est plus "awaiting_presentation".
 *  Déclenche l'envoi du lien (email + DM Discord) via scheduler. */
// Résout le purchase actif d'un user (purchaseId puis fallback par email,
// statuts vivants active/past_due/paid, priorité coaching) et planifie
// l'attribution du rôle = palier (idempotent : `assignDiscordRole` règle les
// rôles cibles). Retourne le tier si l'user est payant, null sinon. Helper
// PARTAGÉ par `resolveAndAssignRoleByDiscordId` (arrivée serveur) et
// `markPresentedByDiscordId` (présentation auto-réparante) — DRY.
async function scheduleRoleFromActivePurchase(
  ctx: MutationCtx,
  user: Doc<"users">
): Promise<"coaching" | "communaute" | null> {
  if (!user.discordId) return null;
  const email = (user.email ?? "").trim().toLowerCase();
  const isLive = (s?: string) =>
    s === "active" || s === "past_due" || s === "paid";
  let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
  if (!purchase || !isLive(purchase.status) || !purchase.tier) {
    purchase = null;
    if (email) {
      const candidates = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      const live = candidates.filter((p) => isLive(p.status) && p.tier);
      purchase = live.find((p) => p.tier === "coaching") ?? live[0] ?? null;
    }
  }
  if (!purchase || !purchase.tier) return null;
  await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
    discordId: user.discordId,
    email,
    tier: purchase.tier,
  });
  return purchase.tier;
}

/** Marque la complétion de l'onboarding sur le USER (idempotent, écrit une seule
 *  fois). `onboardingCompletedAt` est SÉPARÉ du grant de rôle Discord (effet de
 *  bord rattrapable) : il signifie « le client a fini son questionnaire/RDV ».
 *  Le laisser vide faisait apparaître le membre comme « non activé » côté studio
 *  (admin.ts), relançait le lifecycle (coaching.ts) et, en coaching, verrouillait
 *  le dashboard (onboarding.ts). À appeler à CHAQUE finalisation + rattrapage. */
async function markOnboardingCompleted(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const u = await ctx.db.get(userId);
  if (u && !u.onboardingCompletedAt) {
    await ctx.db.patch(userId, { onboardingCompletedAt: Date.now() });
  }
}

/** Rattrapage central du rôle Discord « Onboardé ». Si l'onboarding du user est
 *  DÉJÀ finalisé (community_ready pour le 79€, rdv_booked pour le 179€) mais que
 *  le grant initial a échoué (le client n'était pas encore présent sur le serveur
 *  au moment de `grantOnboarded`, qui est fail-silent), on (re)déclenche le grant
 *  + on marque la complétion. No-op si l'onboarding n'est pas finalisé.
 *  Appelé à l'arrivée serveur (resolveAndAssignRoleByDiscordId), à la liaison
 *  paiement (lib/linking via regrantOnboardedIfDone) et au webhook Stripe. */
async function maybeRegrantOnboarded(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<{ ok: boolean; reason?: "no_onboarding" | "not_finalized" }> {
  const ob = await ctx.db
    .query("onboardings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (!ob) return { ok: false, reason: "no_onboarding" };
  if (ob.step !== "rdv_booked" && ob.step !== "community_ready") {
    return { ok: false, reason: "not_finalized" };
  }
  await markOnboardingCompleted(ctx, userId);
  await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, { userId });
  return { ok: true };
}

/** Filet de visibilité coach : une présentation Discord détectée mais NON liée
 *  à un paiement (compte inconnu ou sans purchase actif) déclenche une alerte
 *  discrète dans le channel staff. La récup self-service (DM bot + page /lier)
 *  tourne déjà en parallèle ; ce message sert juste à ce que Walid voie passer
 *  le cas. Fail-silent : on schedule l'action (qui est elle-même fail-silent)
 *  et on n'interrompt jamais le no-op de la présentation. mentionAdmins=false
 *  pour rester discret (pas de ping). */
async function alertStaffUnlinkedPresentation(
  ctx: MutationCtx,
  discordId: string,
  reason: "user_not_found" | "no_active_purchase"
): Promise<void> {
  const why =
    reason === "user_not_found"
      ? "compte inconnu en base"
      : "aucun paiement actif lié";
  await ctx.scheduler.runAfter(0, internal.discord.postAlertToStaff, {
    content:
      `⚠️ <@${discordId}> s'est présenté sans paiement lié (${why}). ` +
      `Récup auto envoyée par DM (lien /lier).`,
    mentionAdmins: false,
  });
}


/** Bot → clic « S'onboarder » dans le salon privé. Même résolution + self-heal
 *  que markPresentedByDiscordId, MAIS renvoie le LIEN d'onboarding pour que le bot
 *  le poste comme bouton dans le salon privé (en plus du DM + email).
 *  Idempotent : re-clic (link_sent/form_done) → renvoie + re-envoie le lien ;
 *  étapes finales (rdv_booked/community_ready) → renvoie le lien sans re-spammer. */
export const startOnboardingByDiscordId = internalMutation({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const site = (process.env.SITE_URL ?? "https://membres.amourstudios.fr").replace(/\/$/, "");
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) {
      await alertStaffUnlinkedPresentation(ctx, discordId, "user_not_found");
      return { ok: false as const, reason: "user_not_found" as const };
    }
    const tier = await scheduleRoleFromActivePurchase(ctx, user);
    if (!tier) {
      await alertStaffUnlinkedPresentation(ctx, discordId, "no_active_purchase");
      return { ok: false as const, reason: "no_active_purchase" as const };
    }
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!ob) return { ok: true as const, tier, reason: "no_onboarding" as const };

    const link = `${site}/onboarding/${ob.token}`;
    const now = Date.now();

    if (ob.step === "awaiting_presentation") {
      await ctx.db.patch(ob._id, {
        step: "link_sent",
        presentedAt: ob.presentedAt ?? now,
        linkSentAt: now,
        updatedAt: now,
      });
      await logEvent(ctx, {
        userId: user._id,
        type: "onboarding.started",
        title: "Onboarding démarré (bouton S'onboarder)",
        actor: "discord_bot",
      });
    }
    // (Re)envoie le lien DM+email tant qu'on n'est pas à une étape finale.
    if (
      ob.step === "awaiting_presentation" ||
      ob.step === "link_sent" ||
      ob.step === "form_done"
    ) {
      await ctx.scheduler.runAfter(0, internal.onboardings.sendLink, {
        userId: user._id,
        token: ob.token,
        firstName: ob.firstName ?? null,
        tier: ob.tier,
      });
    }
    return { ok: true as const, tier, token: ob.token, link };
  },
});

/** Bot Discord → un membre vient de REJOINDRE le serveur. On lui (ré)attribue
 *  son rôle d'après son purchase déjà lié. Couvre l'ordre « se connecter
 *  (OAuth + claim) AVANT de rejoindre le serveur » : à l'arrivée, le compte
 *  existe et le purchase est lié, mais aucun rôle n'avait pu être posé (le bot
 *  ne voyait pas encore le membre). Idempotent : `assignDiscordRole` règle les
 *  rôles = palier (ré-appel sans effet si déjà bons).
 *
 *  Résolution du purchase : on réutilise la logique existante (purchaseId du
 *  user en priorité, sinon fallback par email sur un abonnement vivant
 *  active/past_due/paid). Sans user ou sans purchase actif → no-op silencieux
 *  (visiteur, staff, ou membre pas encore payeur). */
export const resolveAndAssignRoleByDiscordId = internalMutation({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) return { ok: false as const, reason: "user_not_found" as const };
    const tier = await scheduleRoleFromActivePurchase(ctx, user);
    if (!tier) return { ok: false as const, reason: "no_active_purchase" as const };
    // Rattrapage « Onboardé » à l'arrivée : si le client a fini son onboarding
    // AVANT de rejoindre le serveur, le grant initial avait échoué (membre absent).
    // Maintenant qu'il est là, on (re)pose le rôle. No-op si pas finalisé.
    await maybeRegrantOnboarded(ctx, user._id);
    return { ok: true as const, tier };
  },
});

/** Envoie le lien d'onboarding par email (Resend) + DM Discord (bot).
 *  Fail-silent sur chaque canal individuellement. */
export const sendLink = internalAction({
  args: {
    userId: v.id("users"),
    token: v.string(),
    firstName: v.union(v.string(), v.null()),
    tier: TIER,
  },
  handler: async (ctx, { userId, token, firstName, tier }) => {
    const u = await ctx.runQuery(internal.onboardings._userContact, { userId });
    if (!u) return;
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const link = `${site}/onboarding/${token}`;
    // Email — fail-silent si pas d'email.
    if (u.email) {
      try {
        await ctx.runAction(internal.emails.sendOnboardingLinkEmail, {
          to: u.email,
          firstName: firstName ?? u.firstName ?? null,
          link,
          tier,
        });
      } catch (err) {
        console.warn("⚠️ Email onboarding échec:", err);
      }
    }
    // DM Discord — fail-silent. Embed brandé + bouton (cf. lib/discordMessages).
    if (u.discordId) {
      try {
        const msg = linkDm({
          firstName: firstName ?? u.firstName ?? null,
          tier,
          link,
        });
        await ctx.runAction(internal.onboardings.discordDm, {
          discordId: u.discordId,
          embed: msg.embed,
          button: msg.button,
        });
      } catch (err) {
        console.warn("⚠️ DM Discord onboarding échec:", err);
      }
    }
  },
});

/** Helper interne : récupère les coordonnées d'un user (email/discord/prénom). */
export const _userContact = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    // Pré-rempli depuis l'onboarding si dispo (le user.name peut ne pas être
    // séparé en prénom/nom).
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      email: u.email ?? null,
      discordId: u.discordId ?? null,
      firstName: ob?.firstName ?? null,
      tier: ob?.tier ?? null,
    };
  },
});

/** Lit l'état composite d'un membre (onboarding + paiement + Discord) pour la
 *  boussole `sendStatusDm`. */
export const _statusForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const email = (user.email ?? "").trim().toLowerCase();
    const isLive = (s?: string) =>
      s === "active" || s === "past_due" || s === "paid";
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !isLive(purchase.status)) && email) {
      const cands = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      purchase =
        cands
          .filter((p) => isLive(p.status))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    return {
      discordId: user.discordId ?? null,
      firstName: ob?.firstName ?? null,
      tier: (ob?.tier ?? purchase?.tier ?? null) as
        | "coaching"
        | "communaute"
        | null,
      step: ob?.step ?? null,
      token: ob?.token ?? null,
      purchaseStatus: purchase?.status ?? null,
      purchaseActive: purchase ? isLive(purchase.status) : false,
    };
  },
});

/** La boussole : envoie au membre un DM Discord qui confirme où il en est et
 *  lui donne la prochaine action + le lien. State-aware (réutilisable en push
 *  comme en pull). Ne DM jamais les états déjà couverts par grantOnboarded sauf
 *  fallback explicite. Fail-silent. */
export const sendStatusDm = internalAction({
  args: {
    userId: v.id("users"),
    context: v.optional(
      v.union(
        v.literal("transition"),
        v.literal("reminder"),
        v.literal("payment_active"),
        v.literal("payment_canceled")
      )
    ),
  },
  handler: async (ctx, { userId, context }) => {
    const s = await ctx.runQuery(internal.onboardings._statusForUser, { userId });
    if (!s || !s.discordId) return { ok: false as const, reason: "no_discord" as const };
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const link = s.token ? `${site}/onboarding/${s.token}` : site;

    // Décision « quel DM » = verdict canonique du cerveau (source unique, cf.
    // convex/lib/journey.ts), au lieu de re-dériver step/canceled ici. Le
    // contexte explicite « résiliation » (signal webhook Stripe) force l'état
    // canceled même si le cerveau n'a pas encore vu la résiliation propagée.
    const journey = await ctx.runQuery(internal.journey.journeyForUser, { userId });
    const state =
      context === "payment_canceled" ? ("canceled" as const) : journey.state;
    const msg = statusDm({
      firstName: s.firstName,
      tier: journey.tier ?? s.tier,
      state,
      link,
      site,
    });

    if (!msg) return { ok: false as const, reason: "no_message" as const };
    await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
      discordId: s.discordId,
      embed: msg.embed,
      button: msg.button,
    });
    return { ok: true as const };
  },
});

/** Appelle le bot Discord pour ajouter le rôle Onboardé à un user.
 *  Trigger : fin du questionnaire (79€) ou réservation Calendly (179€). */
export const grantOnboarded = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.runQuery(internal.onboardings._userContact, { userId });
    if (!u?.discordId) {
      console.warn("grantOnboarded: pas de discordId pour user", userId);
      return { ok: false, reason: "no_discord" };
    }
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!endpoint || !secret) {
      console.warn("grantOnboarded: DISCORD_BOT_ENDPOINT(_SECRET) absent");
      return { ok: false, reason: "missing_env" };
    }
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/grant-onboarded`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ discordId: u.discordId, email: u.email }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn(`⚠️ grant-onboarded bot ${res.status}: ${txt.slice(0, 150)}`);
        return { ok: false };
      }
      // Rôle Onboardé attribué = accès complet débloqué → DM de confirmation
      // brandé (fail-silent, adapté à l'offre). Un SEUL embed + un bouton.
      const base = (process.env.SITE_URL ?? "https://membres.amourstudios.fr").replace(/\/$/, "");
      // Renvoi vers #général : mention de salon `<#id>` (cliquable, SANS carte
      // de preview) si l'ID est configuré, sinon « #général » en texte.
      const generalId = process.env.DISCORD_GENERAL_CHANNEL_ID;
      const generalRef = generalId ? `<#${generalId}>` : "**#général**";
      const msg = grantedDm({
        firstName: u.firstName,
        tier: u.tier === "coaching" ? "coaching" : "communaute",
        base,
        generalRef,
      });
      await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
        discordId: u.discordId,
        embed: msg.embed,
        button: msg.button,
      });
      return { ok: true };
    } catch (err) {
      console.warn("⚠️ grant-onboarded fetch échec:", err);
      return { ok: false };
    }
  },
});

/** Appelle le bot Discord pour envoyer un DM.
 *  `suppressEmbeds` (optionnel) : demande au bot de masquer les cartes de preview
 *  auto-générées par Discord pour chaque lien (utile sur les DM riches en liens,
 *  ex. le DM de fin d'onboarding qui sinon affiche 1 carte par URL). */
export const discordDm = internalAction({
  args: {
    discordId: v.string(),
    // `content` (texte brut, legacy/alertes) OU `embed` (message membre brandé).
    content: v.optional(v.string()),
    suppressEmbeds: v.optional(v.boolean()),
    embed: v.optional(EMBED_V),
    button: v.optional(BUTTON_V),
    buttons: v.optional(v.array(BUTTON_V)),
  },
  handler: async (_ctx, { discordId, content, suppressEmbeds, embed, button, buttons }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!endpoint || !secret) {
      console.warn("DISCORD_BOT_ENDPOINT(_SECRET) absent — DM ignoré.");
      return { ok: false, reason: "missing_env" };
    }
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/dm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ discordId, content, suppressEmbeds, embed, button, buttons }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.warn(`⚠️ DM bot ${res.status}: ${txt.slice(0, 150)}`);
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      console.warn("⚠️ DM bot fetch échec:", err);
      return { ok: false };
    }
  },
});

/** Appelle le bot pour poster dans le SALON PRIVÉ d'onboarding du membre
 *  (topic onboarding:<discordId>). Fail-silent. */
export const discordPostOnboarding = internalAction({
  args: {
    discordId: v.string(),
    content: v.optional(v.string()),
    linkLabel: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    embed: v.optional(EMBED_V),
    buttons: v.optional(v.array(BUTTON_V)),
  },
  handler: async (_ctx, { discordId, content, linkLabel, linkUrl, embed, buttons }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!endpoint || !secret) return { ok: false, reason: "missing_env" };
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/post-onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ discordId, content, linkLabel, linkUrl, embed, buttons }),
      });
      return (await res.json().catch(() => ({ ok: false }))) as { ok: boolean };
    } catch (err) {
      console.warn("⚠️ post-onboarding bot échec:", err);
      return { ok: false };
    }
  },
});

/** STATE-AWARE : « Bravo, ton compte est lié ! » + la prochaine étape, posté
 *  DANS LE SALON PRIVÉ du membre — MAIS seulement si ce salon existe (= le
 *  membre est DÉJÀ sur le serveur → liaison APRÈS coup). S'il n'est pas encore
 *  arrivé, le bot renvoie no_channel → no-op (il aura le flux normal
 *  « S'onboarder » à son arrivée). Distingue donc tout seul « onboarding
 *  classique » vs « liaison après coup ». Réutilise la boussole _statusForUser
 *  pour s'adapter à l'étape. Fail-silent. */
export const postLinkedStatusToChannel = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const s = await ctx.runQuery(internal.onboardings._statusForUser, { userId });
    if (!s || !s.discordId) return { ok: false as const, reason: "no_discord" as const };
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const link = s.token ? `${site}/onboarding/${s.token}` : `${site}/exos`;

    const msg = linkedChannelMsg({
      firstName: s.firstName,
      tier: s.tier,
      step: s.step,
      link,
    });

    await ctx.scheduler.runAfter(0, internal.onboardings.discordPostOnboarding, {
      discordId: s.discordId,
      embed: msg.embed,
      // discordPostOnboarding rend linkLabel/linkUrl comme bouton-lien de l'embed.
      linkLabel: msg.button?.label,
      linkUrl: msg.button?.url,
    });
    return { ok: true as const };
  },
});

// --- Lectures admin (studio) ----------------------------------------------

/** Liste tous les onboardings, optionnellement filtrés par étape. */
export const listByStep = query({
  args: { step: v.optional(STEP) },
  handler: async (ctx, { step }) => {
    await requireAdmin(ctx);
    const rows = step
      ? await ctx.db
          .query("onboardings")
          .withIndex("by_step", (q) => q.eq("step", step))
          .order("desc")
          .collect()
      : await ctx.db.query("onboardings").order("desc").collect();
    // Enrichit avec pseudo/discord pour l'affichage.
    const out: Array<{
      _id: Id<"onboardings">;
      userId: Id<"users">;
      tier: "coaching" | "communaute";
      step: typeof rows[number]["step"];
      firstName: string | null;
      lastName: string | null;
      discordUsername: string | null;
      name: string | null;
      createdAt: number;
      formCompletedAt: number | null;
      rdvBookedAt: number | null;
    }> = [];
    for (const r of rows) {
      const u = await ctx.db.get(r.userId);
      out.push({
        _id: r._id,
        userId: r.userId,
        tier: r.tier,
        step: r.step,
        firstName: r.firstName ?? null,
        lastName: r.lastName ?? null,
        discordUsername: u?.discordUsername ?? null,
        name: u?.name ?? null,
        createdAt: r.createdAt,
        formCompletedAt: r.formCompletedAt ?? null,
        rdvBookedAt: r.rdvBookedAt ?? null,
      });
    }
    return out;
  },
});

/** Liste tous les onboardings non finalisés (pour le bloc dashboard /studio).
 *  Triés par createdAt ascendant (les plus anciens = priorité), hydratés avec
 *  les infos user (email, pseudo Discord). */
export const listNotFinal = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("onboardings").collect();
    const live = rows.filter(
      (o) => o.step !== "rdv_booked" && o.step !== "community_ready"
    );
    const enriched = await Promise.all(
      live.map(async (o) => {
        const user = await ctx.db.get(o.userId);
        return {
          _id: o._id,
          userId: o.userId,
          tier: o.tier,
          step: o.step,
          createdAt: o.createdAt,
          linkSentAt: o.linkSentAt ?? null,
          formCompletedAt: o.formCompletedAt ?? null,
          presentedAt: o.presentedAt ?? null,
          relance24hAt: o.relance24hAt ?? null,
          relance48hAt: o.relance48hAt ?? null,
          relance7dAt: o.relance7dAt ?? null,
          token: o.token,
          firstName: o.firstName ?? user?.name ?? null,
          email: user?.email ?? null,
          discordUsername: user?.discordUsername ?? null,
          discordId: user?.discordId ?? null,
        };
      })
    );
    enriched.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return enriched;
  },
});

/** Mutation admin : relance manuelle. Renvoie le DM Discord + email avec le
 *  lien d'onboarding via l'action sendLink existante. Idempotent : si la row
 *  est déjà finalisée, retourne `{ ok: false, reason: "already_done" }`. */
export const triggerManualRelance = mutation({
  args: { onboardingId: v.id("onboardings") },
  handler: async (ctx, { onboardingId }) => {
    await requireAdmin(ctx);
    const ob = await ctx.db.get(onboardingId);
    if (!ob) throw new Error("Onboarding introuvable.");
    if (ob.step === "rdv_booked" || ob.step === "community_ready") {
      return { ok: false, reason: "already_done" };
    }
    // RELANCE manuelle = message « rappel » DISTINCT du 1er envoi (sendLink), et
    // adapté à l'étape (réutilise le contenu de relance du cron). Voir
    // sendManualRelance ci-dessous.
    await ctx.scheduler.runAfter(0, internal.onboardings.sendManualRelance, {
      userId: ob.userId,
    });
    await logEvent(ctx, {
      userId: ob.userId,
      type: "onboarding.relance_manuelle",
      title: "Relance manuelle envoyée par Walid",
      actor: "admin",
    });
    return { ok: true };
  },
});

/** Relance MANUELLE (bouton « Relancer » du dashboard) : envoie un message de
 *  RAPPEL — DISTINCT du 1er envoi `sendLink` (« Bienvenue, c'est parti ») — et
 *  ADAPTÉ à l'étape où le membre est bloqué (présentation / questionnaire / RDV).
 *  Réutilise le contenu de relance du cron (`relanceDm` niveau doux
 *  + mail `sendRelanceOnboarding24h`) → cohérent, rien de neuf à maintenir.
 *  Fail-silent par canal. Ne touche PAS aux flags relance{24,48,7} du cron. */
export const sendManualRelance = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const s = await ctx.runQuery(internal.onboardings._statusForUser, { userId });
    if (!s || !s.step || !s.tier) return { ok: false as const, reason: "no_state" as const };
    const scenario = scenarioForStep(s.step, s.tier);
    // Étape finale (rdv_booked/community_ready) → rien à relancer.
    if (!scenario) return { ok: false as const, reason: "final" as const };

    const contact = await ctx.runQuery(internal.onboardings._userContact, { userId });
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const link = s.token ? `${site}/onboarding/${s.token}` : site;
    const firstName = s.firstName ?? contact?.firstName ?? null;

    // Mail de relance dédié (ton « rappel », ≠ mail de bienvenue). Fail-silent.
    if (contact?.email) {
      try {
        await ctx.runAction(internal.emails.sendRelanceOnboarding24h, {
          to: contact.email,
          firstName,
          link,
          tier: s.tier,
          scenario,
        });
      } catch (err) {
        console.warn("⚠️ relance manuelle email échec:", err);
      }
    }
    // DM « petit rappel » adapté à l'étape (≠ « Bienvenue, c'est parti »).
    if (s.discordId) {
      const msg = relanceDm({ level: 24, scenario, tier: s.tier, firstName, link });
      await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
        discordId: s.discordId,
        embed: msg.embed,
        button: msg.button,
      });
    }
    return { ok: true as const };
  },
});

/** Mutation admin : force la finalisation d'un onboarding bloqué. Cas d'usage :
 *  Walid a calé le 1er RDV à la main (WhatsApp/tel, hors Calendly) ou veut
 *  débloquer un client resté coincé à `form_done` / `awaiting_presentation`.
 *  Marque l'étape finale du palier (communaute → community_ready, coaching →
 *  rdv_booked) et accorde le rôle « Onboardé ». Idempotent : no-op si déjà
 *  finalisé. C'est le filet manuel quand l'auto-réparation ne suffit pas. */
export const forceCompleteOnboarding = mutation({
  args: { onboardingId: v.id("onboardings") },
  handler: async (ctx, { onboardingId }) => {
    await requireAdmin(ctx);
    const ob = await ctx.db.get(onboardingId);
    if (!ob) throw new Error("Onboarding introuvable.");
    if (ob.step === "rdv_booked" || ob.step === "community_ready") {
      return { ok: false as const, reason: "already_done" as const };
    }
    const now = Date.now();
    const patch =
      ob.tier === "communaute"
        ? { step: "community_ready" as const, updatedAt: now }
        : { step: "rdv_booked" as const, rdvBookedAt: now, updatedAt: now };
    await ctx.db.patch(ob._id, patch);
    await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, {
      userId: ob.userId,
    });
    await logEvent(ctx, {
      userId: ob.userId,
      type: "onboarding.force_complete",
      title: "Onboarding débloqué manuellement par Walid",
      actor: "admin",
    });
    return { ok: true as const, step: patch.step };
  },
});

/** Détails de l'onboarding d'un user pour la fiche élève. */
export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return ob ?? null;
  },
});

/** Met à jour la note libre admin (texte). Remplace l'ancien
 *  `coaching.updateOnboardingNote` (qui ciblait onboardingNotes). */
export const updateNote = mutation({
  args: { userId: v.id("users"), notes: v.string() },
  handler: async (ctx, { userId, notes }) => {
    await requireAdmin(ctx);
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (ob) {
      await ctx.db.patch(ob._id, { notes, updatedAt: Date.now() });
      return ob._id;
    }
    // Pas d'onboarding (user pré-onboarding system) → on en crée un en mode
    // "communaute community_ready" juste pour porter la note.
    const now = Date.now();
    return await ctx.db.insert("onboardings", {
      userId,
      tier: "communaute",
      step: "community_ready",
      token: crypto.randomUUID(),
      notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Phase C — Relances automatiques 24h / 48h / 7j ────────────────────────
// Cron quotidien (cf. convex/crons.ts) qui scanne tous les onboardings non
// finalisés et envoie une relance email + DM Discord selon le temps écoulé
// depuis la dernière activité. Idempotent : un flag `relance{24h,48h,7d}At`
// est posé sur la row à chaque envoi (n'envoie jamais 2x le même niveau).

const RELANCE_SCENARIO = v.union(
  v.literal("presentation"),
  v.literal("questionnaire"),
  v.literal("rdv")
);
const RELANCE_LEVEL = v.union(
  v.literal(24),
  v.literal(48),
  v.literal(7)
);

const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const D7 = 7 * 24 * 60 * 60 * 1000;

type RelanceLevel = 24 | 48 | 7;
type RelanceScenario = "presentation" | "questionnaire" | "rdv";

/** Liste interne : toutes les rows onboarding non terminées. */
export const _allUnfinishedOnboardings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("onboardings").collect();
    return rows.filter((r) => {
      // Les steps finaux selon le tier.
      if (r.tier === "communaute" && r.step === "community_ready") return false;
      if (r.tier === "coaching" && r.step === "rdv_booked") return false;
      return true;
    });
  },
});

/** Marque une relance comme envoyée + log + (48h/7j) crée un event d'alerte. */
export const _markRelanceSent = internalMutation({
  args: {
    onboardingId: v.id("onboardings"),
    level: RELANCE_LEVEL,
    scenario: RELANCE_SCENARIO,
  },
  handler: async (ctx, { onboardingId, level, scenario }) => {
    const ob = await ctx.db.get(onboardingId);
    if (!ob) return;
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (level === 24) patch.relance24hAt = now;
    if (level === 48) patch.relance48hAt = now;
    if (level === 7) patch.relance7dAt = now;
    await ctx.db.patch(onboardingId, patch);

    if (level === 48 || level === 7) {
      const days = level === 48 ? 2 : 7;
      const title =
        level === 48
          ? "Élève bloqué en onboarding depuis 48h"
          : "Élève bloqué en onboarding depuis 7 jours";
      await logEvent(ctx, {
        userId: ob.userId,
        type: level === 48 ? "onboarding.relance_48h" : "onboarding.relance_7d",
        title,
        actor: "system",
        meta: { scenario, tier: ob.tier, days },
      });
    }
  },
});

// (relanceDiscordContent retiré 2026-06-21 : le copy des relances vit désormais
//  dans lib/discordMessages.ts → relanceDm, rendu en embed brandé par le bot.)

/** Détermine le scénario en fonction de l'étape actuelle. */
function scenarioForStep(
  step: string,
  tier: "coaching" | "communaute"
): RelanceScenario | null {
  if (step === "awaiting_presentation") return "presentation";
  if (step === "link_sent") return "questionnaire";
  // consents = post-questionnaire, pré-RDV (coaching) → même scénario "rdv".
  if ((step === "consents" || step === "form_done") && tier === "coaching")
    return "rdv";
  return null;
}

/** Anchor temporel : depuis quand on compte l'inactivité. */
function anchorForStep(ob: {
  step: string;
  createdAt: number;
  linkSentAt?: number;
  formCompletedAt?: number;
}): number | null {
  if (ob.step === "awaiting_presentation") return ob.createdAt;
  if (ob.step === "link_sent") return ob.linkSentAt ?? null;
  if (ob.step === "consents" || ob.step === "form_done")
    return ob.formCompletedAt ?? null;
  return null;
}

/** Cron quotidien : envoie les relances dues. */
export const runDailyRelances = internalAction({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.runQuery(
      internal.onboardings._allUnfinishedOnboardings,
      {}
    );
    const now = Date.now();
    const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
    const walidEmail = "walid@amourstudios.fr";

    let sent = 0;
    for (const ob of rows) {
      const scenario = scenarioForStep(ob.step, ob.tier);
      if (!scenario) continue;
      const anchor = anchorForStep(ob);
      if (!anchor) continue;
      const elapsed = now - anchor;

      // Détermine le palier le plus BAS (le plus ancien) dû et pas encore
      // envoyé (FIX #10). On évalue dans l'ordre 24h → 48h → 7j pour ne JAMAIS
      // sauter directement au « dernier rappel » 7j si le 24h/48h n'ont pas
      // encore été envoyés : un onboarding découvert tardivement reçoit d'abord
      // 24h, PUIS 48h, PUIS 7j au fil des runs quotidiens (max un niveau par
      // run), tout en restant idempotent (marquage par palier conservé).
      let level: RelanceLevel | null = null;
      if (elapsed >= H24 && ob.relance24hAt === undefined) {
        level = 24;
      } else if (elapsed >= H48 && ob.relance48hAt === undefined) {
        level = 48;
      } else if (elapsed >= D7 && ob.relance7dAt === undefined) {
        level = 7;
      }
      if (level === null) continue;

      const contact = await ctx.runQuery(
        internal.onboardings._userContact,
        { userId: ob.userId }
      );
      if (!contact) continue;
      const link = `${site}/onboarding/${ob.token}`;
      const firstName = ob.firstName ?? contact.firstName ?? null;

      // ── CLAIM AVANT ENVOI (idempotence) ──
      // On marque la relance comme envoyée AVANT les envois. Si l'action crashe
      // au milieu (timeout, erreur réseau), elle ne repartira pas en double le
      // lendemain. Le palier suivant (48h/7j) sert de filet si un envoi échoue.
      await ctx.runMutation(internal.onboardings._markRelanceSent, {
        onboardingId: ob._id,
        level,
        scenario,
      });

      // ── Email (fail-silent) ──
      if (contact.email) {
        try {
          if (level === 24) {
            await ctx.runAction(internal.emails.sendRelanceOnboarding24h, {
              to: contact.email,
              firstName,
              link,
              tier: ob.tier,
              scenario,
            });
          } else if (level === 48) {
            await ctx.runAction(internal.emails.sendRelanceOnboarding48h, {
              to: contact.email,
              firstName,
              link,
              tier: ob.tier,
              scenario,
            });
          } else {
            await ctx.runAction(internal.emails.sendRelanceOnboarding7d, {
              to: contact.email,
              firstName,
              link,
              tier: ob.tier,
              scenario,
            });
          }
          console.log(
            `📧 relance ${level}h envoyée à ${contact.email} (${scenario}/${ob.tier})`
          );
        } catch (err) {
          console.warn(`⚠️ relance ${level}h email échec:`, err);
        }
      }

      // ── DM Discord (fail-silent) ──
      if (contact.discordId) {
        try {
          const msg = relanceDm({ level, scenario, tier: ob.tier, firstName, link });
          await ctx.runAction(internal.onboardings.discordDm, {
            discordId: contact.discordId,
            embed: msg.embed,
            button: msg.button,
          });
        } catch (err) {
          console.warn(`⚠️ relance ${level}h DM échec:`, err);
        }
      }

      // ── Alerte Walid (7j → email perso + event ; 48h → event seulement) ──
      // L'event est créé dans _markRelanceSent ci-dessous (transactionnel).
      if (level === 7) {
        try {
          const studentName =
            [firstName, ob.lastName].filter(Boolean).join(" ").trim() ||
            contact.email ||
            "Élève";
          console.log(`🔔 alerte Walid (7j bloqué) — ${studentName}`);
          await ctx.runAction(internal.emails.sendWalidStuckStudentAlert, {
            to: walidEmail,
            studentName,
            tier: ob.tier,
            scenario,
            studentEmail: contact.email ?? null,
            daysBlocked: 7,
          });
        } catch (err) {
          console.warn("⚠️ email Walid alerte 7j échec:", err);
        }
      } else if (level === 48) {
        console.log(`🔔 alerte Walid (48h bloqué) — userId=${ob.userId}`);
      }

      sent++;
    }

    console.log(`📧 runDailyRelances: ${sent} relances envoyées`);
    return { sent };
  },
});

/** Re-paiement d'un ancien membre : s'il avait déjà finalisé son onboarding,
 *  on lui redonne le rôle « Onboardé » (accès complet) sans refaire le flow.
 *  No-op s'il n'a pas d'onboarding finalisé. */
export const regrantOnboardedIfDone = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => maybeRegrantOnboarded(ctx, userId),
});

/** Helper dev/test : crée un onboarding "à remplir" pour un user donné.
 *  À supprimer après tests bout-en-bout. */
export const _devSeed = internalMutation({
  args: { userId: v.id("users"), tier: TIER },
  handler: async (ctx, { userId, tier }) => {
    const existing = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return { token: existing.token };
    const now = Date.now();
    const token = crypto.randomUUID();
    await ctx.db.insert("onboardings", {
      userId,
      tier,
      step: "link_sent",
      token,
      linkSentAt: now,
      presentedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { token };
  },
});

// Référence implicite à FINAL_STEP — évite un warning unused-var si jamais
// le compilateur estime que la constante n'est pas atteinte.
void FINAL_STEP;
