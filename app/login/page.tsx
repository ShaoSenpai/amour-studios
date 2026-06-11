"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState, Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
} from "../studio/_components/glass";

// ============================================================================
// Login élève /login — connexion Discord, DA Glass C (cohérente avec /exos et
// le login coach). Stratégie Discord-first : être membre du serveur PUIS se
// connecter. 2 états : gate erreur (pas membre) + état par défaut (2 étapes).
// ============================================================================

const DISCORD = "#5865F2";

const discordBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  padding: "12px 16px",
  background: DISCORD,
  color: "#fff",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 600,
};

function LoginInner() {
  const { signIn } = useAuthActions();
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const hasError = searchParams.has("error");
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const discordInvite =
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "https://discord.gg/78v8PSgjxx";

  useEffect(() => {
    if (hasError) {
      toast.error("Connexion refusée — ton Discord n'est pas dans le serveur Amour Studios.");
    }
  }, [hasError]);

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("discord", { redirectTo: "/" });
    } catch (error) {
      console.error("Discord sign-in failed:", error);
      toast.error("Impossible de se connecter à Discord. Réessaie.");
      setIsLoading(false);
    }
  };

  const shell: CSSProperties = {
    background: c.bgGrad,
    color: c.text,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    padding: 24,
    overflow: "hidden",
  };

  const brandRow = (
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
        <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>ESPACE MEMBRE</div>
      </div>
    </div>
  );

  // ── État erreur : gate Discord ──────────────────────────────────────
  if (hasError) {
    return (
      <main style={shell}>
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
          <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 20 }}>
            {brandRow}
            <div>
              <div style={{ ...mono, color: ACCENT }}>Accès refusé</div>
              <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
                Rejoins le Discord d&apos;abord.
              </h1>
              <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
                Ton compte Discord n&apos;est pas encore membre du serveur{" "}
                <strong style={{ color: c.text }}>Amour Studios</strong>. L&apos;accès à l&apos;app est
                réservé aux membres — c&apos;est gratuit, il suffit de rejoindre.
              </p>
            </div>
            <a href={discordInvite} target="_blank" rel="noopener noreferrer" style={discordBtn}>
              <DiscordIcon size={20} /> Rejoindre le serveur
            </a>
            <button
              type="button"
              onClick={handleDiscordSignIn}
              disabled={isLoading}
              style={{ ...glassBtn(c, "ghost"), width: "100%", opacity: isLoading ? 0.6 : 1 }}
            >
              {isLoading ? "Redirection…" : "J'ai rejoint — réessayer"}
            </button>
            <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center" }}>
              L&apos;inscription au Discord est gratuite et prend 10 secondes.
            </p>
          </div>
        </Glass>
      </main>
    );
  }

  // ── État par défaut : 2 étapes ──────────────────────────────────────
  return (
    <main style={shell}>
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
          {brandRow}

          <div>
            <div style={{ ...mono, color: c.muted }}>Accès réservé aux membres</div>
            <h1 style={{ ...num, fontSize: 38, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
              Entre dans ton univers.
            </h1>
          </div>

          {/* Étape 1 — Discord (pré-requis) */}
          <div
            style={{
              border: "1px solid rgba(88,101,242,0.30)",
              background: "rgba(88,101,242,0.08)",
              borderRadius: 12,
              padding: "16px 18px",
            }}
          >
            <div style={{ ...mono, fontSize: 10, color: DISCORD, marginBottom: 8 }}>
              ÉTAPE 1 — REJOINS LE SERVEUR
            </div>
            <p style={{ fontSize: 13.5, color: c.muted, lineHeight: 1.5, marginBottom: 12 }}>
              Tu dois être membre du Discord Amour Studios pour accéder à l&apos;app. C&apos;est gratuit.
            </p>
            <a
              href={discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...discordBtn, padding: "10px 14px", fontSize: 13 }}
            >
              <DiscordIcon size={16} /> Rejoindre le serveur →
            </a>
          </div>

          {/* Étape 2 — Connexion */}
          <div>
            <div style={{ ...mono, color: c.muted, marginBottom: 10 }}>ÉTAPE 2 — CONNECTE-TOI</div>
            <button
              type="button"
              onClick={handleDiscordSignIn}
              disabled={isLoading}
              style={{
                ...glassBtn(c, "solid"),
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              <DiscordIcon /> {isLoading ? "Redirection…" : "Continuer avec Discord"}
            </button>
          </div>

          <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 16 }}>
            <p style={{ ...mono, fontSize: 10.5, color: c.muted, textAlign: "center" }}>
              Pas encore membre ?{" "}
              <Link
                href="https://www.amourstudios.fr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: ACCENT, textDecoration: "none" }}
              >
                Découvrir Amour Studios ↗
              </Link>
            </p>
          </div>
        </div>
      </Glass>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
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
