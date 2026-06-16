import { ACCENT } from "@/app/studio/_components/glass";
import type { CSSProperties, ReactNode } from "react";

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono-swiss), 'DM Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: ACCENT,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {children}
      <span style={{ width: 40, height: 1, background: ACCENT }} />
    </span>
  );
}

export function BigTitle({ w1, w2 }: { w1: string; w2?: string }) {
  return (
    <h1
      style={{
        fontFamily: "var(--font-grotesk), 'Schibsted Grotesk', sans-serif",
        fontWeight: 800,
        fontSize: "clamp(36px,6vw,72px)",
        lineHeight: 0.92,
        letterSpacing: "-0.02em",
        textTransform: "uppercase",
        margin: "12px 0 4px",
      }}
    >
      <span style={{ display: "block" }}>{w1}</span>
      {w2 && <span style={{ display: "block", color: ACCENT }}>{w2}</span>}
    </h1>
  );
}

// Bloc éditorial : surface plate bordée (remplace les cartes verre).
export function EditorialBlock({
  c,
  children,
  style,
}: {
  c: { line: string };
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${c.line}`,
        background: "transparent",
        borderRadius: 14,
        padding: "clamp(18px,3vw,28px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
