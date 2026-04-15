"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type PanelWidth = "narrow" | "wide";

export function LessonPanel({
  open,
  onClose,
  title,
  italicWord,
  width = "narrow",
  headerRight,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  italicWord?: string;
  width?: PanelWidth;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [b, a] = title.split(italicWord);
    titleNode = (
      <>
        {b}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {a}
      </>
    );
  }

  return (
    <aside
      className={cn(
        "ds-panel fixed right-0 top-[var(--topbar-h)] z-40 flex flex-col overflow-y-auto border-l border-foreground/15 bg-background",
        width === "wide" ? "w-full md:w-[55vw]" : "w-full md:w-[420px]"
      )}
      style={{ height: "calc(100vh - var(--topbar-h))" }}
    >
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-foreground/15 bg-background px-6 py-4">
        <h2
          className="truncate text-3xl font-normal leading-none"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {titleNode}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {headerRight}
          <button
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="flex h-8 items-center justify-center gap-1 border border-foreground/20 bg-foreground/[0.04] px-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:bg-foreground/[0.08]"
            style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
          >
            <X size={12} />
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>
      </div>
      <div className="flex-1 px-6 py-6">{children}</div>
    </aside>
  );
}
