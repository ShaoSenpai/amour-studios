"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <main className="ds-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(0,255,133,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="ds-reveal relative z-10 flex w-full max-w-md flex-col gap-8">
        {/* Meta */}
        <p
          className="font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
          style={{ fontFamily: "var(--font-body)" }}
        >
          — Accès exclusif · Discord OAuth
        </p>

        {/* Hero title */}
        <h1
          className="text-[clamp(48px,7vw,84px)] font-normal leading-[0.92] tracking-[-2px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Entre dans<br />
          ton <em className="italic text-[#FF6B1F]">univers</em>.
        </h1>

        <p
          className="font-mono text-sm text-foreground/60"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Connecte-toi avec Discord pour reprendre ta formation et retrouver ta communauté.
        </p>

        {/* Discord button — filled block */}
        <button
          type="button"
          onClick={handleDiscordSignIn}
          disabled={isLoading}
          className="group flex w-full items-center justify-center gap-3 bg-[#5865F2] px-6 py-4 font-mono text-[11px] uppercase tracking-[2px] text-white transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-[#4752C4] disabled:opacity-60"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        >
          <DiscordIcon />
          {isLoading ? "REDIRECTION…" : "Continuer avec Discord"}
          <span
            className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            →
          </span>
        </button>

        <div
          className="border-t border-foreground/15 pt-6 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          PAS ENCORE LA FORMATION ?{" "}
          <Link
            href="https://www.amourstudios.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2B7A6F] underline-offset-4 hover:underline"
          >
            AMOURSTUDIOS.FR ↗
          </Link>
        </div>
      </div>
    </main>
  );
}

function DiscordIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
