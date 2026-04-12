"use client";

import * as React from "react";
import Link from "next/link";
import { Pill } from "./pill";
import { cn } from "@/lib/utils";

export type ModuleCardState = "completed" | "in-progress" | "upcoming" | "locked";

const ACCENT_BY_ORDER = [
  "#F5B820",
  "#FF6B1F",
  "#E63326",
  "#F2B8A2",
  "#2B7A6F",
  "#0D4D35",
];

export function ModuleCard({
  href,
  order,
  title,
  italicWord,
  description,
  state,
  completed = 0,
  total = 0,
  span = 2,
}: {
  href: string;
  order: number;
  title: string;
  italicWord?: string;
  description?: string;
  badgeLabel?: string;
  state: ModuleCardState;
  completed?: number;
  total?: number;
  span?: 2 | 3 | 4 | 6;
}) {
  const accent = ACCENT_BY_ORDER[order % ACCENT_BY_ORDER.length];
  const isLocked = state === "locked";
  const spanClass = {
    2: "col-span-2",
    3: "col-span-2 md:col-span-3",
    4: "col-span-2 md:col-span-4",
    6: "col-span-2 md:col-span-4 lg:col-span-6",
  }[span];

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleNode = (
      <>
        {before}
        <em className="italic">{italicWord}</em>
        {after}
      </>
    );
  }

  const body = (
    <>
      <div
        className="text-xl italic opacity-80"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {String(order + 1).padStart(2, "0")}
      </div>
      <h3
        className="text-2xl font-normal leading-[1.05] md:text-3xl"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {titleNode}
      </h3>
      {description && (
        <p
          className="mt-3 max-w-[240px] font-mono text-[11px] opacity-75"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {description}
        </p>
      )}
      <div
        className="mt-auto flex items-center gap-2 pt-4 font-mono text-[9px] uppercase tracking-[1.5px]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <Pill variant={isLocked ? "locked" : "neutral"}>
          {state === "completed" && "✓ COMPLÉTÉ"}
          {state === "in-progress" && "EN COURS"}
          {state === "upcoming" && "À VENIR"}
          {state === "locked" && "◉ LOCKED"}
        </Pill>
        {total > 0 && state !== "locked" && (
          <>
            <span>
              {String(completed).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {state === "in-progress" && (
              <>
                <div className="relative ml-1 h-[2px] flex-1 bg-current/20">
                  <div
                    className="absolute inset-y-0 left-0 bg-current transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span>{percent}%</span>
              </>
            )}
          </>
        )}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 right-5 text-[40px] italic opacity-50 transition-all duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1.5 group-hover:opacity-100"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        →
      </span>
    </>
  );

  const baseClasses = cn(
    "group relative flex min-h-[200px] flex-col overflow-hidden p-6 transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] hover:-translate-y-1",
    spanClass
  );

  if (isLocked) {
    return (
      <div
        className={cn(
          baseClasses,
          "cursor-not-allowed border border-dashed border-foreground/15 bg-foreground/[0.04] text-foreground/40"
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={baseClasses}
      style={{ background: accent, color: "#0D0B08" }}
    >
      {body}
    </Link>
  );
}
