import { v } from "convex/values";
import { internalAction, mutation, type ActionCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Emails (via Resend)
//
// DA alignée sur amourstudios.fr : paper #F4F2EE, ink #0A0A0A, orange #FF5A1F,
// Schibsted Grotesk + DM Mono, boutons éditoriaux (mono MAJ, coins droits, →).
// Rendu robuste multi-clients : layout 100% en <table> (pas de flex/grid, que
// Gmail/Outlook ignorent), boutons « bulletproof », couleurs en solide.
// ============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// ctx optionnel : si fourni, on enregistre la santé Resend (alerte Discord si
// l'API échoue en boucle — cf. health.ts).
async function sendViaResend(
  {
    to,
    subject,
    html,
    text,
  }: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  },
  ctx?: ActionCtx
) {
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
      if (ctx) {
        await ctx
          .runMutation(internal.health.recordFailure, {
            service: "resend",
            reason: `HTTP ${res.status} ${body.slice(0, 150)}`,
          })
          .catch(() => {});
      }
      return { ok: false, reason: "api_error", status: res.status };
    }

    const data = await res.json();
    console.log("[emails] sent:", data.id ?? "ok", "→", to);
    if (ctx) {
      await ctx
        .runMutation(internal.health.recordSuccess, { service: "resend" })
        .catch(() => {});
    }
    return { ok: true, id: data.id as string | undefined };
  } catch (err) {
    console.warn("[emails] Resend unreachable:", err);
    if (ctx) {
      await ctx
        .runMutation(internal.health.recordFailure, {
          service: "resend",
          reason: err instanceof Error ? err.message : "network",
        })
        .catch(() => {});
    }
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

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Design tokens (source = amourstudios.fr) ────────────────────────────────
const PAPER = "#F4F2EE"; // fond
const INK = "#0A0A0A"; // texte principal
const INK_SOFT = "#3A3A3A"; // texte secondaire
const MUTED = "#6A6A6A"; // labels / footer
const ORANGE = "#FF5A1F"; // accent
const LINE = "#E4E2DC"; // filets
const PANEL = "#FFFFFF"; // encarts
const SANS =
  "'Schibsted Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'DM Mono',ui-monospace,Menlo,Consolas,monospace";

// ─── Kit de composants email (tous renvoient du HTML inline, table-safe) ─────

/** Label mono en capitales (motif éditorial « ◦ … » du site). */
function kicker(label: string): string {
  return `<p style="margin:0 0 16px;font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};">◦&nbsp;&nbsp;${label}</p>`;
}

/** Titre principal Schibsted, tracking serré. */
function h1(text: string, size = 34): string {
  return `<h1 class="as-h1" style="margin:0 0 18px;font-family:${SANS};font-size:${size}px;line-height:1.08;font-weight:600;letter-spacing:-0.02em;color:${INK};">${text}</h1>`;
}

/** Paragraphe courant. */
function para(
  html: string,
  {
    color = INK,
    size = 16,
    mb = 22,
    mt = 0,
  }: { color?: string; size?: number; mb?: number; mt?: number } = {}
): string {
  return `<p style="margin:${mt}px 0 ${mb}px;font-family:${SANS};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`;
}

/** Bouton « bulletproof » : table + <a>, coins droits, mono MAJ, flèche. */
function button({
  href,
  label,
  bg = ORANGE,
  fg = "#FFFFFF",
  mb = 28,
}: {
  href: string;
  label: string;
  bg?: string;
  fg?: string;
  mb?: number;
}): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${mb}px;">
    <tr><td bgcolor="${bg}" style="border-radius:2px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:15px 26px;font-family:${MONO};font-size:12px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${fg};text-decoration:none;">${label}&nbsp;&nbsp;→</a>
    </td></tr>
  </table>`;
}

/** Encart blanc à liseré orange (bord gauche). Outlook-safe (bordure sur td). */
function panel(inner: string, { mb = 28 }: { mb?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${mb}px;">
    <tr><td style="background:${PANEL};border-left:3px solid ${ORANGE};border-radius:0 8px 8px 0;padding:18px 22px;">${inner}</td></tr>
  </table>`;
}

