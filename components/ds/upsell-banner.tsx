"use client";

import * as React from "react";
import { Lock, Sparkles, ArrowRight } from "lucide-react";

export function UpsellBanner({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative mb-6 flex w-full items-center justify-between gap-4 overflow-hidden border border-[#FFB347]/30 bg-[rgba(255,179,71,0.08)] px-5 py-4 text-left transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:bg-[rgba(255,179,71,0.14)] hover:border-[#FFB347]/55 md:px-7 md:py-5"
      style={{ minHeight: 0 }}
    >
      <div className="flex items-center gap-4 md:gap-5">
        <div className="flex size-10 shrink-0 items-center justify-center bg-[#FFB347] text-[#0D0B08]">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <div
            className="font-mono text-[10px] uppercase tracking-[2px] text-[#FFB347]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ MODE PREVIEW · ACCÈS PARTIEL
          </div>
          <div
            className="mt-1 text-xl italic leading-tight text-foreground md:text-2xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Tu vois <em className="text-[#FFB347]">5 % de la formation.</em>
          </div>
          <div
            className="mt-1 font-mono text-[11px] text-foreground/65 md:text-[12px]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Débloque les <strong className="text-foreground">06 modules</strong>,{" "}
            <strong className="text-foreground">20+ leçons</strong> et la communauté VIP — accès à vie.
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <span
          className="hidden font-mono text-[11px] uppercase tracking-[1.5px] text-foreground/70 sm:inline"
          style={{ fontFamily: "var(--font-body)" }}
        >
          DÈS 497 €
        </span>
        <div className="flex items-center gap-2 bg-[#FFB347] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:tracking-[3px] group-hover:pr-5">
          <Lock size={12} />
          <span>DÉBLOQUER</span>
          <ArrowRight
            size={13}
            className="transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
          />
        </div>
      </div>
    </button>
  );
}
