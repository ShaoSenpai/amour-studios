import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Onboarding
// ----------------------------------------------------------------------------
// Chaque membre qui a payé doit faire un appel vidéo d'onboarding avec un
// admin. L'admin marque l'onboarding comme "complété" via /admin/members.
// Tant que onboardingCompletedAt est undefined → dashboard verrouillé.
// ============================================================================

/**
 * Retourne la note d'onboarding du user courant (ou null).
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("onboardingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Admin : marquer l'onboarding d'un membre comme complété.
 */
export const complete = mutation({
  args: {
    userId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { userId, notes }) => {
    const { userId: adminId } = await requireAdmin(ctx);

    const now = Date.now();

    // Marquer le user comme onboardé
    await ctx.db.patch(userId, { onboardingCompletedAt: now });

    // Créer ou mettre à jour la note d'onboarding
    const existing = await ctx.db
      .query("onboardingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        completedByAdminId: adminId,
        completedAt: now,
        notes: notes ?? "",
      });
    } else {
      await ctx.db.insert("onboardingNotes", {
        userId,
        completedByAdminId: adminId,
        completedAt: now,
        notes: notes ?? "",
      });
    }
  },
});

/**
 * Admin : planifier un RDV d'onboarding pour un membre.
 */
export const schedule = mutation({
  args: {
    userId: v.id("users"),
    scheduledAt: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { userId, scheduledAt, notes }) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("onboardingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        scheduledAt,
        notes: notes ?? existing.notes,
      });
    } else {
      await ctx.db.insert("onboardingNotes", {
        userId,
        scheduledAt,
        notes: notes ?? "",
      });
    }
  },
});
