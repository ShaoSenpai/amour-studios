import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { rateLimit } from "./rateLimit";
import { logEvent } from "./lib/events";
import { nextStatus, type SupportEvent } from "./lib/supportState";

// ============================================================================
// support.ts — état des fils de support IA, transcript, rate-limit, events.
// Toutes les fonctions sont internes (appelées par le bot via HTTP action).
// ============================================================================

/** Récupère un fil existant par channelId OU en crée un nouveau. */
export const getOrCreateThread = internalMutation({
  args: {
    channelId: v.string(),
    discordId: v.string(),
    username: v.optional(v.string()),
    source: v.union(v.literal("support_prefilter"), v.literal("ticket")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("supportThreads")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .first();
    if (existing) return existing;
    const now = Date.now();
    const id = await ctx.db.insert("supportThreads", {
      channelId: args.channelId,
      discordId: args.discordId,
      username: args.username,
      source: args.source,
      status: "ai_active",
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

/** Lit un fil par channelId (undefined si inexistant). */
export const getThreadByChannel = internalQuery({
  args: { channelId: v.string() },
  handler: async (ctx, { channelId }) => {
    return await ctx.db
      .query("supportThreads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
  },
});

/** Retourne les N derniers messages du fil (défaut 12). */
export const recentMessages = internalQuery({
  args: { threadId: v.id("supportThreads"), limit: v.optional(v.number()) },
  handler: async (ctx, { threadId, limit }) => {
    const all = await ctx.db
      .query("supportMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const n = limit ?? 12;
    return all.slice(-n);
  },
});

/** Insère un message dans le transcript du fil. */
export const appendMessage = internalMutation({
  args: {
    threadId: v.id("supportThreads"),
    channelId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    decision: v.optional(
      v.union(v.literal("reply"), v.literal("escalate"), v.literal("shadow")),
    ),
    toolsUsed: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("supportMessages", { ...args, at: Date.now() });
  },
});

/** Applique une transition d'état au fil selon la machine à états supportState. */
export const applyEvent = internalMutation({
  args: {
    threadId: v.id("supportThreads"),
    event: v.union(
      v.literal("member_message"),
      v.literal("admin_message"),
      v.literal("escalate"),
      v.literal("member_resolved"),
      v.literal("admin_resume"),
    ),
    escalatedChannelId: v.optional(v.string()),
    incrementTurn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.threadId);
    if (!t) return;
    const status = nextStatus(t.status, args.event as SupportEvent);
    await ctx.db.patch(args.threadId, {
      status,
      updatedAt: Date.now(),
      ...(args.escalatedChannelId ? { escalatedChannelId: args.escalatedChannelId } : {}),
      ...(args.incrementTurn ? { turnCount: t.turnCount + 1 } : {}),
    });
    return status;
  },
});

/** Rate-limit par discordId (fenêtre 60s). Retourne true si le message est autorisé. */
export const checkMemberRateLimit = internalMutation({
  args: { discordId: v.string(), maxPerMinute: v.optional(v.number()) },
  handler: async (ctx, { discordId, maxPerMinute }) => {
    const res = await rateLimit(ctx, `support:${discordId}`, maxPerMinute ?? 5);
    return res.allowed;
  },
});

/** Log un événement CRM lié au support IA (audit trail). */
export const logSupportEvent = internalMutation({
  args: {
    type: v.string(),
    title: v.string(),
    discordId: v.optional(v.string()),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, { type, title, discordId, meta }) => {
    const user = discordId
      ? await ctx.db
          .query("users")
          .withIndex("by_discord", (q) => q.eq("discordId", discordId))
          .first()
      : null;
    await logEvent(ctx, {
      userId: user?._id,
      type,
      title,
      actor: "support_ai",
      meta: meta ? { raw: meta } : undefined,
    });
  },
});
