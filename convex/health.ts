import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Santé des intégrations externes.
// Les intégrations (Google, Fireflies, Resend…) sont fail-silent : elles
// avalent leurs erreurs pour ne pas bloquer le flux métier. Problème : si le
// token Google est révoqué, chaque RDV est créé SANS Meet en silence, pour
// toujours. Ce module compte les échecs consécutifs et alerte Walid sur Discord
// au-delà d'un seuil (avec cooldown pour ne pas spammer).
// ============================================================================

const ALERT_THRESHOLD = 3; // échecs consécutifs avant d'alerter
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1h entre deux alertes par service

/** Enregistre un échec d'intégration. Alerte Walid si seuil franchi. */
export const recordFailure = internalMutation({
  args: { service: v.string(), reason: v.string() },
  handler: async (ctx, { service, reason }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationHealth")
      .withIndex("by_service", (q) => q.eq("service", service))
      .first();

    const failures = (existing?.consecutiveFailures ?? 0) + 1;
    const shouldAlert =
      failures >= ALERT_THRESHOLD &&
      (!existing?.alertedAt || existing.alertedAt < now - ALERT_COOLDOWN);

    if (existing) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: failures,
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 300),
        ...(shouldAlert ? { alertedAt: now } : {}),
      });
    } else {
      await ctx.db.insert("integrationHealth", {
        service,
        consecutiveFailures: failures,
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 300),
        ...(shouldAlert ? { alertedAt: now } : {}),
      });
    }

    if (shouldAlert) {
      await ctx.scheduler.runAfter(0, internal.discord.postAlertToStaff, {
        content:
          `🛑 **Intégration en panne : ${service}**\n` +
          `${failures} échecs consécutifs. Dernière raison : ${reason.slice(0, 200)}\n` +
          `→ Vérifie les clés/tokens (env Convex). Le flux concerné échoue en silence.`,
      });
    }
  },
});

/** Réinitialise le compteur d'échecs d'un service au premier succès. */
export const recordSuccess = internalMutation({
  args: { service: v.string() },
  handler: async (ctx, { service }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("integrationHealth")
      .withIndex("by_service", (q) => q.eq("service", service))
      .first();
    if (!existing) {
      await ctx.db.insert("integrationHealth", {
        service,
        consecutiveFailures: 0,
        lastSuccessAt: now,
      });
      return;
    }
    // Reset seulement si on sortait d'une série d'échecs (évite des writes inutiles).
    if (existing.consecutiveFailures > 0 || existing.alertedAt) {
      await ctx.db.patch(existing._id, {
        consecutiveFailures: 0,
        lastSuccessAt: now,
        alertedAt: undefined,
      });
    }
  },
});