/** Petit badge plein (motif .opt-badge du site). Texte sombre sur fond accent. */
function badge(label: string, bg = ORANGE, fg = INK): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td bgcolor="${bg}" style="padding:6px 11px;font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;color:${fg};">${label}</td></tr></table>`;
}

/** Ligne d'étape numérotée (table 2 colonnes). */
function stepRow(num: string, html: string, last = false): string {
  const pb = last ? "0" : "16px";
  return `<tr>
    <td valign="top" style="width:30px;padding:0 0 ${pb};font-family:${MONO};font-size:13px;font-weight:500;color:${ORANGE};">${num}</td>
    <td valign="top" style="padding:0 0 ${pb};font-family:${SANS};font-size:15px;line-height:1.5;color:${INK};">${html}</td>
  </tr>`;
}

/** Ligne label/valeur (récap paiement). */
function kvRow(label: string, value: string, last = false): string {
  const border = last ? "none" : `1px solid ${LINE}`;
  return `<tr>
    <td style="padding:11px 0;border-bottom:${border};font-family:${SANS};font-size:14px;color:${MUTED};">${escape(label)}</td>
    <td align="right" style="padding:11px 0;border-bottom:${border};font-family:${SANS};font-size:14px;font-weight:600;color:${INK};">${escape(value)}</td>
  </tr>`;
}

/** Lien direct (repli si le bouton ne marche pas). */
function directLink(url: string, label = "Lien direct"): string {
  return `<p style="margin:26px 0 0;font-family:${MONO};font-size:11px;color:${MUTED};">${label} : <a href="${url}" style="color:${MUTED};word-break:break-all;">${url}</a></p>`;
}

// ─── Layout partagé (100% table, fonts Google + repli système) ────────────────

function layout({ title, children }: { title: string; children: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;width:100%!important;background:${PAPER};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  a{color:${ORANGE};}
  @media only screen and (max-width:600px){
    .as-wrap{width:100%!important;}
    .as-pad{padding-left:20px!important;padding-right:20px!important;}
    .as-h1{font-size:28px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${escape(title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
    <tr><td align="center" style="padding:36px 12px;">
      <table role="presentation" class="as-wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
        <tr><td class="as-pad" style="padding:0 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="middle" style="padding-right:11px;">
                <div style="width:34px;height:34px;background:${ORANGE};border-radius:9px;text-align:center;font-family:${SANS};font-weight:800;font-size:15px;line-height:34px;color:#FFFFFF;letter-spacing:-0.04em;">AS</div>
              </td>
              <td valign="middle" style="font-family:${SANS};font-weight:600;font-size:17px;letter-spacing:-0.01em;color:${INK};">AMOUR STUDIOS</td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="as-pad" style="padding:0 8px;">
          ${children}
        </td></tr>
        <tr><td class="as-pad" style="padding:40px 8px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-top:1px solid ${LINE};padding-top:22px;font-family:${MONO};font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};line-height:1.7;">
              Coaching artistes musique<br>
              <a href="https://amourstudios.fr" style="color:${MUTED};text-decoration:underline;text-underline-offset:3px;">amourstudios.fr</a>
              &nbsp;·&nbsp;
              <a href="mailto:contact@amourstudios.fr" style="color:${MUTED};text-decoration:underline;text-underline-offset:3px;">contact@amourstudios.fr</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Email 1 — Confirmation paiement (lien /claim → /onboarding) ──────

const APP_URL = "https://amour-studios.vercel.app";

function claimEmailHtml({
  firstName,
  claimToken,
  tier,
}: {
  firstName: string;
  claimToken: string;
  tier: "coaching" | "communaute";
}) {
  const claimUrl = `${APP_URL}/claim?t=${encodeURIComponent(claimToken)}`;
  const tierLabel = tier === "coaching" ? "Coaching" : "Communauté";
  const tierPrice = tier === "coaching" ? "179€/mois" : "79€/mois";
  const tierNeedsRdv = tier === "coaching";

  const steps = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${stepRow(
      "01",
      `<strong>Active</strong> en cliquant le bouton ci-dessus + connecte-toi avec ton compte Discord.`
    )}
    ${stepRow(
      "02",
      `<strong>Présente-toi</strong> dans le channel <strong>#🎤・présente-toi</strong> du Discord.<br><span style="color:${MUTED};font-size:13.5px;">C'est obligatoire — c'est ce qui débloque la suite (et anime le serveur 🔥).</span>`
    )}
    ${stepRow(
      "03",
      `Tu reçois un <strong>DM Discord + email</strong> avec ton lien d'onboarding.<br><span style="color:${MUTED};font-size:13.5px;">Questionnaire rapide${
        tierNeedsRdv ? " + réservation de ton 1er RDV avec Walid" : ""
      } → accès complet débloqué.</span>`,
      true
    )}
  </table>`;

  const body = `
    ${kicker(`Paiement validé · ${tierLabel} ${tierPrice}`)}
    ${h1(`Bienvenue${firstName ? `, ${escape(firstName)}` : ""} 👋`, 38)}
    ${para(
      `Ton accès <strong>${tierLabel}</strong> est confirmé. Pour qu'on t'ouvre la porte du Discord, il te reste <strong>3 étapes</strong> simples.`,
      { mb: 28 }
    )}
    ${button({ href: claimUrl, label: "Activer mon accès" })}
    ${panel(`${kicker("Ta route")}${steps}`)}
    ${para(
      `💡 <strong>Avant ta présentation</strong>, tu vois déjà tous les channels mais tu ne peux pas écrire dedans — c'est volontaire, ça force chacun à faire connaissance.`,
      { color: INK_SOFT, size: 13.5, mb: 0 }
    )}
    ${directLink(claimUrl)}
  `;
  return layout({
    title: `Bienvenue chez AMOUR STUDIOS — ${tierLabel}`,
    children: body,
  });
}

export const sendClaimEmail = internalAction({
  args: {
    to: v.string(),
    firstName: v.optional(v.string()),
    claimToken: v.string(),
    tier: v.optional(
      v.union(v.literal("coaching"), v.literal("communaute"))
    ),
  },
  handler: async (ctx, { to, firstName, claimToken, tier }) => {
    if (!to) return { ok: false, reason: "no_email" };
    const resolvedTier = tier ?? "communaute";
    const tierLabel =
      resolvedTier === "coaching" ? "Coaching" : "Communauté";
    await sendViaResend({
      to,
      subject: `Bienvenue chez AMOUR STUDIOS — active ton accès ${tierLabel}`,
      html: claimEmailHtml({
        firstName: firstName ?? "",
        claimToken,
        tier: resolvedTier,
      }),
    }, ctx);
    return { ok: true };
  },
});

// ─── Email — Reçu de paiement (invoice.paid + upsell) ─────────────────

function formatEur(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return amount.toLocaleString("fr-FR", {
      style: "currency",
      currency: (currency || "eur").toUpperCase(),
    });
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} €`;
  }
}

