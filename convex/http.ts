import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";

// ============================================================================
// Amour Studios — Convex HTTP router
// ----------------------------------------------------------------------------
// Routes :
//   - Auth : /.well-known/*, /api/auth/*
//   - Webhook Stripe : /webhooks/stripe (POST)
// ============================================================================

const http = httpRouter();

// --- Convex Auth routes ------------------------------------------------------
auth.addHttpRoutes(http);

// --- CORS pour amourstudios.fr -----------------------------------------------
// Localhost autorisé uniquement sur deployment DEV. En PROD on ne laisse
// passer que les origines amourstudios.fr officielles.
const IS_PROD = (process.env.CONVEX_CLOUD_URL ?? "").includes("frugal-curlew-831");
const ALLOWED_ORIGINS = new Set<string>(
  IS_PROD
    ? ["https://amourstudios.fr", "https://www.amourstudios.fr"]
    : [
        "https://amourstudios.fr",
        "https://www.amourstudios.fr",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
      ]
);

// Mappe un statut d'abonnement Stripe vers notre énum interne.
function mapStripeStatus(
  s: string
): "active" | "past_due" | "canceled" | "incomplete" {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "incomplete"; // incomplete, incomplete_expired, paused…
  }
}

// Retrouve le palier à partir de l'ID de prix Stripe (fallback si pas de metadata).
function tierFromPriceId(
  priceId?: string
): "communaute" | "coaching" | undefined {
  if (!priceId) return undefined;
  if (priceId === process.env.STRIPE_PRICE_COACHING) return "coaching";
  if (priceId === process.env.STRIPE_PRICE_COMMUNITY) return "communaute";
  return undefined;
}

function corsHeaders(origin: string | null) {
  const allowOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.amourstudios.fr";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// --- Stripe : create payment intent (appelé depuis amourstudios.fr/paiement) -
http.route({
  path: "/api/create-payment-intent",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, request) => {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request.headers.get("origin")),
    });
  }),
});

