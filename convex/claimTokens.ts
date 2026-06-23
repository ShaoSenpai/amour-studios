import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { linkPurchaseToUser } from "./lib/linking";
import { rateLimit } from "./rateLimit";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

// ============================================================================
// Claim tokens — clé secrète à usage unique liée à un PaymentIntent.
// ----------------------------------------------------------------------------
// Durée de vie : 7 jours.
// Sécurise le /claim contre le hijack de PI ID (impossible à deviner).
// ============================================================================

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Code court de liaison : 6 chars base32 sans caractères ambigus (pas de I/O/0/1/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 30 chars
function genCode(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
/** Normalise la saisie utilisateur : "amr-7k3qxm" / "AMR 7K3QXM" → "7K3QXM". */
function normalizeCode(input: string): string {
  let s = (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length > 6 && s.startsWith("AMR")) s = s.slice(3); // retire le préfixe d'affichage
  return s;
}
/** Génère un code unique (anti-collision via l'index by_code). */
async function generateUniqueCode(
  ctx: GenericMutationCtx<DataModel>
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = genCode();
    const existing = await ctx.db
      .query("claimTokens")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!existing) return code;
  }
  return genCode() + genCode().slice(0, 2); // fallback très improbable
}

/**
 * Masque un email pour un retour PUBLIC non authentifié : garde la 1re lettre
 * du local-part + le domaine intact (`dermovium@gmail.com` → `d***@gmail.com`).
 * Empêche la fuite de l'email client complet via un lien /claim partagé/loggé,
 * tout en gardant assez d'info pour une confirmation visuelle « c'est mon
 * paiement ». Robuste aux entrées malformées (pas de `@`, local-part vide).
 */
function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "***"; // pas d'@ ou local-part vide → on ne révèle rien
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

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
    const code = await generateUniqueCode(ctx);
    return await ctx.db.insert("claimTokens", {
      token,
      code,
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

    // Lien d'onboarding DIRECT (token public) si le purchase est déjà lié à un
    // user ET que son onboarding n'est pas terminé. Permet à /claim de rediriger
    // droit vers le wizard SANS session navigateur — indispensable en webview
    // (navigateur in-app) où la session OAuth ne tient pas. Le token onboarding
    // est un secret partagé (même modèle que le claim token), donc OK en public.
    let onboardingToken: string | null = null;
    if (purchase.userId) {
      const uid = purchase.userId;
      const ob = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .first();
      if (ob && ob.step !== "rdv_booked" && ob.step !== "community_ready") {
        onboardingToken = ob.token;
      }
    }

    return {
      _id: purchase._id,
      status: purchase.status,
      // PII : on ne renvoie JAMAIS l'email en clair sur cette query PUBLIQUE
      // non authentifiée (un lien /claim partagé/loggé l'exposerait). Masqué.
      email: maskEmail(purchase.email),
      hasUser: !!purchase.userId,
      onboardingToken,
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
    if (!userId) throw new ConvexError("Non authentifié");

    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (!claim) throw new ConvexError("Lien invalide ou expiré");
    if (claim.expiresAt < Date.now()) {
      throw new ConvexError("Ce lien d'activation a expiré (valide 7 jours)");
    }
    if (claim.claimedAt && claim.claimedByUserId !== userId) {
      throw new ConvexError("Ce lien a déjà été utilisé sur un autre compte");
    }

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", claim.paymentIntentId)
      )
      .first();
    if (!purchase) {
      throw new ConvexError("Paiement introuvable — le webhook Stripe n'est peut-être pas encore arrivé");
    }
    // Abonnements : on accepte "active" et "incomplete" (paiement en cours de
    // confirmation) en plus de "paid" (legacy). On refuse les statuts terminaux.
    const linkable =
      purchase.status === "paid" ||
      purchase.status === "active" ||
      purchase.status === "incomplete";
    if (!linkable) {
      throw new ConvexError(`Ce paiement n'est pas valide (statut : ${purchase.status})`);
    }
    // Liaison fiable au compte AUTHENTIFIÉ (transfert multi-compte géré, rôles
    // Discord + onboarding) via le primitif partagé. Le TOKEN, envoyé à l'email
    // du paiement, prouve la légitimité → on lie même si email Stripe ≠ Discord.
    const { transferred } = await linkPurchaseToUser(ctx, purchase, userId);

    // Burn le token (single-use).
    await ctx.db.patch(claim._id, {
      claimedAt: Date.now(),
      claimedByUserId: userId,
    });

    return { ok: true, purchaseId: purchase._id, transferred };
  },
});

/**
 * Query publique : retourne le purchase associé à un CODE de liaison (masqué).
 * Miroir de purchaseForToken, pour l'écran in-app « Lier mon paiement ».
 */
