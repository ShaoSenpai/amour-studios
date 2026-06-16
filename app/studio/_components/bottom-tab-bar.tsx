"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCENT, SAFE, TOUCH, mono, type C } from "./glass";

export type TabItem = { href: string; label: string; icon: string; exact: boolean };

// 4 destinations principales + un onglet « Plus » (sheet). Les `secondary`
// vont dans le sheet. `active(href, exact)` reprend la logique du layout.
export function BottomTabBar({
  c,
  dark,
  primary,
  secondary,
  orphanCount,
  isActive,
  footer,
}: {
  c: C;
  dark: boolean;
  primary: TabItem[];
  secondary: TabItem[];
  orphanCount: number;
  isActive: (href: string, exact: boolean) => boolean;
  footer: React.ReactNode; // thème + déconnexion (réutilise le markup du layout)
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sideBg = dark ? "#0B0B0B" : "#FFFFFF";
  const sideLine = dark ? "rgba(255,255,255,0.08)" : "rgba(11,11,11,0.08)";
  const muted = dark ? "rgba(244,242,238,0.55)" : "rgba(11,11,11,0.5)";

  const anySecondaryActive = secondary.some((s) => isActive(s.href, s.exact));

  const tab = (active: boolean, onClick?: () => void) => ({
    flex: 1,
    minWidth: 0,
    height: TOUCH.comfortable,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    color: active ? ACCENT : muted,
    fontFamily: "inherit",
    padding: 0,
  });

  return (
    <>
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
          background: sideBg,
          borderTop: `1px solid ${sideLine}`,
          display: "flex",
          paddingBottom: SAFE.bottom,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {primary.map((it) => {
          const active = isActive(it.href, it.exact);
          return (
            <Link key={it.href} href={it.href} style={tab(active)}>
              <span style={{ fontSize: 18, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{it.icon}</span>
              <span style={{ ...mono, fontSize: 8.5, letterSpacing: "0.02em" }}>{it.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} style={tab(anySecondaryActive)}>
          <span style={{ fontSize: 18, lineHeight: 1, position: "relative" }}>
            ⋯
            {orphanCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -8, width: 7, height: 7, borderRadius: 7, background: ACCENT }} />
            )}
          </span>
          <span style={{ ...mono, fontSize: 8.5, letterSpacing: "0.02em" }}>Plus</span>
        </button>
      </nav>

      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)" }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 61,
              background: sideBg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: `1px solid ${sideLine}`,
              padding: 14,
              paddingBottom: `calc(14px + ${SAFE.bottom})`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 4, background: sideLine, margin: "2px auto 10px" }} />
            {secondary.map((it) => {
              const active = isActive(it.href, it.exact);
              const badge = it.href === "/studio/transcripts" ? orphanCount : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    minHeight: TOUCH.min,
                    padding: "0 12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: active ? c.text : c.muted,
                    background: active ? c.chip : "transparent",
                    fontSize: 15,
                  }}
                >
                  <span style={{ fontSize: 16, width: 18, textAlign: "center", color: active ? ACCENT : c.muted, fontFamily: "'DM Mono', monospace" }}>{it.icon}</span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {badge > 0 && (
                    <span style={{ ...mono, fontSize: 9.5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: ACCENT, color: "#0B0B0B", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{badge}</span>
                  )}
                </Link>
              );
            })}
            <div style={{ height: 1, background: sideLine, margin: "8px 0" }} />
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
