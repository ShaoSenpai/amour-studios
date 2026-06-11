import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
import { feedLine } from "./lib/events";

// ============================================================================
// Journal d'événements (trace CRM).
//  - recordEvent : internalMutation pour les actions/webhooks (Stripe, Calendly…)
//  - listForUser : timeline d'un élève (fiche)
//  - recent      : flux global récent
// ============================================================================

export const recordEvent = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    type: v.string(),
    title: v.string(),
    meta: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", { ...args, at: Date.now() });
    const line = feedLine(args.type, args.title);
    if (line) {
      await ctx.scheduler.runAfter(0, internal.discord.postFeedToStaff, {
        content: line,
        userId: args.userId,
      });
    }
  },
});

/** Variante interne acceptant un email : résout l'userId pour rattacher l'event. */
export const recordEventByEmail = internalMutation({
  args: {
    email: v.string(),
    type: v.string(),
    title: v.string(),
    meta: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, { email, ...rest }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
      .first();
    await ctx.db.insert("events", { ...rest, userId: u?._id, at: Date.now() });
    const line = feedLine(rest.type, rest.title);
    if (line) {
      await ctx.scheduler.runAfter(0, internal.discord.postFeedToStaff, {
        content: line,
        userId: u?._id,
      });
    }
  },
});

/** Timeline d'un élève (plus récent d'abord). */
export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const ev = await ctx.db
      .query("events")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return ev.sort((a, b) => b.at - a.at);
  },
});

/** Flux global récent (toutes profils confondus). */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx);
    const ev = await ctx.db
      .query("events")
      .withIndex("by_at")
      .order("desc")
      .take(limit ?? 50);
    return ev;
  },
});
