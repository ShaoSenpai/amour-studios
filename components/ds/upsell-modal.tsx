"use client";

import * as React from "react";
import { X, Lock, ArrowRight, Check, Zap } from "lucide-react";

export function UpsellModal({
  open,
  onClose,
  moduleTitle,
}: {
  open: boolean;
  onClose: () => void;
  moduleTitle?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop blur */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[#0D0B08]/85"
        style={{ backdropFilter: "blur(8px)" }}
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="ds-reveal relative w-full max-w-lg overflow-hidden border border-foreground/15 bg-background"
      >
        {/* Header avec accent orange */}
        <div className="relative bg-[#FFB347] px-6 py-5 text-[#0D0B08] md:px-8">
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
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Lock size={11} />
            ◦ MODULE VERROUILLÉ
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
          <p
            className="mb-5 font-mono text-sm text-foreground/80 leading-relaxed"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {moduleTitle ? (
              <>
                Le module <strong className="italic text-foreground" style={{ fontFamily: "var(--font-serif)" }}>{moduleTitle}</strong> fait partie de la formation complète.
              </>
            ) : (
              <>Cette section fait partie de la formation complète.</>
            )}
          </p>

          {/* Bénéfices */}
          <ul
            className="mb-6 flex flex-col gap-3 font-mono text-[12px] text-foreground/80"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {[
              "06 modules — 20+ leçons vidéo",
              "Accès à la communauté Discord VIP",
              "Vision Board, scripts, templates inclus",
              "Accès à vie — ton rythme",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <Check size={14} className="mt-[3px] shrink-0 text-[color:var(--state-done)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Prix */}
          <div className="mb-5 flex items-baseline gap-3 border-t border-foreground/10 pt-5">
            <span
              className="text-4xl italic leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              497 €
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              en une fois · accès à vie
            </span>
          </div>

          {/* CTA */}
          <a
            href="https://www.amourstudios.fr/paiement"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full items-center justify-center gap-2.5 bg-[#FFB347] px-6 py-4 font-mono text-[12px] font-bold uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:pr-8"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Zap size={14} />
            DÉBLOQUER MAINTENANT
            <ArrowRight
              size={14}
              className="transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
            />
          </a>

          <p
            className="mt-3 text-center font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/40"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Apple Pay · Google Pay · CB · 7j satisfait ou remboursé
          </p>
        </div>
      </div>
    </div>
  );
}
