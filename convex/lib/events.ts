import { GenericMutationCtx } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============================================================================
// logEvent — helper de journalisation (trace CRM). Appelé DANS les mutations
// (accès db direct). Pour les actions/webhooks, passer par
// internal.events.recordEvent (voir convex/events.ts).
//
// Feed Discord : pour les types « feed-worthy » (cf. FEED_EMOJI), on programme
// en plus un post dans le channel de suivi (silencieux, fail-silent sans
// DISCORD_FEED_CHANNEL_ID). Le même hook est répliqué dans events.ts pour les
// events loggés depuis les actions/webhooks.
// ============================================================================

export type LogEventArgs = {
  userId?: Id<"users">;
  type: string;
  title: string;
  meta?: Record<string, unknown>;
  actor?: string;
};

// Types d'événements à pousser dans le feed Discord (emoji par type). Tout type
// absent de cette table n'est PAS posté (évite le bruit des events internes).
export const FEED_EMOJI: Record<string, string> = {
  "payment.paid": "💰",
  "charge.refunded": "💸",
  "payment.failed": "⚠️",
  "subscription.canceled": "🚪",
  "subscription.tier_changed": "🔁",
  "subscription.refunded": "💸",
  "rdv.completed": "✅",
  "exercise.completed": "📝",
  "call.summary": "🎤",
  "onboarding.created": "🆕",
  "member.new": "👋",
};

/** Construit la ligne de feed pour un event, ou null si le type n'est pas
 *  feed-worthy. Le `title` est déjà un libellé FR ; le nom de l'élève est
 *  ajouté par postFeedToStaff (résolu depuis userId). */
export function feedLine(type: string, title: string): string | null {
  const emoji = FEED_EMOJI[type];
  if (!emoji) return null;
  return `${emoji} ${title}`;
}

export async function logEvent(
  ctx: GenericMutationCtx<DataModel>,
  args: LogEventArgs
): Promise<void> {
  await ctx.db.insert("events", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    meta: args.meta ? JSON.stringify(args.meta) : undefined,
    actor: args.actor,
    at: Date.now(),
  });
  // Feed Discord (silencieux) — fail-silent si channel non configuré.
  const line = feedLine(args.type, args.title);
  if (line) {
    await ctx.scheduler.runAfter(0, internal.discord.postFeedToStaff, {
      content: line,
      userId: args.userId,
    });
  }
}
