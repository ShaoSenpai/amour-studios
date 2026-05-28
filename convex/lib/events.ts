import { GenericMutationCtx } from "convex/server";
import { DataModel, Id } from "../_generated/dataModel";

// ============================================================================
// logEvent — helper de journalisation (trace CRM). Appelé DANS les mutations
// (accès db direct). Pour les actions/webhooks, passer par
// internal.events.recordEvent (voir convex/events.ts).
// ============================================================================

export type LogEventArgs = {
  userId?: Id<"users">;
  type: string;
  title: string;
  meta?: Record<string, unknown>;
  actor?: string;
};

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
}
