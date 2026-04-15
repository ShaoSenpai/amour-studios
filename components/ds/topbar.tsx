"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pill } from "./pill";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useViewMode } from "@/components/providers/view-mode-provider";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { Search, Eye, EyeOff } from "lucide-react";

export function Topbar() {
  const user = useQuery(api.users.current);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const { viewMode, cycle } = useViewMode();
  const { collapsed } = useSidebar();

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
  const isVip = !!user.purchaseId || user.role === "admin";

  return (
    <div
      className={`sticky top-0 z-30 border-b border-foreground/15 bg-background/90 backdrop-blur-md transition-[padding-left] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
        collapsed ? "md:pl-[68px]" : "md:pl-[240px]"
      }`}
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 md:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-serif text-xl italic text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
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
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          />
          <kbd className="hidden sm:inline border border-foreground/20 px-[5px] py-[1px] font-mono text-[9px] tracking-wider text-foreground/60">
            ⌘K
          </kbd>
        </form>

        <div className="flex items-center gap-2 md:gap-3">
          {/* Cycle vue admin → vip → preview — visible uniquement pour les vrais admins */}
          {user.role === "admin" && (
            <button
              type="button"
              onClick={cycle}
              title={`Basculer la vue (actuel : ${viewMode}). Cycle : admin → vip → preview gratuit → admin`}
              className={`hidden md:flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                viewMode === "admin"
                  ? "border-foreground/25 bg-foreground/[0.05] text-foreground/70 hover:text-foreground"
                  : viewMode === "vip"
                  ? "border-[color:var(--state-done-bg)] bg-[color:var(--state-done-bg)] text-[color:var(--state-done-fg)]"
                  : "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
              }`}
              style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
            >
              {viewMode === "admin" ? <Eye size={11} /> : <EyeOff size={11} />}
              {viewMode === "admin"
                ? "VUE ADMIN"
                : viewMode === "vip"
                ? "VUE MEMBRE VIP"
                : "VUE PREVIEW"}
            </button>
          )}

          <Pill variant={isVip ? "success" : "alert"} className="hidden sm:inline-flex">
            ● {isVip ? "VIP ACTIF" : "EN ATTENTE"}
          </Pill>
          <span className="hidden font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 md:inline" style={{ fontFamily: "var(--font-body-legacy)" }}>
            NIV.{String(level).padStart(2, "0")} · {xp.toLocaleString("fr-FR")} XP
          </span>
          <NotificationBell />
          <ThemeToggle />
          <Link
            href="/dashboard/profile"
            className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-foreground font-serif text-sm italic text-background"
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