http.route({
  path: "/api/create-payment-intent",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const headers = corsHeaders(request.headers.get("origin"));

    // Rate limit : max 15 requêtes/min par IP. Bloque le spam de PaymentIntents.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("cf-connecting-ip") ||
      "unknown";
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, {
      key: `create-payment-intent:${ip}`,
      max: 15,
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Trop de requêtes. Attends une minute et réessaie.",
        }),
        {
          status: 429,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    let body: { offre?: string; duree?: string; email?: string; phone?: string };
    try {
      body = (await request.json()) as {
        offre?: string;
        duree?: string;
        email?: string;
        phone?: string;
      };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const offre: "communaute" | "coaching" =
      body.offre === "coaching" ? "coaching" : "communaute";
    const duree: "1mois" | "3mois" | undefined =
      body.duree === "3mois" ? "3mois" : body.duree === "1mois" ? "1mois" : undefined;
    const email = typeof body.email === "string" ? body.email : "";
    const phone = typeof body.phone === "string" ? body.phone : undefined;

    try {
      const result = await ctx.runAction(api.stripe.createSubscription, {
        offre,
        duree,
        email,
        phone,
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown";
      console.error("[create-payment-intent] error:", detail);
      // En prod on ne leak PAS les détails internes (stack Stripe, chemins Convex).
      return new Response(
        JSON.stringify({
          error: "Erreur lors de la création du paiement. Réessaie dans quelques secondes.",
          ...(IS_PROD ? {} : { detail }),
        }),
        {
          status: 500,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }
  }),
});

// --- Stripe webhook ----------------------------------------------------------
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    // Vérification de la signature Stripe
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
    });

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response("Invalid signature", { status: 400 });
    }

    // Traiter les events d'abonnement (Communauté 79€ / Coaching 179€)
    switch (event.type) {
      // ── Création / modification d'abonnement (upgrade, downgrade, statut) ──
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as {
          id: string;
          status: string;
          customer?: string | { id?: string };
          metadata?: Record<string, string>;
          items?: {
            data?: Array<{
              price?: { id?: string };
              current_period_end?: number;
            }>;
          };
          current_period_end?: number;
          cancel_at_period_end?: boolean;
        };

        const meta = sub.metadata ?? {};
        const email = (meta.email || "").trim().toLowerCase();
        const priceId = sub.items?.data?.[0]?.price?.id;
        const tier =
          (meta.tier as "communaute" | "coaching" | undefined) ||
          tierFromPriceId(priceId);
        const duree =
          meta.duree === "1mois" || meta.duree === "3mois"
            ? (meta.duree as "1mois" | "3mois")
            : undefined;
        const status = mapStripeStatus(sub.status);
        const periodEndSec =
          sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        await ctx.runMutation(internal.stripe.recordSubscription, {
          email: email || "",
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          tier,
          duree,
          status,
          currentPeriodEnd:
            typeof periodEndSec === "number" ? periodEndSec * 1000 : undefined,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });

        // Synchroniser les rôles Discord (si l'utilisateur a déjà lié son Discord).
        if (email) {
          const user = await ctx.runQuery(internal.stripe.findUserByEmail, { email });
          if (user?.discordId) {
            if (status === "active" && tier) {
              await ctx.runAction(internal.stripe.assignDiscordRole, {
                discordId: user.discordId,
                email,
                tier,
              });
            } else if (status === "canceled") {
              await ctx.runAction(internal.stripe.removeDiscordRoles, {
                discordId: user.discordId,
                email,
              });
            }
          }
          // Onboarding : si l'user existe déjà et n'a pas encore d'onboarding,
          // on le crée maintenant (ensureForUser est idempotent).
          if (user?._id && status === "active" && tier) {
            await ctx.runMutation(internal.onboardings.ensureForUser, {
              userId: user._id,
            });
          }
        }

        console.log(`✅ Subscription ${event.type} (${sub.id}) → ${status} [${tier ?? "?"}]`);
        break;
      }

      // ── Résiliation / fin d'engagement 3 mois ──
      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as {
          id: string;
          metadata?: Record<string, string>;
        };
        const meta = sub.metadata ?? {};
        const email = (meta.email || "").trim().toLowerCase();

        await ctx.runMutation(internal.stripe.recordSubscription, {
          email: email || "",
          stripeSubscriptionId: sub.id,
          status: "canceled",
        });

        if (email) {
          const user = await ctx.runQuery(internal.stripe.findUserByEmail, { email });
          if (user?.discordId) {
            await ctx.runAction(internal.stripe.removeDiscordRoles, {
              discordId: user.discordId,
              email,
            });
          }
        }

        // Hook relance (Phase 3) : fin d'un engagement coaching 3 mois → proposer
        // de renouveler (email Resend + ping Discord). Logique à brancher Phase 3.
        if (meta.tier === "coaching" && meta.duree === "3mois") {
          console.log(`[relance] coaching 3 mois terminé pour ${email} → renouvellement à proposer`);
        }

        if (email) {
          await ctx.runMutation(internal.events.recordEventByEmail, {
            email,
            type: "subscription.canceled",
            title: "Abonnement résilié",
            actor: "stripe",
          });
        }

        console.log(`✅ Subscription deleted (${sub.id}) for ${email}`);
        break;
      }

      // ── Facture payée (1ère facture + renouvellements mensuels) ──
      case "invoice.paid": {
        const invoice = event.data.object as unknown as {
          id: string;
          customer_email?: string | null;
          customer?: string;
          subscription?: string | null;
          parent?: { subscription_details?: { subscription?: string | null } } | null;
          amount_paid?: number;
          currency?: string;
          lines?: { data?: Array<{ period?: { end?: number } }> };
        };
        const subId =
          invoice.subscription ||
          invoice.parent?.subscription_details?.subscription ||
          null;
        const email = (invoice.customer_email || "").trim().toLowerCase();
        if (!subId) {
          // Facture hors abonnement → ignorer.
          break;
        }

        const periodEndSec = invoice.lines?.data?.[0]?.period?.end;
        await ctx.runMutation(internal.stripe.recordSubscription, {
          email: email || "",
          stripeSubscriptionId: subId,
          stripeCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : undefined,
          status: "active",
          amount: invoice.amount_paid,
          currency: invoice.currency,
          currentPeriodEnd:
            typeof periodEndSec === "number" ? periodEndSec * 1000 : undefined,
        });

        // Email de confirmation + claim token (uniquement la 1ère facture).
        const purchase = await ctx.runQuery(
          internal.stripe.findPurchaseBySubscription,
          { stripeSubscriptionId: subId }
        );
        const targetEmail = email || purchase?.email || "";
        if (purchase?.stripePaymentIntentId) {
          const claimToken = await ctx.runQuery(internal.claimTokens.byPaymentIntent, {
            paymentIntentId: purchase.stripePaymentIntentId,
          });
          if (claimToken && targetEmail) {
            await ctx.runAction(internal.emails.sendClaimEmail, {
              to: targetEmail,
              firstName: "",
              claimToken,
              tier: purchase?.tier,
            });
          }
        }

        // (Re)synchroniser le rôle Discord selon le palier.
        if (targetEmail) {
          const user = await ctx.runQuery(internal.stripe.findUserByEmail, {
            email: targetEmail,
          });
          if (user?.discordId && purchase?.tier) {
            await ctx.runAction(internal.stripe.assignDiscordRole, {
              discordId: user.discordId,
              email: targetEmail,
              tier: purchase.tier,
            });
          }
        }

        if (targetEmail) {
          const amt =
            typeof invoice.amount_paid === "number"
              ? ` · ${(invoice.amount_paid / 100).toLocaleString("fr-FR")} €`
              : "";
          await ctx.runMutation(internal.events.recordEventByEmail, {
            email: targetEmail,
            type: "payment.paid",
            title: `Paiement reçu${amt}`,
            actor: "stripe",
            meta: JSON.stringify({ subId, amount: invoice.amount_paid ?? null }),
          });
        }

        console.log(`✅ Invoice paid (${invoice.id}) for sub ${subId}`);
        break;
      }

      // ── Impayé → past_due (relance gérée en Phase 3) ──
      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as {
          subscription?: string | null;
          parent?: { subscription_details?: { subscription?: string | null } } | null;
          customer_email?: string | null;
        };
        const subId =
          invoice.subscription ||
          invoice.parent?.subscription_details?.subscription ||
          null;
        if (subId) {
          await ctx.runMutation(internal.stripe.recordSubscription, {
            email: (invoice.customer_email || "").trim().toLowerCase() || "",
            stripeSubscriptionId: subId,
            status: "past_due",
          });
          const femail = (invoice.customer_email || "").trim().toLowerCase();
          if (femail) {
            await ctx.runMutation(internal.events.recordEventByEmail, {
              email: femail,
              type: "payment.failed",
              title: "Paiement échoué",
              actor: "stripe",
            });
          }
          console.log(`⚠️ Invoice payment failed for sub ${subId} → past_due`);
        }
        break;
      }

      default:
        // On ignore les autres events
        break;
    }

    return new Response("OK", { status: 200 });
  }),
});

