"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { X, Lock, Check, Zap, ArrowRight, Loader2 } from "lucide-react";
import { getStripe } from "@/lib/stripe-client";
import { fireConfetti } from "@/components/gamification/confetti";

// ============================================================================
// Amour Studios — Payment Modal
// ----------------------------------------------------------------------------
// Modal in-app qui remplace la redirection vers amourstudios.fr/paiement.
// - Crée un PaymentIntent via Convex (mode 1x ou 3x Klarna)
// - Monte <PaymentElement> de Stripe (CB, Apple/Google Pay, Klarna)
// - Sur succès : écran "Bienvenue" + confetti → redirige vers /dashboard
// - Sur 3x Klarna : Stripe redirige vers return_url = /claim?t=TOKEN
// ============================================================================

type Mode = "1x" | "3x";

export function PaymentModal({
  open,
  onClose,
  moduleTitle,
}: {
  open: boolean;
  onClose: () => void;
  moduleTitle?: string;
}) {
  const me = useQuery(api.users.current);
  const createPI = useAction(api.stripe.createPaymentIntent);

  const [mode, setMode] = React.useState<Mode>("1x");
  const [email, setEmail] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [claimToken, setClaimToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [initError, setInitError] = React.useState<string | null>(null);

  // Pré-remplit l'email depuis le user connecté (une fois)
  React.useEffect(() => {
    if (me?.email && !email) setEmail(me.email);
  }, [me?.email, email]);

  // Escape ferme
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Crée/re-crée le PaymentIntent. L'email n'est pas dans les deps — il est
  // passé via receipt_email au confirmPayment, donc pas besoin de reset.
  const initPI = React.useCallback(
    async (m: Mode) => {
      setLoading(true);
      setInitError(null);
      setClientSecret(null);
      try {
        const emailSnapshot = emailRef.current;
        const res = await createPI({ mode: m, email: emailSnapshot });
        setClientSecret(res.clientSecret);
        setClaimToken(res.claimToken ?? null);
      } catch (err) {
        console.error("[payment-modal] createPaymentIntent failed:", err);
        setInitError("Impossible d'initialiser le paiement. Réessaie dans quelques secondes.");
      } finally {
        setLoading(false);
      }
    },
    [createPI]
  );

  // Snapshot email pour que initPI utilise la valeur courante sans être une dep
  const emailRef = React.useRef(email);
  React.useEffect(() => {
    emailRef.current = email;
  }, [email]);

  // Init PI uniquement au premier open + à chaque changement de mode
  // Jamais ré-init sur changement d'email (l'email est envoyé via receipt_email
  // au confirmPayment, pas besoin de re-créer le PaymentIntent).
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setClientSecret(null);
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      initPI(mode);
    }
  }, [open, mode, initPI]);

  // Changement de mode après ouverture
  const prevModeRef = React.useRef<Mode | null>(null);
  React.useEffect(() => {
    if (!open) {
      prevModeRef.current = null;
      return;
    }
    if (prevModeRef.current === null) {
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      initPI(mode);
    }
  }, [mode, open, initPI]);

  if (!open) return null;

  const elementsOptions: StripeElementsOptions | null = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "stripe" as const,
          variables: {
            colorPrimary: "#0D0B08",
            colorText: "#0D0B08",
            colorBackground: "#F4EEE1",
            colorDanger: "#E63326",
            fontFamily: "DM Sans, system-ui, sans-serif",
            borderRadius: "8px",
          },
        },
      }
    : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0D0B08]/85"
        style={{ backdropFilter: "blur(10px)" }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="ds-reveal relative w-full max-w-xl max-h-[92dvh] overflow-y-auto border border-foreground/15 bg-background"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#FFB347] px-6 py-5 text-[#0D0B08] md:px-8">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-[#0D0B08]/60 transition-colors hover:text-[#0D0B08]"
            aria-label="Fermer"
            style={{ minHeight: 0 }}
          >
            <X size={18} />
          </button>
          <div
            className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[2px]"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            <Lock size={11} />
            ◦ {moduleTitle ? `MODULE · ${moduleTitle}` : "ACCÈS FORMATION COMPLÈTE"}
          </div>
          <h2
            className="text-3xl font-normal italic leading-[1] tracking-tight md:text-4xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Débloque <em>tout.</em>
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 md:px-8">
          {/* Bénéfices */}
          <ul
            className="mb-6 grid grid-cols-1 gap-2.5 font-mono text-[12px] text-foreground/80 sm:grid-cols-2"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {[
              "06 modules · 20+ leçons vidéo",
              "Communauté Discord VIP",
              "Vision Board, scripts, templates",
              "Accès à vie · ton rythme",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2">
                <Check size={13} className="mt-[2px] shrink-0 text-[color:var(--state-done)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Toggle mode 1x / 3x */}
          <div className="mb-5 flex gap-2">
            {(["1x", "3x"] as Mode[]).map((m) => {
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex flex-1 flex-col items-start gap-1 border p-3 text-left transition-all ${
                    isActive
                      ? "border-foreground bg-foreground/[0.06]"
                      : "border-foreground/15 bg-foreground/[0.02] hover:border-foreground/35"
                  }`}
                  style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
                >
                  <span
                    className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    {m === "1x" ? "◦ En une fois" : "◦ 3× sans frais"}
                  </span>
                  <span
                    className="text-2xl font-normal italic leading-none"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {m === "1x" ? "497 €" : "3 × 165,67 €"}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/45"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    {m === "1x" ? "CB · Apple Pay · Google Pay" : "via Klarna"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Email */}
          <label
            className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="mb-4 w-full border border-foreground/20 bg-foreground/[0.03] px-3 py-2.5 font-mono text-sm outline-none focus:border-foreground/50"
            style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
          />

          {/* PaymentElement */}
          {initError ? (
            <div
              className="mb-4 border border-[#E63326]/40 bg-[#E63326]/10 px-4 py-3 font-mono text-xs text-[#E63326]"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              {initError}
              <button
                className="ml-2 underline"
                onClick={() => initPI(mode)}
              >
                Réessayer
              </button>
            </div>
          ) : !elementsOptions ? (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-md border border-foreground/10 bg-foreground/[0.02] py-8 text-sm text-foreground/50">
              <Loader2 size={14} className="animate-spin" />
              Chargement du formulaire…
            </div>
          ) : (
            <Elements stripe={getStripe()} options={elementsOptions} key={clientSecret}>
              <PaymentForm
                mode={mode}
                email={email}
                claimToken={claimToken}
                loading={loading}
                onSuccess={onClose}
              />
            </Elements>
          )}

          <p
            className="mt-3 text-center font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Paiement sécurisé Stripe · 7 jours satisfait ou remboursé
          </p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PaymentForm — sous-composant qui a accès à useStripe/useElements
// ────────────────────────────────────────────────────────────────────────────

function PaymentForm({
  mode,
  email,
  claimToken,
  loading: parentLoading,
  onSuccess,
}: {
  mode: Mode;
  email: string;
  claimToken: string | null;
  loading: boolean;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/claim${claimToken ? `?t=${encodeURIComponent(claimToken)}` : ""}`
        : undefined;

    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl,
        receipt_email: email.trim() || undefined,
      },
    });

    if (stripeErr) {
      setError(stripeErr.message ?? "Erreur de paiement");
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      setSuccess(true);
      fireConfetti();
      // Laisse le webhook créer le purchase + laisse l'animation de succès
      // jouer 3s avant de fermer + rediriger vers dashboard
      setTimeout(() => {
        onSuccess();
        router.push("/dashboard?justPaid=1");
      }, 3400);
      return;
    }

    // Autre status (requires_action, processing…) — Stripe gère via redirect
    setSubmitting(false);
  };

  if (success) {
    return <PaymentSuccess />;
  }

  const label = mode === "3x" ? "Continuer avec Klarna" : "Payer 497 €";
  const isReady = !!stripe && !!elements && !parentLoading;

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card", "apple_pay", "google_pay"],
            wallets: { link: "never" },
          }}
        />
      </div>

      {error && (
        <div
          className="mb-3 border border-[#E63326]/40 bg-[#E63326]/10 px-3 py-2 font-mono text-[11px] text-[#E63326]"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!isReady || submitting}
        className="group flex w-full items-center justify-center gap-2.5 bg-[#FFB347] px-6 py-4 font-mono text-[12px] font-bold uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:pr-8 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
      >
        {submitting ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Traitement…
          </>
        ) : (
          <>
            <Zap size={14} /> {label}
            <ArrowRight
              size={14}
              className="transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
            />
          </>
        )}
      </button>
    </form>
  );
}

function PaymentSuccess() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div
        className="flex size-14 items-center justify-center rounded-full bg-[color:var(--state-done-bg)]"
        style={{ animation: "xp-level-bump-kf 700ms cubic-bezier(.34,1.56,.64,1)" }}
      >
        <Check size={28} color="var(--state-done-fg)" />
      </div>
      <div>
        <p
          className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--state-done)]"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          ◦ Paiement confirmé
        </p>
        <h3
          className="text-3xl italic leading-[1]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Bienvenue dans <em>Amour Studios.</em>
        </h3>
        <p
          className="mt-3 font-mono text-xs text-foreground/60"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          On te redirige vers ton dashboard…
        </p>
      </div>
    </div>
  );
}