function formatDateFr(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function receiptEmailHtml({
  firstName,
  offerLabel,
  amountCents,
  currency,
  paidAt,
  cardLast4,
  receiptPdfUrl,
}: {
  firstName: string;
  offerLabel: string;
  amountCents: number;
  currency: string;
  paidAt: number;
  cardLast4?: string;
  receiptPdfUrl?: string;
}) {
  const rows = [
    kvRow("Offre", offerLabel),
    kvRow("Montant", formatEur(amountCents, currency)),
    kvRow("Date", formatDateFr(paidAt), !cardLast4),
  ];
  if (cardLast4) rows.push(kvRow("Moyen de paiement", `Carte •••• ${cardLast4}`, true));
  const recap = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join(
    ""
  )}</table>`;

  const body = `
    ${kicker("Paiement reçu")}
    ${h1(`Merci${firstName ? `, ${escape(firstName)}` : ""} 🧾`, 32)}
    ${para(`Voici le récapitulatif de ton paiement AMOUR STUDIOS.`, { mb: 28 })}
    ${panel(recap)}
    ${
      receiptPdfUrl
        ? button({ href: receiptPdfUrl, label: "Télécharger le reçu (PDF)" })
        : ""
    }
    ${para(
      `Une question sur ce paiement ? Réponds simplement à cet email, on est là.`,
      { color: INK_SOFT, size: 14, mb: 0 }
    )}
  `;
  return layout({ title: `Reçu AMOUR STUDIOS — ${offerLabel}`, children: body });
}

export const sendPaymentReceipt = internalAction({
  args: {
    to: v.string(),
    firstName: v.optional(v.string()),
    offerLabel: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    paidAt: v.number(),
    cardLast4: v.optional(v.string()),
    receiptPdfUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.to) return { ok: false as const, reason: "no_email" as const };
    await sendViaResend(
      {
        to: args.to,
        subject: `Reçu AMOUR STUDIOS · ${args.offerLabel} · ${formatEur(args.amountCents, args.currency)}`,
        html: receiptEmailHtml({
          firstName: args.firstName ?? "",
          offerLabel: args.offerLabel,
          amountCents: args.amountCents,
          currency: args.currency,
          paidAt: args.paidAt,
          cardLast4: args.cardLast4,
          receiptPdfUrl: args.receiptPdfUrl,
        }),
      },
      ctx
    );
    return { ok: true as const };
  },
});

// ─── Email — Refund effectué (charge.refunded) ────────────────────────

export const sendRefundNotice = internalAction({
  args: { to: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { to, amount, currency }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const eur = (amount / 100).toFixed(2);
    const cur = currency.toUpperCase();
    const html = layout({
      title: "Remboursement effectué",
      children: `
        ${kicker(`Remboursement · ${eur} ${cur}`)}
        ${h1("Remboursement effectué", 32)}
        ${para(
          `On vient de te rembourser <strong>${eur} ${cur}</strong> sur la carte utilisée pour ton abonnement AMOUR STUDIOS.`,
          { mb: 14 }
        )}
        ${para(`Ton accès Discord a été retiré automatiquement.`, { size: 15, mb: 14 })}
        ${para(
          `Si c'est une erreur ou si tu veux reprendre, réponds à ce mail ou écris à <a href="mailto:contact@amourstudios.fr" style="color:${ORANGE};">contact@amourstudios.fr</a>.`,
          { size: 15, mb: 0 }
        )}
      `,
    });
    const res = await sendViaResend({
      to,
      subject: `Remboursement effectué · ${eur} ${cur}`,
      html,
    }, ctx);
    return { ok: res.ok };
  },
});

// ─── Email — Paiement échoué (invoice.payment_failed) ──────────────────

export const sendPaymentFailedNotice = internalAction({
  args: { to: v.string() },
  handler: async (ctx, { to }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const html = layout({
      title: "Ton paiement a échoué",
      children: `
        ${kicker("Paiement échoué · action recommandée")}
        ${h1("Petit souci avec ta CB", 32)}
        ${para(`Ton dernier paiement AMOUR STUDIOS vient d'échouer. Ça peut être :`, { mb: 14 })}
        <ul style="margin:0 0 18px;padding-left:20px;font-family:${SANS};font-size:15px;line-height:1.7;color:${INK};">
          <li>une carte expirée</li>
          <li>un plafond atteint</li>
          <li>une CB bloquée temporairement</li>
        </ul>
        ${para(
          `Stripe va automatiquement réessayer <strong>plusieurs fois dans les prochains jours</strong>. Mais le plus simple est de mettre ta CB à jour.`,
          { size: 15, mb: 14 }
        )}
        ${para(
          `Réponds à ce mail si tu veux qu'on t'aide. Ou écris à <a href="mailto:contact@amourstudios.fr" style="color:${ORANGE};">contact@amourstudios.fr</a>.`,
          { size: 15, mb: 14 }
        )}
        ${para(
          `Si plusieurs tentatives échouent, ton abonnement sera automatiquement annulé.`,
          { color: MUTED, size: 12.5, mb: 0 }
        )}
      `,
    });
    const res = await sendViaResend({
      to,
      subject: "Ton paiement AMOUR STUDIOS a échoué",
      html,
    }, ctx);
    return { ok: res.ok };
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
  // body en texte brut → échappé + sauts de ligne convertis en <br>.
  const safeBody = escape(body).replace(/\n/g, "<br>");
  const html = `
    ${badge("Nouveauté Amour Studios", accent || ORANGE)}
    ${h1(escape(title), 36)}
    ${para(safeBody, { color: INK_SOFT, size: 15, mb: 28 })}
    ${button({ href: `${APP_URL}/`, label: "Ouvrir mon espace" })}
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
        accent: accent ?? ORANGE,
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
  handler: async (ctx, { to, title, body, accent }) => {
    const html = broadcastEmailHtml({ title, body, accent });
    // Resend supporte l'envoi en batch via /emails/batch, mais ça demande
    // un payload array. On fait du parallèle avec un fetch par destinataire
    // pour rester simple — OK jusqu'à quelques centaines de membres.
    await Promise.allSettled(
      to.map((email) =>
        sendViaResend({ to: email, subject: title, html }, ctx)
      )
    );
  },
});

