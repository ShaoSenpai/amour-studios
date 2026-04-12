import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Streak tracking
// ----------------------------------------------------------------------------
// Appelé au login du dashboard. Si lastActiveAt est hier → streak +1.
// Si lastActiveAt est aujourd'hui → pas de changement.
// Sinon → streak reset à 1.
// ============================================================================

export const updateStreak = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const user = await ctx.db.get(userId);
    if (!user) return;

    const now = Date.now();
    const lastActive = user.lastActiveAt ?? 0;

    // Calculer les jours (UTC)
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const lastActiveDate = new Date(lastActive);
    lastActiveDate.setUTCHours(0, 0, 0, 0);

    let newStreak = user.streakDays ?? 0;

    if (lastActiveDate.getTime() === todayStart.getTime()) {
      // Déjà actif aujourd'hui → rien à faire
      return;
    } else if (lastActiveDate.getTime() === yesterdayStart.getTime()) {
      // Actif hier → streak +1
      newStreak += 1;
    } else {
      // Plus d'un jour sans activité → reset
      newStreak = 1;
    }

    await ctx.db.patch(userId, {
      streakDays: newStreak,
      lastActiveAt: now,
    });
  },
});
