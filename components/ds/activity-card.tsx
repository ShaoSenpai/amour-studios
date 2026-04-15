import * as React from "react";
import { cn } from "@/lib/utils";
import { Play, Trophy, Users, Megaphone, type LucideIcon } from "lucide-react";

export type ActivityKind = "lesson" | "badge" | "community" | "news";

const ICON_BY_KIND: Record<ActivityKind, LucideIcon> = {
  lesson: Play,
  badge: Trophy,
  community: Users,
  news: Megaphone,
};

export function ActivityCard({
  kind = "news",
  label,
  title,
  body,
  href,
  ctaLabel,
  timestamp,
  live = false,
  className,
}: {
  kind?: ActivityKind;
  label: string;
  title: string;
  body: string;
  href?: string;
  ctaLabel?: string;
  timestamp?: string;
  live?: boolean;
  className?: string;
}) {
  const Icon = ICON_BY_KIND[kind];
  const Wrapper: React.ElementType = href ? "a" : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "group flex items-center gap-4 border-b border-foreground/10 px-4 py-3 transition-colors last:border-b-0",
        href && "hover:bg-foreground/[0.03] cursor-pointer",
        className
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center border border-foreground/15 bg-foreground/[0.04] text-foreground/70">
        <Icon size={14} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="ds-label mb-0.5 flex items-center gap-2 text-foreground/50">
          <span>{label}</span>
          {live && (
            <span
              aria-label="Live"
              className="h-1.5 w-1.5 rounded-full ds-pulse"
              style={{ background: "var(--state-done)" }}
            />
          )}
          {timestamp && (
            <>
              <span className="opacity-40">·</span>
              <span>{timestamp}</span>
            </>
          )}
        </div>
        <div className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {title}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-foreground/60">
          {body}
        </div>
      </div>

      {href && ctaLabel && (
        <div className="ds-label hidden shrink-0 text-foreground/60 transition-colors group-hover:text-foreground sm:block">
          {ctaLabel} →
        </div>
      )}
    </Wrapper>
  );
}
