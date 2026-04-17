"use client";

import * as React from "react";
import { Lock, ArrowRight } from "lucide-react";

export function UpsellBanner({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative mb-6 flex w-full items-center gap-3 overflow-hidden border border-[#FF6B1F]/30 bg-[rgba(255,107,31,0.08)] px-4 py-3 text-left transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:bg-[rgba(255,107,31,0.14)] hover:border-[#FF6B1F]/55 md:px-6 md:py-4"
      style={{ minHeight: 0 }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="text-base italic leading-tight text-foreground md:text-lg"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Tu vois <em className="text-[#FF6B1F]">5 %</em> de la formation.
        </div>
        <div
          className="mt-0.5 font-mono text-[10px] text-foreground/55 md:text-[11px]"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          06 modules · 20+ leçons · Discord VIP · accès à vie
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5 bg-[#FF6B1F] px-3 py-2 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:tracking-[3px] group-hover:pr-4 md:px-4 md:py-2.5 md:text-[11px]"
        style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
      >
        <Lock size={11} />
        <span className="hidden sm:inline">DÉBLOQUER</span>
        <span className="sm:hidden">497 €</span>
        <ArrowRight
          size={12}
          className="transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
        />
      </div>
    </button>
  );
}
