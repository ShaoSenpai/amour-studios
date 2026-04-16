"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main
      className="ds-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground"
    >
      <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6">
        <p className="ds-label text-[#FF6B1F]">◦ Erreur application</p>
        <h1 className="ds-display">
          Oups, <em className="italic">ça a planté.</em>
        </h1>
        <p className="ds-body text-foreground/80">{error?.message || "Erreur inconnue."}</p>
        {error?.digest && (
          <p
            className="font-mono text-[10px] text-foreground/40"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ref : {error.digest}
          </p>
        )}
        {error?.stack && (
          <pre
            className="max-h-80 overflow-auto border border-foreground/15 bg-foreground/[0.04] p-3 font-mono text-[10px] leading-snug text-foreground/60"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {error.stack.split("\n").slice(0, 25).join("\n")}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-[#FFB347] px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-[2px] text-[#0D0B08]"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            Réessayer
          </button>
          <a
            href="/login"
            className="border border-foreground/20 bg-foreground/[0.04] px-5 py-3 font-mono text-[11px] font-bold uppercase tracking-[2px] text-foreground/80"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            Retour login
          </a>
        </div>
      </div>
    </main>
  );
}
