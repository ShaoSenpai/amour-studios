import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
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
        const email =
          pi.metadata?.email || pi.receipt_email || "";

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
          payment_intent?: string;
          customer?: string;
          amount_paid?: number;
          currency?: string;
        };
        const email = invoiceData.customer_email || "";
        const pi = invoiceData.payment_intent || "";

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
