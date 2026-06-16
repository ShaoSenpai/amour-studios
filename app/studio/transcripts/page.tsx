"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Loader2, Mic, ExternalLink, Users, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  useIsMobile,
  mono,
  num,
  Glass,
  Pill,
  GlassButton,
  type C,
  type PillTone,
} from "../_components/glass";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Transcripts à rattacher — api.fireflies.{listOrphans, attachableSessionsForOrphan,
// resolveOrphan, dismissOrphan}.
// ----------------------------------------------------------------------------
// Liste les transcripts Fireflies orphelins (réunions enregistrées dont on n'a
// pas pu deviner l'élève par email). Pour chacun : Walid peut « Rattacher » à une
// session de coaching candidate (±2j, sans transcript) ou « Ignorer » la réunion.
//
// Pas de mode test ici : branché directement sur les vraies queries Convex.
// ============================================================================

type OrphanId = Id<"firefliesOrphans">;

/** Statut de session → libellé FR + tone du Pill (aligné sur la fiche élève). */
const STATUS_INFO: Record<string, { label: string; tone: PillTone }> = {
  scheduled: { label: "À venir", tone: "outline" },
  completed: { label: "Fait", tone: "success" },
  canceled: { label: "Annulé", tone: "outline" },
  no_show: { label: "No-show", tone: "warn" },
};

function sessionStatusInfo(status: string): { label: string; tone: PillTone } {
  return STATUS_INFO[status] ?? { label: status, tone: "ghost" };
}

export default function TranscriptsPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const isMobile = useIsMobile();
  const orphans = useQuery(api.fireflies.listOrphans, {});

  // ── Loading ─────────────────────────────────────────────────────────────
  if (orphans === undefined) {
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

  return (
    <div
      style={{
        background: c.bgGrad,
        minHeight: "100vh",
        color: c.text,
        padding: isMobile ? 14 : 26,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "26px 30px", display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted, display: "flex", alignItems: "center", gap: 8 }}>
                <Mic size={13} /> Fireflies · rattachement manuel
              </div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>
                Transcripts à rattacher{" "}
                {orphans.length > 0 && (
                  <span style={{ color: c.muted }}>· {orphans.length}</span>
                )}
              </div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                Réunions enregistrées dont l&apos;élève n&apos;a pas pu être deviné
                automatiquement. Rattache-les à la bonne session de coaching, ou ignore
                celles qui sont hors coaching.
              </div>
            </div>
          </div>
        </Glass>

        {/* État vide */}
        {orphans.length === 0 ? (
          <Glass c={c} dark={dark}>
            <div
              style={{
                padding: "44px 22px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ ...num, fontSize: 24, fontWeight: 500 }}>
                Aucun transcript en attente ✅
              </div>
              <div style={{ fontSize: 14, color: c.muted, maxWidth: 460 }}>
                Tout est rattaché automatiquement.
              </div>
            </div>
          </Glass>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {orphans.map((o) => (
              <OrphanCard key={o._id} c={c} dark={dark} orphan={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Carte d'un transcript orphelin ───────────────────────────────────────────

type Orphan = {
  _id: OrphanId;
  firefliesId: string;
  title?: string;
  meetingDate: number;
  participants: string[];
  transcriptUrl?: string;
  aiSummary?: string;
  createdAt: number;
};

const SUMMARY_MAX = 150;

function OrphanCard({ c, dark, orphan }: { c: C; dark: boolean; orphan: Orphan }) {
  const isMobile = useIsMobile();
  const [picking, setPicking] = useState(false);
  const dismissOrphan = useMutation(api.fireflies.dismissOrphan);

  const dateLabel = new Date(orphan.meetingDate).toLocaleString("fr-FR");
  const summary =
    orphan.aiSummary && orphan.aiSummary.length > SUMMARY_MAX
      ? orphan.aiSummary.slice(0, SUMMARY_MAX).trimEnd() + "…"
      : orphan.aiSummary;

  const handleDismiss = () => {
    // Confirmation via toast sonner avec action (pattern dominant du /studio).
    toast("Ignorer ce transcript ?", {
      description: "Il sera marqué comme hors coaching et disparaîtra de la liste.",
      action: {
        label: "Ignorer",
        onClick: () => {
          void dismissOrphan({ orphanId: orphan._id })
            .then(() => toast.success("Transcript ignoré."))
            .catch(() => toast.error("Impossible d'ignorer le transcript."));
        },
      },
    });
  };

  return (
    <Glass c={c} dark={dark} pad={0}>
      {/* En-tête : titre + date + actions */}
      <div
        style={{
          padding: "20px 24px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...mono, color: c.muted, display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <CalendarClock size={12} /> {dateLabel}
          </div>
          <div style={{ ...num, fontSize: 21, fontWeight: 500, lineHeight: 1.15 }}>
            {orphan.title || (
              <span style={{ color: c.faint }}>Réunion sans titre</span>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexShrink: 0,
            width: isMobile ? "100%" : "auto",
          }}
        >
          <GlassButton
            c={c}
            kind={picking ? "ghost" : "solid"}
            onClick={() => setPicking((v) => !v)}
            style={{ flex: isMobile ? 1 : undefined }}
          >
            {picking ? "Fermer" : "Rattacher"}
          </GlassButton>
          <GlassButton
            c={c}
            onClick={handleDismiss}
            style={{ color: c.muted, flex: isMobile ? 1 : undefined }}
          >
            Ignorer
          </GlassButton>
        </div>
      </div>

      {/* Corps : participants + extrait + lien */}
      <div
        style={{
          padding: "0 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Participants */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <Users size={14} style={{ color: c.faint, marginTop: 3, flexShrink: 0 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
            {orphan.participants.length === 0 ? (
              <span style={{ ...mono, color: c.faint, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>
                Aucun participant connu
              </span>
            ) : (
              orphan.participants.map((p, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 11,
                    color: c.muted,
                    background: c.chip,
                    border: `1px solid ${c.line}`,
                    borderRadius: 999,
                    padding: "4px 10px",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Extrait du résumé */}
        {summary && (
          <div
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: c.muted,
              background: dark ? "rgba(50, 22, 12, 0.22)" : "rgba(255, 232, 220, 0.40)",
              border: `1px solid ${c.line}`,
              borderRadius: 14,
              padding: "13px 16px",
              boxShadow: `inset 0 1px 0 ${c.inner}`,
              maxHeight: isMobile ? 200 : undefined,
              overflowY: "auto",
            }}
          >
            {summary}
          </div>
        )}

        {/* Lien transcript */}
        {orphan.transcriptUrl && (
          <a
            href={orphan.transcriptUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...mono,
              fontSize: 11,
              color: c.accent,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              alignSelf: "flex-start",
            }}
          >
            <ExternalLink size={12} /> Voir le transcript
          </a>
        )}
      </div>

      {/* Panneau de sélection de session */}
      {picking && (
        <SessionPicker
          c={c}
          dark={dark}
          orphanId={orphan._id}
          onResolved={() => setPicking(false)}
        />
      )}
    </Glass>
  );
}

// ── Panneau de sélection de la session à rattacher ───────────────────────────

function SessionPicker({
  c,
  dark,
  orphanId,
  onResolved,
}: {
  c: C;
  dark: boolean;
  orphanId: OrphanId;
  onResolved: () => void;
}) {
  const sessions = useQuery(api.fireflies.attachableSessionsForOrphan, { orphanId });
  const resolveOrphan = useMutation(api.fireflies.resolveOrphan);
  const [busyId, setBusyId] = useState<Id<"coachingSessions"> | null>(null);

  const handlePick = (sessionId: Id<"coachingSessions">) => {
    setBusyId(sessionId);
    void resolveOrphan({ orphanId, sessionId })
      .then(() => {
        toast.success("Transcript rattaché à la session.");
        onResolved();
      })
      .catch(() => {
        toast.error("Impossible de rattacher le transcript.");
        setBusyId(null);
      });
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${c.line}`,
        background: dark ? "rgba(255,255,255,0.025)" : "rgba(11,11,11,0.02)",
        padding: "16px 24px 18px",
      }}
    >
      <div style={{ ...mono, color: c.muted, marginBottom: 12 }}>
        Rattacher à une session
      </div>

      {/* Loading sessions */}
      {sessions === undefined && (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
          <Loader2 className="animate-spin" style={{ color: c.muted }} size={16} />
        </div>
      )}

      {/* Aucune candidate */}
      {sessions && sessions.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: c.muted,
            lineHeight: 1.55,
            padding: "10px 14px",
            borderRadius: 12,
            background: c.chip,
            border: `1px solid ${c.line}`,
          }}
        >
          Aucune session sans transcript autour de cette date. Crée/édite le RDV
          depuis la fiche élève d&apos;abord.
        </div>
      )}

      {/* Liste des candidates */}
      {sessions && sessions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((s) => {
            const si = sessionStatusInfo(s.status);
            const busy = busyId === s._id;
            const disabled = busyId !== null;
            return (
              <button
                key={s._id}
                onClick={() => handlePick(s._id)}
                disabled={disabled}
                style={{
                  textAlign: "left",
                  cursor: disabled ? "default" : "pointer",
                  opacity: disabled && !busy ? 0.5 : 1,
                  background: c.chip,
                  border: `1px solid ${c.line}`,
                  borderRadius: 14,
                  padding: "13px 15px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  color: c.text,
                  fontFamily: "inherit",
                  boxShadow: `inset 0 1px 0 ${c.inner}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.studentName}
                  </div>
                  <div style={{ ...mono, color: c.muted, marginTop: 3, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                    {new Date(s.scheduledAt).toLocaleString("fr-FR")} · {s.type}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <Pill c={c} tone={si.tone}>
                    {si.label}
                  </Pill>
                  <span style={{ ...mono, fontSize: 11, color: c.accent, whiteSpace: "nowrap" }}>
                    {busy ? "Rattachement…" : "Rattacher →"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