// ─── Email 3 — Campagne CRM (Brique E) ─────────────────────────────
// Email de campagne propre, sans CTA. Le corps est rendu en <br> (saut de
// ligne) après échappement HTML. Réutilise layout().

export function campaignEmailHtml(body: string): string {
  const safeBody = escape(body).replace(/\n/g, "<br>");
  return layout({
    title: "Amour Studios",
    children: para(safeBody, { color: INK_SOFT, size: 15, mb: 0 }),
  });
}

/**
 * Envoie UN email de campagne (un destinataire). Interne — appelé en boucle
 * par campaigns.sendCampaign et par campaigns.sendTest. Fail-silent si Resend
 * n'est pas configuré (sendViaResend retourne { ok:false }).
 */
export const sendCampaignEmailOne = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (ctx, { to, subject, html }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const res = await sendViaResend({ to, subject, html }, ctx);
    return { ok: res.ok };
  },
});

// ─── Email — Lien d'onboarding (envoyé après présentation Discord) ──────────

function onboardingLinkEmailHtml({
  firstName,
  link,
  tier,
}: {
  firstName: string | null;
  link: string;
  tier: "coaching" | "communaute";
}): string {
  const hello = firstName ? `Salut ${escape(firstName)}` : "Salut";
  const intro =
    tier === "coaching"
      ? "On a vu ta présentation sur le Discord 🙌 Prochaine étape : 3 étapes pour débloquer ton accès complet — questionnaire (~5 min) puis réservation de ton 1er appel avec Walid."
      : "On a vu ta présentation sur le Discord 🙌 Dernière étape pour débloquer ton accès complet : 2-3 petites questions (~2 min).";
  const cta = tier === "coaching" ? "Commencer l'onboarding" : "Compléter mon profil";
  const unlockLabel =
    tier === "coaching"
      ? "⚠ Tant que le RDV n'est pas réservé, ton accès Discord reste limité (lecture seule)."
      : "⚠ Tant que le questionnaire n'est pas complété, ton accès communauté reste verrouillé.";
  const body = `
    ${kicker("Ton lien d'onboarding · obligatoire")}
    ${h1(`${hello} 👋`, 36)}
    ${para(escape(intro), { mb: 22 })}
    ${button({ href: link, label: cta })}
    ${panel(para(unlockLabel, { size: 14, mb: 0 }))}
    ${directLink(link)}
  `;
  return layout({ title: "Ton onboarding · AMOUR STUDIOS", children: body });
}

