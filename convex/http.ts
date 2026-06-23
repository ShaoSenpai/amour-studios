import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import {
  coachingEndedDm,
  refundDm,
  paymentFailedDm,
} from "./lib/discordMessages";

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

    let body: {
      offre?: string;
      email?: string;
      phone?: string;
      termsAccepted?: boolean;
      legalVersion?: string;
    };
    try {
      body = (await request.json()) as {
        offre?: string;
        email?: string;
        phone?: string;
        termsAccepted?: boolean;
        legalVersion?: string;
      };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const offre: "communaute" | "coaching" =
      body.offre === "coaching" ? "coaching" : "communaute";
    // L'offre coaching est UNIQUE (engagement 3 mois) : on n'accepte plus de
    // `duree` ici. createSubscription force "3mois" pour tout coaching.
    const email = typeof body.email === "string" ? body.email : "";
    const phone = typeof body.phone === "string" ? body.phone : undefined;
    const termsAccepted =
      typeof body.termsAccepted === "boolean" ? body.termsAccepted : undefined;
    const legalVersion =
      typeof body.legalVersion === "string" ? body.legalVersion : undefined;

    try {
      const result = await ctx.runAction(api.stripe.createSubscription, {
        offre,
        email,
        phone,
        termsAccepted,
        legalVersion,
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

    // Idempotence : Stripe livre at-least-once et rejoue sur réponse non-2xx.
    // On « claim » l'event.id en tête : si déjà traité, on sort en 200 sans
    // rejouer les side-effects (DM, emails, alertes, retrait de rôles).
    const claim = await ctx.runMutation(internal.stripe.claimStripeEvent, {
      eventId: event.id,
      type: event.type,
    });
    if (claim.duplicate) {
      console.log(`Stripe event ${event.id} (${event.type}) déjà traité — skip`);
      return new Response("OK (duplicate)", { status: 200 });
    }

    // Traiter les events d'abonnement (Communauté 79€ / Coaching 179€).
    // Wrappé en try/catch : un throw n'entraîne pas de retry Stripe (l'event
    // est déjà claimé) pour éviter les doubles notifications ; on alerte Walid.
    try {
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
            const regrant = await ctx.runMutation(
              internal.onboardings.regrantOnboardedIfDone,
              { userId: user._id }
            );
            // Nouveau membre (pas un re-paiement d'onboarding déjà finalisé) :
            // DM boussole d'accueil « paiement validé → présente-toi ».
            // Seulement à la CRÉATION (jamais sur updated = renouvellement) et
            // seulement si regrant n'a PAS finalisé (sinon double-DM avec
            // grantOnboarded).
            if (
              event.type === "customer.subscription.created" &&
              !regrant.ok
            ) {
              await ctx.runAction(internal.onboardings.sendStatusDm, {
                userId: user._id,
                context: "payment_active",
              });
            }
          }
        }

        // Email Stripe ≠ email Discord : le purchase peut être LIÉ (claimByToken)
        // à un user dont l'email diffère → `findUserByEmail` ci-dessus le rate.
        // On (ré)attribue le rôle + démarre l'onboarding du BON compte lié. On ne
        // le fait que si l'email du compte lié DIFFÈRE de l'email du paiement
        // (sinon déjà géré ci-dessus). `linkAndStartOnboarding` est idempotent
        // (n'envoie le lien qu'une fois).
        if (status === "active" && tier) {
          const linked = await ctx.runQuery(
            internal.stripe.linkedUserForSubscription,
            { stripeSubscriptionId: sub.id }
          );
          if (
            linked?.discordId &&
            (linked.email ?? "").toLowerCase() !== email
          ) {
            await ctx.runAction(internal.stripe.assignDiscordRole, {
              discordId: linked.discordId,
              email: linked.email ?? "",
              tier,
            });
            await ctx.runMutation(internal.onboardings.linkAndStartOnboarding, {
              userId: linked.userId,
              tier,
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

        // Fin de coaching → win-back Communauté 79€ (palier J:0). Pour la
        // communauté (ou autre), on garde le DM boussole générique.
        const isCoachingWinback = meta.tier === "coaching";
        const COMMU_URL = "https://amourstudios.fr/paiement/?offre=communaute";
        if (email) {
          const user = await ctx.runQuery(internal.stripe.findUserByEmail, { email });
          if (user?.discordId) {
            await ctx.runAction(internal.stripe.removeDiscordRoles, {
              discordId: user.discordId,
              email,
            });
            // Nettoyage du rôle « Onboardé » (jamais retiré jusqu'ici) :
            // l'abonnement disparaît → l'accès complet débloqué par l'onboarding
            // doit l'être aussi.
            await ctx.runAction(internal.stripe.removeOnboardedRole, {
              discordId: user.discordId,
            });
            if (isCoachingWinback) {
              // DM win-back (remplace le DM générique pour le coaching : un seul
              // message, qui annonce la fin ET propose la Communauté).
              const dm = coachingEndedDm({ commuUrl: COMMU_URL });
              await ctx.runAction(internal.onboardings.discordDm, {
                discordId: user.discordId,
                embed: dm.embed,
                button: dm.button,
              });
            } else {
              // DM boussole « ton accès a pris fin » (résiliation communauté…).
              await ctx.runAction(internal.onboardings.sendStatusDm, {
                userId: user._id,
                context: "payment_canceled",
              });
            }
          }
          // Email win-back (canal email, indépendant du lien Discord).
          if (isCoachingWinback) {
            const firstName = user?.name?.split(" ")[0] ?? null;
            await ctx.runAction(internal.emails.sendRenewalWinback, {
              to: email,
              firstName,
              level: 0,
            });
          }
        }

        // Email Stripe ≠ email Discord : compte LIÉ via /claim → `findUserByEmail`
        // ci-dessus le rate (email différent) et l'ex-abonné garde Membre/Coaching/
        // Onboardé. Filet RETRAIT symétrique du filet d'attribution du handler
        // subscription.updated : on retire les rôles du BON compte lié, mais
        // SEULEMENT si son email diffère de celui du paiement (sinon déjà géré).
        const linked = await ctx.runQuery(
          internal.stripe.linkedUserForSubscription,
          { stripeSubscriptionId: sub.id }
        );
        if (
          linked?.discordId &&
          (linked.email ?? "").toLowerCase() !== email
        ) {
          await ctx.runAction(internal.stripe.removeDiscordRoles, {
            discordId: linked.discordId,
            email: linked.email ?? "",
          });
          await ctx.runAction(internal.stripe.removeOnboardedRole, {
            discordId: linked.discordId,
          });
          await ctx.runAction(internal.onboardings.sendStatusDm, {
            userId: linked.userId,
            context: "payment_canceled",
          });
        }

        if (isCoachingWinback) {
          console.log(`[winback] coaching terminé pour ${email} → email + DM Communauté 79€ envoyés (J:0)`);
        }

        if (email) {
          await ctx.runMutation(internal.events.recordEventByEmail, {
            email,
            type: "subscription.canceled",
            title: "Abonnement résilié",
            actor: "stripe",
          });
        }

        // Alerte Walid dans #⚠️・alertes-inactivité
        await ctx.runAction(internal.discord.postAlertToStaff, {
          content: `🚪 **Abonnement résilié** — ${email || "email inconnu"}\nLes rôles Discord ont été retirés automatiquement.${
            meta.tier === "coaching" && meta.duree === "3mois"
              ? "\n\n📅 Coaching 3 mois terminé → proposer un renouvellement."
              : ""
          }`,
        });

        console.log(`✅ Subscription deleted (${sub.id}) for ${email}`);
        break;
      }

      // ── Carte ajoutée via Checkout `mode:"setup"` (choix d'une autre carte) ──
      // Flux self-service /compte : le membre a installé une nouvelle carte via
      // `startCardUpdate` (Checkout setup, AUCUN débit). On la pose en moyen de
      // paiement par défaut du customer pour que le prochain upgrade / la
      // prochaine facture la débite. ⚠️ AUCUN débit n'est déclenché ici.
      case "checkout.session.completed": {
        const session = event.data.object as unknown as {
          id: string;
          mode?: string;
          customer?: string | { id?: string } | null;
          setup_intent?: string | { id?: string } | null;
          metadata?: { subscriptionId?: string } | null;
        };
        // On ne traite QUE les sessions de setup de carte. Les autres modes
        // (payment/subscription) ne nous concernent pas ici → ignorés sans rien
        // casser (les abonnements passent par customer.subscription.* / invoice.*).
        if (session.mode !== "setup") {
          console.log(`checkout.session.completed (mode=${session.mode ?? "?"}) ignoré`);
          break;
        }
        const setupIntentId =
          typeof session.setup_intent === "string"
            ? session.setup_intent
            : session.setup_intent?.id;
        if (!setupIntentId) {
          console.warn("checkout.session.completed (setup) sans setup_intent — ignoré");
          break;
        }
        const si = await stripe.setupIntents.retrieve(setupIntentId);
        const pm =
          typeof si.payment_method === "string"
            ? si.payment_method
            : si.payment_method?.id;
        const customerId =
          typeof si.customer === "string" ? si.customer : si.customer?.id;
        if (!pm || !customerId) {
          console.warn(
            `checkout.session.completed (setup): payment_method/customer manquant (pm=${pm ?? "?"}, cust=${customerId ?? "?"})`
          );
          break;
        }
        // Pose la nouvelle carte en moyen de paiement par défaut du customer.
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: pm },
        });
        console.log(
          `✅ Carte par défaut mise à jour (setup) pour customer ${customerId} → pm ${pm}`
        );
        // ⚠️ CRUCIAL : l'abonnement a sa PROPRE default_payment_method
        // (`createSubscription` → `save_default_payment_method:"on_subscription"`),
        // qui PRIME sur celle du customer pour les factures d'abonnement. Sans
        // cette mise à jour, l'upgrade (`billing_cycle_anchor:"now"`) débiterait
        // l'ANCIENNE carte. On pose donc aussi la carte par défaut DE L'ABONNEMENT.
        const setupSubId = session.metadata?.subscriptionId;
        if (setupSubId) {
          await stripe.subscriptions.update(setupSubId, { default_payment_method: pm });
          console.log(`✅ Carte par défaut de l'abonnement ${setupSubId} → pm ${pm}`);
        }
        break;
      }

      // ── Remboursement (manuel ou via bot SAV Stripe) ──
      // Retire les rôles Discord, prévient l'élève (DM + email), alerte Walid.
      case "charge.refunded": {
        const charge = event.data.object as unknown as {
          id: string;
          customer?: string | null;
          amount: number;
          amount_refunded: number;
          currency: string;
          payment_intent?: string | null;
          billing_details?: { email?: string | null } | null;
        };
        const email = (charge.billing_details?.email ?? "").trim().toLowerCase();
        const amountEur = (charge.amount_refunded / 100).toFixed(2);
        const cur = charge.currency.toUpperCase();
        // Un remboursement PARTIEL (geste commercial) ne doit PAS couper l'accès
        // d'un client encore actif. On ne retire rôles + Onboardé + DM « accès
        // coupé » QUE si le remboursement est TOTAL. L'audit/event reste TOUJOURS
        // enregistré (partiel comme total).
        const fullyRefunded =
          typeof charge.amount === "number" &&
          charge.amount_refunded >= charge.amount;

        if (email) {
          const user = await ctx.runQuery(internal.stripe.findUserByEmail, { email });
          if (user?.discordId && fullyRefunded) {
            // Retire les rôles (idempotent côté bot : no_role si déjà parti).
            await ctx.runAction(internal.stripe.removeDiscordRoles, {
              discordId: user.discordId,
              email,
            });
            // Retire aussi le rôle « Onboardé » (remboursement TOTAL = accès coupé).
            await ctx.runAction(internal.stripe.removeOnboardedRole, {
              discordId: user.discordId,
            });
            // DM élève — embed brandé.
            const dm = refundDm({ amountEur, cur });
            await ctx.runAction(internal.onboardings.discordDm, {
              discordId: user.discordId,
              embed: dm.embed,
            });
          }
          // Email Resend (filet de sécurité si DM bloqué)
          await ctx.runAction(internal.emails.sendRefundNotice, {
            to: email,
            amount: charge.amount_refunded,
            currency: charge.currency,
            accessRemoved: fullyRefunded,
          });
          // Audit trail
          await ctx.runMutation(internal.events.recordEventByEmail, {
            email,
            type: "charge.refunded",
            title: `Remboursé ${amountEur} ${cur}`,
            actor: "stripe",
            meta: JSON.stringify({
              chargeId: charge.id,
              paymentIntent: charge.payment_intent ?? null,
              amount: charge.amount_refunded,
            }),
          });
        }
        // Alerte Walid
        await ctx.runAction(internal.discord.postAlertToStaff, {
          content:
            `💸 **Refund ${fullyRefunded ? "TOTAL" : "partiel"}** — ${email || "email inconnu"} · ${amountEur} ${cur}\n` +
            (fullyRefunded
              ? `Rôles Discord retirés automatiquement.`
              : `Remboursement partiel : accès Discord CONSERVÉ.`),
        });
        console.log(`💸 Charge refunded for ${email || "(no email)"} — ${amountEur} ${cur}`);
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
          lines?: {
            data?: Array<{
              period?: { end?: number };
              price?: { id?: string } | null;
            }>;
          };
          invoice_pdf?: string | null;
          hosted_invoice_url?: string | null;
          charge?: string | null;
          status_transitions?: { paid_at?: number | null } | null;
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
        // Dérive le tier depuis le price ID de la ligne de facture. Sans ça, si le
        // purchase n'avait pas encore de tier, recordSubscription le laisse
        // undefined → assignDiscordRole (gardé par `if (purchase?.tier)`) est sauté
        // → coaché payant SANS rôle. On passe tier + stripePriceId. Si le tier ne
        // se dérive pas, on laisse undefined (recordSubscription n'écrase pas un
        // champ connu avec undefined → pas de régression).
        const invoicePriceId = invoice.lines?.data?.[0]?.price?.id ?? undefined;
        const invoiceTier = tierFromPriceId(invoicePriceId);
        await ctx.runMutation(internal.stripe.recordSubscription, {
          email: email || "",
          stripeSubscriptionId: subId,
          stripeCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : undefined,
          stripePriceId: invoicePriceId,
          tier: invoiceTier,
          status: "active",
          amount: invoice.amount_paid,
          currency: invoice.currency,
          currentPeriodEnd:
            typeof periodEndSec === "number" ? periodEndSec * 1000 : undefined,
        });

        // Email de claim — UNIQUEMENT tant que la purchase n'est pas encore
        // liée à un compte. `invoice.paid` se redéclenche à CHAQUE renouvellement
        // mensuel ; sans ce guard `!purchase.userId`, un abonné déjà actif
        // recevrait « active ton accès » tous les mois (byPaymentIntent ne filtre
        // pas les tokens déjà consommés). Une fois lié → le cron lifecycle gère
        // les relances des seuls non-activés.
        const purchase = await ctx.runQuery(
          internal.stripe.findPurchaseBySubscription,
          { stripeSubscriptionId: subId }
        );
        const targetEmail = email || purchase?.email || "";
        if (purchase?.stripePaymentIntentId && !purchase.userId) {
          const claim = await ctx.runQuery(internal.claimTokens.byPaymentIntent, {
            paymentIntentId: purchase.stripePaymentIntentId,
          });
          if (claim?.token && targetEmail) {
            await ctx.runAction(internal.emails.sendClaimEmail, {
              to: targetEmail,
              firstName: "",
              claimToken: claim.token,
              code: claim.code ?? undefined,
              tier: purchase?.tier,
            });
          }
        }

        // Reçu de paiement — envoyé à CHAQUE facture payée (1er paiement ET
        // renouvellements), indépendamment du guard claim ci-dessus. Idempotent
        // via claimStripeEvent (event traité une seule fois). Fail-silent.
        if (targetEmail && typeof invoice.amount_paid === "number") {
          // Carte (best-effort) : récupère le last4 depuis la charge.
          let cardLast4: string | undefined;
          if (invoice.charge) {
            try {
              const charge = await stripe.charges.retrieve(invoice.charge);
              cardLast4 =
                charge.payment_method_details?.card?.last4 ?? undefined;
            } catch {
              cardLast4 = undefined;
            }
          }
          const paidAt = invoice.status_transitions?.paid_at
            ? invoice.status_transitions.paid_at * 1000
            : Date.now();
          await ctx.runAction(internal.emails.sendPaymentReceipt, {
            to: targetEmail,
            firstName: "",
            offerLabel: purchase?.tier === "coaching" ? "Coaching" : "Communauté",
            amountCents: invoice.amount_paid,
            currency: invoice.currency ?? "eur",
            paidAt,
            cardLast4,
            receiptPdfUrl:
              invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? undefined,
          });
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

            // DM élève (s'il a lié son Discord) — voix Papi Amour
            const user = await ctx.runQuery(internal.stripe.findUserByEmail, {
              email: femail,
            });
            if (user?.discordId) {
              const site = (process.env.SITE_URL ?? "https://membres.amourstudios.fr").replace(/\/$/, "");
              const dm = paymentFailedDm({ site });
              await ctx.runAction(internal.onboardings.discordDm, {
                discordId: user.discordId,
                embed: dm.embed,
                button: dm.button,
              });
            }
            // Email Resend (filet de sécurité)
            await ctx.runAction(internal.emails.sendPaymentFailedNotice, {
              to: femail,
            });
          }
          // Alerte Walid dans #⚠️・alertes-inactivité
          await ctx.runAction(internal.discord.postAlertToStaff, {
            content:
              `⚠ **Paiement échoué** — ${femail || "email inconnu"}\n` +
              `Statut : past_due. Stripe va retry automatiquement. ` +
              `Si ça échoue 3-4 fois, l'abonnement sera annulé.\n\n` +
              `→ Pense à le contacter via /studio si la situation traîne.`,
          });
          console.log(`⚠️ Invoice payment failed for sub ${subId} → past_due`);
        }
        break;
      }

      default:
        // On ignore les autres events
        break;
    }
    } catch (err) {
      console.error(
        `[stripe webhook] échec traitement ${event.type} (${event.id}):`,
        err
      );
      // L'event reste claimé (pas de retry → pas de double notif). On prévient
      // Walid pour rattrapage manuel via /studio.
      await ctx
        .runAction(internal.discord.postAlertToStaff, {
          content: `🛑 **Webhook Stripe en échec** — ${event.type} (${event.id}). Traitement incomplet, vérifie /studio.`,
        })
        .catch(() => {});
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

    // Vérification de signature. En prod (frugal-curlew-831), la clé EST
    // obligatoire — fail-closed : sans clé, on rejette pour éviter qu'un
    // attaquant POST un faux invitee.created et crée des sessions.
    // En dev (autre déploiement), on log un warn et on accepte (pour les
    // tests locaux qui n'ont pas forcément la clé).
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const header = request.headers.get("Calendly-Webhook-Signature") || "";
      // Parsing tolérant : on découpe sur la 1re "=" de chaque segment pour
      // ne pas casser si la valeur (v1, en hex/base64) contient des "=" de
      // padding. Le split.map précédent castait `as [string, string]` ce
      // qui produisait un tuple invalide quand le segment était mal formé.
      const parts: Record<string, string> = {};
      for (const segment of header.split(",")) {
        const eqIdx = segment.indexOf("=");
        if (eqIdx === -1) continue;
        parts[segment.slice(0, eqIdx).trim()] = segment.slice(eqIdx + 1).trim();
      }
      const t = parts["t"];
      const v1 = parts["v1"];
      const expected = t ? await hmacHex(signingKey, `${t}.${rawBody}`) : "";
      if (!t || !v1 || v1 !== expected) {
        console.warn("Calendly webhook: signature invalide");
        // Fail-loud : si le header est bien formé (t+v1 présents) mais la
        // signature ne matche pas, c'est très probablement une CLÉ DÉSYNCHRONISÉE
        // (abonnement webhook recréé côté Calendly → nouvelle signing key) → tous
        // les RDV échouent en silence. On alerte le staff. On n'alerte PAS les
        // POST sans header (scans/bruit).
        if (t && v1) {
          await ctx.runAction(internal.discord.postAlertToStaff, {
            content:
              "⚠️ **Calendly : signature webhook invalide.** La clé `CALENDLY_WEBHOOK_SIGNING_KEY` ne correspond plus à l'abonnement webhook Calendly → les RDV ne se synchronisent pas sur le dashboard. À resynchroniser (clé ou abonnement).",
            mentionAdmins: true,
          });
        }
        return new Response("Invalid signature", { status: 401 });
      }
    } else if (IS_PROD) {
      console.error("CALENDLY_WEBHOOK_SIGNING_KEY absent en prod — webhook rejeté");
      await ctx.runAction(internal.discord.postAlertToStaff, {
        content:
          "⚠️ **Calendly : `CALENDLY_WEBHOOK_SIGNING_KEY` absente en prod** → tous les RDV sont rejetés et n'apparaissent pas sur le dashboard. À configurer côté Convex.",
        mentionAdmins: true,
      });
      return new Response("Missing signing key", { status: 401 });
    } else {
      console.warn("CALENDLY_WEBHOOK_SIGNING_KEY non défini (dev) — signature non vérifiée");
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
        // Trace CRM : UN SEUL event par RDV (avant : doublon).
        // - RDV d'onboarding → markRdvBookedByUser logge « 1er RDV réservé
        //   (onboarding) » + passe l'onboarding à rdv_booked.
        // - RDV de coaching ultérieur → event générique « RDV réservé (Calendly) ».
        if (res.matched && res.isOnboarding) {
          await ctx.runMutation(internal.onboardings.markRdvBookedByUser, {
            userId: res.userId,
            sessionId: res.sessionId,
          });
        } else if (res.matched) {
          await ctx.runMutation(internal.events.recordEventByEmail, {
            email,
            type: "rdv.booked",
            title: "RDV réservé (Calendly)",
            actor: "calendly",
            meta: JSON.stringify({ scheduledAt: start }),
          });
        }
        // Fail-loud : RDV reçu mais aucun compte trouvé (email inconnu ET pas de
        // token onboarding) → session non créée. On le rend visible au staff au
        // lieu de le perdre silencieusement (récupérable via « Resync Calendly »).
        if (!res.matched) {
          await ctx.runAction(internal.discord.postAlertToStaff, {
            content:
              `📅 ⚠️ **RDV Calendly non rattaché** : \`${email}\` (${se.name ?? "RDV"}). ` +
              `Aucun compte ne correspond (email inconnu + pas de lien onboarding). ` +
              `À relier manuellement ou via « Resync Calendly » dans le studio.`,
            mentionAdmins: false,
          });
        }
        console.log(`📅 Calendly invitee.created (${email}) → matched=${res.matched}`);
      } else {
        // Payload incomplet (email / uri / heure manquant) : au lieu d'ignorer
        // en silence, on alerte (Calendly a peut-être changé sa structure).
        await ctx.runAction(internal.discord.postAlertToStaff, {
          content:
            "📅 ⚠️ **Webhook Calendly invitee.created incomplet** (email/URI/heure manquant) → RDV non enregistré. À vérifier.",
          mentionAdmins: false,
        });
        console.warn(
          `Calendly invitee.created payload incomplet (email=${!!email} uri=${!!eventUri} start=${start})`
        );
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


// ── Webhook Discord « S'onboarder » ─────────────────────────────────────────
// Le membre clique le bouton « S'onboarder » dans son salon privé → le bot POST
// ici avec son discordId → on (ré)assure son rôle, on avance l'onboarding +
// envoie le lien (DM+email) ET on RENVOIE le lien pour que le bot le poste dans
// le salon privé. Auth IDENTIQUE à /webhooks/discord/presentation.
http.route({
  path: "/webhooks/discord/start-onboarding",
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
      internal.onboardings.startOnboardingByDiscordId,
      { discordId }
    );
    return new Response(JSON.stringify(res), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Webhook Discord membre rejoint ──────────────────────────────────────────
// Le bot écoute `guildMemberAdd`. À l'arrivée d'un membre (non-bot, bonne
// guild), il POST ici avec son discordId → on lui (ré)attribue son rôle d'après
// son purchase déjà lié. Couvre l'ordre « se connecter (OAuth + claim) AVANT de
// rejoindre le serveur » (le rôle n'avait pas pu être posé tant que le membre
// n'était pas là). Auth IDENTIQUE à /webhooks/discord/presentation :
// Bearer DISCORD_BOT_ENDPOINT_SECRET (= BOT_SECRET côté bot).
http.route({
  path: "/webhooks/discord/member-joined",
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
      internal.onboardings.resolveAndAssignRoleByDiscordId,
      { discordId }
    );
    // Enrichit la réponse avec l'état canonique du cerveau (cf. convex/journey.ts)
    // pour que le robot choisisse son message d'accueil dessus. Additif : les
    // champs existants (ok/tier/reason…) sont préservés ; `journey` est ignoré
    // par le robot tant qu'il n'est pas câblé → zéro changement de comportement.
    const journey = await ctx.runQuery(internal.journey.journeyByDiscordId, {
      discordId,
    });
    return new Response(JSON.stringify({ ...res, journey }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Webhook Discord tickets ─────────────────────────────────────────────────
// Le bot poste ici quand un membre ouvre (action "open") ou ferme (action
// "close") un ticket de support. On garde une trace (table tickets) pour le
// suivi /studio/tickets. Sur "open", on alerte aussi le staff (postAlertToStaff)
// avec le lien du salon. Auth IDENTIQUE à /webhooks/discord/presentation :
// Bearer DISCORD_BOT_ENDPOINT_SECRET (= BOT_SECRET côté bot).
http.route({
  path: "/webhooks/discord/ticket",
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
    let body: {
      action?: string;
      discordId?: string;
      username?: string;
      channelId?: string;
      closedBy?: string;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    const action = (body.action ?? "").trim();
    const channelId = (body.channelId ?? "").trim();
    if (!channelId) return new Response("channelId required", { status: 400 });

    if (action === "open") {
      const discordId = (body.discordId ?? "").trim();
      if (!discordId) return new Response("discordId required", { status: 400 });
      await ctx.runMutation(internal.tickets.recordOpen, {
        discordId,
        username: body.username,
        channelId,
      });
      // Coupe l'IA dans le salon ticket (prise en charge humaine) → évite que
      // l'IA réponde/ré-escalade et recrée un ticket à chaque message du membre.
      await ctx.runMutation(internal.support.ensureTicketThreadMuted, {
        channelId,
        discordId,
        username: body.username,
      });
      // Lien cliquable du salon (le guildId est implicite côté Discord : un
      // mention de salon <#id> résout dans le serveur où l'alerte est postée).
      await ctx.runAction(internal.discord.postAlertToStaff, {
        content: `🎫 **Nouveau ticket** de <@${discordId}> → <#${channelId}>`,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "close") {
      await ctx.runMutation(internal.tickets.recordClose, {
        channelId,
        closedBy: body.closedBy,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Unknown action", { status: 400 });
  }),
});

// Pré-filtre IA #support : le bot relaie chaque message membre ici, on renvoie
// une décision { action, message, reason }. Auth Bearer DISCORD_BOT_ENDPOINT_SECRET.
http.route({
  path: "/webhooks/discord/support-message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!expected) return new Response("Not configured", { status: 500 });
    const auth = request.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body: {
      channelId?: string;
      discordId?: string;
      username?: string;
      content?: string;
      source?: "support_prefilter" | "ticket";
      isAdmin?: boolean;
    } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    const channelId = (body.channelId ?? "").trim();
    const discordId = (body.discordId ?? "").trim();
    const content = (body.content ?? "").trim();
    if (!channelId || !discordId || content.length < 3) {
      return new Response(JSON.stringify({ action: "disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const decision = await ctx.runAction(internal.supportAgent.handleSupportMessage, {
      channelId,
      discordId,
      username: body.username,
      content,
      source: body.source ?? "support_prefilter",
      isAdmin: Boolean(body.isAdmin),
    });

    if (decision.action !== "disabled") {
      const thread = await ctx.runQuery(internal.support.getThreadByChannel, { channelId });
      if (thread) {
        await ctx.runMutation(internal.support.appendMessage, {
          threadId: thread._id,
          channelId,
          role: "assistant",
          content: decision.message ?? decision.reason ?? "",
          decision:
            (process.env.AI_SUPPORT_MODE === "shadow" ? "shadow" : decision.action) as "reply" | "escalate" | "shadow",
          toolsUsed: decision.toolsUsed,
          confidence: decision.confidence,
          inputTokens: decision.inputTokens,
          outputTokens: decision.outputTokens,
        });
      }
    }

    return new Response(JSON.stringify(decision), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Webhook Discord : transcript pour l'escalade ────────────────────────────
// Le bot appelle cet endpoint pour récupérer le transcript IA d'un fil avant
// de créer le salon ticket. On enregistre aussi l'escalade dans Convex.
// Auth Bearer DISCORD_BOT_ENDPOINT_SECRET (= BOT_SECRET côté bot).
http.route({
  path: "/webhooks/discord/support-transcript",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!expected) return new Response("Not configured", { status: 500 });
    if ((request.headers.get("Authorization") ?? "") !== `Bearer ${expected}`)
      return new Response("Unauthorized", { status: 401 });
    const body = (await request.json().catch(() => ({}))) as {
      channelId?: string;
      escalatedChannelId?: string;
      reason?: string;
      discordId?: string;
    };
    const channelId = (body.channelId ?? "").trim();
    const thread = await ctx.runQuery(internal.support.getThreadByChannel, { channelId });
    if (!thread) {
      return new Response(JSON.stringify({ transcript: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const transcript = await ctx.runQuery(internal.support.threadTranscript, {
      threadId: thread._id,
    });
    await ctx.runMutation(internal.support.recordEscalation, {
      threadId: thread._id,
      discordId: body.discordId ?? thread.discordId,
      reason: body.reason ?? "escalade IA",
      escalatedChannelId: body.escalatedChannelId,
    });
    return new Response(JSON.stringify({ transcript }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ── Webhook Discord : action membre sur un fil de support ───────────────────
// Reçoit les actions des boutons Discord : "resolved" (C'est réglé) et
// "resume" (Reprendre l'IA). Auth Bearer DISCORD_BOT_ENDPOINT_SECRET.
http.route({
  path: "/webhooks/discord/support-action",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.DISCORD_BOT_ENDPOINT_SECRET;
    if (!expected) return new Response("Not configured", { status: 500 });
    if ((request.headers.get("Authorization") ?? "") !== `Bearer ${expected}`)
      return new Response("Unauthorized", { status: 401 });
    const body = (await request.json().catch(() => ({}))) as {
      channelId?: string;
      action?: string;
    };
    const channelId = (body.channelId ?? "").trim();
    if (!channelId) return new Response("channelId required", { status: 400 });
    if (body.action === "resolved") {
      await ctx.runMutation(internal.support.markResolvedByChannel, { channelId });
    } else if (body.action === "resume") {
      await ctx.runMutation(internal.support.resumeAiByChannel, { channelId });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
