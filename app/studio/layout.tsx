"use client";

import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  useIsMobile,
  mono,
  Avatar,
  GlassButton,
} from "./_components/glass";
import {
  TestModeProvider,
  TestModeToggle,
  TestModeBadge,
} from "./_components/test-mode";
import { PageTransition } from "./_components/page-transition";

// ============================================================================
// Shell du back-office /studio — sidebar Glass + toggle thème + admin-gate.
// Aucun lien vers la plateforme formation. Les queries Convex sont déjà
// admin-gated côté serveur ; ce gate UI évite juste d'afficher l'app à un
// non-admin.
// ============================================================================

const NAV = [
  { href: "/studio", label: "Aujourd'hui", icon: "◐", exact: true },
  { href: "/studio/eleves", label: "Élèves", icon: "◉", exact: false },
  { href: "/studio/calendrier", label: "Calendrier", icon: "◫", exact: false },
  { href: "/studio/paiements", label: "Paiements", icon: "◇", exact: false },
  { href: "/studio/campagnes", label: "Campagnes", icon: "◗", exact: false },
  { href: "/studio/transcripts", label: "Transcripts", icon: "◍", exact: false },
];

export default function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // La page login a son propre chrome (pas de sidebar).
  if (pathname === "/studio/login") {
    return <>{children}</>;
  }

  return (
    <TestModeProvider>
      <StudioShell pathname={pathname}>{children}</StudioShell>
    </TestModeProvider>
  );
}