export const sendOnboardingLinkEmail = internalAction({
  args: {
    to: v.string(),
    firstName: v.union(v.string(), v.null()),
    link: v.string(),
    tier: v.union(v.literal("coaching"), v.literal("communaute")),
  },
  handler: async (ctx, { to, firstName, link, tier }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const subject =
      tier === "coaching"
        ? "Ton onboarding coaching · Amour Studios"
        : "Complète ton profil · Amour Studios";
    const res = await sendViaResend({
      to,
      subject,
      html: onboardingLinkEmailHtml({ firstName, link, tier }),
    }, ctx);
    return { ok: res.ok };
  },
});

// ─── Emails — Relances onboarding (Phase C, cron quotidien) ─────────────────
// 3 niveaux d'urgence × 3 scénarios (étape bloquée). Tutoiement, voix
// "Papi Amour", direct, pas d'em dash, pas de vocabulaire AI.

const SCENARIO = v.union(
  v.literal("presentation"),   // step = awaiting_presentation
  v.literal("questionnaire"),  // step = link_sent
  v.literal("rdv")             // step = form_done (coaching seulement)
);
const RELANCE_TIER = v.union(v.literal("coaching"), v.literal("communaute"));
type Scenario = "presentation" | "questionnaire" | "rdv";
type RelanceTier = "coaching" | "communaute";

