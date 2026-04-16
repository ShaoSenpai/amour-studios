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
// Dès que l'utilisateur devient VIP, déclenche une animation "bienvenue"
// puis retire le param de l'URL pour révéler le dashboard unlocked.
// ============================================================================

export function UnlockOverlay() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const justPaid = searchParams.get("justPaid") === "1";

  const purchase = useQuery(api.purchases.current);
  const user = useQuery(api.users.current);

  const [stage, setStage] = React.useState<"hidden" | "waiting" | "revealing" | "done">(
    justPaid ? "waiting" : "hidden"
  );

  // Passage à "revealing" dès que le purchase apparaît (webhook a fini)
  React.useEffect(() => {
    if (stage !== "waiting") return;
    if (purchase?.status === "paid" || user?.purchaseId) {
      setStage("revealing");
      fireConfetti();
      setTimeout(() => fireConfetti(), 450);
    }
  }, [purchase?.status, user?.purchaseId, stage]);

  // Fallback : si le webhook met plus de 15s, on laisse quand même passer
  React.useEffect(() => {
    if (stage !== "waiting") return;
    const t = setTimeout(() => setStage("revealing"), 15000);
    return () => clearTimeout(t);
  }, [stage]);

  // Après le reveal, retire le param ?justPaid=1 de l'URL
  React.useEffect(() => {
    if (stage !== "revealing") return;
    const t = setTimeout(() => {
      setStage("done");
      const url = new URL(window.location.href);
      url.searchParams.delete("justPaid");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
    }, 2400);
    return () => clearTimeout(t);
  }, [stage, router]);

  if (stage === "hidden" || stage === "done") return null;

  const showSuccess = stage === "revealing";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{
        background: "rgba(13, 11, 8, 0.96)",
        backdropFilter: "blur(14px)",
        animation: showSuccess ? "unlock-fade-out 2400ms ease-in forwards" : undefined,
      }}
    >
      <style>{`
        @keyframes unlock-fade-out {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; pointer-events: none; }
        }
        @keyframes unlock-check-pop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          60% { transform: scale(1.25) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes unlock-title-rise {
          0% { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div className="flex flex-col items-center gap-6 px-6 text-center text-[#F4EEE1]">
        {!showSuccess ? (
          <>
            <Loader2 size={32} className="animate-spin text-[#FFB347]" />
            <div>
              <p
                className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-[#FFB347]"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ Liaison du paiement…
              </p>
              <h2
                className="text-3xl italic leading-[1] md:text-4xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                On prépare ton accès.
              </h2>
              <p
                className="mt-3 font-mono text-xs text-[#F4EEE1]/60"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                Quelques secondes — Stripe nous confirme ton paiement.
              </p>
            </div>
          </>
        ) : (
          <>
            <div
              className="flex size-20 items-center justify-center rounded-full"
              style={{
                background: "var(--state-done-bg)",
                animation: "unlock-check-pop 700ms cubic-bezier(.34,1.56,.64,1)",
              }}
            >
              <Check size={40} color="var(--state-done-fg)" strokeWidth={3} />
            </div>
            <div style={{ animation: "unlock-title-rise 500ms ease-out 150ms both" }}>
              <p
                className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--state-done)]"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ Accès complet débloqué
              </p>
              <h2
                className="text-4xl italic leading-[1] md:text-5xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Bienvenue, <em>artiste.</em>
              </h2>
              <p
                className="mt-4 font-mono text-xs text-[#F4EEE1]/70"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                6 modules · 20+ leçons · communauté VIP
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
