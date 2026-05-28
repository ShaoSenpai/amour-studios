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

export default crons;
