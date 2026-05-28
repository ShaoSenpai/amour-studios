"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ACCENT, palette, useIsDark, mono, num, Glass, glassBtn } from "../_components/glass";

// ============================================================================
// Login /studio — connexion Discord, style Glass. Réservé à l'équipe.
// Si déjà connecté → redirige /studio (le gate admin du layout fait le reste).
// ============================================================================

export default function StudioLoginPage() {
  const { signIn } = useAuthActions();
  const me = useQuery(api.users.current);
  const router = useRouter();
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (me) router.replace("/studio");
  }, [me, router]);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      await signIn("discord", { redirectTo: "/studio" });
    } catch (error) {
      console.error("Discord sign-in failed:", error);
      toast.error("Impossible de se connecter à Discord. Réessaie.");
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        background: c.bgGrad,
        color: c.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: 24,
        overflow: "hidden",
      }}
    >
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: ACCENT,
                color: "#0B0B0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 20,
                borderRadius: 10,
                letterSpacing: "-0.02em",
              }}
            >
              A
            </div>
            <div>
              <div style={{ ...mono, fontSize: 11, letterSpacing: "0.06em" }}>AMOUR STUDIOS</div>
              <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>OPS · BACK-OFFICE</div>
            </div>
          </div>

          <div>
            <div style={{ ...mono, color: c.muted }}>Accès réservé à l&apos;équipe</div>
            <h1 style={{ ...num, fontSize: 38, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
              Espace coach.
            </h1>
            <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.5 }}>
              Outil interne de pilotage. Connecte-toi avec ton compte Discord
              administrateur pour accéder aux élèves, au calendrier et aux
              paiements.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading}
            style={{
              ...glassBtn(c, "solid"),
              width: "100%",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: loading ? 0.6 : 1,
            }}
          >
            <DiscordIcon />
            {loading ? "Redirection…" : "Continuer avec Discord"}
          </button>

          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center" }}>
            Réservé aux administrateurs · Amour Studios
          </p>
        </div>
      </Glass>
    </main>
  );
}

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
