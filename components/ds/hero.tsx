"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "@/lib/use-animated-number";

const STORAGE_KEY = "amour-dashboard-progress";

function readLastSeen(): { completed: number; total: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.completed === "number" &&
      typeof parsed?.total === "number"
    ) {
      return parsed;
    }
  } catch {}
  return null;
}

function writeLastSeen(completed: number, total: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ completed, total })
    );
  } catch {}
}

export function Hero({
  caption,
  title,
  italicWord,
  ctaLabel,
  ctaHref,
  progress,
  progressUnit = "leçons",
  progressLabel = "Progression",
  className,
}: {
  caption: string;
  title: string;
  italicWord?: string;
  ctaLabel?: string;
  ctaHref?: string;
  progress?: { percent: number; completed: number; total: number };
  progressUnit?: string;
  progressLabel?: string;
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

  // Initial = dernière valeur vue (localStorage). Tween vers la valeur actuelle.
  const initialCompleted = React.useMemo(() => {
    if (!progress) return undefined;
    const seen = readLastSeen();
    if (!seen) return progress.completed; // pas d'animation au premier passage
    // Si le total a changé (nouveaux modules) on évite de tween avec des
    // données incohérentes — on saute directement à la cible.
    if (seen.total !== progress.total) return progress.completed;
    // Si l'utilisateur a moins qu'avant (edge case) → pas d'anim
    if (seen.completed > progress.completed) return progress.completed;
    return seen.completed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedCompleted = useAnimatedNumber(progress?.completed ?? 0, {
    duration: 1800,
    initial: initialCompleted,
  });

  const displayCompleted = Math.floor(animatedCompleted);
  const displayPercent = progress?.total
    ? Math.round((animatedCompleted / progress.total) * 100)
    : 0;

  const completedToSave = progress?.completed;
  const totalToSave = progress?.total;
  React.useEffect(() => {
    if (completedToSave == null || totalToSave == null) return;
    const t = setTimeout(() => {
      writeLastSeen(completedToSave, totalToSave);
    }, 2000);
    return () => clearTimeout(t);
  }, [completedToSave, totalToSave]);

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
                  <span>◦ {progressLabel}</span>
                  <span className="tabular-nums">
                    <span className="font-bold" style={{ color: "var(--state-done)" }}>
                      {displayPercent}%
                    </span>
                    <span className="mx-2 opacity-40">·</span>
                    <span>{displayCompleted}/{progress.total} {progressUnit}</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="ds-progress-fill h-full rounded-full"
                    style={{
                      width: `${displayPercent}%`,
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
