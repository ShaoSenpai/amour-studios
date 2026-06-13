"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// ============================================================================
// Glass Chunky — primitives partagées du back-office /studio.
// Verre translucide (alpha ~0.28, blur(40px) saturate(150%)), coins 22px,
// orbes orange radiaux en fond, sheen brossé 135°, Schibsted Grotesk XXL +
// DM Mono, accent #FF5A1F, light (#E8E3D7) / dark (#08080C).
// Extrait de app/admin/page.tsx + des références design (glass.jsx / utils.jsx).
// ============================================================================

export const ACCENT = "#FF5A1F";
export const R = 22;

/** Suit l'attribut data-theme du <html> (cf. components/layout/theme-toggle). */
// Cache module-level : après le 1er mount, on mémorise le thème pour éviter le
// flash clair→sombre à chaque navigation, SANS réintroduire le mismatch.
let _cachedDark: boolean | null = null;

export function useIsDark() {
  // ⚠️ Le 1er render (SSR + hydratation client) DOIT valoir `false` — c'est ce
  // que rend le serveur (où `document` est absent). Lire data-theme dès le 1er
  // render client crée un MISMATCH d'hydratation : React garde alors le fond en
  // clair (valeur SSR) mais passe le texte en couleurs sombres (clair) → TEXTE
  // BLANC SUR FOND CLAIR = INVISIBLE. On corrige immédiatement au mount via le
  // useEffect. Le cache module évite le flash sur les nav suivantes.
  const [dark, setDark] = useState<boolean>(() => _cachedDark ?? false);
  useEffect(() => {
    const read = () => {
      const d =
        document.documentElement.getAttribute("data-theme") === "dark";
      _cachedDark = d;
      setDark(d);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/**
 * Vrai sous 900px (mobile / petite tablette). Init lazy via matchMedia pour
 * éviter le flash de layout desktop au montage, puis écoute les changements.
 */
export function useIsMobile(query: string = "(max-width: 900px)") {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const read = () => setMobile(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return mobile;
}

export function palette(dark: boolean, accent: string = ACCENT) {
  return dark
    ? {
        bg: "#08080C",
        bgGrad: `radial-gradient(ellipse 90% 70% at 12% 8%, ${accent}38, transparent 55%),
                 radial-gradient(ellipse 70% 60% at 88% 92%, ${accent}22, transparent 65%),
                 radial-gradient(ellipse 80% 50% at 50% 50%, #4A2E1A2A, transparent 70%),
                 #08080C`,
        glass: "rgba(28, 28, 36, 0.28)",
        glassStrong: "rgba(34, 34, 44, 0.42)",
        sheen:
          "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 28%, transparent 50%, transparent 72%, rgba(255,255,255,0.03) 100%)",
        text: "#F5F2EC",
        textOnAccent: "#0B0B0B",
        muted: "rgba(245,242,236,0.58)",
        faint: "rgba(245,242,236,0.32)",
        ghost: "rgba(245,242,236,0.14)",
        line: "rgba(255,255,255,0.07)",
        hairline: "rgba(255,255,255,0.05)",
        chip: "rgba(255,255,255,0.06)",
        inner: "rgba(255,255,255,0.06)",
        shadow: "0 30px 60px -30px rgba(0,0,0,0.6)",
        successFg: "#9DDDB1",
        accent,
        dark: true,
      }
    : {
        bg: "#E8E3D7",
        bgGrad: `radial-gradient(ellipse 80% 60% at 10% 6%, ${accent}48, transparent 55%),
                 radial-gradient(ellipse 60% 50% at 94% 94%, ${accent}36, transparent 65%),
                 radial-gradient(ellipse 70% 40% at 55% 45%, #FFFFFF70, transparent 65%),
                 #E8E3D7`,
        glass: "rgba(255, 252, 246, 0.32)",
        glassStrong: "rgba(255, 252, 246, 0.50)",
        sheen:
          "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.10) 28%, transparent 50%, transparent 72%, rgba(255,255,255,0.18) 100%)",
        text: "#0B0B0B",
        textOnAccent: "#FFFFFF",
        muted: "rgba(11,11,11,0.58)",
        faint: "rgba(11,11,11,0.34)",
        ghost: "rgba(11,11,11,0.14)",
        line: "rgba(11,11,11,0.07)",
        hairline: "rgba(11,11,11,0.06)",
        chip: "rgba(11,11,11,0.05)",
        inner: "rgba(255,255,255,0.55)",
        shadow: "0 30px 60px -28px rgba(20,16,8,0.16)",
        successFg: "#1E5F3B",
        accent,
        dark: false,
      };
}

export type C = ReturnType<typeof palette>;

export const mono: CSSProperties = {
  fontFamily: "'DM Mono', ui-monospace, monospace",
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 400,
};

export const num: CSSProperties = {
  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.025em",
};

export function Glass({
  c,
  dark,
  children,
  pad = 22,
  strong = false,
  tint,
  radius = R,
  style = {},
  onClick,
}: {
  c: C;
  dark: boolean;
  children: ReactNode;
  pad?: number;
  strong?: boolean;
  tint?: string;
  radius?: number;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: tint || (strong ? c.glassStrong : c.glass),
        backgroundImage: c.sheen,
        backgroundBlendMode: dark ? "plus-lighter" : "normal",
        backdropFilter: "blur(40px) saturate(150%)",
        WebkitBackdropFilter: "blur(40px) saturate(150%)",
        borderRadius: radius,
        border: `1px solid ${c.line}`,
        boxShadow: `inset 0 1px 0 ${c.inner}, ${c.shadow}`,
        padding: pad,
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Avatar({
  name,
  size = 28,
  dark = false,
  image,
}: {
  name: string;
  size?: number;
  dark?: boolean;
  image?: string | null;
}) {
  const initials = name
    .replace(/[._-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = dark ? `oklch(0.32 0.04 ${h})` : `oklch(0.86 0.04 ${h})`;
  const fg = dark ? `oklch(0.92 0.02 ${h})` : `oklch(0.32 0.06 ${h})`;
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: size,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: bg,
        color: fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Mono', ui-monospace, monospace",
        fontSize: Math.round(size * 0.36),
        fontWeight: 500,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function Sparkline({
  data,
  color,
  fill,
  width = 400,
  height = 60,
}: {
  data: number[];
  color: string;
  fill: string;
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => [
    i * stepX,
    height - 2 - ((v - min) / range) * (height - 4),
  ]);
  const d = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <path d={area} fill={fill} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

export function glassBtn(c: C, kind: "solid" | "ghost" | "ink" = "ghost"): CSSProperties {
  const base: CSSProperties = {
    fontFamily: "'DM Mono', ui-monospace, monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "11px 16px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
  if (kind === "solid")
    return {
      ...base,
      background: c.accent,
      color: "#0B0B0B",
      boxShadow: `0 8px 24px -8px ${c.accent}80, inset 0 1px 0 rgba(255,255,255,0.3)`,
    };
  if (kind === "ink")
    return {
      ...base,
      background: c.dark ? "rgba(255,255,255,0.92)" : "#0B0B0B",
      color: c.dark ? "#0B0B0B" : "#FFF",
    };
  return {
    ...base,
    background: c.chip,
    color: c.text,
    border: `1px solid ${c.line}`,
    backdropFilter: "blur(12px)",
  };
}

/** Bouton Glass C avec états hover/active/focus (classe CSS .glass-btn).
 *  Remplace le pattern `<button style={glassBtn(c, kind)}>`. */
export function GlassButton({
  c,
  kind = "ghost",
  style,
  className,
  ...props
}: ComponentProps<"button"> & {
  c: C;
  kind?: "solid" | "ghost" | "ink";
}) {
  return (
    <button
      type="button"
      className={className ? `glass-btn ${className}` : "glass-btn"}
      style={{ ...glassBtn(c, kind), ...style }}
      {...props}
    />
  );
}

export type PillTone =
  | "ghost"
  | "accent"
  | "ink"
  | "outline"
  | "success"
  | "warn";

export function Pill({
  c,
  children,
  tone = "ghost",
}: {
  c: C;
  children: ReactNode;
  tone?: PillTone;
}) {
  const tones: Record<PillTone, { bg: string; color: string; border: string }> = {
    ghost: { bg: c.chip, color: c.text, border: c.line },
    accent: { bg: c.accent, color: "#0B0B0B", border: "transparent" },
    ink: {
      bg: c.dark ? "rgba(255,255,255,0.92)" : "#0B0B0B",
      color: c.dark ? "#0B0B0B" : "#FFF",
      border: "transparent",
    },
    outline: { bg: "transparent", color: c.muted, border: c.line },
    success: {
      bg: c.dark ? "rgba(34, 99, 64, 0.5)" : "rgba(34, 99, 64, 0.12)",
      color: c.successFg,
      border: "transparent",
    },
    warn: { bg: c.accent, color: "#0B0B0B", border: "transparent" },
  };
  const t = tones[tone];
  return (
    <span
      style={{
        ...mono,
        fontSize: 11,
        background: t.bg,
        color: t.color,
        padding: "4px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  c,
  items,
  value,
  onChange,
}: {
  c: C;
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: c.chip,
        padding: 3,
        borderRadius: 999,
        border: `1px solid ${c.line}`,
      }}
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            className="glass-seg"
            onClick={() => onChange(it.id)}
            style={{
              ...mono,
              fontSize: 11,
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: active
                ? c.dark
                  ? "rgba(255,255,255,0.92)"
                  : "#0B0B0B"
                : "transparent",
              color: active ? (c.dark ? "#0B0B0B" : "#FFF") : c.muted,
              whiteSpace: "nowrap",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Petit menu déroulant verre, fermeture au clic extérieur. */
export function FilterSelect<T extends string>({
  c,
  label,
  value,
  options,
  onChange,
}: {
  c: C;
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const current = options.find((o) => o.id === value) || options[0];
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Le menu est porté sur document.body (position: fixed) pour échapper aux
  // contextes d'empilement créés par les cartes verre (backdrop-filter) : sinon
  // la carte du tableau peinte ensuite passe par-dessus le menu.
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

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        style={{
          ...mono,
          fontSize: 10.5,
          padding: "8px 12px",
          paddingRight: 28,
          borderRadius: 999,
          background: c.chip,
          border: `1px solid ${c.line}`,
          color: c.text,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          position: "relative",
        }}
      >
        <span style={{ color: c.muted }}>{label}</span>
        <span>{current?.label}</span>
        <span style={{ position: "absolute", right: 10, color: c.muted, fontSize: 9 }}>
          ▾
        </span>
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
              background: c.dark
                ? "rgba(28,28,36,0.92)"
                : "rgba(255,252,246,0.92)",
              backdropFilter: "blur(40px) saturate(150%)",
              WebkitBackdropFilter: "blur(40px) saturate(150%)",
              border: `1px solid ${c.line}`,
              borderRadius: 14,
              boxShadow: c.dark
                ? "0 20px 40px rgba(0,0,0,0.6)"
                : "0 20px 40px rgba(0,0,0,0.15)",
              minWidth: 180,
              padding: 4,
            }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{
                  ...mono,
                  fontSize: 10.5,
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: o.id === value ? c.chip : "transparent",
                  color: c.text,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ── Helpers de formatage FR ─────────────────────────────────────────────────

// Timeline du parcours coaching = les 3 modules du curriculum + clôture.
// (« onboarding » retiré du stepper ; libellé conservé pour d'éventuelles
// données existantes.)
export const STAGES = [
  "positionnement",
  "contenu",
  "feedback_analyse",
  "termine",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  positionnement: "Positionnement",
  contenu: "Contenu",
  feedback_analyse: "Feedback & analyse",
  termine: "Terminé",
};

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage as Stage] ?? stage;
}

/** Libellé curriculum unifié : « Module 1 | Titre de la leçon - 01 ». */
export function curriculumLabel(ci: {
  moduleNo: number;
  lessonTitle: string;
  lessonNo: number;
}): string {
  return `Module ${ci.moduleNo} | ${ci.lessonTitle} - ${String(ci.lessonNo).padStart(2, "0")}`;
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(ts);
}

export function fmtDateShort(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(ts);
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
}

export function relativeFromNow(ts: number | null | undefined): string {
  if (!ts) return "—";
  const DAY = 86400000;
  const diff = Date.now() - ts;
  if (diff < 0) return "à venir";
  if (diff < 3600000) return `il y a ${Math.max(1, Math.round(diff / 60000))} min`;
  if (diff < DAY) return `il y a ${Math.round(diff / 3600000)} h`;
  if (diff < 2 * DAY) return "hier";
  return `il y a ${Math.round(diff / DAY)} j`;
}

/** Statut d'abonnement Convex → libellé FR + tone du Pill. */
export function statusInfo(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case "active":
    case "paid":
      return { label: "à jour", tone: "success" };
    case "past_due":
      return { label: "échec", tone: "warn" };
    case "canceled":
      return { label: "annulé", tone: "outline" };
    default:
      return { label: status, tone: "ghost" };
  }
}
