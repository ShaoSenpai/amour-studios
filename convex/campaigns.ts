import { v } from "convex/values";
import { action, internalAction, internalMutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
import { campaignEmailHtml } from "./emails";

// ============================================================================
// Amour Studios — Campagnes CRM (Brique E). Admin only.
// ----------------------------------------------------------------------------
// Canaux : Email (Resend) + WhatsApp (Twilio). On envoie un message par
// destinataire, on personnalise {prenom}/{pseudo}, on enregistre la campagne
// + 1 event résumé. Auth des actions : déléguée aux queries/mutations internes
// admin-gated (segmentMembers est déjà requireAdmin) — voir sendCampaign.
// ============================================================================

const CHANNEL = v.union(v.literal("email"), v.literal("whatsapp"));

/** Remplace {prenom}/{pseudo} dans le corps par le nom fourni (ou un fallback). */
function personalize(body: string, name: string): string {
  return body
    .replace(/\{prenom\}/g, name)
    .replace(/\{pseudo\}/g, name);
}

/** Normalise un numéro vers le format Twilio WhatsApp `whatsapp:+...`. */
function toWhatsApp(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `whatsapp:${digits.startsWith("+") ? digits : `+${digits}`}`;
}

const TWILIO_ENDPOINT = (sid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

/**
 * Envoie UN message WhatsApp via Twilio. INTERNE — appelé en boucle par
 * sendCampaign et par sendTest (via internal.campaigns.sendWhatsAppOne).
 * En `internalAction` : JAMAIS exposé sur l'API publique, donc impossible
 * d'envoyer un WhatsApp arbitraire au nom d'AMOUR STUDIOS depuis l'extérieur.
 * Fail-silent si creds absentes (log + ok:false).
 */
export const sendWhatsAppOne = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
  },
  handler: async (
    ctx,
    { to, body }
  ): Promise<{ ok: boolean; reason?: string; status?: number }> => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;

    if (!sid || !token || !from) {
      console.warn("[campaigns] TWILIO_* manquant — skipping WhatsApp");
      return { ok: false as const, reason: "not_configured" as const };
    }
    if (!to || !to.startsWith("whatsapp:")) {
      console.warn("[campaigns] destination WhatsApp invalide:", to);
      return { ok: false as const, reason: "bad_destination" as const };
    }

    try {
      const auth = btoa(`${sid}:${token}`);
      const params = new URLSearchParams({ To: to, From: from, Body: body });
      const res = await fetch(TWILIO_ENDPOINT(sid), {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[campaigns] Twilio API error:", res.status, errText.slice(0, 300));
        await ctx
          .runMutation(internal.health.recordFailure, {
            service: "twilio",
            reason: `HTTP ${res.status} ${errText.slice(0, 150)}`,
          })
          .catch(() => {});
        return { ok: false as const, reason: "api_error" as const, status: res.status };
      }
      await ctx
        .runMutation(internal.health.recordSuccess, { service: "twilio" })
        .catch(() => {});
      return { ok: true as const };
    } catch (err) {
      console.warn("[campaigns] Twilio unreachable:", err);
      await ctx
        .runMutation(internal.health.recordFailure, {
          service: "twilio",
          reason: err instanceof Error ? err.message : "network",
        })
        .catch(() => {});
      return { ok: false as const, reason: "network" as const };
    }
  },
});

/**
 * Envoi de test : un seul message vers `to`, {prenom}/{pseudo} → « toi ».
 * Admin-gated via la mutation interne recordCampaign ? Non : test n'enregistre
 * rien. On vérifie l'admin via une query admin-gated avant d'envoyer.
 */
export const sendTest = action({
  args: {
    channel: CHANNEL,
    subject: v.optional(v.string()),
    body: v.string(),
    to: v.string(),
  },
  handler: async (ctx, { channel, subject, body, to }): Promise<{ ok: boolean }> => {
    // Auth : on s'appuie sur une query admin-gated (throw si pas admin).
    await ctx.runQuery(api.segments.listSegments, {});

    const text = personalize(body, "toi");

    if (channel === "email") {
      const html = campaignEmailHtml(text);
      const res = await ctx.runAction(internal.emails.sendCampaignEmailOne, {
        to,
        subject: subject ?? "Amour Studios",
        html,
      });
      return { ok: res.ok };
    }

    const dest = toWhatsApp(to);
    if (!dest) return { ok: false };
    const res = await ctx.runAction(internal.campaigns.sendWhatsAppOne, {
      to: dest,
      body: text,
    });
    return { ok: res.ok };
  },
});

/**
 * Envoi d'une campagne à tout un segment. L'auth admin passe par
 * `api.segments.segmentMembers` (query déjà requireAdmin) : si l'appelant
 * n'est pas admin, elle throw avant tout envoi.
 */
export const sendCampaign = action({
  args: {
    segment: v.string(),
    channel: CHANNEL,
    subject: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, { segment, channel, subject, body }): Promise<{ sent: number }> => {
    // Admin-gate + chargement des destinataires.
    const members = await ctx.runQuery(api.segments.segmentMembers, {
      key: segment,
    });

    let sent = 0;

    if (channel === "email") {
      for (const m of members) {
        if (!m.email) continue;
        const text = personalize(body, m.name ?? m.discordUsername ?? "toi");
        const html = campaignEmailHtml(text);
        const res = await ctx.runAction(internal.emails.sendCampaignEmailOne, {
          to: m.email,
          subject: subject ?? "Amour Studios",
          html,
        });
        if (res.ok) sent++;
      }
    } else {
      for (const m of members) {
        if (!m.phone) continue;
        const dest = toWhatsApp(m.phone);
        if (!dest) continue;
        const text = personalize(body, m.name ?? m.discordUsername ?? "toi");
        const res = await ctx.runAction(internal.campaigns.sendWhatsAppOne, {
          to: dest,
          body: text,
        });
        if (res.ok) sent++;
      }
    }

    await ctx.runMutation(internal.campaigns.recordCampaign, {
      channel,
      segment,
      subject: channel === "email" ? subject : undefined,
      body,
      recipientCount: sent,
    });

    return { sent };
  },
});

/**
 * Enregistre une campagne dans `campaigns` + logue 1 event global résumé
 * (`campaign.sent`, sans userId). Interne.
 */
export const recordCampaign = internalMutation({
  args: {
    channel: CHANNEL,
    segment: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    recipientCount: v.number(),
  },
  handler: async (ctx, { channel, segment, subject, body, recipientCount }) => {
    const now = Date.now();
    await ctx.db.insert("campaigns", {
      channel,
      segment,
      subject,
      body,
      recipientCount,
      createdAt: now,
    });
    await ctx.db.insert("events", {
      type: "campaign.sent",
      title: `Campagne ${channel} → ${segment} (${recipientCount})`,
      actor: "coach",
      at: now,
    });
  },
});

/** Historique des campagnes (plus récent d'abord, max 30). */
export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("campaigns")
      .withIndex("by_at")
      .order("desc")
      .take(30);
  },
});
