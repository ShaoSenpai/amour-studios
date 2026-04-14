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
      "bg-[color:var(--state-done-bg)] text-[color:var(--state-done-fg)] border-[color:var(--state-done-bg)]",
    alert:
      "bg-[#FF6B1F] text-[#0D0B08] border-[#FF6B1F]",
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