const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ??
  process.env.DISCORD_INVITE_URL ??
  "";

function helloLine(firstName: string | null): string {
  return firstName ? `Salut ${escape(firstName)}` : "Salut";
}

function copyForScenario(
  scenario: Scenario,
  tier: RelanceTier,
  link: string
): {
  ctaLabel: string;
  ctaHref: string;
  hookLine: string;
  bodyLine: string;
  warningLine: string;
  optionalDiscord: string;
} {
  // CTA + corps adaptés au step bloqué. Le ton monte selon le level (gérée
  // côté wrappers 24h/48h/7d).
  if (scenario === "presentation") {
    return {
      ctaLabel: DISCORD_INVITE_URL ? "Rejoindre Discord et me présenter" : "Aller sur Discord",
      ctaHref: DISCORD_INVITE_URL || link,
      hookLine: "Ta présentation Discord n'est toujours pas faite.",
      bodyLine:
        tier === "coaching"
          ? "C'est la 1ère étape obligatoire pour ouvrir ton onboarding coaching. Un message dans <strong>#🎤・présente-toi</strong> et on t'envoie ton lien dans la foulée."
          : "C'est la 1ère étape obligatoire pour ouvrir ton accès communauté. Un message dans <strong>#🎤・présente-toi</strong> et on t'envoie ton lien dans la foulée.",
      warningLine: "Tant que tu n'as pas posté ta présentation, tu vois les channels mais tu ne peux pas écrire.",
      optionalDiscord: DISCORD_INVITE_URL
        ? directLink(DISCORD_INVITE_URL, "Lien Discord")
        : "",
    };
  }
  if (scenario === "questionnaire") {
    return {
      ctaLabel: "Terminer mon questionnaire",
      ctaHref: link,
      hookLine: "Ton questionnaire d'onboarding n'est pas fini.",
      bodyLine:
        tier === "coaching"
          ? "Il reste 5 min pour le compléter. C'est ce qui permet à Walid de préparer ton 1er appel et de te débloquer la suite."
          : "Il reste 2 min pour le finir. C'est la dernière étape avant de débloquer ton accès complet communauté.",
      warningLine:
        tier === "coaching"
          ? "Tant que le questionnaire n'est pas rempli, tu ne peux pas réserver ton 1er RDV ni écrire sur le Discord."
          : "Tant que le questionnaire n'est pas rempli, ton accès communauté reste limité.",
      optionalDiscord: "",
    };
  }
  // rdv (coaching only)
  return {
    ctaLabel: "Réserver mon 1er RDV",
    ctaHref: link,
    hookLine: "Tu n'as pas encore réservé ton 1er appel avec Walid.",
    bodyLine:
      "Ton questionnaire est OK, il manque juste le RDV. Choisis un créneau et ton accès Discord s'ouvre complètement derrière.",
    warningLine:
      "Tant que le 1er RDV n'est pas réservé, ton accès Discord (écriture, lives, feedback) reste limité.",
    optionalDiscord: "",
  };
}

