import * as React from "react";
import { cn } from "@/lib/utils";

export type PillVariant = "success" | "alert" | "neutral" | "locked";

export function Pill({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: PillVariant;
  className?: string;
}) {
  const variants: Record<PillVariant, string> = {
    success:
      "bg-[color:color-mix(in_srgb,var(--state-done)_15%,transparent)] text-[color:var(--state-done)] border-[color:color-mix(in_srgb,var(--state-done)_40%,transparent)]",
    alert:
      "bg-[rgba(255,107,31,0.15)] text-[#FF6B1F] border-[rgba(255,107,31,0.4)]",
    neutral:
      "bg-foreground/[0.06] text-foreground/80 border-foreground/20",
    locked:
      "bg-transparent text-foreground/50 border-foreground/20 border-dashed",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[2px]",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
