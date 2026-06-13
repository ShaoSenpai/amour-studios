import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { logEvent } from "./lib/events";

// ============================================================================
// Amour Studios — Tickets de support Discord
// ----------------------------------------------------------------------------
// Le bot Discord crée un salon privé quand un membre clique « Ouvrir un ticket »
// dans #support, et POST ici via /webhooks/discord/ticket. On garde une trace
// (open/closed) pour le suivi back-office /studio/tickets. Le coach répond DANS
// Discord ; cette table = visibilité/audit, pas un canal de réponse.
// ============================================================================

// Enregistre l'ouverture d'un ticket (appelé par le webhook bot, action open).
// Idempotent best-effort : si un ticket open existe déjà pour ce channelId, on
// ne ré-insère pas (un même salon ne doit pas créer deux lignes).
export const recordOpen = internalMutation({
  args: {
    discordId: v.string(),
    username: v.optional(v.string()),
    channelId: v.string(),
  },
  handler: async (ctx, { discordId, username, channelId }) => {
    const existing = await ctx.db
      .query("tickets")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
    if (existing) {
      return { ok: true as const, ticketId: existing._id, duplicate: true };
    }
    const ticketId = await ctx.db.insert("tickets", {
      discordId,
      username,
      channelId,
      status: "open",
      openedAt: Date.now(),
    });
    // Trace CRM. On résout l'éventuel user pour rattacher l'event à son profil.
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    await logEvent(ctx, {
      userId: user?._id,
      type: "ticket.opened",
      title: `Ticket support ouvert${username ? ` (${username})` : ""}`,
      actor: "discord",
      meta: { channelId, discordId },
    });
    return { ok: true as const, ticketId, duplicate: false };
  },
});

// Enregistre la fermeture d'un ticket (appelé par le webhook bot, action close).
export const recordClose = internalMutation({
  args: {
    channelId: v.string(),
    closedBy: v.optional(v.string()),
  },
  handler: async (ctx, { channelId, closedBy }) => {
    const ticket = await ctx.db
      .query("tickets")
      .withIndex("by_channel", (q) => q.eq("channelId", channelId))
      .first();
    if (!ticket) {
      return { ok: false as const, reason: "not_found" };
    }
    if (ticket.status === "closed") {
      return { ok: true as const, duplicate: true };
    }
    await ctx.db.patch(ticket._id, {
      status: "closed",
      closedAt: Date.now(),
      closedBy,
    });
    const user = ticket.discordId
      ? await ctx.db
          .query("users")
          .withIndex("by_discord", (q) => q.eq("discordId", ticket.discordId))
          .first()
      : null;
    await logEvent(ctx, {
      userId: user?._id,
      type: "ticket.closed",
      title: "Ticket support fermé",
      actor: "discord",
      meta: { channelId, closedBy },
    });
    return { ok: true as const, duplicate: false };
  },
});

// Liste pour le back-office : tickets ouverts + ~20 derniers fermés. Pour chaque
// ticket on tente de résoudre l'élève (by_discord) afin d'afficher nom + email.
// Admin-only.
export const listTickets = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const open = await ctx.db
      .query("tickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    open.sort((a, b) => b.openedAt - a.openedAt);

    const closedAll = await ctx.db
      .query("tickets")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .collect();
    closedAll.sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt));
    const closed = closedAll.slice(0, 20);

    // Résolution user mutualisée (un même discordId peut avoir plusieurs tickets).
    const cache = new Map<
      string,
      { userId: string; name: string | null; email: string | null } | null
    >();
    const resolve = async (discordId: string) => {
      if (cache.has(discordId)) return cache.get(discordId)!;
      const u = await ctx.db
        .query("users")
        .withIndex("by_discord", (q) => q.eq("discordId", discordId))
        .first();
      const out = u
        ? {
            userId: u._id as string,
            name: u.name || u.discordUsername || null,
            email: u.email || null,
          }
        : null;
      cache.set(discordId, out);
      return out;
    };

    const enrich = async (t: (typeof open)[number]) => {
      const who = await resolve(t.discordId);
      return {
        id: t._id as string,
        discordId: t.discordId,
        username: t.username ?? null,
        channelId: t.channelId,
        status: t.status,
        openedAt: t.openedAt,
        closedAt: t.closedAt ?? null,
        closedBy: t.closedBy ?? null,
        userId: who?.userId ?? null,
        name: who?.name ?? null,
        email: who?.email ?? null,
      };
    };

    return {
      open: await Promise.all(open.map(enrich)),
      closed: await Promise.all(closed.map(enrich)),
    };
  },
});
