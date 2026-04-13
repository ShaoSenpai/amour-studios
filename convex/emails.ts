import { v } from "convex/values";
import { internalAction, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Emails (via Resend)
// ============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function sendViaResend({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn("[emails] RESEND_API_KEY ou RESEND_FROM_EMAIL manquant — skipping");
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Amour Studios <${fromEmail}>`,
        to,
        subject,
        html,
        text: text ?? stripHtml(html),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[emails] Resend API error:", res.status, body);
      return { ok: false, reason: "api_error", status: res.status };
    }

    const data = await res.json();
    console.log("[emails] sent:", data.id ?? "ok", "→", to);
    return { ok: true, id: data.id as string | undefined };
  } catch (err) {
    console.warn("[emails] Resend unreachable:", err);
    return { ok: false, reason: "network" };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Shared email layout (DS match) ────────────────────────────────

function layout({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#0D0B08;color:#F0E9DB;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:14px;line-height:1.55;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:36px;">
      <span style="display:inline-block;width:8px;height:8px;background:#00FF85;border-radius:50%;"></span>
      <span style="font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:22px;letter-spacing:-0.5px;">Amour Studios</span>
    </div>
    ${children}
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(240,233,219,0.15);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:rgba(240,233,219,0.5);letter-spacing:1px;text-transform:uppercase;">
      ◦ Amour Studios · Formation pour artistes musique<br>
      <a href="https://www.amourstudios.fr" style="color:rgba(240,233,219,0.6);text-decoration:underline;text-underline-offset:3px;">amourstudios.fr</a>
      &nbsp;&middot;&nbsp;
      <a href="mailto:contact@amourstudios.fr" style="color:rgba(240,233,219,0.6);text-decoration:underline;text-underline-offset:3px;">contact@amourstudios.fr</a>
    </div>
  </div>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Email 1 — Confirmation paiement (lien /claim) ────────────────

const APP_URL = "https://amour-studios.vercel.app";

function claimEmailHtml({
  firstName,
  paymentIntentId,
}: {
  firstName: string;
  paymentIntentId: string;
}) {
  const claimUrl = `${APP_URL}/claim?pi=${encodeURIComponent(paymentIntentId)}`;
  const body = `
    <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(240,233,219,0.55);margin:0 0 16px;">— Paiement validé · 497 €</p>
    <h1 style="font-family:'Instrument Serif',Georgia,serif;font-size:44px;line-height:0.95;font-weight:400;letter-spacing:-1.5px;margin:0 0 24px;color:#F0E9DB;">
      Bienvenue${firstName ? `, ${escape(firstName)}` : ""}.<br>
      <em style="font-style:italic;color:#FF6B1F;">Dernière étape.</em>
    </h1>
    <p style="color:rgba(240,233,219,0.8);margin:0 0 28px;">
      Ton paiement est confirmé côté Stripe. Il te reste <strong style="color:#F0E9DB;">un clic</strong> pour activer ton accès et rejoindre la communauté Discord.
    </p>

    <a href="${claimUrl}" style="display:inline-block;background:#00FF85;color:#0D0B08;padding:16px 28px;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;text-decoration:none;margin:0 0 28px;">
      Activer mon accès →
    </a>

    <div style="margin:32px 0;padding:20px;background:rgba(240,233,219,0.04);border-left:3px solid #FF6B1F;">
      <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(240,233,219,0.5);margin:0 0 12px;">◦ Les 3 étapes</p>
      <div style="margin-bottom:10px;"><span style="color:#FF6B1F;font-family:'Instrument Serif',Georgia,serif;font-style:italic;">01.</span> &nbsp;Clique le bouton vert ci-dessus.</div>
      <div style="margin-bottom:10px;"><span style="color:#FF6B1F;font-family:'Instrument Serif',Georgia,serif;font-style:italic;">02.</span> &nbsp;Connecte-toi avec ton compte Discord (ou crée-en un, c'est gratuit — on t'accompagne).</div>
      <div><span style="color:#FF6B1F;font-family:'Instrument Serif',Georgia,serif;font-style:italic;">03.</span> &nbsp;Ton rôle VIP est attribué automatiquement, tu accèdes à la formation et à la communauté.</div>
    </div>

    <p style="color:rgba(240,233,219,0.6);font-size:12px;margin:24px 0 0;">
      <strong style="color:#F0E9DB;">Peu importe l'email utilisé</strong> pour ton compte Discord — on te lie automatiquement à ton paiement via ce lien unique.
    </p>

    <p style="color:rgba(240,233,219,0.4);font-size:11px;margin:24px 0 0;font-family:'JetBrains Mono',monospace;">
      Lien direct si le bouton ne marche pas : <br>
      <a href="${claimUrl}" style="color:rgba(240,233,219,0.6);word-break:break-all;">${claimUrl}</a>
    </p>
  `;
  return layout({ title: "Active ton accès Amour Studios", children: body });
}

export const sendClaimEmail = internalAction({
  args: {
    to: v.string(),
    firstName: v.optional(v.string()),
    paymentIntentId: v.string(),
  },
  handler: async (_ctx, { to, firstName, paymentIntentId }) => {
    if (!to) return { ok: false, reason: "no_email" };
    await sendViaResend({
      to,
      subject: "Ton accès Amour Studios — dernière étape",
      html: claimEmailHtml({
        firstName: firstName ?? "",
        paymentIntentId,
      }),
    });
    return { ok: true };
  },
});

// ─── Email 2 — Broadcast admin ─────────────────────────────────────

function broadcastEmailHtml({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: string;
}) {
  // On convertit les sauts de ligne en <br> pour que le markdown-like marche
  const safeBody = escape(body).replace(/\n/g, "<br>");
  const html = `
    <div style="display:inline-block;background:${accent};color:#0D0B08;padding:4px 10px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">
      ◦ Nouveauté Amour Studios
    </div>
    <h1 style="font-family:'Instrument Serif',Georgia,serif;font-size:40px;line-height:1;font-weight:400;letter-spacing:-1.5px;margin:0 0 24px;color:#F0E9DB;">
      ${escape(title)}
    </h1>
    <div style="color:rgba(240,233,219,0.85);margin:0 0 28px;font-size:14px;line-height:1.7;">
      ${safeBody}
    </div>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:${accent};color:#0D0B08;padding:14px 24px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;text-decoration:none;">
      Ouvrir la formation →
    </a>
  `;
  return layout({ title, children: html });
}

/**
 * Broadcast email à un segment de membres. Admin only.
 * Si le scope n'a pas de membres, retourne { sent: 0 }.
 */
export const broadcastEmail = mutation({
  args: {
    scope: v.union(v.literal("all"), v.literal("vip"), v.literal("pending")),
    title: v.string(),
    body: v.string(),
    accent: v.optional(v.string()),
  },
  handler: async (ctx, { scope, title, body, accent }) => {
    await requireAdmin(ctx);
    if (!title.trim() || !body.trim()) {
      throw new Error("Titre et corps requis");
    }

    const users = await ctx.db.query("users").collect();
    const targets = users.filter((u) => {
      if (u.deletedAt) return false;
      if (!u.email) return false;
      if (scope === "all") return true;
      if (scope === "vip") return !!u.purchaseId;
      if (scope === "pending") return !u.purchaseId;
      return false;
    });

    // On schedule un job par 50 destinataires pour éviter les limites Resend
    // (100 req/s free tier). Le batch de 50 est envoyé en parallèle dans l'action.
    for (let i = 0; i < targets.length; i += 50) {
      const batch = targets.slice(i, i + 50).map((u) => u.email!);
      await ctx.scheduler.runAfter(0, internal.emails.sendBroadcastBatch, {
        to: batch,
        title: title.trim(),
        body: body.trim(),
        accent: accent ?? "#FF6B1F",
      });
    }

    return { sent: targets.length };
  },
});

export const sendBroadcastBatch = internalAction({
  args: {
    to: v.array(v.string()),
    title: v.string(),
    body: v.string(),
    accent: v.string(),
  },
  handler: async (_ctx, { to, title, body, accent }) => {
    const html = broadcastEmailHtml({ title, body, accent });
    // Resend supporte l'envoi en batch via /emails/batch, mais ça demande
    // un payload array. On fait du parallèle avec un fetch par destinataire
    // pour rester simple — OK jusqu'à quelques centaines de membres.
    await Promise.allSettled(
      to.map((email) =>
        sendViaResend({ to: email, subject: title, html })
      )
    );
  },
});
