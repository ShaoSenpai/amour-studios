"use client";

import { useEffect } from "react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
  GlassButton,
} from "../studio/_components/glass";

// Error boundary de l'espace élève /exos — DA Glass C (inline styles).
// La stack n'est affichée qu'en dev (jamais en prod).
export default function ExosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  useEffect(() => {
    console.error("[exos-error]", error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main
      style={{
        background: c.bgGrad,
        color: c.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <Glass
        c={c}
        dark={dark}
        strong
        pad={0}
        style={{ width: "100%", maxWidth: 520, overflow: "hidden" }}
      >
        <div
          style={{
            padding: "40px 38px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={{ ...mono, color: ACCENT }}>◦ Erreur exercices</div>
          <div>
            <h1
              style={{
                ...num,
                fontSize: 36,
                fontWeight: 500,
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              Une erreur est survenue.
            </h1>
            <p
              style={{
                fontSize: 14.5,
                color: c.muted,
                marginTop: 12,
                lineHeight: 1.55,
              }}
            >
              Le chargement de cet espace a échoué. Réessaie — si le problème
              continue, recharge la page.
            </p>
          </div>

          {error?.digest && (
            <div style={{ ...mono, fontSize: 9.5, color: c.faint }}>
              ref : {error.digest}
            </div>
          )}

          {isDev && error?.stack && (
            <pre
              style={{
                ...mono,
                fontSize: 9.5,
                lineHeight: 1.5,
                textTransform: "none",
                letterSpacing: 0,
                color: c.muted,
                background: c.chip,
                border: `1px solid ${c.line}`,
                borderRadius: 12,
                padding: 12,
                maxHeight: 280,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
              }}
            >
              {error.stack.split("\n").slice(0, 25).join("\n")}
            </pre>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <GlassButton c={c} kind="solid" onClick={reset}>
              Réessayer
            </GlassButton>
            <a
              href="/exos"
              className="glass-btn"
              style={{
                ...glassBtn(c, "ghost"),
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Retour aux exercices
            </a>
          </div>
        </div>
      </Glass>
    </main>
  );
}
