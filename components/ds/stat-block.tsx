"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function StatBlock({
  label,
  value,
  unit,
  sub,
  accent = "#00FF85",
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
    return (
      <div
        className={cn(
          "relative flex min-h-[140px] flex-col justify-between overflow-hidden p-5 transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] hover:-translate-y-1",
          className
        )}
        style={{ background: accent, color: "#0D0B08" }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-[2.5px] opacity-70"
          style={{ fontFamily: "var(--font-body)" }}
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
            style={{ fontFamily: "var(--font-body)" }}
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
        style={{ fontFamily: "var(--font-body)" }}
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
          style={{ fontFamily: "var(--font-body)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
