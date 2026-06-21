"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  ACCENT,
  Glass,
  GlassButton,
  mono,
  num,
  palette,
  useIsDark,
  type C,
} from "./glass";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Bloc "Onboardings en attente" — dashboard /studio.
// Affiche en un coup d'œil chaque user payant bloqué dans le flow d'onboarding :
// étape, durée depuis le blocage, relances auto déjà envoyées, et bouton de
// relance manuelle. DA Glass C inline (cf. glass.tsx).
// ============================================================================

const H24 = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;

type Tone = "muted" | "warning" | "danger";

function formatElapsed(ts: number | null | undefined): { label: string; tone: Tone } {
  if (!ts) return { label: "il y a un moment", tone: "muted" };
  const diff = Math.max(0, Date.now() - ts);
  const tone: Tone = diff >= H48 ? "danger" : diff >= H24 ? "warning" : "muted";
  if (diff < 3600_000) {
    const m = Math.max(1, Math.round(diff / 60_000));
    return { label: `il y a ${m} min`, tone };
  }
  if (diff < H24) {
    const h = Math.round(diff / 3600_000);
    return { label: `il y a ${h}h`, tone };
  }
  const d = Math.round(diff / H24);
  return { label: `il y a ${d}j`, tone };
}

function toneColor(c: C, tone: Tone): string {
  if (tone === "danger") return "#E53935";
  if (tone === "warning") return "#FF8500";
  return c.muted;
}

type StepLabel = {
  icon: string;
  text: string;
  anchorKey: "createdAt" | "linkSentAt" | "formCompletedAt";
};

function stepInfo(step: string): StepLabel | null {
  if (step === "awaiting_presentation")
    return { icon: "📍", text: "Pas présenté", anchorKey: "createdAt" };
  if (step === "link_sent")
    return { icon: "📝", text: "Questionnaire pending", anchorKey: "linkSentAt" };
  if (step === "form_done" || step === "consents")
    return { icon: "📅", text: "RDV pending", anchorKey: "formCompletedAt" };
  return null;
}

type Row = {
  _id: Id<"onboardings">;
  userId: Id<"users">;
  tier: "coaching" | "communaute";
  step: string;
  createdAt: number;
  linkSentAt: number | null;
  formCompletedAt: number | null;
  presentedAt: number | null;
  relance24hAt: number | null;
  relance48hAt: number | null;
  relance7dAt: number | null;
  token: string;
  firstName: string | null;
  email: string | null;
  discordUsername: string | null;
  discordId: string | null;
};

function RelanceTag({ c, label }: { c: C; label: string }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 9.5,
        color: c.faint,
        background: c.chip,
        border: `1px solid ${c.line}`,
        padding: "2px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PendingRow({
  c,
  dark,
  row,
  onRelance,
  sending,
}: {
  c: C;
  dark: boolean;
  row: Row;
  onRelance: (id: Id<"onboardings">) => void;
  sending: boolean;
}) {
  const info = stepInfo(row.step);
  const anchorTs = info ? row[info.anchorKey] : null;
  const elapsed = formatElapsed(anchorTs);
  const displayName =
    row.discordUsername || row.firstName || row.email || "Élève";

  const isCoaching = row.tier === "coaching";
  const tierBadgeStyle: CSSProperties = {
    ...mono,
    fontSize: 9.5,
    padding: "3px 9px",
    borderRadius: 999,
    background: isCoaching ? ACCENT : c.chip,
    color: isCoaching ? "#0B0B0B" : c.text,
    border: isCoaching ? "none" : `1px solid ${c.line}`,
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 10px",
        borderTop: `1px solid ${c.hairline}`,
        flexWrap: "wrap",
      }}
    >
      {/* Identité (clic = fiche élève) */}
      <Link
        href={`/studio/eleves/${row.userId}`}
        style={{
          minWidth: 0,
          flex: "1 1 200px",
          textDecoration: "none",
          color: c.text,
          display: "block",
        }}
      >
        <div
          style={{
            ...num,
            fontSize: 16,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </div>
        {row.email && (
          <div
            style={{
              ...mono,
              fontSize: 10,
              color: c.muted,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.email}
          </div>
        )}
      </Link>

      {/* Step + durée */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 3,
          minWidth: 140,
          flexShrink: 0,
        }}
      >
        {info && (
          <div style={{ fontSize: 12, color: c.text, whiteSpace: "nowrap" }}>
            <span style={{ marginRight: 4 }}>{info.icon}</span>
            {info.text}
          </div>
        )}
        <div
          style={{
            ...mono,
            fontSize: 10,
            color: toneColor(c, elapsed.tone),
            whiteSpace: "nowrap",
          }}
        >
          {elapsed.label}
        </div>
      </div>

      {/* Tags relances */}
      <div
        style={{
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
          flexShrink: 0,
          maxWidth: 180,
        }}
      >
        {row.relance24hAt && <RelanceTag c={c} label="R24h ✓" />}
        {row.relance48hAt && <RelanceTag c={c} label="R48h ✓" />}
        {row.relance7dAt && <RelanceTag c={c} label="R7d ✓" />}
      </div>

      {/* Tier badge */}
      <span style={tierBadgeStyle}>
        {isCoaching ? "Coaching 179€" : "Communauté 79€"}
      </span>

      {/* Relancer */}
      <GlassButton
        c={c}
        onClick={() => onRelance(row._id)}
        disabled={sending}
        style={{
          padding: "8px 12px",
          fontSize: 10,
          opacity: sending ? 0.5 : 1,
          cursor: sending ? "not-allowed" : "pointer",
        }}
      >
        {sending ? "Envoi…" : "Relancer"}
      </GlassButton>
    </div>
  );
}

export function OnboardingsPendingBlock() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const rows = useQuery(api.onboardings.listNotFinal) as Row[] | undefined;
  const trigger = useMutation(api.onboardings.triggerManualRelance);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const handleRelance = async (id: Id<"onboardings">) => {
    if (pending.has(id)) return;
    setPending((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      const res = await trigger({ onboardingId: id });
      if (res?.ok) {
        toast.success("Relance envoyée.");
      } else if (res?.reason === "already_done") {
        toast.message("Onboarding déjà finalisé.");
      } else {
        toast.error("Relance impossible.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur relance.");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <Glass c={c} dark={dark} pad={0}>
      <div
        style={{
          padding: "18px 22px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ ...mono, color: c.muted }}>◦ Onboardings en attente</div>
        {rows && rows.length > 0 && (
          <span
            style={{
              ...mono,
              fontSize: 10,
              padding: "4px 9px",
              borderRadius: 999,
              background: ACCENT,
              color: "#0B0B0B",
              whiteSpace: "nowrap",
            }}
          >
            {rows.length}
          </span>
        )}
      </div>

      <div style={{ padding: "0 12px 14px" }}>
        {rows === undefined && (
          <div
            style={{
              ...mono,
              color: c.faint,
              padding: "16px 10px",
            }}
          >
            Chargement…
          </div>
        )}
        {rows && rows.length === 0 && (
          <div
            style={{
              ...mono,
              color: c.faint,
              padding: "16px 10px",
            }}
          >
            Aucun onboarding en attente · tout le monde a son accès complet 🎉
          </div>
        )}
        {rows &&
          rows.map((row) => (
            <PendingRow
              key={row._id}
              c={c}
              dark={dark}
              row={row}
              onRelance={handleRelance}
              sending={pending.has(row._id)}
            />
          ))}
      </div>
    </Glass>
  );
}
