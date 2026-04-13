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
    <div className="flex flex-wrap items-center justify-between gap-2 border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[1.5px]" style={{ fontFamily: "var(--font-body)" }}>
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-foreground/50 transition-colors hover:text-foreground"
        style={{ minHeight: 0 }}
      >
        <ChevronLeft size={12} />
        Dashboard
      </Link>
      <div className="flex items-center gap-3 text-foreground/60">
        <span
          className="italic text-[14px]"
          style={{ fontFamily: "var(--font-serif)", color: moduleAccent ?? "#FF6B1F" }}
        >
          {moduleTitle}
        </span>
        <span>·</span>
        <span>LEÇON {String(lessonOrder).padStart(2, "0")} / {String(lessonTotal).padStart(2, "0")}</span>
        <span>·</span>
        <span className="border border-[rgba(0,255,133,0.35)] bg-[rgba(0,255,133,0.15)] px-2 py-[2px] text-[#00FF85]">
          +{xpReward} XP
        </span>
      </div>
    </div>
  );
}
