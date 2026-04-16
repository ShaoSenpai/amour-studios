import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Singleton — loadStripe doit être appelé au plus haut niveau pour éviter
// les re-créations d'instances à chaque render.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error("[stripe] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY manquante");
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(key);
    }
  }
  return stripePromise;
}
