"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";
import {
  ACCENT,
  mono,
  type C,
} from "../../../_components/glass";

type SessionType = "onboarding" | "coaching" | "other";

type SessionStatus = "scheduled" | "completed" | "canceled" | "no_show";

// Statut d'un RDV : label + couleur. Vert = fait, bleu = à venir,
// orange = annulé, rouge = no-show.
const STATUS_META: Record<SessionStatus, { label: string; color: string }> = {
  completed: { label: "Fait", color: "#1FA463" },
  scheduled: { label: "À venir", color: "#3B82F6" },
  canceled: { label: "Annulé", color: "#F97316" },
  no_show: { label: "No-show", color: "#E03131" },
};
const STATUS_ORDER: SessionStatus[] = ["completed", "scheduled", "no_show", "canceled"];

// Animation de pression « façon Apple » réutilisée par les boutons.
const TAP = {
  whileTap: { scale: 0.95 },
  whileHover: { scale: 1.04 },
  transition: SPRING,
};

export type { SessionType, SessionStatus };
export { STATUS_META, STATUS_ORDER, TAP };

export function Field({ c, label, value, mono: isMono = false }: { c: C; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ ...mono, color: c.faint, fontSize: 9.5 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, fontFamily: isMono ? "'DM Mono', monospace" : "inherit" }}>{value}</div>
    </div>
  );
}

// Bouton-icône (actions secondaires) : carré, infobulle au survol. Rendu comme
// lien (<a>) si `href` est fourni, sinon comme bouton.
export function IconBtn({ c, title, onClick, href, danger = false, size = 40, children }: { c: C; title: string; onClick?: () => void; href?: string; danger?: boolean; size?: number; children: React.ReactNode }) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: c.chip,
    border: `1px solid ${danger ? `${ACCENT}99` : c.line}`,
    color: danger ? ACCENT : c.muted,
    cursor: "pointer",
    flexShrink: 0,
    textDecoration: "none",
  };
  if (href) {
    return (
      <motion.a {...TAP} href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title} style={style}>
        {children}
      </motion.a>
    );
  }
  return (
    <motion.button {...TAP} type="button" title={title} aria-label={title} onClick={onClick} style={style}>
      {children}
    </motion.button>
  );
}

// Badge de statut cliquable : ouvre un menu pour changer Fait / À venir /
// No-show / Annulé. Chaque statut a sa couleur. Menu porté sur document.body
// (position: fixed) pour échapper aux contextes d'empilement des cartes verre.
export function StatusSelect({ c, dark, value, onChange }: { c: C; dark: boolean; value: string; onChange: (s: SessionStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const meta = STATUS_META[value as SessionStatus] ?? { label: value, color: c.muted };

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const badgeStyle = (color: string): React.CSSProperties => ({
    ...mono,
    fontSize: 10,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 999,
    background: `${color}1F`,
    border: `1px solid ${color}66`,
    color: dark ? "#FFFFFF" : color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)} style={badgeStyle(meta.color)}>
        <span style={{ width: 6, height: 6, borderRadius: 6, background: meta.color, flexShrink: 0 }} />
        {meta.label}
        <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              zIndex: 1000,
              background: dark ? "rgba(28,28,36,0.94)" : "rgba(255,252,246,0.94)",
              backdropFilter: "blur(40px) saturate(150%)",
              WebkitBackdropFilter: "blur(40px) saturate(150%)",
              border: `1px solid ${c.line}`,
              borderRadius: 14,
              boxShadow: dark ? "0 20px 40px rgba(0,0,0,0.6)" : "0 20px 40px rgba(0,0,0,0.15)",
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 150,
            }}
          >
            {STATUS_ORDER.map((st) => {
              const m = STATUS_META[st];
              const active = st === value;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    onChange(st);
                    setOpen(false);
                  }}
                  style={{
                    ...badgeStyle(m.color),
                    justifyContent: "flex-start",
                    width: "100%",
                    background: active ? `${m.color}2E` : `${m.color}14`,
                    borderColor: active ? `${m.color}` : `${m.color}55`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 7, background: m.color, flexShrink: 0 }} />
                  {m.label}
                  {active && <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// Bloc « Résumé du call · Fireflies » — résumé auto distinct des notes du coach.
// Glass léger, encadré subtil, retours à la ligne préservés. Lien transcript
// optionnel (accent #FF5A1F).
export function FirefliesSummary({
  c,
  aiSummary,
  transcriptUrl,
}: {
  c: C;
  aiSummary: string;
  transcriptUrl?: string;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        borderRadius: 12,
        background: c.glass,
        border: `1px solid ${c.line}`,
        boxShadow: `inset 0 1px 0 ${c.inner}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ ...mono, fontSize: 9.5, color: ACCENT }}>
          Résumé du call · Fireflies
        </span>
        {transcriptUrl && (
          <a
            href={transcriptUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...mono, fontSize: 9.5, color: ACCENT, textDecoration: "none", flexShrink: 0 }}
          >
            Voir le transcript ↗
          </a>
        )}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: c.muted, whiteSpace: "pre-wrap" }}>
        {aiSummary}
      </div>
    </div>
  );
}

export function fieldInput(c: C): React.CSSProperties {
  return {
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    padding: "10px 12px",
    color: c.text,
    outline: "none",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    fontSize: 13.5,
    width: "100%",
  };
}