export const purchaseForCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const norm = normalizeCode(code);
    if (norm.length < 4) return null;
    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_code", (q) => q.eq("code", norm))
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
      tier: purchase.tier ?? null,
      email: maskEmail(purchase.email),
      hasUser: !!purchase.userId,
    };
  },
});

/**
 * Mutation authentifiée : lie le paiement (résolu par CODE) au MEMBRE CONNECTÉ.
 * C'est la voie sûre & pratique : l'identité = le compte Discord OAuth courant,
 * la preuve = le code court. Marche quel que soit l'email du paiement.
 * Rate-limit (anti brute-force du code court) : 10 essais / 60s par user.
 */
export const linkByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Non authentifié");
    const norm = normalizeCode(code);
    if (norm.length < 4) throw new ConvexError("Code invalide");

    const rl = await rateLimit(ctx, `linkByCode:${userId}`, 10);
    if (!rl.allowed) {
      throw new ConvexError("Trop d'essais. Réessaie dans une minute.");
    }

    const claim = await ctx.db
      .query("claimTokens")
      .withIndex("by_code", (q) => q.eq("code", norm))
      .first();
    if (!claim) throw new ConvexError("Code invalide ou expiré");
    if (claim.expiresAt < Date.now()) {
      throw new ConvexError("Ce code a expiré. Demande-en un nouveau.");
    }
    if (claim.claimedAt && claim.claimedByUserId !== userId) {
      throw new ConvexError("Ce code a déjà été utilisé sur un autre compte");
    }

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", claim.paymentIntentId)
      )
      .first();
    if (!purchase) {
      throw new ConvexError("Paiement introuvable — le webhook Stripe n'est peut-être pas encore arrivé");
    }
    const linkable =
      purchase.status === "paid" ||
      purchase.status === "active" ||
      purchase.status === "incomplete";
    if (!linkable) {
      throw new ConvexError(`Ce paiement n'est pas valide (statut : ${purchase.status})`);
    }

    const { transferred } = await linkPurchaseToUser(ctx, purchase, userId);

    await ctx.db.patch(claim._id, {
      claimedAt: Date.now(),
      claimedByUserId: userId,
    });

    return { ok: true, purchaseId: purchase._id, transferred };
  },
});

/**
 * Interne : garantit un token de claim VALIDE pour un PaymentIntent. Si le
 * token existant est expiré ou absent, en crée un neuf (TTL 7j) et le renvoie.
 * Utilisé par le cron de relance des paiements non activés (le 1er token a pu
 * expirer avant que l'élève ne crée son compte).
 */
/**
 * Garantit un claim (token + code) VALIDE pour un PaymentIntent. Réutilise le
 * token existant s'il est encore valide/non utilisé (en lui posant un code s'il
 * manque), sinon en crée un neuf. Fonction simple → appelable depuis n'importe
 * quelle mutation (refreshForPaymentIntent, admin adminGetClaimLink).
 */
export async function ensureClaim(
  ctx: GenericMutationCtx<DataModel>,
  paymentIntentId: string,
  email?: string
): Promise<{ token: string; code: string }> {
  const now = Date.now();
  const existing = await ctx.db
    .query("claimTokens")
    .withIndex("by_payment_intent", (q) =>
      q.eq("paymentIntentId", paymentIntentId)
    )
    .first();
  if (existing && !existing.claimedAt && existing.expiresAt > now) {
    let code = existing.code;
    if (!code) {
      code = await generateUniqueCode(ctx);
      await ctx.db.patch(existing._id, { code });
    }
    return { token: existing.token, code };
  }
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  const code = await generateUniqueCode(ctx);
  await ctx.db.insert("claimTokens", {
    token,
    code,
    paymentIntentId,
    email: email || existing?.email || undefined,
    expiresAt: now + TOKEN_TTL_MS,
    createdAt: now,
  });
  return { token, code };
}

export const refreshForPaymentIntent = internalMutation({
  args: { paymentIntentId: v.string(), email: v.optional(v.string()) },
  // Renvoie { token, code } (le code AMR sert au repli in-app dans les emails).
  handler: async (ctx, { paymentIntentId, email }) =>
    await ensureClaim(ctx, paymentIntentId, email),
});

/** One-shot : attribue un `code` aux claimTokens existants qui n'en ont pas. */
export const backfillCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("claimTokens").collect();
    let filled = 0;
    for (const r of rows) {
      if (!r.code) {
        await ctx.db.patch(r._id, { code: await generateUniqueCode(ctx) });
        filled++;
      }
    }
    return { total: rows.length, filled };
  },
});

/**
 * Interne : trouve le purchase ACTIF le plus récent pour un email (index
 * by_email), parmi les statuts vivants (active/past_due/paid) et muni d'un
 * stripePaymentIntentId réel (pi_...). Sert à `resendActivationByEmail`.
 * Renvoie { paymentIntentId, tier, firstName } ou null. Ne révèle rien à
 * l'extérieur (utilisé seulement par l'action, qui répond générique).
 */
