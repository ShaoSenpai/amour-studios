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
      "bg-[rgba(0,255,133,0.12)] text-[#00FF85] border-[rgba(0,255,133,0.35)]",
    alert:
      "bg-[rgba(255,107,31,0.12)] text-[#FF6B1F] border-[rgba(255,107,31,0.35)]",
    neutral:
      "bg-foreground/[0.06] text-foreground/80 border-foreground/15",
    locked:
      "bg-transparent text-foreground/40 border-foreground/15 border-dashed",
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
