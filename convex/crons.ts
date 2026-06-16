import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// ============================================================================
// Tâches planifiées (Brique D).
//  - auto-complétion des RDV passés (→ "completed", modifiable à la main).
//  - sync Fireflies (résumés de call) par polling.
// ============================================================================

const crons = cronJobs();

crons.interval(
  "auto-complete-sessions",
  { minutes: 30 },
  internal.coaching.autoCompleteSessions,
  {}
);

// Sync Fireflies (résumés de call) par polling. Fenêtre ÉLARGIE le 2026-06-16
// pour couvrir aussi les RDV du MATIN (avant : 14-21 UTC = après-midi/soir only).
// ⚠️ Convex crons = UTC. Paris = UTC+2 (été) / UTC+1 (hiver). Plage UTC 6h-21h
// = 8h-23h Paris (été) / 7h-22h (hiver) → couvre toute la journée de RDV + buffer
// transcript. `*/30 6-21 * * *` = toutes les 30 min, heures 6-21 UTC (32 runs/j).
// Quota Fireflies : 48/j saturaient avant ; 32/j reste sous la limite, et un run
// rate-limité est skippé proprement (pas une panne) → réessai au run suivant.
crons.cron("fireflies-sync", "*/30 6-21 * * *", internal.fireflies.sync, {});

// Relances onboarding (Phase C) — 7h UTC = 8h Paris hiver / 9h Paris été.
// Pour chaque onboarding non finalisé, envoie une relance 24h/48h/7j depuis
// la dernière activité (createdAt/linkSentAt/formCompletedAt selon l'étape).
crons.daily(
  "onboarding-relances",
  { hourUTC: 7, minuteUTC: 0 },
  internal.onboardings.runDailyRelances,
  {}
);

// Paiements non activés : payé mais jamais lié à un compte. Sans ça, un élève
// qui paye mais ne crée pas son compte est invisible et jamais relancé.
crons.daily(
  "remind-unactivated-purchases",
  { hourUTC: 8, minuteUTC: 0 },
  internal.lifecycle.remindUnactivatedPurchases,
  {}
);

// Renouvellement coaching 3 mois (J-7) : préavis avant la coupure sèche.
crons.daily(
  "remind-renewals",
  { hourUTC: 8, minuteUTC: 30 },
  internal.lifecycle.remindRenewals,
  {}
);

export default crons;
