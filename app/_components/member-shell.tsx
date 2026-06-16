"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { palette, mono, ACCENT, useIsDark } from "@/app/studio/_components/glass";

const NAV = [
  { href: "/exos", label: "Exercices" },
  { href: "/compte", label: "Mon compte" },
];

// Coquille membre partagée : gate auth + header sticky (nav Exercices | Mon compte).
// NE pose PAS de <main>/fond : chaque page garde sa propre coquille (fond bgGrad,
// maxWidth…). Le header est en flux normal (sticky) → le contenu démarre dessous.
export function MemberShell({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.users.current);
  const router = useRouter();
  const pathname = usePathname();
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  useEffect(() => {
    if (me === null) router.replace("/login?returnTo=" + encodeURIComponent(pathname));
  }, [me, router, pathname]);

  if (me === undefined)
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: c.bgGrad }}>
        <Loader2 size={22} style={{ color: c.muted, animation: "spin 1s linear infinite" }} />
      </main>
    );
  if (me === null) return null;

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px clamp(16px,5vw,48px)",
          borderBottom: `1px solid ${c.line}`,
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: dark ? "rgba(8,8,12,0.82)" : "rgba(232,227,215,0.82)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          color: c.text,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-grotesk), 'Schibsted Grotesk', sans-serif",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            fontSize: 15,
          }}
        >
          Amour<span style={{ color: ACCENT }}>studios</span>
        </span>
        <nav style={{ display: "flex", gap: 8 }}>
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <a
                key={n.href}
                href={n.href}
                style={{
                  ...mono,
                  fontSize: 10.5,
                  textDecoration: "none",
                  padding: "8px 14px",
                  borderRadius: 999,
                  color: active ? c.textOnAccent : c.muted,
                  background: active ? ACCENT : c.chip,
                  border: `1px solid ${active ? ACCENT : c.line}`,
                }}
              >
                {n.label}
              </a>
            );
          })}
        </nav>
      </header>
      {children}
    </>
  );
}
