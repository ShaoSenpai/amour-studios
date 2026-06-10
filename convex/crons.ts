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

crons.interval("fireflies-sync", { minutes: 15 }, internal.fireflies.sync, {});

// Relances onboarding (Phase C) — 7h UTC = 8h Paris hiver / 9h Paris été.
// Pour chaque onboarding non finalisé, envoie une relance 24h/48h/7j depuis
// la dernière activité (createdAt/linkSentAt/formCompletedAt selon l'étape).
crons.daily(
  "onboarding-relances",
  { hourUTC: 7, minuteUTC: 0 },
  internal.onboardings.runDailyRelances,
  {}
);

export default crons;
