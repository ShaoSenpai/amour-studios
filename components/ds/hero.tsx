"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Hero({
  caption,
  title,
  italicWord,
  ctaLabel,
  ctaHref,
  progress,
  className,
}: {
  caption: string;
  title: string;
  italicWord?: string;
  ctaLabel?: string;
  ctaHref?: string;
  progress?: { percent: number; completed: number; total: number };
  className?: string;
}) {
  let titleRender: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleRender = (
      <>
        {before}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {after}
      </>
    );
  }

  return (
    <section className={cn("ds-reveal", className)}>
      <div
        className="relative overflow-hidden rounded-md p-8 text-[#0D0B08] md:p-12"
        style={{
          background: "var(--hero-bg)",
        }}
      >
        <div
          className="mb-3 font-mono text-[10px] uppercase tracking-[3px] opacity-55"
          style={{ fontFamily: "var(--font-body)" }}
        >
          — {caption}
        </div>
        <h1
          className="mb-6 text-[clamp(42px,5.5vw,72px)] font-normal leading-[0.95] tracking-[-2px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {titleRender}
        </h1>
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-2.5 rounded-sm bg-[#0D0B08] px-5 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#F0E9DB] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:pr-7"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {ctaLabel}
            <span
              className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              →
            </span>
          </Link>
        )}

        {progress && (
          <div className="mt-10 border-t border-[#0D0B08]/15 pt-5">
            <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[2px] opacity-70" style={{ fontFamily: "var(--font-body)" }}>
              <span>◦ Progression</span>
              <span>
                <span className="font-bold" style={{ color: "#0D4D35" }}>
                  {progress.percent}%
                </span>
                <span className="mx-2 opacity-40">·</span>
                <span>{progress.completed}/{progress.total} leçons</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#0D0B08]/10">
              <div
                className="ds-progress-fill h-full rounded-full"
                style={{
                  width: `${progress.percent}%`,
                  background: "linear-gradient(90deg, #0D4D35 0%, #FF6B1F 100%)",
                }}
              />
            </div>
          </div>
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-6 -right-6 text-[260px] italic leading-[0.7] opacity-[0.06]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          ·
        </span>
      </div>
    </section>
  );
}
