"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0 }}>
        <main
          style={{
            minHeight: "100vh",
            background: "#0D0B08",
            color: "#F0E9DB",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ maxWidth: 640, width: "100%" }}>
            <p
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "2px",
                color: "#FF6B1F",
                marginBottom: 16,
              }}
            >
              ◦ Erreur application
            </p>
            <h1
              style={{
                fontFamily: "ui-serif, Georgia, serif",
                fontStyle: "italic",
                fontSize: 42,
                lineHeight: 1,
                margin: "0 0 16px",
              }}
            >
              Oups, ça a planté.
            </h1>
            <p style={{ fontSize: 14, color: "rgba(240,233,219,0.7)", marginBottom: 24 }}>
              {error?.message || "Erreur inconnue."}
            </p>
            {error?.digest && (
              <p style={{ fontSize: 11, color: "rgba(240,233,219,0.45)", fontFamily: "monospace", marginBottom: 24 }}>
                ref: {error.digest}
              </p>
            )}
            {error?.stack && (
              <pre
                style={{
                  fontSize: 10,
                  color: "rgba(240,233,219,0.55)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: 12,
                  overflowX: "auto",
                  maxHeight: 280,
                  marginBottom: 24,
                  lineHeight: 1.4,
                }}
              >
                {error.stack.split("\n").slice(0, 20).join("\n")}
              </pre>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={reset}
                style={{
                  background: "#FFB347",
                  color: "#0D0B08",
                  border: "none",
                  padding: "12px 20px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Réessayer
              </button>
              <a
                href="/login"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "#F0E9DB",
                  border: "1px solid rgba(255,255,255,0.15)",
                  padding: "12px 20px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Retour login
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
