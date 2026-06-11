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

// Sync Fireflies : UNIQUEMENT pendant la fenêtre des RDV (économise le quota
// quotidien Fireflies — avant, 48 runs/jour saturaient la limite).
// RDV 16h-20h Paris, durée 1h → le dernier (20h) finit à 21h et son transcript
// sort ~21h30-22h. On pousse la fenêtre jusqu'à 22h+ Paris pour être sûr.
// ⚠️ Convex crons = UTC. Paris = UTC+2 (été) / UTC+1 (hiver). La plage UTC
// 14h-21h30 couvre 16h-23h30 Paris en été et 15h-22h30 en hiver → la fenêtre
// RDV + 1h + buffer transcript est garantie jusqu'à ≥22h30 Paris toute l'année.
// `*/30 14-21 * * *` = toutes les 30 min, heures 14-21 UTC (16 runs/jour).
crons.cron("fireflies-sync", "*/30 14-21 * * *", internal.fireflies.sync, {});

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
