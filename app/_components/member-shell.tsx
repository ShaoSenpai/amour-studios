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

export function MemberShell({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.users.current);
  const router = useRouter();
  const pathname = usePathname();
  const dark = useIsDark();
  const c = palette(dark);

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
    <div style={{ minHeight: "100dvh", background: c.bgGrad, color: c.text }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px clamp(16px,5vw,48px)", borderBottom: `1px solid ${c.line}`,
          position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)",
        }}
      >
        <span style={{ fontFamily: "var(--font-grotesk)", fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase", fontSize: 15 }}>
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
                  ...mono, fontSize: 10.5, textDecoration: "none",
                  padding: "8px 14px", borderRadius: 999,
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
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(20px,4vw,48px) clamp(16px,5vw,48px)" }}>
        {children}
      </main>
    </div>
  );
}