// --- Calendly webhook --------------------------------------------------------
// Reçoit invitee.created / invitee.canceled et synchronise coachingSessions.
// Vérifie la signature HMAC si CALENDLY_WEBHOOK_SIGNING_KEY est défini.
async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

http.route({
  path: "/webhooks/calendly",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();

    // Vérification de signature (si une clé est configurée).
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const header = request.headers.get("Calendly-Webhook-Signature") || "";
      const parts = Object.fromEntries(
        header.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string])
      );
      const t = parts["t"];
      const v1 = parts["v1"];
      const expected = t ? await hmacHex(signingKey, `${t}.${rawBody}`) : "";
      if (!t || !v1 || v1 !== expected) {
        console.warn("Calendly webhook: signature invalide");
        return new Response("Invalid signature", { status: 401 });
      }
    } else {
      console.warn("CALENDLY_WEBHOOK_SIGNING_KEY non défini — signature non vérifiée");
    }

    let data: {
      event?: string;
      payload?: {
        email?: string;
        uri?: string;
        scheduled_event?: { uri?: string; start_time?: string; end_time?: string; name?: string };
        tracking?: { utm_source?: string };
      };
    };
    try {
      data = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const p = data.payload ?? {};
    const se = p.scheduled_event ?? {};
    const eventUri = se.uri || p.uri || "";
    const email = (p.email || "").trim().toLowerCase();
    // Fallback : la page /onboarding/[token] passe `utm_source=onboarding-<token>`
    // au widget Calendly. Si l'email diffère de celui en BDD (typo, perso/pro),
    // on récupère quand même le user via ce token.
    const utm = (p.tracking?.utm_source || "").trim();
    const fallbackToken = utm.startsWith("onboarding-")
      ? utm.slice("onboarding-".length)
      : null;

    if (data.event === "invitee.created") {
      const start = se.start_time ? Date.parse(se.start_time) : NaN;
      if (email && eventUri && !Number.isNaN(start)) {
        const res = await ctx.runMutation(internal.coaching.upsertCalendlySession, {
          email,
          calendlyEventUri: eventUri,
          calendlyInviteeUri: p.uri,
          scheduledAt: start,
          endAt: se.end_time ? Date.parse(se.end_time) : undefined,
          eventName: se.name,
          fallbackOnboardingToken: fallbackToken ?? undefined,
        });
        await ctx.runMutation(internal.events.recordEventByEmail, {
          email,
          type: "rdv.booked",
          title: "RDV réservé (Calendly)",
          actor: "calendly",
          meta: JSON.stringify({ scheduledAt: start }),
        });
        // Si c'est un RDV d'onboarding, met l'onboarding row à "rdv_booked".
        if (res.matched && res.isOnboarding) {
          await ctx.runMutation(internal.onboardings.markRdvBookedByUser, {
            userId: res.userId,
            sessionId: res.sessionId,
          });
        }
        console.log(`📅 Calendly invitee.created (${email}) → matched=${res.matched}`);
      }
    } else if (data.event === "invitee.canceled") {
      if (eventUri) {
        const res = await ctx.runMutation(internal.coaching.cancelCalendlySession, {
          calendlyEventUri: eventUri,
        });
        console.log(`📅 Calendly invitee.canceled (${eventUri}) → ${res.canceled} annulée(s)`);
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

// ── Webhook Discord présentation ────────────────────────────────────────────
// Le bot écoute le channel #presentations. À chaque post valide d'un membre,
// il POST ici avec son discordId → on marque l'onboarding "presented" et on
// envoie le lien (email + DM Discord). Auth : Bearer DISCORD_BOT_ENDPOINT_SECRET
// (le bot connaît déjà ce secret pour /sync-roles).
http.route({
  path: "/webhooks/discord/presentation",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!expected) {
      return new Response("Not configured", { status: 500 });
    }
    const auth = request.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body: { discordId?: string } = {};
    try {
      body = (await request.json()) as { discordId?: string };
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const discordId = (body.discordId ?? "").trim();
    if (!discordId) return new Response("discordId required", { status: 400 });

    const res = await ctx.runMutation(
      internal.onboardings.markPresentedByDiscordId,
      { discordId }
    );
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
