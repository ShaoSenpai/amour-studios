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
        <em className="italic text-foreground">{italicWord}</em>
        {after}
      </>
    );
  }

  return (
    <section className={cn("ds-reveal", className)}>
      <div className="relative overflow-hidden p-4 text-foreground md:p-6">
        <div
          className="mb-3 font-mono text-[10px] uppercase tracking-[3px] opacity-55"
          style={{ fontFamily: "var(--font-body-legacy)" }}
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
            style={{ fontFamily: "var(--font-body-legacy)" }}
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
          <div className="mt-10 border-t border-foreground/20 pt-5">
            {progress.completed === 0 ? (
              <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[2px] opacity-70" style={{ fontFamily: "var(--font-body-legacy)" }}>
                <span>◦ Prêt à commencer</span>
                <span>Module 01 en premier</span>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-baseline justify-between text-[10px] uppercase tracking-[2px] opacity-70" style={{ fontFamily: "var(--font-body-legacy)" }}>
                  <span>◦ Progression</span>
                  <span>
                    <span className="font-bold" style={{ color: "var(--state-done)" }}>
                      {progress.percent}%
                    </span>
                    <span className="mx-2 opacity-40">·</span>
                    <span>{progress.completed}/{progress.total} leçons</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="ds-progress-fill h-full rounded-full"
                    style={{
                      width: `${progress.percent}%`,
                      background: "linear-gradient(90deg, var(--progress-grad-from), var(--progress-grad-to))",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
