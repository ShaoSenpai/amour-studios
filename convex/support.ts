import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
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

/** Marque le fil d'un salon TICKET comme `muted` (IA coupée) à l'ouverture.
 *  Un ticket = prise en charge humaine : l'IA ne doit pas y répondre ni ré-escalader
 *  (sinon elle recrée un salon ticket à chaque message → doublons). Crée le fil en
 *  `muted` s'il n'existe pas, sinon coupe l'IA s'il était `ai_active`. */
export const ensureTicketThreadMuted = internalMutation({
  args: {
    channelId: v.string(),
    discordId: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, { channelId, discordId, username }) => {
    const existing = await ctx.db
      .query("supportThreads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
    if (existing) {
      if (existing.status === "ai_active") {
        await ctx.db.patch(existing._id, { status: "muted", updatedAt: Date.now() });
      }
      return;
    }
    const now = Date.now();
    await ctx.db.insert("supportThreads", {
      channelId,
      discordId,
      username,
      source: "ticket",
      status: "muted",
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Réactive un fil RÉSOLU quand le membre ré-écrit : repasse ai_active + remet
 *  le compteur de tours à zéro (nouvelle conversation). */
export const reactivateThread = internalMutation({
  args: { threadId: v.id("supportThreads") },
  handler: async (ctx, { threadId }) => {
    await ctx.db.patch(threadId, { status: "ai_active", turnCount: 0, updatedAt: Date.now() });
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

// ============================================================================
// Safe tools — lecture d'état membre + actions self-service pour l'agent IA.
// Toutes scopées au discordId du membre vérifié ; zéro PII au-delà du minimal.
// ============================================================================

/**
 * Lit l'état synthétique d'un membre pour l'agent IA (read-only).
 * - linked : un compte Discord est bien relié à un paiement
 * - tier   : "communaute" | "coaching" | null (depuis purchases)
 * - onboarded : true si l'onboarding est au moins commencé (purchaseId présent)
 */
export const lookupMemberState = internalQuery({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) {
      return { linked: false, tier: null as string | null, onboarded: false };
    }
    // Tier vit sur purchases, pas sur users.
    let tier: string | null = null;
    if (user.purchaseId) {
      const purchase = await ctx.db.get(user.purchaseId);
      tier = purchase?.tier ?? null;
    }
    // onboarded = le compte a un purchaseId lié (paiement confirmé).
    // Pour plus de précision on pourrait interroger onboardings, mais on garde
    // le minimum de PII.
    const onboarded = Boolean(user.purchaseId);
    return { linked: true, tier, onboarded };
  },
});

/**
 * Interne : résout l'email du paiement d'un membre depuis son discordId.
 * users.purchaseId → purchases.email (toujours présent, v.string()).
 * Retourne null si le compte n'est pas lié.
 */
export const _memberEmail = internalQuery({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user?.purchaseId) return null;
    const purchase = await ctx.db.get(user.purchaseId);
    return purchase?.email ?? null;
  },
});

const DISCORD_INVITE = "discord.gg/x9humyUMnJ";
const CALENDLY_NOTE =
  "Réserve ton 1er RDV via le lien Calendly reçu à ton onboarding coaching.";
const ACCOUNT_URL = "/compte";

/**
 * Dispatche les "safe tools" que l'agent IA peut appeler pour un membre.
 * Chaque outil est scopé au discordId vérifié transmis par le bot.
 *
 * Tools :
 *   lookupMemberState   — état synthétique (linked/tier/onboarded)
 *   resendDiscordInvite — renvoie le lien d'invitation Discord
 *   getCalendlyLink     — note sur l'accès au lien Calendly
 *   getAccountLink      — URL de la page /compte
 *   getLinkCode         — rappel : code AMR visible sur /compte
 *   resendActivationLink / getOnboardingLink — renvoie l'email d'activation
 *     (nécessite un email ; résolu depuis purchaseId → purchases.email
 *      ou fourni explicitement par le bot via le champ `email`)
 */
type SafeToolResult =
  | { linked: boolean; tier: string | null; onboarded: boolean }
  | { ok: true; invite: string }
  | { ok: true; note: string }
  | { ok: true; url: string }
  | { ok: true; hint: string; state: { linked: boolean; tier: string | null; onboarded: boolean } }
  | { ok: true; sent: boolean }
  | { ok: false; needHumanEmail: boolean }
  | { ok: false; error: string };

export const runSafeTool = internalAction({
  args: {
    tool: v.string(),
    discordId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, { tool, discordId, email }): Promise<SafeToolResult> => {
    switch (tool) {
      case "lookupMemberState":
        return await ctx.runQuery(internal.support.lookupMemberState, {
          discordId,
        });

      case "resendDiscordInvite":
        return { ok: true, invite: DISCORD_INVITE };

      case "getCalendlyLink":
        return { ok: true, note: CALENDLY_NOTE };

      case "getAccountLink":
        return { ok: true, url: ACCOUNT_URL };

      case "getLinkCode": {
        const state = await ctx.runQuery(internal.support.lookupMemberState, {
          discordId,
        });
        return { ok: true, hint: "Code AMR visible sur /compte", state };
      }

      case "resendActivationLink":
      case "getOnboardingLink": {
        // Résolution de l'email : on préfère l'email fourni explicitement,
        // sinon on remonte via purchaseId → purchases.email.
        // Si le compte n'est pas lié (no purchaseId), on demande à l'agent
        // d'escalader vers un humain pour obtenir l'email.
        const resolvedEmail =
          email ??
          (await ctx.runQuery(internal.support._memberEmail, { discordId }));
        if (!resolvedEmail) {
          return { ok: false, needHumanEmail: true };
        }
        await ctx.runAction(api.claimTokens.resendActivationByEmail, {
          email: resolvedEmail,
        });
        return { ok: true, sent: true };
      }

      default:
        return { ok: false, error: "unknown_tool" };
    }
  },
});

// ============================================================================
// Escalade et transcript
// ============================================================================

/** Marque le fil escaladé + log event. Le bot crée le salon ticket et rappelle
 * cette mutation avec l'escalatedChannelId pour la traçabilité. */
export const recordEscalation = internalMutation({
  args: {
    threadId: v.id("supportThreads"),
    discordId: v.string(),
    reason: v.string(),
    escalatedChannelId: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, discordId, reason, escalatedChannelId }) => {
    const t = await ctx.db.get(threadId);
    if (!t) return;
    await ctx.db.patch(threadId, {
      status: "escalated",
      updatedAt: Date.now(),
      ...(escalatedChannelId ? { escalatedChannelId } : {}),
    });
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    await logEvent(ctx, {
      userId: user?._id,
      type: "support.escalated",
      title: `Escalade IA → humain : ${reason.slice(0, 80)}`,
      actor: "support_ai",
      meta: { channelId: t.channelId, discordId, reason },
    });
  },
});

/** Transcript texte d'un fil (pour copier dans le salon ticket à l'escalade). */
export const threadTranscript = internalQuery({
  args: { threadId: v.id("supportThreads") },
  handler: async (ctx, { threadId }) => {
    const msgs = await ctx.db
      .query("supportMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return msgs
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "Membre" : "Assistant"} : ${m.content}`)
      .join("\n");
  },
});

/** Marque le fil comme résolu (bouton « C'est réglé »). Log un événement CRM. */
export const markResolvedByChannel = internalMutation({
  args: { channelId: v.string() },
  handler: async (ctx, { channelId }) => {
    const t = await ctx.db
      .query("supportThreads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
    if (!t) return;
    await ctx.db.patch(t._id, { status: "resolved", updatedAt: Date.now() });
    await logEvent(ctx, {
      type: "support.deflection_success",
      title: "Question réglée par l'IA (sans humain)",
      actor: "support_ai",
      meta: { channelId },
    });
  },
});

/** Réactive l'IA sur un fil mis en veille (bouton « Reprendre l'IA »). */
export const resumeAiByChannel = internalMutation({
  args: { channelId: v.string() },
  handler: async (ctx, { channelId }) => {
    const t = await ctx.db
      .query("supportThreads")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
    if (!t) return;
    if (t.status === "muted") {
      await ctx.db.patch(t._id, { status: "ai_active", updatedAt: Date.now() });
    }
  },
});

// ============================================================================
// Plafond quotidien de tokens IA (Task 5.1)
// ============================================================================

/** Jour courant en UTC "YYYY-MM-DD". */
function todayUtc(): string {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

/** Cumule la dépense de tokens du jour. Retourne le total après ajout. */
export const addTokenSpend = internalMutation({
  args: { tokens: v.number() },
  handler: async (ctx, { tokens }) => {
    const day = todayUtc();
    const row = await ctx.db
      .query("supportDailyUsage")
      .withIndex("by_day", (q) => q.eq("day", day))
      .first();
    if (!row) {
      await ctx.db.insert("supportDailyUsage", { day, tokens, updatedAt: Date.now() });
      return tokens;
    }
    const total = row.tokens + tokens;
    await ctx.db.patch(row._id, { tokens: total, updatedAt: Date.now() });
    return total;
  },
});

/** Dépense de tokens du jour courant (0 si rien). */
export const todayTokenSpend = internalQuery({
  args: {},
  handler: async (ctx) => {
    const day = todayUtc();
    const row = await ctx.db
      .query("supportDailyUsage")
      .withIndex("by_day", (q) => q.eq("day", day))
      .first();
    return row?.tokens ?? 0;
  },
});

// ============================================================================
// RGPD — purge des transcripts anciens (Task 5.2)
// ============================================================================

/** Supprime les messages de support plus anciens que olderThanDays (défaut 180). */
export const purgeOldMessages = internalMutation({
  args: { olderThanDays: v.optional(v.number()) },
  handler: async (ctx, { olderThanDays }) => {
    const cutoff = Date.now() - (olderThanDays ?? 180) * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("supportMessages")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(500);
    for (const m of old) await ctx.db.delete(m._id);
    return { deleted: old.length };
  },
});

/** RESET TOTAL des données du bot support (threads + messages + usage quotidien).
 *  Garde-fou Stripe test (comme resetTestFunnel) pour protéger d'un effacement en
 *  prod live. Lancer : npx convex run support:resetSupportData --prod */
export const resetSupportData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sk = process.env.STRIPE_SECRET_KEY ?? "";
    if (!sk.startsWith("sk_test")) {
      throw new Error(
        "resetSupportData REFUSÉ : Stripe n'est pas en mode test (protection données réelles).",
      );
    }
    const deleted = { supportThreads: 0, supportMessages: 0, supportDailyUsage: 0 };
    for (const m of await ctx.db.query("supportMessages").collect()) {
      await ctx.db.delete(m._id);
      deleted.supportMessages++;
    }
    for (const t of await ctx.db.query("supportThreads").collect()) {
      await ctx.db.delete(t._id);
      deleted.supportThreads++;
    }
    for (const d of await ctx.db.query("supportDailyUsage").collect()) {
      await ctx.db.delete(d._id);
      deleted.supportDailyUsage++;
    }
    return { ok: true as const, deleted };
  },
});

// ============================================================================
// Stats Assistant IA — dashboard /studio/tickets (Task 5.3)
// ============================================================================

/** Agrège l'activité IA de support pour la section « Assistant IA » du back-office.
 * Admin-only. Taux de déflection = fils résolus sans humain / (résolus + escaladés). */
export const aiSupportStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const threads = await ctx.db.query("supportThreads").collect();
    const resolved = threads.filter((t) => t.status === "resolved").length;
    const escalated = threads.filter((t) => t.status === "escalated").length;
    const aiActive = threads.filter((t) => t.status === "ai_active").length;
    const totalHandled = threads.length;
    // Taux de déflection = résolus sans humain / (résolus + escaladés).
    const closed = resolved + escalated;
    const deflectionRate = closed > 0 ? Math.round((resolved / closed) * 100) : 0;

    // Volume des dernières 24h (messages assistant).
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recentMsgs = await ctx.db
      .query("supportMessages")
      .withIndex("by_at", (q) => q.gt("at", since))
      .collect();
    const aiRepliesToday = recentMsgs.filter((m) => m.role === "assistant").length;

    return {
      totalHandled,
      resolved,
      escalated,
      aiActive,
      deflectionRate,
      aiRepliesToday,
    };
  },
});
