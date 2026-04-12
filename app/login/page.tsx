"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 bg-background" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 60%)' }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8 reveal">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="font-display text-2xl tracking-tight leading-none">
            <span>AMOUR</span>
            <span className="text-orange">s</span>
            <span>tu</span>
            <span className="text-mustard">d</span>
            <span className="text-[#E63326]">i</span>
            <span>o</span>
            <span className="text-pine">s</span>
            <sup className="text-[0.4em] ml-0.5 text-muted-foreground">®</sup>
          </p>
          <p className="text-sm text-muted-foreground font-serif-accent">
            Connecte-toi pour accéder à ta formation
          </p>
        </div>

        {/* Discord button */}
        <Button
          size="lg"
          onClick={handleDiscordSignIn}
          disabled={isLoading}
          className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium gap-2.5 h-12 rounded-full active:scale-[0.97] transition-all"
          style={{ boxShadow: 'none' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(88,101,242,0.35)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
        >
          <DiscordIcon />
          {isLoading ? "Redirection..." : "Continuer avec Discord"}
        </Button>

        <p className="text-xs text-muted-foreground text-center max-w-xs">
          Pas encore la formation ?{" "}
          <Link href="/" className="text-primary hover:underline">
            Découvre Amour Studios
          </Link>
        </p>
      </div>
    </main>
  );
}

function DiscordIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
