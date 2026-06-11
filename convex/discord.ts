import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Discord staff alerts
// ----------------------------------------------------------------------------
// Poste un message dans le channel #⚠️・alertes-inactivité du serveur Discord
// pour notifier Walid sur les events critiques (refund, past_due, cancel).
// Fail silent : si env manquante ou bot down, on ne bloque pas le flow métier.
// ============================================================================

export const postAlertToStaff = internalAction({
  args: {
    content: v.string(),
    // Par défaut on mentionne les admins (toi, Younes, Walid) en tête du
    // message pour qu'ils reçoivent une vraie notification. Passer false pour
    // une alerte discrète (sans ping).
    mentionAdmins: v.optional(v.boolean()),
  },
  handler: async (_ctx, { content, mentionAdmins }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
    if (!endpoint || !secret || !channelId) {
      console.warn(
        "postAlertToStaff: env manquante (DISCORD_BOT_ENDPOINT / DISCORD_BOT_ENDPOINT_SECRET / DISCORD_ALERTS_CHANNEL_ID)"
      );
      return { ok: false, reason: "missing_env" as const };
    }
    // Mentions admins (CSV ADMIN_DISCORD_IDS) → ping Discord en tête de message.
    const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const mentions =
      mentionAdmins !== false && adminIds.length > 0
        ? adminIds.map((id) => `<@${id}>`).join(" ") + "\n"
        : "";
    const finalContent = mentions + content;
    try {
      const res = await fetch(
        `${endpoint.replace(/\/$/, "")}/channel-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ channelId, content: finalContent }),
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(
          `⚠️ postAlertToStaff ${res.status}: ${txt.slice(0, 150)}`
        );
        return { ok: false as const };
      }
      return { ok: true as const };
    } catch (err) {
      console.warn("postAlertToStaff fetch échec:", err);
      return { ok: false as const };
    }
  },
});

/** Query interne : nom affichable d'un user (pour enrichir le feed). */
export const userNameById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    return u.name || u.discordUsername || u.email?.split("@")[0] || null;
  },
});

/**
 * Feed de suivi (channel DISCORD_FEED_CHANNEL_ID) — flux passif de TOUT ce qui
 * se passe (paiements, RDV terminés, exos, statuts…). SILENCIEUX : aucune
 * mention/ping (contrairement à postAlertToStaff). Fail-silent si le channel
 * n'est pas configuré. Le nom de l'élève est ajouté si `userId` est fourni.
 */
export const postFeedToStaff = internalAction({
  args: {
    content: v.string(),
    userId: v.optional(v.id("users")),
    category: v.optional(v.union(v.literal("payments"), v.literal("students"))),
  },
  handler: async (ctx, { content, userId, category }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    // Routage : channel dédié par catégorie s'il existe, sinon le channel feed
    // unique. → 1 seul channel (DISCORD_FEED_CHANNEL_ID) OU 2 séparés
    // (DISCORD_FEED_PAYMENTS_CHANNEL_ID / DISCORD_FEED_STUDENTS_CHANNEL_ID),
    // au choix, juste en réglant les variables d'env. Aucun changement de code.
    const channelId =
      (category === "payments" && process.env.DISCORD_FEED_PAYMENTS_CHANNEL_ID) ||
      (category === "students" && process.env.DISCORD_FEED_STUDENTS_CHANNEL_ID) ||
      process.env.DISCORD_FEED_CHANNEL_ID;
    if (!endpoint || !secret || !channelId) {
      // Feed non configuré → on ne poste rien (pas d'erreur).
      return { ok: false, reason: "missing_env" as const };
    }
    let line = content;
    if (userId) {
      const name = await ctx.runQuery(internal.discord.userNameById, { userId });
      if (name) line = `${content} — ${name}`;
    }
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/channel-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ channelId, content: line }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.warn(`⚠️ postFeedToStaff ${res.status}: ${txt.slice(0, 150)}`);
        return { ok: false as const };
      }
      return { ok: true as const };
    } catch (err) {
      console.warn("postFeedToStaff fetch échec:", err);
      return { ok: false as const };
    }
  },
});