function relanceTone(
  level: 24 | 48 | 7,
  firstName: string | null
): { tag: string; heading: string; sign: string } {
  if (level === 24) {
    return {
      tag: "Petit rappel · 24h",
      heading: `${helloLine(firstName)} 👋`,
      sign: "À tout de suite,<br>L'équipe AMOUR STUDIOS",
    };
  }
  if (level === 48) {
    return {
      tag: "Relance · 48h",
      heading: `${helloLine(firstName)},`,
      sign: "On t'attend,<br>L'équipe AMOUR STUDIOS",
    };
  }
  return {
    tag: "Dernier rappel · 7 jours",
    heading: `${helloLine(firstName)},`,
    sign: "Walid · AMOUR STUDIOS",
  };
}

function relanceEmailHtml({
  level,
  firstName,
  link,
  tier,
  scenario,
}: {
  level: 24 | 48 | 7;
  firstName: string | null;
  link: string;
  tier: RelanceTier;
  scenario: Scenario;
}): string {
  const tone = relanceTone(level, firstName);
  const copy = copyForScenario(scenario, tier, link);

  // Intensité du message selon le level : 24h doux, 48h ferme, 7j strict.
  const closingByLevel =
    level === 24
      ? "Rien de grave, on te relance juste avant que ça file."
      : level === 48
      ? "Ça fait 2 jours qu'on n'a pas de nouvelles. Si tu as une question, réponds simplement à cet email."
      : "Ça fait 7 jours. Si tu n'avances pas, on devra fermer ton onboarding et libérer ta place. Préviens-nous si tu as un blocage.";

  const body = `
    ${kicker(tone.tag)}
    ${h1(tone.heading, 32)}
    ${para(`<strong>${copy.hookLine}</strong>`, { mb: 18 })}
    ${para(copy.bodyLine, { size: 15, mb: 24 })}
    ${button({ href: copy.ctaHref, label: copy.ctaLabel })}
    ${panel(para(copy.warningLine, { size: 14, mb: 0 }))}
    ${para(closingByLevel, { color: INK_SOFT, size: 14, mb: 0 })}
    ${copy.optionalDiscord}
    ${directLink(link)}
    ${para(tone.sign, { color: MUTED, size: 13.5, mb: 0, mt: 22 })}
  `;
  return layout({ title: "Onboarding · AMOUR STUDIOS", children: body });
}

function relanceSubject(level: 24 | 48 | 7, scenario: Scenario): string {
  if (scenario === "presentation") {
    if (level === 24) return "Tu as oublié ? Présente-toi sur Discord pour débloquer ton accès";
    if (level === 48) return "Relance · ta présentation Discord est toujours en attente";
    return "Dernier rappel · ton accès reste fermé tant que tu ne t'es pas présenté";
  }
  if (scenario === "questionnaire") {
    if (level === 24) return "2 min pour finir ton onboarding · AMOUR STUDIOS";
    if (level === 48) return "Plus que 2 min pour débloquer ton accès Discord";
    return "Dernier rappel · ton questionnaire d'onboarding bloque ton accès";
  }
  // rdv
  if (level === 24) return "Réserve ton 1er RDV pour débloquer ton accès Discord";
  if (level === 48) return "Ton 1er RDV n'est toujours pas réservé · accès Discord limité";
  return "Dernier rappel · ton accès reste limité tant que tu n'as pas réservé";
}

export const sendRelanceOnboarding24h = internalAction({
  args: {
    to: v.string(),
    firstName: v.union(v.string(), v.null()),
    link: v.string(),
    tier: RELANCE_TIER,
    scenario: SCENARIO,
  },
  handler: async (ctx, { to, firstName, link, tier, scenario }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const res = await sendViaResend({
      to,
      subject: relanceSubject(24, scenario),
      html: relanceEmailHtml({ level: 24, firstName, link, tier, scenario }),
    }, ctx);
    return { ok: res.ok };
  },
});

