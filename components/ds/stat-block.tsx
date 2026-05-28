"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Luminance simple pour choisir un texte lisible sur un fond hex. */
function isDark(hex: string): boolean {
  const m = hex.replace("#", "");
  if (m.length < 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // luminance perçue
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}

export function StatBlock({
  label,
  value,
  unit,
  sub,
  accent = "#2B7A6F",
  variant = "outline",
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: string;
  variant?: "outline" | "filled";
  className?: string;
}) {
  if (variant === "filled") {
    // Texte lisible : clair si l'accent est foncé (ink), sinon sombre.
    const fg = isDark(accent) ? "#FFFFFF" : "#0D0B08";
    return (
      <div
        className={cn(
          "relative flex min-h-[140px] flex-col justify-between overflow-hidden p-5 transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] hover:-translate-y-1",
          className
        )}
        style={{ background: accent, color: fg }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[2.5px] opacity-70"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          ◦ {label}
        </div>
        <div
          className="text-5xl italic leading-none"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {value}
          {unit && <span className="ml-1 text-2xl opacity-60">{unit}</span>}
        </div>
        {sub && (
          <div
            className="font-mono text-[10px] opacity-60"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {sub}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-foreground/15 bg-foreground/[0.04] p-5 transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:bg-foreground/[0.08]",
        className
      )}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
      }}
    >
      <div
        className="mb-2 font-mono text-[9px] uppercase tracking-[2.5px] text-foreground/50"
        style={{ fontFamily: "var(--font-body-legacy)" }}
      >
        ◦ {label}
      </div>
      <div
        className="text-4xl italic leading-none"
        style={{ color: accent, fontFamily: "var(--font-serif)" }}
      >
        {value}
        {unit && <span className="ml-1 text-xl opacity-60">{unit}</span>}
      </div>
      {sub && (
        <div
          className="mt-1 font-mono text-[10px] text-foreground/50"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
