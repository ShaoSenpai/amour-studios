import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Admin queries & mutations
// ============================================================================

/**
 * Retourne TOUS les users (admins inclus) avec état onboarding + purchase.
 */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Non authentifié");

    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin uniquement");

    const users = await ctx.db.query("users").collect();

    const members = await Promise.all(
      users
        .filter((u) => !u.deletedAt)
        .map(async (user) => {
          const onboarding = await ctx.db
            .query("onboardingNotes")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .first();

          const purchase = user.purchaseId
            ? await ctx.db.get(user.purchaseId)
            : null;

          return {
            ...user,
            onboarding,
            purchase,
          };
        })
    );

    return members;
  },
});

/**
 * Changer le rôle d'un user (admin ↔ member).
 */
export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { userId, role }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { role });
  },
});

/**
 * Soft-delete un user (le désactive sans supprimer les données).
 */
export const removeMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const { userId: adminId } = await requireAdmin(ctx);
    if (userId === adminId) throw new Error("Tu ne peux pas te supprimer toi-même");
    await ctx.db.patch(userId, { deletedAt: Date.now() });
  },
});

/**
 * Réactiver un user soft-deleted.
 */
export const restoreMember = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { deletedAt: undefined });
  },
});

/**
 * Lier manuellement un purchase à un user (si les emails ne matchent pas).
 */
export const linkPurchase = mutation({
  args: {
    userId: v.id("users"),
    purchaseId: v.id("purchases"),
  },
  handler: async (ctx, { userId, purchaseId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { purchaseId });
    await ctx.db.patch(purchaseId, { userId });
  },
});

/**
 * Ajouter un membre manuellement par email + rôle.
 * Crée un "pré-user" dans la base. Quand cette personne se connecte
 * via Discord avec le même email, le callback createOrUpdateUser
 * détectera le user existant et le liera.
 * Crée aussi un purchase fictif pour bypasser le gate paiement.
 */
export const addMember = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { email, name, role }) => {
    await requireAdmin(ctx);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) throw new Error("Email requis");

    // Vérifier si un user avec cet email existe déjà
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), trimmedEmail))
      .first();

    if (existing) throw new Error("Un membre avec cet email existe déjà");

    const now = Date.now();

    // Créer un purchase fictif (status "paid") pour bypasser le gate
    const purchaseId = await ctx.db.insert("purchases", {
      email: trimmedEmail,
      stripeSessionId: `manual_${now}`,
      stripePaymentIntentId: `manual_${now}`,
      amount: 0,
      currency: "eur",
      status: "paid",
      createdAt: now,
      paidAt: now,
    });

    // Créer le pré-user
    const userId = await ctx.db.insert("users", {
      email: trimmedEmail,
      name: name?.trim() || undefined,
      role,
      purchaseId,
      xp: 0,
      streakDays: 0,
      lastActiveAt: now,
      createdAt: now,
      onboardingCompletedAt: now, // bypass onboarding pour les ajouts manuels
    });

    // Lier le purchase au user
    await ctx.db.patch(purchaseId, { userId });

    return userId;
  },
});
