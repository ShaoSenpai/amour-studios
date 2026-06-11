import { v } from "convex/values";
import { internalAction, mutation, type ActionCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Emails (via Resend)
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

// ─── Shared email layout (DA actuelle — accent FF5A1F, Schibsted Grotesk) ─

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
<body style="margin:0;padding:0;background:#E8E3D7;color:#0B0B0B;font-family:'Schibsted Grotesk',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:36px;">
      <span style="display:inline-block;width:30px;height:30px;background:#FF5A1F;color:#0B0B0B;border-radius:8px;font-weight:600;font-size:17px;line-height:30px;text-align:center;letter-spacing:-0.02em;">A</span>
      <span style="font-weight:500;font-size:18px;letter-spacing:-0.01em;">AMOUR STUDIOS</span>
    </div>
    ${children}
    <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(11,11,11,0.10);font-size:12px;color:rgba(11,11,11,0.55);">
      <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;">Coaching artistes musique</span><br>
      <a href="https://amourstudios.fr" style="color:rgba(11,11,11,0.55);text-decoration:underline;text-underline-offset:3px;">amourstudios.fr</a>
      &nbsp;·&nbsp;
      <a href="mailto:contact@amourstudios.fr" style="color:rgba(11,11,11,0.55);text-decoration:underline;text-underline-offset:3px;">contact@amourstudios.fr</a>
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

  const body = `
    <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
      ◦ Paiement validé · ${tierLabel} ${tierPrice}
    </p>
    <h1 style="font-size:38px;line-height:1.05;font-weight:500;letter-spacing:-0.025em;margin:0 0 18px;color:#0B0B0B;">
      Bienvenue${firstName ? `, ${escape(firstName)}` : ""} 👋
    </h1>
    <p style="color:#0B0B0B;margin:0 0 28px;font-size:16px;">
      Ton accès <strong>${tierLabel}</strong> est confirmé. Pour qu'on
      t'ouvre la porte du Discord, il te reste <strong>3 étapes</strong> simples.
    </p>

    <!-- CTA principal -->
    <a href="${claimUrl}" style="display:inline-block;background:#FF5A1F;color:#FFFFFF;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:500;text-decoration:none;letter-spacing:-0.005em;margin:0 0 32px;">
      Activer mon accès →
    </a>

    <!-- Les 3 étapes -->
    <div style="margin:0 0 28px;padding:22px 24px;background:rgba(255,255,255,0.55);border-left:3px solid #FF5A1F;border-radius:0 12px 12px 0;">
      <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">◦ Ta route</p>

      <div style="margin-bottom:14px;display:flex;gap:10px;align-items:baseline;">
        <span style="color:#FF5A1F;font-weight:500;font-size:13px;font-family:ui-monospace,Menlo,monospace;">01</span>
        <span><strong>Active</strong> en cliquant le bouton ci-dessus + connecte-toi avec ton compte Discord.</span>
      </div>

      <div style="margin-bottom:14px;display:flex;gap:10px;align-items:baseline;">
        <span style="color:#FF5A1F;font-weight:500;font-size:13px;font-family:ui-monospace,Menlo,monospace;">02</span>
        <span>
          <strong>Présente-toi</strong> dans le channel <strong>#🎤・présente-toi</strong> du Discord.<br>
          <span style="color:rgba(11,11,11,0.65);font-size:13.5px;">
            C'est obligatoire — c'est ce qui débloque la suite (et anime le serveur 🔥).
          </span>
        </span>
      </div>

      <div style="display:flex;gap:10px;align-items:baseline;">
        <span style="color:#FF5A1F;font-weight:500;font-size:13px;font-family:ui-monospace,Menlo,monospace;">03</span>
        <span>
          Tu reçois un <strong>DM Discord + email</strong> avec ton lien d'onboarding<br>
          <span style="color:rgba(11,11,11,0.65);font-size:13.5px;">
            Questionnaire rapide${tierNeedsRdv ? " + réservation de ton 1er RDV avec Walid" : ""} → accès complet débloqué.
          </span>
        </span>
      </div>
    </div>

    <p style="color:rgba(11,11,11,0.65);font-size:13.5px;margin:0 0 14px;">
      💡 <strong>Avant ta présentation</strong>, tu vois déjà tous les channels mais tu ne peux
      pas écrire dedans — c'est volontaire, ça force chacun à faire connaissance.
    </p>

    <p style="color:rgba(11,11,11,0.55);font-size:12.5px;margin:28px 0 0;font-family:ui-monospace,Menlo,monospace;">
      Lien direct : <a href="${claimUrl}" style="color:rgba(11,11,11,0.65);word-break:break-all;">${claimUrl}</a>
    </p>
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
        <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
          ◦ Remboursement · ${eur} ${cur}
        </p>
        <h1 style="font-size:32px;line-height:1.05;font-weight:500;letter-spacing:-0.02em;margin:0 0 18px;color:#0B0B0B;">
          Remboursement effectué
        </h1>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:16px;">
          On vient de te rembourser <strong>${eur} ${cur}</strong> sur la carte utilisée pour ton abonnement AMOUR STUDIOS.
        </p>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:15px;">
          Ton accès Discord a été retiré automatiquement.
        </p>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:15px;">
          Si c'est une erreur ou si tu veux reprendre, réponds à ce mail ou écris à
          <a href="mailto:contact@amourstudios.fr" style="color:#FF5A1F;">contact@amourstudios.fr</a>.
        </p>
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
        <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
          ◦ Paiement échoué · action recommandée
        </p>
        <h1 style="font-size:32px;line-height:1.05;font-weight:500;letter-spacing:-0.02em;margin:0 0 18px;color:#0B0B0B;">
          Petit souci avec ta CB
        </h1>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:16px;">
          Ton dernier paiement AMOUR STUDIOS vient d'échouer. Ça peut être :
        </p>
        <ul style="color:#0B0B0B;margin:0 0 18px;padding-left:20px;font-size:15px;">
          <li>une carte expirée</li>
          <li>un plafond atteint</li>
          <li>une CB bloquée temporairement</li>
        </ul>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:15px;">
          Stripe va automatiquement réessayer <strong>plusieurs fois dans les prochains jours</strong>. Mais le plus simple est de mettre ta CB à jour.
        </p>
        <p style="color:#0B0B0B;margin:0 0 14px;font-size:15px;">
          Réponds à ce mail si tu veux qu'on t'aide. Ou écris à
          <a href="mailto:contact@amourstudios.fr" style="color:#FF5A1F;">contact@amourstudios.fr</a>.
        </p>
        <p style="color:rgba(11,11,11,0.55);font-size:12.5px;margin:24px 0 0;">
          Si plusieurs tentatives échouent, ton abonnement sera automatiquement annulé.
        </p>
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
// Email de campagne propre, sans le CTA « Ouvrir la formation ». Le corps
// est rendu en <br> (saut de ligne) après échappement HTML. Réutilise layout().

export function campaignEmailHtml(body: string): string {
  const safeBody = escape(body).replace(/\n/g, "<br>");
  const html = `
    <div style="color:rgba(240,233,219,0.85);margin:0;font-size:14px;line-height:1.7;">
      ${safeBody}
    </div>
  `;
  // Le titre du layout = (à défaut d'objet explicite) « Amour Studios ».
  return layout({ title: "Amour Studios", children: html });
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
  const cta = tier === "coaching" ? "Commencer l'onboarding →" : "Compléter mon profil →";
  const unlockLabel =
    tier === "coaching"
      ? "⚠ Tant que le RDV n'est pas réservé, ton accès Discord reste limité (lecture seule)."
      : "⚠ Tant que le questionnaire n'est pas complété, ton accès communauté reste verrouillé.";
  const body = `
    <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
      ◦ Ton lien d'onboarding · obligatoire
    </p>
    <h1 style="font-size:36px;line-height:1.05;font-weight:500;letter-spacing:-0.025em;margin:0 0 18px;color:#0B0B0B;">
      ${hello} 👋
    </h1>
    <p style="color:#0B0B0B;margin:0 0 22px;font-size:16px;">${intro}</p>

    <a href="${link}" style="display:inline-block;background:#FF5A1F;color:#FFFFFF;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:500;text-decoration:none;letter-spacing:-0.005em;margin:0 0 22px;">
      ${cta}
    </a>

    <div style="margin:0 0 20px;padding:14px 18px;background:rgba(255,90,31,0.10);border-left:3px solid #FF5A1F;border-radius:0 10px 10px 0;">
      <p style="color:#0B0B0B;font-size:14px;margin:0;line-height:1.5;">${unlockLabel}</p>
    </div>

    <p style="color:rgba(11,11,11,0.55);font-size:12.5px;margin:24px 0 0;font-family:ui-monospace,Menlo,monospace;">
      Lien direct : <a href="${link}" style="color:rgba(11,11,11,0.65);word-break:break-all;">${link}</a>
    </p>
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
      ctaLabel: DISCORD_INVITE_URL ? "Rejoindre Discord et me présenter →" : "Aller sur Discord →",
      ctaHref: DISCORD_INVITE_URL || link,
      hookLine: "Ta présentation Discord n'est toujours pas faite.",
      bodyLine:
        tier === "coaching"
          ? "C'est la 1ère étape obligatoire pour ouvrir ton onboarding coaching. Un message dans <strong>#🎤・présente-toi</strong> et on t'envoie ton lien dans la foulée."
          : "C'est la 1ère étape obligatoire pour ouvrir ton accès communauté. Un message dans <strong>#🎤・présente-toi</strong> et on t'envoie ton lien dans la foulée.",
      warningLine: "Tant que tu n'as pas posté ta présentation, tu vois les channels mais tu ne peux pas écrire.",
      optionalDiscord: DISCORD_INVITE_URL
        ? `<p style="color:rgba(11,11,11,0.55);font-size:12.5px;margin:18px 0 0;">Lien Discord : <a href="${DISCORD_INVITE_URL}" style="color:rgba(11,11,11,0.65);">${DISCORD_INVITE_URL}</a></p>`
        : "",
    };
  }
  if (scenario === "questionnaire") {
    return {
      ctaLabel: "Terminer mon questionnaire →",
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
    ctaLabel: "Réserver mon 1er RDV →",
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
      tag: "◦ Petit rappel · 24h",
      heading: `${helloLine(firstName)} 👋`,
      sign: "À tout de suite,<br>L'équipe AMOUR STUDIOS",
    };
  }
  if (level === 48) {
    return {
      tag: "◦ Relance · 48h",
      heading: `${helloLine(firstName)},`,
      sign: "On t'attend,<br>L'équipe AMOUR STUDIOS",
    };
  }
  return {
    tag: "◦ Dernier rappel · 7 jours",
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

  // Intensité visuelle : 24h doux (cream highlight), 48h ferme, 7j stricte
  // (avertissement plus appuyé).
  const closingByLevel =
    level === 24
      ? "Rien de grave, on te relance juste avant que ça file."
      : level === 48
      ? "Ça fait 2 jours qu'on n'a pas de nouvelles. Si tu as une question, réponds simplement à cet email."
      : "Ça fait 7 jours. Si tu n'avances pas, on devra fermer ton onboarding et libérer ta place. Préviens-nous si tu as un blocage.";

  const body = `
    <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
      ${tone.tag}
    </p>
    <h1 style="font-size:34px;line-height:1.05;font-weight:500;letter-spacing:-0.025em;margin:0 0 18px;color:#0B0B0B;">
      ${tone.heading}
    </h1>
    <p style="color:#0B0B0B;margin:0 0 18px;font-size:16px;">
      <strong>${copy.hookLine}</strong>
    </p>
    <p style="color:#0B0B0B;margin:0 0 24px;font-size:15px;">
      ${copy.bodyLine}
    </p>

    <a href="${copy.ctaHref}" style="display:inline-block;background:#FF5A1F;color:#FFFFFF;padding:15px 28px;border-radius:999px;font-size:14px;font-weight:500;text-decoration:none;letter-spacing:-0.005em;margin:0 0 24px;">
      ${copy.ctaLabel}
    </a>

    <div style="margin:0 0 20px;padding:14px 18px;background:rgba(255,90,31,0.10);border-left:3px solid #FF5A1F;border-radius:0 10px 10px 0;">
      <p style="color:#0B0B0B;font-size:14px;margin:0;line-height:1.5;">${copy.warningLine}</p>
    </div>

    <p style="color:rgba(11,11,11,0.7);font-size:14px;margin:0 0 12px;">
      ${closingByLevel}
    </p>

    ${copy.optionalDiscord}

    <p style="color:rgba(11,11,11,0.55);font-size:12.5px;margin:24px 0 0;font-family:ui-monospace,Menlo,monospace;">
      Lien direct : <a href="${link}" style="color:rgba(11,11,11,0.65);word-break:break-all;">${link}</a>
    </p>

    <p style="color:rgba(11,11,11,0.55);font-size:13.5px;margin:26px 0 0;">
      ${tone.sign}
    </p>
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
  const body = `
    <p style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;color:rgba(11,11,11,0.55);margin:0 0 14px;">
      ◦ Élève bloqué · intervention manuelle
    </p>
    <h1 style="font-size:30px;line-height:1.1;font-weight:500;letter-spacing:-0.02em;margin:0 0 18px;color:#0B0B0B;">
      ${escape(studentName)} stagne depuis ${daysBlocked}j
    </h1>
    <p style="color:#0B0B0B;margin:0 0 14px;font-size:15px;">
      Les 3 relances auto sont envoyées. Si tu veux le récupérer, prends 5 min pour lui passer un WhatsApp ou un DM Discord direct.
    </p>
    <div style="margin:0 0 20px;padding:14px 18px;background:rgba(255,255,255,0.55);border-left:3px solid #FF5A1F;border-radius:0 10px 10px 0;">
      <p style="color:#0B0B0B;font-size:14px;margin:0 0 6px;line-height:1.5;"><strong>Tier :</strong> ${tierLabel}</p>
      <p style="color:#0B0B0B;font-size:14px;margin:0 0 6px;line-height:1.5;">${scenarioLabel}</p>
      ${studentEmail ? `<p style="color:#0B0B0B;font-size:14px;margin:0;line-height:1.5;"><strong>Email :</strong> ${escape(studentEmail)}</p>` : ""}
    </div>
    <p style="color:rgba(11,11,11,0.6);font-size:13.5px;margin:0;">
      Tu peux aussi le retrouver dans /studio &gt; Onboardings en attente.
    </p>
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
