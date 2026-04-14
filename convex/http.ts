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

    let body: { mode?: string; email?: string };
    try {
      body = (await request.json()) as { mode?: string; email?: string };
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const mode: "1x" | "3x" = body.mode === "3x" ? "3x" : "1x";
    const email = typeof body.email === "string" ? body.email : "";

    try {
      const result = await ctx.runAction(api.stripe.createPaymentIntent, {
        email,
        mode,
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

    // Traiter les events qui nous intéressent
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const email = (
          pi.metadata?.email || pi.receipt_email || ""
        )
          .trim()
          .toLowerCase();

        if (!email) {
          console.warn("payment_intent.succeeded without email, skipping");
          break;
        }

        await ctx.runMutation(internal.stripe.fulfillPayment, {
          email,
          stripeSessionId: pi.id, // on réutilise le champ pour le PI id
          stripePaymentIntentId: pi.id,
          stripeCustomerId:
            typeof pi.customer === "string" ? pi.customer : undefined,
          amount: pi.amount,
          currency: pi.currency,
        });

        console.log(`✅ Purchase fulfilled for ${email} (${pi.id})`);

        // Email de confirmation avec claim token signé (fail-silent)
        const firstName = (pi.metadata?.firstName as string | undefined) ?? "";
        const claimToken =
          (pi.metadata?.claim_token as string | undefined) ||
          (await ctx.runQuery(internal.claimTokens.byPaymentIntent, {
            paymentIntentId: pi.id,
          }));
        if (claimToken) {
          await ctx.runAction(internal.emails.sendClaimEmail, {
            to: email,
            firstName,
            claimToken,
          });
        } else {
          console.warn(`No claim token found for ${pi.id} — email skipped`);
        }

        // Assigner le rôle Discord VIP si le user existe et a un discordId
        const user = await ctx.runQuery(internal.stripe.findUserByEmail, { email });
        if (user?.discordId) {
          await ctx.runAction(internal.stripe.assignDiscordRole, {
            discordId: user.discordId,
            email,
          });
        }

        break;
      }

      case "invoice.paid": {
        // Mode 3× : la première invoice payée = accès accordé
        const invoiceData = event.data.object as {
          id: string;
          customer_email?: string;
          payment_intent?: string | null;
          confirmation_secret?: { payment_intent?: string | null } | null;
          customer?: string;
          amount_paid?: number;
          currency?: string;
        };
        const email = (invoiceData.customer_email || "")
          .trim()
          .toLowerCase();
        // Stripe API ≥ 2024-11 : payment_intent déprécié → fallback si besoin
        // via refetch depuis l'invoice complète.
        let pi = invoiceData.payment_intent || "";
        if (!pi) {
          try {
            const full = await stripe.invoices.retrieve(invoiceData.id, {
              expand: ["payment_intent"],
            });
            const fullPi = (full as unknown as { payment_intent?: { id?: string } | string | null }).payment_intent;
            if (typeof fullPi === "string") pi = fullPi;
            else if (fullPi && typeof fullPi === "object" && fullPi.id) pi = fullPi.id;
          } catch (err) {
            console.warn("Failed to refetch invoice PI:", err);
          }
        }

        if (!email || !pi) {
          console.warn("invoice.paid without email or PI, skipping");
          break;
        }

        await ctx.runMutation(internal.stripe.fulfillPayment, {
          email,
          stripeSessionId: invoiceData.id,
          stripePaymentIntentId: pi,
          stripeCustomerId:
            typeof invoiceData.customer === "string"
              ? invoiceData.customer
              : undefined,
          amount: invoiceData.amount_paid ?? 0,
          currency: invoiceData.currency ?? "eur",
        });

        console.log(`✅ Invoice paid for ${email} (${invoiceData.id})`);
        break;
      }

      default:
        // On ignore les autres events
        break;
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
