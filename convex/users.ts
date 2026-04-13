import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — User queries
// ----------------------------------------------------------------------------
// Voir prd.md section 4.1 et section 5 (Auth flow).
// ============================================================================

/**
 * Retourne le user actuellement connecté, ou `null` si non authentifié.
 * Utilisé par la plupart des écrans (header, dashboard, player, admin).
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.deletedAt !== undefined) return null;
    return user;
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const updates: Record<string, string> = {};
    if (args.name !== undefined) updates.name = args.name.trim();
    if (args.email !== undefined) updates.email = args.email.trim().toLowerCase();
    await ctx.db.patch(userId, updates);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveProfileImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(userId, { customImage: storageId, image: url ?? undefined });
  },
});

/**
 * Query interne : récupère le user courant depuis une action.
 * Retourne uniquement les champs utiles au flow Discord.
 */
export const getSelf = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.deletedAt !== undefined) return null;
    return {
      discordId: user.discordId,
      email: user.email,
      purchaseId: user.purchaseId,
    };
  },
});

/**
 * Action publique : le user demande une re-synchronisation du rôle Discord VIP.
 * Utile si l'assignation automatique a échoué (bot down, timing, etc.).
 */
export const requestDiscordRoleSync = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const self = await ctx.runQuery(internal.users.getSelf, { userId });
    if (!self?.discordId || !self?.email || !self?.purchaseId) {
      throw new Error("Compte non éligible (paiement ou Discord manquant)");
    }

    await ctx.runAction(internal.stripe.assignDiscordRole, {
      discordId: self.discordId,
      email: self.email,
    });

    return { ok: true };
  },
});

// ============================================================================
// Claim flow — lier un paiement Stripe au user courant
// ============================================================================

/**
 * Query publique : check si un purchase existe pour une session Stripe donnée.
 * Utile pour la page /claim pour afficher l'état en temps réel (retry si le
 * webhook n'est pas encore arrivé).
 */
export const purchaseForSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();
    if (!purchase) return null;
    return {
      _id: purchase._id,
      status: purchase.status,
      email: purchase.email,
      hasUser: !!purchase.userId,
    };
  },
});

/**
 * Même chose via payment_intent_id (intégration Stripe Elements).
 */
export const purchaseForPaymentIntent = query({
  args: { paymentIntentId: v.string() },
  handler: async (ctx, { paymentIntentId }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", paymentIntentId)
      )
      .first();
    if (!purchase) return null;
    return {
      _id: purchase._id,
      status: purchase.status,
      email: purchase.email,
      hasUser: !!purchase.userId,
    };
  },
});

/**
 * Mutation publique : lie un purchase au user courant via la session Stripe.
 * Idempotent — si déjà lié, no-op.
 */
export const claimPurchaseBySession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_stripe_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();

    if (!purchase) {
      throw new Error("Paiement introuvable — il est peut-être encore en cours de traitement");
    }
    if (purchase.status !== "paid") {
      throw new Error("Ce paiement n'est pas validé");
    }
    if (purchase.userId && purchase.userId !== userId) {
      throw new Error("Ce paiement est déjà lié à un autre compte");
    }

    // Link purchase ↔ user
    if (!purchase.userId) {
      await ctx.db.patch(purchase._id, { userId });
    }
    const user = await ctx.db.get(userId);
    if (user && !user.purchaseId) {
      await ctx.db.patch(userId, { purchaseId: purchase._id });
    }

    // Schedule Discord role assignment (fail-silent)
    if (user?.discordId && user?.email) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: user.discordId,
        email: user.email,
      });
    }

    return { ok: true, purchaseId: purchase._id };
  },
});

/**
 * Même chose via payment_intent_id (intégration Stripe Elements).
 */
export const claimPurchaseByPaymentIntent = mutation({
  args: { paymentIntentId: v.string() },
  handler: async (ctx, { paymentIntentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");

    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_payment_intent", (q) =>
        q.eq("stripePaymentIntentId", paymentIntentId)
      )
      .first();

    if (!purchase) {
      throw new Error("Paiement introuvable — il est peut-être encore en cours de traitement");
    }
    if (purchase.status !== "paid") {
      throw new Error("Ce paiement n'est pas validé");
    }
    if (purchase.userId && purchase.userId !== userId) {
      throw new Error("Ce paiement est déjà lié à un autre compte");
    }

    if (!purchase.userId) {
      await ctx.db.patch(purchase._id, { userId });
    }
    const user = await ctx.db.get(userId);
    if (user && !user.purchaseId) {
      await ctx.db.patch(userId, { purchaseId: purchase._id });
    }

    if (user?.discordId && user?.email) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: user.discordId,
        email: user.email,
      });
    }

    return { ok: true, purchaseId: purchase._id };
  },
});

/**
 * Mutation publique : fallback si l'email Discord ≠ email Stripe.
 * Le user entre son email de paiement → on cherche un purchase "paid" non lié
 * à ce email → on le lie au user courant.
 */
export const claimPurchaseByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const normalized = email.trim().toLowerCase();
    if (!normalized) throw new Error("Email requis");

    const user = await ctx.db.get(userId);
    if (user?.purchaseId) {
      throw new Error("Ton compte est déjà lié à un paiement");
    }

    const purchase = await ctx.db
      .query("purchases")
      .filter((q) =>
        q.and(
          q.eq(q.field("email"), normalized),
          q.eq(q.field("status"), "paid")
        )
      )
      .first();

    if (!purchase) {
      throw new Error("Aucun paiement trouvé pour cet email");
    }
    if (purchase.userId && purchase.userId !== userId) {
      throw new Error("Ce paiement est déjà lié à un autre compte");
    }

    if (!purchase.userId) {
      await ctx.db.patch(purchase._id, { userId });
    }
    await ctx.db.patch(userId, { purchaseId: purchase._id });

    if (user?.discordId && user?.email) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: user.discordId,
        email: user.email,
      });
    }

    return { ok: true };
  },
});
