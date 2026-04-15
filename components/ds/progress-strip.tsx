import * as React from "react";
import { cn } from "@/lib/utils";

export function ProgressStrip({
  label = "ROUTE COMPLÈTE",
  percent,
  fraction,
  className,
}: {
  label?: string;
  percent: number;
  fraction?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto_auto] items-center gap-5 border border-foreground/15 bg-foreground/[0.04] px-5 py-4",
        className
      )}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
        style={{ fontFamily: "var(--font-body-legacy)" }}
      >
        ◦ {label}
      </span>
      <div className="relative h-[3px] bg-foreground/10">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
          style={{
            width: `${clamped}%`,
            background: "linear-gradient(90deg, var(--progress-grad-from), var(--progress-grad-to))",
          }}
        />
      </div>
      <span
        className="text-xl italic text-[color:var(--state-done)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {clamped}%
      </span>
      {fraction && (
        <span
          className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {fraction}
        </span>
      )}
    </div>
  );
}
