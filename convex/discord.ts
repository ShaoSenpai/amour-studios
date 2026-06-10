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
  args: { content: v.string() },
  handler: async (_ctx, { content }) => {
    const endpoint = process.env.DISCORD_BOT_ENDPOINT;
    const secret = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    const channelId = process.env.DISCORD_ALERTS_CHANNEL_ID;
    if (!endpoint || !secret || !channelId) {
      console.warn(
        "postAlertToStaff: env manquante (DISCORD_BOT_ENDPOINT / DISCORD_BOT_ENDPOINT_SECRET / DISCORD_ALERTS_CHANNEL_ID)"
      );
      return { ok: false, reason: "missing_env" as const };
    }
    try {
      const res = await fetch(
        `${endpoint.replace(/\/$/, "")}/channel-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ channelId, content }),
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
