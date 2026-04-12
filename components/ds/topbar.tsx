"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pill } from "./pill";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Search } from "lucide-react";

export function Topbar() {
  const user = useQuery(api.users.current);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!user) return null;

  const xp = user.xp ?? 0;
  const level = Math.floor(xp / 500) + 1;
  const isVip = !!user.purchaseId;

  return (
    <div className="sticky top-0 z-30 border-b border-foreground/15 bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 md:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-serif text-xl italic text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <span className="h-2 w-2 rounded-full bg-[#00FF85] ds-pulse" aria-hidden />
          <span className="hidden sm:inline">Amour Studios</span>
          <span className="sm:hidden">A.</span>
        </Link>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/dashboard?q=${encodeURIComponent(query.trim())}`);
          }}
          className="flex items-center gap-2 border border-foreground/15 bg-foreground/[0.03] px-3 py-2"
        >
          <Search size={14} className="text-foreground/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une leçon, une note…"
            className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-foreground/40"
            style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
          />
          <kbd className="hidden sm:inline border border-foreground/20 px-[5px] py-[1px] font-mono text-[9px] tracking-wider text-foreground/60">
            ⌘K
          </kbd>
        </form>

        <div className="flex items-center gap-2 md:gap-3">
          <Pill variant={isVip ? "success" : "alert"} className="hidden sm:inline-flex">
            ● {isVip ? "VIP ACTIF" : "EN ATTENTE"}
          </Pill>
          <span className="hidden font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 md:inline" style={{ fontFamily: "var(--font-body)" }}>
            NIV.{String(level).padStart(2, "0")} · {xp.toLocaleString("fr-FR")} XP
          </span>
          <NotificationBell />
          <ThemeToggle />
          <Link
            href="/dashboard/profile"
            className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-[#FF6B1F] font-serif text-sm italic text-[#0D0B08]"
            style={{ fontFamily: "var(--font-serif)", minHeight: 0 }}
            aria-label="Profil"
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-full object-cover" />
            ) : (
              (user.name ?? "?")[0]?.toUpperCase()
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