export const _findActivePurchaseForEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const isLive = (s?: string) =>
      s === "active" || s === "past_due" || s === "paid";
    const rows = await ctx.db
      .query("purchases")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .collect();
    const candidates = rows
      .filter(
        (p) =>
          isLive(p.status) &&
          typeof p.stripePaymentIntentId === "string" &&
          p.stripePaymentIntentId.startsWith("pi_")
      )
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const picked = candidates[0];
    if (!picked) return null;
    // État de liaison + onboarding (pour rendre l'email fallback state-aware :
    // ne pas renvoyer « relie ton paiement » si c'est DÉJÀ lié — anti-répétition).
    let firstName: string | null = null;
    let onboardingStep: string | null = null;
    let onboardingToken: string | null = null;
    if (picked.userId) {
      const ob = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", picked.userId!))
        .first();
      firstName = ob?.firstName ?? null;
      onboardingStep = ob?.step ?? null;
      onboardingToken = ob?.token ?? null;
    }
    return {
      paymentIntentId: picked.stripePaymentIntentId as string,
      tier: picked.tier ?? null,
      firstName,
      linkedUserId: picked.userId ?? null,
      onboardingStep,
      onboardingToken,
    };
  },
});

/**
 * Action PUBLIQUE (self-service) : renvoie un lien d'activation par email.
 * Cas d'usage : un client a payé mais s'est présenté avec un compte Discord
 * NON lié à son paiement (ou a perdu son lien). Depuis la page /lier, il entre
 * l'email de son paiement ; s'il existe un purchase actif, on régénère un token
 * frais (7j) et on lui ré-envoie l'email de claim.
 *
 * ⚠️ ANTI-LEAK : la réponse est TOUJOURS { ok: true }, identique que l'email
 * ait un paiement ou non. On ne révèle jamais l'existence d'un paiement (sinon
 * la page devient un oracle d'énumération d'emails clients).
 *
 * Rate-limit : clé `resendActivation:<email>`, max 5 / fenêtre (60s).
 */
export const resendActivationByEmail = action({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ ok: true }> => {
    const normalized = email.trim().toLowerCase();
    // Email vide ou manifestement invalide → réponse générique (pas d'oracle).
    if (!normalized || !normalized.includes("@")) return { ok: true };

    // Rate-limit (fail-open sur la réponse générique : on n'expose jamais le
    // dépassement). Si bloqué, on ne fait simplement aucun envoi.
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, {
      key: `resendActivation:${normalized}`,
      max: 5,
    });
    if (!rl.allowed) return { ok: true };

    const found = await ctx.runQuery(
      internal.claimTokens._findActivePurchaseForEmail,
      { email: normalized }
    );
    // Pas de paiement actif → on ne fait RIEN mais on répond pareil (anti-leak).
    if (!found) return { ok: true };

    try {
      const site = process.env.SITE_URL ?? "https://membres.amourstudios.fr";
      // STATE-AWARE (anti-répétition) : on n'envoie « relie ton paiement » QUE si
      // ce n'est PAS encore lié. Si déjà lié, on s'adapte à l'étape pour ne pas
      // répéter une étape franchie.
      if (found.linkedUserId) {
        // Déjà lié + onboarding terminé → rien à renvoyer (évite la répétition).
        if (
          found.onboardingStep === "rdv_booked" ||
          found.onboardingStep === "community_ready"
        ) {
          return { ok: true };
        }
        // Déjà lié mais onboarding en cours → renvoyer le LIEN d'onboarding
        // (le bon état), surtout pas « relie ton paiement » (déjà fait).
        if (found.onboardingToken) {
          await ctx.runAction(internal.emails.sendOnboardingLinkEmail, {
            to: normalized,
            firstName: found.firstName ?? null,
            link: `${site}/onboarding/${found.onboardingToken}`,
            tier: found.tier ?? "communaute",
          });
        }
        return { ok: true };
      }
      // NON lié → mail RÉCUP « relie ton paiement » (lien /claim?t= DIRECT + code
      // AMR en repli, cas email paiement ≠ email Discord).
      const { token, code } = await ctx.runMutation(
        internal.claimTokens.refreshForPaymentIntent,
        { paymentIntentId: found.paymentIntentId, email: normalized }
      );
      await ctx.runAction(internal.emails.sendRelinkEmail, {
        to: normalized,
        firstName: found.firstName ?? "",
        claimToken: token,
        code,
        tier: found.tier ?? undefined,
      });
    } catch (err) {
      // Fail-silent : la réponse reste générique. On log côté serveur.
      console.warn("⚠️ resendActivationByEmail envoi échec:", err);
    }
    return { ok: true };
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
    if (!claim?.token) return null;
    return { token: claim.token, code: claim.code ?? null };
  },
});
