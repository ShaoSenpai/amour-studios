import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { logEvent } from "./lib/events";
import type { Doc } from "./_generated/dataModel";

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
    // ── TRANSFERT (re-liaison multi-compte) ─────────────────────────────────
    // Le purchase est déjà lié à un AUTRE user que celui qui claim aujourd'hui.
    // C'est le scénario « compte Discord non lié » : le client avait lié son
    // paiement à un 1er compte (supprimé/recréé, mauvais compte à l'OAuth…),
    // puis se présente avec un 2e. Le TOKEN, envoyé à l'EMAIL DU PAIEMENT,
    // prouve la légitimité → on autorise le transfert vers le user courant.
    //
    // On capture l'ancien compte AVANT de repointer pour pouvoir lui retirer
    // ses rôles Discord (il ne doit plus avoir accès via ce paiement).
    const isTransfer = !!purchase.userId && purchase.userId !== userId;
    let oldUser: Doc<"users"> | null = null;
    if (isTransfer) {
      oldUser = await ctx.db.get(purchase.userId!);
      // Délie l'ancien user du purchase (un user = au plus 1 purchaseId).
      if (oldUser && oldUser.purchaseId === purchase._id) {
        await ctx.db.patch(oldUser._id, { purchaseId: undefined });
      }
    }

    // Link purchase ↔ user courant. En transfert on repointe explicitement
    // purchase.userId (il pointait vers l'ancien) ; sinon (cas nominal non lié)
    // on ne pose que si absent — comportement historique inchangé.
    if (isTransfer || !purchase.userId) {
      await ctx.db.patch(purchase._id, { userId });
    }
    const user = await ctx.db.get(userId);
    if (user && !user.purchaseId) {
      await ctx.db.patch(userId, { purchaseId: purchase._id });
    }

    // En transfert : rattache l'onboarding au nouveau user. On repointe la row
    // de l'ANCIEN user vers le nouveau (préserve la progression : prénom,
    // réponses, étape) UNIQUEMENT si le nouveau user n'a pas déjà la sienne.
    // Si les deux en ont une, on garde celle du nouveau (createForPurchase plus
    // bas est idempotent et ne créera rien). Si aucun n'en a, createForPurchase
    // la créera.
    if (isTransfer && oldUser) {
      const newUserOb = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      const oldUserOb = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", oldUser._id))
        .first();
      if (!newUserOb && oldUserOb) {
        await ctx.db.patch(oldUserOb._id, {
          userId,
          updatedAt: Date.now(),
        });
      }
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

    // En transfert : retire d'abord les rôles de l'ANCIEN compte Discord (il ne
    // doit plus profiter de ce paiement) — rôles palier + Onboardé. Fail-silent
    // côté actions. On ne le fait que si l'ancien compte avait un discordId.
    if (isTransfer && oldUser?.discordId) {
      await ctx.scheduler.runAfter(0, internal.stripe.removeDiscordRoles, {
        discordId: oldUser.discordId,
        email: oldUser.email ?? "",
      });
      await ctx.scheduler.runAfter(0, internal.stripe.removeOnboardedRole, {
        discordId: oldUser.discordId,
      });
    }

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
    // createForPurchase est idempotent (no-op si l'onboarding existe déjà —
    // notamment après un rattachement de transfert ci-dessus).
    if (accessGranted && purchase.tier) {
      await ctx.scheduler.runAfter(0, internal.onboardings.createForPurchase, {
        userId,
        tier: purchase.tier,
      });
    }

    // Trace CRM du transfert (post-patch, dans la même transaction).
    if (isTransfer) {
      await logEvent(ctx, {
        userId,
        type: "purchase.transferred",
        title: "Paiement transféré vers un nouveau compte (récup self-service)",
        actor: "system",
        meta: {
          purchaseId: purchase._id,
          fromUserId: oldUser?._id ?? null,
          fromDiscordId: oldUser?.discordId ?? null,
          toDiscordId: user?.discordId ?? null,
        },
      });
    }

    return { ok: true, purchaseId: purchase._id, transferred: isTransfer };
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
    // Prénom : depuis l'onboarding du user lié si dispo (sinon vide).
    let firstName: string | null = null;
    if (picked.userId) {
      const ob = await ctx.db
        .query("onboardings")
        .withIndex("by_user", (q) => q.eq("userId", picked.userId!))
        .first();
      firstName = ob?.firstName ?? null;
    }
    return {
      paymentIntentId: picked.stripePaymentIntentId as string,
      tier: picked.tier ?? null,
      firstName,
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
      const token = await ctx.runMutation(
        internal.claimTokens.refreshForPaymentIntent,
        { paymentIntentId: found.paymentIntentId, email: normalized }
      );
      await ctx.runAction(internal.emails.sendClaimEmail, {
        to: normalized,
        firstName: found.firstName ?? "",
        claimToken: token,
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
    return claim?.token ?? null;
  },
});