function StudioShell({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const me = useQuery(api.users.current);
  // Badge nav : nombre de transcripts Fireflies en attente de rattachement.
  // Query légère (orphelins non résolus), admin-gated côté serveur. ⚠️ Elle
  // THROW "Admin uniquement" pour un non-admin → on ne l'appelle QUE si l'user
  // est admin (sinon "skip"), sinon un compte non-admin authentifié qui ouvre
  // /studio fait crasher tout le shell (useQuery propage l'erreur serveur).
  const isAdmin = me?.role === "admin";
  const orphanCount =
    useQuery(api.fireflies.listOrphans, isAdmin ? {} : "skip")?.length ?? 0;
  const router = useRouter();
  const dark = useIsDark();
  const { signOut } = useAuthActions();
  const c = palette(dark, ACCENT);
  const isMobile = useIsMobile();
  const [userCollapsed, setUserCollapsed] = useState(false);
  // En mobile, la sidebar passe en mode compact (64px, icônes seules) plutôt
  // qu'un drawer : le contenu reste lisible sans risque de régression desktop.
  const collapsed = userCollapsed || isMobile;

  useEffect(() => {
    // Non connecté → login. Connecté mais NON-admin (ex. session de test) →
    // hors du back-office : le dispatcher racine le renverra vers /exos.
    if (me === null) router.replace("/studio/login");
    else if (me && me.role !== "admin") router.replace("/");
  }, [me, router]);

  // Loader (inclut le non-admin : on n'affiche jamais le shell admin à un
  // non-admin — il voit le loader le temps de la redirection ci-dessus).
  if (me === undefined || me === null || me.role !== "admin") {
    return (
      <main
        style={{
          background: c.bgGrad,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  // Non-admin → écran réservé.
  if (me.role !== "admin") {
    return (
      <main
        style={{
          background: c.bgGrad,
          color: c.text,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ ...mono, color: ACCENT }}>◦ Accès refusé</p>
        <h1 style={{ fontFamily: "inherit", fontSize: 38, fontWeight: 500, letterSpacing: "-0.025em", margin: 0 }}>
          Réservé aux admins.
        </h1>
        <p style={{ fontSize: 15, color: c.muted, maxWidth: 420 }}>
          Cet espace est l&apos;outil interne de l&apos;équipe Amour Studios. Ton
          compte n&apos;a pas les droits administrateur.
        </p>
        <GlassButton
          c={c}
          kind="ink"
          onClick={() => void signOut().then(() => router.replace("/studio/login"))}
        >
          Se déconnecter
        </GlassButton>
      </main>
    );
  }

  const W = collapsed ? 64 : 220;
  const sideBg = dark ? "#0B0B0B" : "#FFFFFF";
  const sideLine = dark ? "rgba(255,255,255,0.08)" : "rgba(11,11,11,0.08)";
  const sideText = dark ? "#F4F2EE" : "#0B0B0B";
  const sideMuted = dark ? "rgba(244,242,238,0.5)" : "rgba(11,11,11,0.5)";
  const sideActive = dark ? "#161616" : "#F4F2EE";

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const coachName = me.discordUsername || me.name || "Coach";

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: dark ? "#0B0B0B" : "#F4F2EE",
        color: sideText,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <aside
        style={{
          width: W,
          flexShrink: 0,
          background: sideBg,
          color: sideText,
          borderRight: `1px solid ${sideLine}`,
          display: "flex",
          flexDirection: "column",
          transition: "width .18s ease",
          position: "sticky",
          top: 0,
          height: "100vh",
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: collapsed ? "20px 0" : "20px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10,
            borderBottom: `1px solid ${sideLine}`,
            height: 64,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: ACCENT,
              color: "#0B0B0B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 16,
              borderRadius: 8,
              letterSpacing: "-0.02em",
              flexShrink: 0,
            }}
          >
            A
          </div>
          {!collapsed && (
            <div>
              <div style={{ ...mono, fontSize: 11, color: sideText, lineHeight: 1.1, letterSpacing: "0.04em" }}>
                AMOUR
              </div>
              <div style={{ ...mono, fontSize: 9.5, color: sideMuted, lineHeight: 1.1, marginTop: 2 }}>
                STUDIOS · OPS
              </div>
            </div>
          )}
        </div>

        {/* Badge MODE TEST (visible quand actif) */}
        {!collapsed && (
          <div style={{ padding: "12px 14px 0" }}>
            <TestModeBadge c={c} />
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: "10px 8px", display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
          {!collapsed && (
            <div style={{ ...mono, color: sideMuted, padding: "10px 10px 6px", fontSize: 9.5 }}>
              Pilotage
            </div>
          )}
          {NAV.map((it) => {
            const active = isActive(it);
            // Badge orange sur « Transcripts » = nb d'orphelins à rattacher.
            const badge = it.href === "/studio/transcripts" ? orphanCount : 0;
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: collapsed ? "10px 0" : "9px 12px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  color: active ? sideText : sideMuted,
                  background: active ? sideActive : "transparent",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontSize: 13.5,
                  fontWeight: active ? 500 : 400,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: active ? ACCENT : sideMuted,
                    fontFamily: "'DM Mono', monospace",
                    width: 16,
                    textAlign: "center",
                  }}
                >
                  {it.icon}
                </span>
                {!collapsed && <span style={{ flex: 1 }}>{it.label}</span>}
                {badge > 0 && (
                  <span
                    style={{
                      ...mono,
                      fontSize: 9.5,
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: ACCENT,
                      color: "#0B0B0B",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      // Collapsed : pastille flottante en haut-droite de l'icône.
                      position: collapsed ? "absolute" : "static",
                      top: collapsed ? 4 : undefined,
                      right: collapsed ? 10 : undefined,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer : thème + user + collapse */}
        <div style={{ borderTop: `1px solid ${sideLine}`, padding: collapsed ? "10px 0" : "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => {
              const next =
                document.documentElement.getAttribute("data-theme") === "dark"
                  ? "light"
                  : "dark";
              if (next === "dark")
                document.documentElement.setAttribute("data-theme", "dark");
              else document.documentElement.removeAttribute("data-theme");
              try {
                localStorage.setItem("amour-theme", next);
              } catch {}
            }}
            style={{
              ...mono,
              fontSize: 10,
              padding: collapsed ? "8px 0" : "8px 12px",
              background: "transparent",
              border: `1px solid ${sideLine}`,
              color: sideText,
              cursor: "pointer",
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {dark ? "☼" : "☾"}
            {!collapsed && <span>{dark ? "Clair" : "Sombre"}</span>}
          </button>

          <TestModeToggle
            collapsed={collapsed}
            sideText={sideText}
            sideLine={sideLine}
            accent={ACCENT}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: collapsed ? "center" : "space-between",
            }}
          >
            {!collapsed && (
              <button
                onClick={() => void signOut().then(() => router.replace("/studio/login"))}
                style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", color: sideText, fontFamily: "inherit", padding: 0, textAlign: "left" }}
                title="Se déconnecter"
              >
                <Avatar name={coachName} size={28} dark={dark} image={me.image} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {coachName}
                  </div>
                  <div style={{ ...mono, color: sideMuted, fontSize: 9.5, marginTop: 1 }}>
                    Coach · admin
                  </div>
                </div>
              </button>
            )}
            <button
              onClick={() => setUserCollapsed((v) => !v)}
              style={{
                width: 28,
                height: 28,
                border: `1px solid ${sideLine}`,
                background: "transparent",
                color: sideMuted,
                cursor: "pointer",
                borderRadius: 8,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {collapsed ? "›" : "‹"}
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
