import * as React from "react";
import { cn } from "@/lib/utils";

export function ActivityCard({
  label,
  title,
  italicWord,
  body,
  live = false,
  className,
}: {
  label: string;
  title: string;
  italicWord?: string;
  body: string;
  live?: boolean;
  className?: string;
}) {
  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleNode = (
      <>
        {before}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {after}
      </>
    );
  }

  return (
    <div
      className={cn(
        "relative border border-foreground/15 bg-foreground/[0.04] p-5",
        className
      )}
    >
      {live && (
        <span
          aria-label="Live"
          className="absolute right-5 top-5 h-1.5 w-1.5 rounded-full bg-[#00FF85] ds-pulse"
        />
      )}
      <div
        className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ {label}
      </div>
      <h4
        className="mb-2 text-xl font-normal leading-tight"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {titleNode}
      </h4>
      <p
        className="font-mono text-[11px] leading-relaxed text-foreground/65"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {body}
      </p>
    </div>
  );
}
