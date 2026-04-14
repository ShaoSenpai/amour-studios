"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function LessonMetaBar({
  moduleTitle,
  moduleAccent,
  lessonOrder,
  lessonTotal,
  xpReward,
}: {
  moduleTitle: string;
  moduleAccent?: string;
  lessonOrder: number;
  lessonTotal: number;
  xpReward: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/20 bg-foreground/[0.06] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[1.5px]" style={{ fontFamily: "var(--font-body)" }}>
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-foreground/65 transition-colors hover:text-foreground"
        style={{ minHeight: 0 }}
      >
        <ChevronLeft size={12} />
        Dashboard
      </Link>
      <div className="flex items-center gap-3 text-foreground/75">
        <span
          className="italic text-[14px]"
          style={{ fontFamily: "var(--font-serif)", color: moduleAccent ?? "#FF6B1F" }}
        >
          {moduleTitle}
        </span>
        <span>·</span>
        <span>LEÇON {String(lessonOrder).padStart(2, "0")} / {String(lessonTotal).padStart(2, "0")}</span>
        <span>·</span>
        <span
          className="px-2 py-[2px] font-bold"
          style={{ background: "var(--state-done-bg)", color: "var(--state-done-fg)" }}
        >
          +{xpReward} XP
        </span>
      </div>
    </div>
  );
}
