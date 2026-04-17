"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Suspense } from "react";

function LoginInner() {
  const { signIn } = useAuthActions();
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const hasError = searchParams.has("error");

  const discordInvite =
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "https://discord.gg/xDg3spYfem";

  useEffect(() => {
    if (hasError) {
      toast.error("Connexion refusée — ton Discord n'est pas dans le serveur Amour Studios.");
    }
  }, [hasError]);

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("discord", { redirectTo: "/dashboard" });
    } catch (error) {
      console.error("Discord sign-in failed:", error);
      toast.error("Impossible de se connecter à Discord. Réessaie.");
      setIsLoading(false);
    }
  };

  // ── État erreur : gate Discord plein écran ──────────────────────────
  if (hasError) {
    return (
      <main className="ds-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
        <div className="ds-reveal relative z-10 flex w-full max-w-md flex-col gap-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-[#E63326]/20">
            <DiscordIcon size={28} className="text-[#E63326]" />
          </div>

          <p className="ds-label text-[#E63326]">◦ Accès refusé</p>

          <h1 className="ds-display">
            Rejoins le Discord d&apos;abord.
          </h1>

          <p className="ds-body text-foreground/80">
            Ton compte Discord n&apos;est pas encore membre du serveur <strong>Amour Studios</strong>.
            L&apos;accès à l&apos;app est réservé aux membres du Discord — gratuit, il suffit de rejoindre.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={discordInvite}
              target="_blank"
              rel="noopener noreferrer"
              className="group ds-label flex flex-1 items-center justify-center gap-3 bg-[#5865F2] px-6 py-4 text-white transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-[#4752C4]"
              style={{ minHeight: 0 }}
            >
              <DiscordIcon size={22} />
              Rejoindre le serveur
              <span
                className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                →
              </span>
            </a>
          </div>

          <button
            type="button"
            onClick={handleDiscordSignIn}
            disabled={isLoading}
            className="ds-label w-full border border-foreground/20 bg-foreground/[0.04] px-6 py-3 text-foreground/80 transition-colors hover:bg-foreground/[0.08]"
            style={{ minHeight: 0 }}
          >
            {isLoading ? "Redirection…" : "J'ai rejoint — réessayer la connexion"}
          </button>

          <p
            className="text-center font-mono text-[10px] text-foreground/40"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            L&apos;inscription au Discord est gratuite et prend 10 secondes.
          </p>
        </div>
      </main>
    );
  }

  // ── État par défaut ────────────────────────────────────────────────
  return (
    <main className="ds-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      <div className="ds-reveal relative z-10 flex w-full max-w-md flex-col gap-8">
        <p className="ds-label text-foreground/55">— Accès réservé aux membres</p>

        <h1 className="ds-display">
          Entre dans<br />
          ton <em className="italic text-foreground">univers</em>.
        </h1>

        {/* Pré-requis Discord mis en avant */}
        <div className="border border-[#5865F2]/25 bg-[#5865F2]/[0.06] px-5 py-4">
          <p
            className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[2px] text-[#5865F2]"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Étape 1 — Rejoins le serveur Discord
          </p>
          <p
            className="mb-3 font-mono text-[12px] text-foreground/75"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Tu dois être membre du Discord Amour Studios pour accéder à l&apos;app. C&apos;est gratuit.
          </p>
          <a
            href={discordInvite}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-white transition-opacity hover:opacity-90"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            <DiscordIcon size={14} />
            Rejoindre →
          </a>
        </div>

        <div>
          <p
            className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[2px] text-foreground/55"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Étape 2 — Connecte-toi
          </p>
          <button
            type="button"
            onClick={handleDiscordSignIn}
            disabled={isLoading}
            className="group ds-label flex w-full items-center justify-center gap-3 bg-[#5865F2] px-6 py-4 text-white transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-[#4752C4] disabled:opacity-60"
            style={{ minHeight: 0 }}
          >
            <DiscordIcon />
            {isLoading ? "Redirection…" : "Continuer avec Discord"}
            <span
              className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              →
            </span>
          </button>
        </div>

        <div className="border-t border-foreground/15 pt-6">
          <p className="ds-label text-foreground/50">
            Pas encore la formation ?{" "}
            <Link
              href="https://www.amourstudios.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 whitespace-nowrap text-[#2B7A6F] underline-offset-4 hover:underline"
            >
              amourstudios.fr ↗
            </Link>
          </p>
        </div>
      </div>
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

function DiscordIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
