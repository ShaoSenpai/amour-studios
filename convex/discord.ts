import { v } from "convex/values";
import { internalAction } from "./_generated/server";

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
