import { GenericMutationCtx } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============================================================================
// logEvent — helper de journalisation (trace CRM). Appelé DANS les mutations
// (accès db direct). Pour les actions/webhooks, passer par
// internal.events.recordEvent (voir convex/events.ts).
//
// Feed Discord : pour les types « feed-worthy » (cf. FEED_META), on programme
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

// Deux familles de feed : « payments » (argent) et « students » (parcours élève).
// Permet de router vers 2 channels séparés OU un seul (cf. postFeedToStaff).
export type FeedCategory = "payments" | "students";

// Types d'événements à pousser dans le feed Discord (emoji + catégorie). Tout
// type absent de cette table n'est PAS posté (évite le bruit des events internes
// comme note.added, campaign.sent, stripe.portal_opened…).
export const FEED_META: Record<string, { emoji: string; category: FeedCategory }> = {
  // ── 💰 Paiements / abonnements ──
  "payment.paid": { emoji: "💰", category: "payments" },
  "payment.failed": { emoji: "⚠️", category: "payments" },
  "charge.refunded": { emoji: "💸", category: "payments" },
  "subscription.refunded": { emoji: "💸", category: "payments" },
  "subscription.canceled": { emoji: "🚪", category: "payments" },
  "subscription.tier_changed": { emoji: "🔁", category: "payments" },
  "subscription.renewal_reminder": { emoji: "📅", category: "payments" },
  "purchase.activation_reminder": { emoji: "🟠", category: "payments" },
  // ── 🎓 Parcours élève ──
  "member.new": { emoji: "👋", category: "students" },
  "onboarding.created": { emoji: "🆕", category: "students" },
  "onboarding.presented": { emoji: "🎤", category: "students" }, // présenté + validé Discord
  "onboarding.form_done": { emoji: "📋", category: "students" },
  "onboarding.rdv_booked": { emoji: "📆", category: "students" },
  "rdv.booked": { emoji: "📆", category: "students" },
  "rdv.created": { emoji: "📆", category: "students" },
  "rdv.rescheduled": { emoji: "🔃", category: "students" },
  "rdv.completed": { emoji: "✅", category: "students" },
  "exercise.completed": { emoji: "📝", category: "students" },
  "call.summary": { emoji: "🎙️", category: "students" }, // transcript Fireflies validé
  "stage.changed": { emoji: "📈", category: "students" },
};

/** Construit l'entrée de feed (ligne + catégorie) pour un event, ou null si le
 *  type n'est pas feed-worthy. Le `title` est déjà un libellé FR ; le nom de
 *  l'élève est ajouté par postFeedToStaff (résolu depuis userId). */
export function feedEntry(
  type: string,
  title: string
): { line: string; category: FeedCategory } | null {
  const m = FEED_META[type];
  if (!m) return null;
  return { line: `${m.emoji} ${title}`, category: m.category };
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
  const entry = feedEntry(args.type, args.title);
  if (entry) {
    await ctx.scheduler.runAfter(0, internal.discord.postFeedToStaff, {
      content: entry.line,
      userId: args.userId,
      category: entry.category,
    });
  }
}
