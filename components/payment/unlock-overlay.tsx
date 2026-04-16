"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Check, Loader2 } from "lucide-react";
import { fireConfetti } from "@/components/gamification/confetti";

// ============================================================================
// UnlockOverlay
// ----------------------------------------------------------------------------
// S'affiche sur /dashboard?justPaid=1 après paiement réussi. Attend que le
// webhook Stripe ait créé le purchase et lié l'utilisateur (Convex réactif).
// Dès que l'utilisateur devient VIP, joue "Bienvenue artiste" puis retire
// ?justPaid de l'URL.
// Layout volontairement fixe (min-h + max-w) pour éviter tout saut vertical
// entre les 2 états.
// ============================================================================

export function UnlockOverlay() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPaid = searchParams.get("justPaid") === "1";

  const purchase = useQuery(api.purchases.current);
  const user = useQuery(api.users.current);

  const [stage, setStage] = React.useState<"hidden" | "waiting" | "revealing" | "fading" | "done">(
    justPaid ? "waiting" : "hidden"
  );

  React.useEffect(() => {
    if (stage !== "waiting") return;
    if (purchase?.status === "paid" || user?.purchaseId) {
      setStage("revealing");
      fireConfetti();
      const t = setTimeout(() => fireConfetti(), 500);
      return () => clearTimeout(t);
    }
  }, [purchase?.status, user?.purchaseId, stage]);

  React.useEffect(() => {
    if (stage !== "waiting") return;
    const t = setTimeout(() => setStage("revealing"), 15000);
    return () => clearTimeout(t);
  }, [stage]);

  React.useEffect(() => {
    if (stage !== "revealing") return;
    const t = setTimeout(() => setStage("fading"), 2000);
    return () => clearTimeout(t);
  }, [stage]);

  React.useEffect(() => {
    if (stage !== "fading") return;
    const t = setTimeout(() => {
      setStage("done");
      const url = new URL(window.location.href);
      url.searchParams.delete("justPaid");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
    }, 500);
    return () => clearTimeout(t);
  }, [stage, router]);

  if (stage === "hidden" || stage === "done") return null;

  const showSuccess = stage === "revealing" || stage === "fading";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center transition-opacity duration-500 ease-in-out"
      style={{
        background: "rgba(13, 11, 8, 0.96)",
        backdropFilter: "blur(14px)",
        opacity: stage === "fading" ? 0 : 1,
        pointerEvents: stage === "fading" ? "none" : "auto",
      }}
    >
      <style>{`
        @keyframes unlock-check-pop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes unlock-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Container taille fixe : évite tout saut entre "waiting" et "revealing" */}
      <div
        className="flex w-full max-w-md flex-col items-center gap-6 px-6 text-center text-[#F4EEE1]"
        style={{ minHeight: 280 }}
      >
        {/* Icône — même slot 80x80 pour les 2 états */}
        <div className="flex size-20 items-center justify-center">
          {!showSuccess ? (
            <Loader2 size={32} className="animate-spin text-[#FFB347]" />
          ) : (
            <div
              className="flex size-20 items-center justify-center rounded-full"
              style={{
                background: "var(--state-done-bg)",
                animation: "unlock-check-pop 700ms cubic-bezier(.34,1.56,.64,1)",
              }}
            >
              <Check size={40} color="var(--state-done-fg)" strokeWidth={3} />
            </div>
          )}
        </div>

        {/* Texte — wrapper de hauteur fixe pour éviter le reflow */}
        <div
          key={showSuccess ? "success" : "waiting"}
          className="flex flex-col items-center gap-3"
          style={{ animation: "unlock-fade-in 400ms ease-out both", minHeight: 140 }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[2px]"
            style={{
              fontFamily: "var(--font-body-legacy)",
              color: showSuccess ? "var(--state-done)" : "#FFB347",
            }}
          >
            ◦ {showSuccess ? "Accès complet débloqué" : "Liaison du paiement…"}
          </p>
          <h2
            className="text-4xl italic leading-[1] md:text-5xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {showSuccess ? (
              <>
                Bienvenue, <em>artiste.</em>
              </>
            ) : (
              "On prépare ton accès."
            )}
          </h2>
          <p
            className="font-mono text-xs text-[#F4EEE1]/65"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {showSuccess
              ? "6 modules · 20+ leçons · communauté VIP"
              : "Quelques secondes — Stripe nous confirme ton paiement."}
          </p>
        </div>
      </div>
    </div>
  );
}
