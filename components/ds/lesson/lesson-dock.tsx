"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type DockKey = "exos" | "notes" | "comments" | "module";

export function LessonDock({
  active,
  onSelect,
  counts,
}: {
  active: DockKey | null;
  onSelect: (k: DockKey | null) => void;
  counts: Partial<Record<DockKey, number | undefined>>;
}) {
  const items: { key: DockKey; icon: string; label: string }[] = [
    { key: "exos", icon: "✎", label: "Exos" },
    { key: "notes", icon: "¶", label: "Notes" },
    { key: "comments", icon: "◌", label: "Com." },
    { key: "module", icon: "≡", label: "Module" },
  ];

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") { e.preventDefault(); onSelect("exos"); }
      if (e.key === "2") { e.preventDefault(); onSelect("notes"); }
      if (e.key === "3") { e.preventDefault(); onSelect("comments"); }
      if (e.key === "4") { e.preventDefault(); onSelect("module"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onSelect]);

  // Masqué quand un panneau est ouvert (fermer via × ESC ou Escape)
  const hidden = active !== null;
  return (
    <div
      className={cn(
        "fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 flex-row gap-2 safe-area-bottom transition-all duration-300 md:bottom-auto md:left-auto md:top-1/2 md:right-4 md:-translate-x-0 md:-translate-y-1/2 md:flex-col",
        hidden ? "pointer-events-none opacity-0 md:translate-x-[120%]" : "pointer-events-auto opacity-100"
      )}
    >
      {items.map((it) => {
        const isActive = active === it.key;
        const count = counts[it.key];
        return (
          <button
            key={it.key}
            onClick={() => onSelect(isActive ? null : it.key)}
            className={cn(
              "relative flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border font-mono text-[8px] uppercase tracking-[1.5px] transition-all duration-500 [transition-timing-function:var(--ease-reveal)]",
              isActive
                ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08] shadow-lg"
                : "border-foreground/25 bg-foreground/[0.08] text-foreground hover:-translate-y-0.5 hover:border-foreground/45 hover:bg-foreground/[0.14]"
            )}
            style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
            aria-label={it.label}
          >
            <span
              className="text-2xl italic leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {it.icon}
            </span>
            <span>{it.label}</span>
            {typeof count === "number" && count > 0 && (
              <span
                className={cn(
                  "absolute -right-1 -top-1 px-[5px] py-0 font-mono text-[8px] font-bold",
                  isActive ? "bg-[#0D0B08] text-[#FF6B1F]" : "bg-[#FF6B1F] text-[#0D0B08]"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