export const sendRelanceOnboarding48h = internalAction({
  args: {
    to: v.string(),
    firstName: v.union(v.string(), v.null()),
    link: v.string(),
    tier: RELANCE_TIER,
    scenario: SCENARIO,
  },
  handler: async (ctx, { to, firstName, link, tier, scenario }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const res = await sendViaResend({
      to,
      subject: relanceSubject(48, scenario),
      html: relanceEmailHtml({ level: 48, firstName, link, tier, scenario }),
    }, ctx);
    return { ok: res.ok };
  },
});

export const sendRelanceOnboarding7d = internalAction({
  args: {
    to: v.string(),
    firstName: v.union(v.string(), v.null()),
    link: v.string(),
    tier: RELANCE_TIER,
    scenario: SCENARIO,
  },
  handler: async (ctx, { to, firstName, link, tier, scenario }) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const res = await sendViaResend({
      to,
      subject: relanceSubject(7, scenario),
      html: relanceEmailHtml({ level: 7, firstName, link, tier, scenario }),
    }, ctx);
    return { ok: res.ok };
  },
});

// ─── Email — Alerte Walid (élève bloqué 7j) ─────────────────────────────────

function walidAlertHtml({
  studentName,
  tier,
  scenario,
  studentEmail,
  daysBlocked,
}: {
  studentName: string;
  tier: RelanceTier;
  scenario: Scenario;
  studentEmail: string | null;
  daysBlocked: number;
}): string {
  const scenarioLabel =
    scenario === "presentation"
      ? "Bloqué à : présentation Discord (étape 1)"
      : scenario === "questionnaire"
      ? "Bloqué à : questionnaire onboarding (étape 2)"
      : "Bloqué à : réservation 1er RDV (étape 3)";
  const tierLabel = tier === "coaching" ? "Coaching 179€" : "Communauté 79€";
  const detail = `
    ${para(`<strong>Tier :</strong> ${tierLabel}`, { size: 14, mb: 6 })}
    ${para(escape(scenarioLabel), { size: 14, mb: studentEmail ? 6 : 0 })}
    ${studentEmail ? para(`<strong>Email :</strong> ${escape(studentEmail)}`, { size: 14, mb: 0 }) : ""}
  `;
  const body = `
    ${kicker("Élève bloqué · intervention manuelle")}
    ${h1(`${escape(studentName)} stagne depuis ${daysBlocked}j`, 30)}
    ${para(
      `Les 3 relances auto sont envoyées. Si tu veux le récupérer, prends 5 min pour lui passer un WhatsApp ou un DM Discord direct.`,
      { size: 15, mb: 20 }
    )}
    ${panel(detail)}
    ${para(`Tu peux aussi le retrouver dans /studio &gt; Onboardings en attente.`, {
      color: MUTED,
      size: 13.5,
      mb: 0,
    })}
  `;
  return layout({ title: "Élève bloqué — AMOUR STUDIOS", children: body });
}

export const sendWalidStuckStudentAlert = internalAction({
  args: {
    to: v.string(),
    studentName: v.string(),
    tier: RELANCE_TIER,
    scenario: SCENARIO,
    studentEmail: v.union(v.string(), v.null()),
    daysBlocked: v.number(),
  },
  handler: async (
    ctx,
    { to, studentName, tier, scenario, studentEmail, daysBlocked }
  ) => {
    if (!to) return { ok: false as const, reason: "no_email" as const };
    const subject = `[Onboarding bloqué ${daysBlocked}j] ${studentName}`;
    const res = await sendViaResend({
      to,
      subject,
      html: walidAlertHtml({ studentName, tier, scenario, studentEmail, daysBlocked }),
    }, ctx);
    return { ok: res.ok };
  },
});
