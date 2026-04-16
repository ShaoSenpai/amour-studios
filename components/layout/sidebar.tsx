"use client";

import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Logo } from "./logo";
import { XpBar } from "@/components/gamification/xp-bar";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { useSidebar } from "./sidebar-provider";
import { useEffectiveRole } from "@/components/providers/view-mode-provider";
import {
  Home,
  LayoutGrid,
  Users,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  MessageCircle,
  Gauge,
  Wrench,
} from "lucide-react";
// CSS transitions only — framer-motion removed for Next.js 16 compat

export function Sidebar() {
  const user = useQuery(api.users.current);
  const { signOut } = useAuthActions();
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const effectiveRole = useEffectiveRole(user?.role);

  if (!user) return null;

  const isAdmin = effectiveRole === "admin";
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;

  return (
    <aside
      className={`hidden md:flex fixed left-0 top-0 bottom-0 flex-col bg-background border-r border-border z-40 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
    >
      {/* ── Header: Logo centré ── */}
      <div className="h-14 flex items-center justify-center border-b border-border shrink-0 px-3">
        {!collapsed ? (
          <Logo size="sm" />
        ) : (
          <span className="font-display text-sm text-foreground">A</span>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto px-2">
        <NavItem href="/dashboard" icon={Home} label="La formation" active={pathname === "/dashboard"} collapsed={collapsed} />
        <NavItem href="/dashboard/outils" icon={Wrench} label="Mes outils" active={pathname.startsWith("/dashboard/outils")} collapsed={collapsed} />

        {isAdmin && (
          <>
            {!collapsed && (
              <div className="px-3 pt-5 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[2px] text-foreground/25">Admin</span>
              </div>
            )}
            {collapsed && <div className="my-2 mx-2 border-t border-border" />}
            <NavItem href="/admin" icon={Gauge} label="Cockpit" active={pathname === "/admin"} collapsed={collapsed} />
            <NavItem href="/admin/content" icon={LayoutGrid} label="Contenu" active={pathname.startsWith("/admin/content")} collapsed={collapsed} />
            <NavItem href="/admin/members" icon={Users} label="Membres" active={pathname.startsWith("/admin/members")} collapsed={collapsed} />
          </>
        )}

        <div className="flex-1" />

        {discordInvite && (
          <>
            {!collapsed && (
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-[2px] text-foreground/25">Communauté</span>
              </div>
            )}
            {collapsed && <div className="my-2 mx-2 border-t border-border" />}
            <NavItem
              href={discordInvite}
              icon={MessageCircle}
              label="Discord"
              active={false}
              collapsed={collapsed}
              external
            />
          </>
        )}

        {!collapsed && (
          <div className="px-3 pt-3 pb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[2px] text-foreground/25">Compte</span>
          </div>
        )}
        {collapsed && <div className="my-2 mx-2 border-t border-border" />}
        <NavItem href="/dashboard/profile" icon={User} label="Mon profil" active={pathname === "/dashboard/profile"} collapsed={collapsed} />
      </nav>

      {/* ── Footer ── */}
      <div className={`border-t border-border ${collapsed ? "py-3 px-2" : "p-4"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link href="/dashboard/profile" title="Profil">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-8 rounded-full border border-white/10 hover:border-primary/40 transition-colors" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="size-8 rounded-full bg-muted/50 flex items-center justify-center text-[11px] text-foreground/60 hover:bg-primary/10 transition-colors">
                  {user.name?.[0] ?? "?"}
                </div>
              )}
            </Link>
            <button
              onClick={toggle}
              title="Ouvrir le menu"
              aria-label="Ouvrir le menu"
              className="p-1.5 rounded-lg text-foreground/30 hover:text-foreground/60 hover:bg-muted/50 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div>
            <Link href="/dashboard/profile" className="flex items-center gap-3 mb-3 group">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-9 rounded-full border border-white/10 group-hover:border-primary/40 transition-colors" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="size-9 rounded-full bg-muted/50 flex items-center justify-center text-xs text-foreground/60 group-hover:bg-primary/10 transition-colors">
                  {user.name?.[0] ?? "?"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground/90 group-hover:text-primary transition-colors">
                  {user.name}
                </p>
                <XpBar xp={user.xp ?? 0} />
              </div>
            </Link>

            <div className="flex items-center justify-between mb-3">
              <StreakBadge days={user.streakDays ?? 0} />
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={toggle}
                title="Réduire le menu"
                aria-label="Réduire le menu"
                className="p-1.5 rounded-lg text-foreground/30 hover:text-foreground/60 hover:bg-muted/50 transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => signOut()}
                title="Déconnexion"
                className="p-1.5 rounded-lg text-foreground/30 hover:text-red-400/80 hover:bg-red-400/5 transition-all"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  external?: boolean;
}) {
  const className = `flex items-center gap-3 h-10 rounded-lg text-sm transition-all duration-200 ${
    collapsed ? "justify-center w-10 mx-auto px-0" : "px-3"
  } ${
    active
      ? "bg-primary/10 text-primary"
      : "text-foreground/40 hover:text-foreground/80 hover:bg-muted/30"
  }`;

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={collapsed ? label : undefined}
        className={className}
      >
        <Icon size={18} />
        {!collapsed && <span>{label}</span>}
      </a>
    );
  }

  return (
    <Link href={href} title={collapsed ? label : undefined} className={className}>
      <Icon size={18} />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
