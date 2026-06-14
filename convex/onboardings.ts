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
import { requireAdmin } from "./lib/auth";
import { logEvent } from "./lib/events";
import type { Id, Doc } from "./_generated/dataModel";

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

/** Vérifie qu'un user (qui vient de se logger ou de payer) a bien un
 *  onboarding row. Si purchase actif + tier connu + pas encore d'onboarding,
 *  crée la row. Idempotent. Appelée depuis auth.ts (à la connexion Discord)
 *  ET depuis le webhook Stripe (à la création d'une subscription). */
export const ensureForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<{ created: boolean }> => {
    const existing = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return { created: false };
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
    const token = crypto.randomUUID();
    await ctx.db.insert("onboardings", {
      userId,
      tier: active.tier,
      step: "awaiting_presentation",
      token,
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, {
      userId,
      type: "onboarding.created",
      title: "Onboarding créé",
      actor: "system",
    });
    return { created: true };
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
      currentEur: 79,
      coachingEur: 179,
      feeEur: 100,
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
 *  une fois le débit Stripe confirmé. Bascule la row sur coaching/form_done et
 *  ferme la fenêtre d'offre (→ la page enchaîne l'étape RDV coaching). Log
 *  l'event tier_changed. Idempotent : ne re-log pas si déjà coaching. */
export const _applyUpgradeOnboarding = internalMutation({
  args: { onboardingId: v.id("onboardings") },
  handler: async (ctx, { onboardingId }) => {
    const ob = await ctx.db.get(onboardingId);
    if (!ob) return;
    const alreadyCoaching = ob.tier === "coaching";
    await ctx.db.patch(onboardingId, {
      tier: "coaching",
      step: "form_done",
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
 *  montant coaching, duree effacée). Le webhook Stripe (subscription.updated)
 *  confirmera/écrasera ensuite — on pose tôt pour cohérence immédiate. */
export const _applyUpgradePurchase = internalMutation({
  args: { purchaseId: v.id("purchases"), stripePriceId: v.string() },
  handler: async (ctx, { purchaseId, stripePriceId }) => {
    await ctx.db.patch(purchaseId, {
      tier: "coaching",
      stripePriceId,
      amount: 17900,
      duree: undefined,
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
    const now = Date.now();
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
        patch.step = "form_done";
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
      // 79€ : community_ready = final → bot ajoute Onboardé
      if (ob.tier === "communaute") {
        await ctx.scheduler.runAfter(0, internal.onboardings.grantOnboarded, {
          userId: ob.userId,
        });
      }
    }
    return { ok: true };
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
    // 179€ : rdv_booked = final → bot ajoute Onboardé
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

export const markPresentedByDiscordId = internalMutation({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) {
      // Compte Discord inconnu en base = présentation non liée à un paiement.
      // Le bot DM déjà le présentateur (lien /lier) ; ici on prévient le coach
      // (filet de visibilité, fail-silent, sans bloquer le no-op).
      await alertStaffUnlinkedPresentation(ctx, discordId, "user_not_found");
      return { ok: false as const, reason: "user_not_found" as const };
    }

    // Self-heal : (ré)attribue le rôle = palier si le purchase est actif. Couvre
    // le cas « lié mais sans rôle » (ex. bot down au join → guildMemberAdd perdu,
    // OAuth fait avant le join). Si aucun purchase actif → visiteur/non-payant :
    // on s'arrête là (pas de welcome ni d'onboarding déclenché côté bot).
    const tier = await scheduleRoleFromActivePurchase(ctx, user);
    if (!tier) {
      // User connu mais sans paiement actif lié → même filet coach.
      await alertStaffUnlinkedPresentation(ctx, discordId, "no_active_purchase");
      return { ok: false as const, reason: "no_active_purchase" as const };
    }

    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    // Membre payant mais pas d'onboarding row : le rôle a quand même été (ré)assuré.
    if (!ob) return { ok: true as const, tier, reason: "no_onboarding" as const };
    if (ob.step !== "awaiting_presentation") {
      return { ok: true as const, tier, alreadyDone: true as const };
    }
    const now = Date.now();
    await ctx.db.patch(ob._id, {
      step: "link_sent",
      presentedAt: now,
      linkSentAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, {
      userId: user._id,
      type: "onboarding.presented",
      title: "Présentation Discord détectée",
      actor: "discord_bot",
    });
    // Déclenche l'envoi email + DM (action) avec le token.
    await ctx.scheduler.runAfter(0, internal.onboardings.sendLink, {
      userId: user._id,
      token: ob.token,
      firstName: ob.firstName ?? null,
      tier: ob.tier,
    });
    return { ok: true as const, tier };
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
    const site = process.env.SITE_URL ?? "https://amour-studios.vercel.app";
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
    // DM Discord — fail-silent.
    if (u.discordId) {
      try {
        const name = (firstName ?? u.firstName ?? "").trim();
        const greet = name ? `Salut ${name} 👋\n\n` : "Salut 👋\n\n";
        const intro =
          tier === "coaching"
            ? "Merci pour ta présentation ✨\n\n**Pour débloquer ton accès Discord complet** (écriture dans tous les channels, lives, feedback), il te reste 3 étapes obligatoires :\n\n1️⃣ Tes coordonnées (~30s)\n2️⃣ Questionnaire (~5 min) pour que Walid prépare ton 1er appel\n3️⃣ **Réserver ton 1er appel avec Walid** ← c'est ce qui débloque ton accès\n\nTant que le RDV n'est pas réservé, ton accès Discord reste limité."
            : "Merci pour ta présentation ✨\n\n**Pour débloquer ton accès complet communauté**, il te reste 2 petites étapes (~2 min) :\n\n1️⃣ Tes coordonnées\n2️⃣ 3 questions rapides\n\nTant que ce n'est pas complété, ton accès reste limité.";
        await ctx.runAction(internal.onboardings.discordDm, {
          discordId: u.discordId,
          content: `${greet}${intro}\n\n👉 ${link}`,
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
      // (fail-silent, adapté à l'offre). C'est le « tu as accès à tout ».
      const hi = u.firstName ? `${u.firstName}, ` : "";
      const content =
        u.tier === "coaching"
          ? `🎉 ${hi}c'est validé ! Ton accès est complet : tu peux désormais écrire dans tous les channels, ton espace exercices est ouvert, et ton 1er RDV est calé. On se voit très vite. 🚀`
          : `🎉 ${hi}bienvenue dans AMOUR STUDIOS ! Ta présentation est validée — tu as maintenant accès à **tous les channels** de la communauté. Partage ta musique, pose tes questions, profite des ressources. 🎵`;
      await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
        discordId: u.discordId,
        content,
      });
      return { ok: true };
    } catch (err) {
      console.warn("⚠️ grant-onboarded fetch échec:", err);
      return { ok: false };
    }
  },
});

/** Appelle le bot Discord pour envoyer un DM. */
export const discordDm = internalAction({
  args: { discordId: v.string(), content: v.string() },
  handler: async (_ctx, { discordId, content }) => {
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
        body: JSON.stringify({ discordId, content }),
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
    await ctx.scheduler.runAfter(0, internal.onboardings.sendLink, {
      userId: ob.userId,
      token: ob.token,
      firstName: ob.firstName ?? null,
      tier: ob.tier,
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

const RELANCE_TIER = v.union(v.literal("coaching"), v.literal("communaute"));
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

/** Contenu DM Discord selon (level × scenario × tier). Ton qui monte avec le level. */
function relanceDiscordContent({
  level,
  scenario,
  tier,
  firstName,
  link,
}: {
  level: RelanceLevel;
  scenario: RelanceScenario;
  tier: "coaching" | "communaute";
  firstName: string | null;
  link: string;
}): string {
  const hello = firstName ? `Salut ${firstName} 👋` : "Salut 👋";

  if (scenario === "presentation") {
    if (level === 24) {
      return `${hello}\n\nPetit rappel : tu n'as pas encore posté ta présentation dans **#🎤・présente-toi**.\n\nC'est l'étape qui débloque ton onboarding ${tier === "coaching" ? "coaching" : "communauté"}. Un message et on t'envoie ton lien dans la foulée 🔥`;
    }
    if (level === 48) {
      return `${hello}\n\nÇa fait 2 jours, ta présentation Discord est toujours en attente.\n\nSans ce message dans **#🎤・présente-toi**, on ne peut pas t'envoyer ton lien d'onboarding. C'est 30 secondes, vraiment.`;
    }
    return `${hello}\n\n**Dernier rappel.** 7 jours sans présentation.\n\nSi tu ne fais pas le message dans **#🎤・présente-toi** rapidement, on devra fermer ton onboarding et libérer ta place.\n\nUn blocage ? Réponds à ce DM, on regarde ensemble.`;
  }

  if (scenario === "questionnaire") {
    if (level === 24) {
      return `${hello}\n\nTu as bien ton lien d'onboarding, mais ton questionnaire n'est pas terminé.\n\n${tier === "coaching" ? "Il reste 5 min pour le boucler. C'est ce qui permet à Walid de préparer ton 1er appel." : "Il reste 2 min pour le finir. Dernière étape avant ton accès complet."}\n\n👉 ${link}`;
    }
    if (level === 48) {
      return `${hello}\n\n48h que ton questionnaire est en pause. ${tier === "coaching" ? "Sans ce questionnaire, tu ne peux pas réserver ton 1er RDV ni écrire sur le Discord." : "Sans ce questionnaire, ton accès Discord reste limité."}\n\n👉 ${link}`;
    }
    return `${hello}\n\n**Dernier rappel.** 7 jours que ton questionnaire est ouvert.\n\nSi tu ne le termines pas, on suspend ton onboarding. Un blocage ? Dis-le moi en réponse.\n\n👉 ${link}`;
  }

  // rdv (coaching only)
  if (level === 24) {
    return `${hello}\n\nQuestionnaire OK 🙌 Il reste juste ton 1er RDV avec Walid à réserver.\n\nC'est ce qui débloque ton accès Discord complet (écriture, lives, feedback).\n\n👉 ${link}`;
  }
  if (level === 48) {
    return `${hello}\n\n48h que ton questionnaire est validé mais que le RDV n'est pas posé.\n\nTon accès Discord reste limité tant que le créneau n'est pas réservé. Choisis ce qui t'arrange.\n\n👉 ${link}`;
  }
  return `${hello}\n\n**Dernier rappel.** 7 jours sans RDV.\n\nTon accès Discord reste limité. Si tu n'arrives pas à trouver un créneau, réponds-moi, on cale ça à la main.\n\n👉 ${link}`;
}

/** Détermine le scénario en fonction de l'étape actuelle. */
function scenarioForStep(
  step: string,
  tier: "coaching" | "communaute"
): RelanceScenario | null {
  if (step === "awaiting_presentation") return "presentation";
  if (step === "link_sent") return "questionnaire";
  if (step === "form_done" && tier === "coaching") return "rdv";
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
  if (ob.step === "form_done") return ob.formCompletedAt ?? null;
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
    const site = process.env.SITE_URL ?? "https://amour-studios.vercel.app";
    const walidEmail = "walid@amourstudios.fr";

    let sent = 0;
    for (const ob of rows) {
      const scenario = scenarioForStep(ob.step, ob.tier);
      if (!scenario) continue;
      const anchor = anchorForStep(ob);
      if (!anchor) continue;
      const elapsed = now - anchor;

      // Détermine le niveau le plus haut "dû" et pas encore envoyé.
      // On évalue dans l'ordre 7j → 48h → 24h pour envoyer au max un niveau
      // par run (le plus pertinent), tout en restant idempotent.
      let level: RelanceLevel | null = null;
      if (elapsed >= D7 && ob.relance7dAt === undefined) {
        level = 7;
      } else if (elapsed >= H48 && ob.relance48hAt === undefined) {
        level = 48;
      } else if (elapsed >= H24 && ob.relance24hAt === undefined) {
        level = 24;
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
          await ctx.runAction(internal.onboardings.discordDm, {
            discordId: contact.discordId,
            content: relanceDiscordContent({
              level,
              scenario,
              tier: ob.tier,
              firstName,
              link,
            }),
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
