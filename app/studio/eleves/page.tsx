"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  useIsMobile,
  mono,
  num,
  Glass,
  Avatar,
  Pill,
  Segmented,
  FilterSelect,
  STAGES,
  STAGE_LABELS,
  stageLabel,
  statusInfo,
  relativeFromNow,
  fmtDateShort,
  fmtTime,
  type Stage,
} from "../_components/glass";
import { useTestMode } from "../_components/test-mode";
import { useTestStore, selectStudentsList } from "../_components/test-store";

// ============================================================================
// Élèves — liste filtrable depuis api.coaching.studentsList.
// Recherche par pseudo Discord, segment Tous/Coaching/Communauté (via tier),
// filtres Étape (coachingStage) & Paiement (status). Colonne « Prochain RDV »
// (nextSessionAt) + téléphone. Clic ligne → /studio/eleves/{id}.
// ============================================================================

type Seg = "tous" | "coaching" | "commu";
type StatusFilter = "tous" | "ok" | "incident";
type EtapeFilter = "toutes" | Stage;

/** nextSessionAt → "12 mars · 14:30" ou "—". */
function fmtNextRdv(ts: number | null): string {
  if (!ts) return "—";
  return `${fmtDateShort(ts)} · ${fmtTime(ts)}`;
}

export default function ElevesPage() {
  const dark = useIsDark();
  const isMobile = useIsMobile();
  const router = useRouter();
  const { testMode } = useTestMode();
  const liveStudents = useQuery(api.coaching.studentsList);
  useTestStore();
  const c = palette(dark, ACCENT);

  // Deep-link : ?tier=&stage=&status=&q= pré-règlent les filtres (depuis le
  // dashboard « Aujourd'hui » : KPI Coaching/Communauté, raccourci impayés…).
  const searchParams = useSearchParams();
  const initSeg: Seg = (() => {
    const t = searchParams.get("tier");
    if (t === "coaching") return "coaching";
    if (t === "commu" || t === "communaute") return "commu";
    return "tous";
  })();
  const initStatus: StatusFilter = (() => {
    const s = searchParams.get("status");
    if (s === "incident" || s === "past_due") return "incident";
    if (s === "ok" || s === "active") return "ok";
    return "tous";
  })();
  const initEtape: EtapeFilter = (() => {
    const st = searchParams.get("stage");
    const valid: Stage[] = ["positionnement", "contenu", "feedback_analyse", "termine"];
    return st && (valid as string[]).includes(st) ? (st as Stage) : "toutes";
  })();

  const [seg, setSeg] = useState<Seg>(initSeg);
  const [etape, setEtape] = useState<EtapeFilter>(initEtape);
  const [status, setStatus] = useState<StatusFilter>(initStatus);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // Tri par date d'inscription : "desc" = plus récents en haut (défaut).
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const students = testMode ? selectStudentsList() : liveStudents;

  const live = useMemo(() => students ?? [], [students]);

  const filtered = useMemo(() => {
    const list = live.filter((m) => {
      const isActive = m.status === "active" || m.status === "paid";
      if (seg === "coaching" && m.tier !== "coaching") return false;
      if (seg === "commu" && m.tier !== "communaute") return false;
      if (etape !== "toutes" && m.coachingStage !== etape) return false;
      const incident = m.status === "past_due";
      if (status === "ok" && !isActive) return false;
      if (status === "incident" && !incident) return false;
      if (query) {
        const q = query.toLowerCase();
        const name = (m.discordUsername || m.name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
    // Tri par date d'inscription (createdAt). Défaut "desc" = plus récents en haut.
    return list.sort((a, b) => {
      const av = a.createdAt ?? 0;
      const bv = b.createdAt ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [live, seg, etape, status, query, sortDir]);

  const nCoaching = live.filter((m) => m.tier === "coaching").length;
  const nCommu = live.filter((m) => m.tier === "communaute").length;
  const nIncident = live.filter((m) => m.status === "past_due").length;

  if (students === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  const COLS = "minmax(200px, 1.3fr) 110px 110px 1fr 140px 130px 100px 40px";

  const cardStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    padding: 14,
    borderRadius: 14,
    background: c.chip,
    border: `1px solid ${c.line}`,
    width: "100%",
    fontFamily: "inherit",
    color: c.text,
    cursor: "pointer",
    textAlign: "left" as const,
  };

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "26px 30px", display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted }}>Pilotage · base élèves</div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>
                Élèves <span style={{ color: c.muted }}>· {live.length}</span>
              </div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                <span style={{ color: c.text, fontWeight: 500 }}>{nCoaching} coaching</span>
                {" · "}
                <span>{nCommu} communauté</span>
                {" · "}
                <span style={{ color: ACCENT, fontWeight: 500 }}>{nIncident} incidents paiement</span>
              </div>
            </div>
          </div>
        </Glass>

        {/* Filter bar */}
        <Glass c={c} dark={dark} pad={14} style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <Segmented
              c={c}
              value={seg}
              onChange={setSeg}
              items={[
                { id: "tous", label: `Tous · ${live.length}` },
                { id: "coaching", label: "Coaching" },
                { id: "commu", label: "Communauté" },
              ]}
            />
            <div style={{ width: 1, height: 22, background: c.line }} />
            <FilterSelect
              c={c}
              label="Étape"
              value={etape}
              onChange={setEtape}
              options={[
                { id: "toutes", label: "Toutes" },
                ...STAGES.map((s) => ({ id: s, label: STAGE_LABELS[s] })),
              ]}
            />
            <FilterSelect
              c={c}
              label="Paiement"
              value={status}
              onChange={setStatus}
              options={[
                { id: "tous", label: "Tous" },
                { id: "ok", label: "À jour" },
                { id: "incident", label: "Incidents" },
              ]}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.chip, padding: "7px 12px", borderRadius: 999, border: `1px solid ${c.line}`, minWidth: 240, flex: isMobile ? "1 1 100%" : undefined }}>
            <span style={{ color: c.muted, fontSize: 13 }}>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par pseudo Discord…"
              style={{ background: "transparent", border: "none", color: c.text, outline: "none", flex: 1, fontFamily: "inherit", fontSize: 13 }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ background: "transparent", border: "none", color: c.muted, cursor: "pointer" }}>×</button>
            )}
          </div>
        </Glass>

        {/* Liste — cartes empilées sur mobile, tableau sur desktop */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((m) => {
              const who = m.discordUsername || m.name || "—";
              const offre = m.tier === "coaching" ? "Coaching" : m.tier === "communaute" ? "Communauté" : "—";
              const si = m.status ? statusInfo(m.status) : { label: "—", tone: "outline" as const };
              const chip = {
                ...mono,
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 999,
                background: c.chip,
                border: `1px solid ${c.line}`,
                color: c.muted,
              };
              return (
                <button key={m._id} type="button" onClick={() => router.push(`/studio/eleves/${m._id}`)} style={cardStyle}>
                  {/* Identité */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={who} size={34} dark={dark} image={m.image} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</div>
                      <div style={{ ...mono, fontSize: 10, color: c.muted }}>{offre}</div>
                    </div>
                  </div>
                  {/* Infos clés en chips */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <span style={chip}>{stageLabel(m.coachingStage)}</span>
                    {m.nextSessionAt != null && <span style={chip}>📅 {fmtNextRdv(m.nextSessionAt)}</span>}
                    <Pill c={c} tone={si.tone}>
                      <span style={{ width: 5, height: 5, borderRadius: 5, background: si.tone === "success" ? c.successFg : si.tone === "outline" ? c.faint : "#0B0B0B" }} />
                      {si.label}
                    </Pill>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "40px 22px", textAlign: "center", color: c.muted, fontSize: 14 }}>
                Aucun élève ne correspond aux filtres.
              </div>
            )}
          </div>
        ) : (
        <Glass c={c} dark={dark} pad={0}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 22px", borderBottom: `1px solid ${c.line}`, ...mono, color: c.faint }}>
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              title={`Trier par date d'inscription (${sortDir === "desc" ? "plus récents en haut" : "plus anciens en haut"})`}
              style={{
                ...mono,
                color: c.faint,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                font: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
              }}
            >
              Élève
              <span style={{ color: ACCENT, fontSize: 11 }}>
                {sortDir === "desc" ? "↓" : "↑"}
              </span>
            </button>
            <div>Offre</div>
            <div>Paiement</div>
            <div>Étape</div>
            <div>Prochain RDV</div>
            <div>Téléphone</div>
            <div>Dernière act.</div>
            <div />
          </div>

          {filtered.map((m, i) => {
            const who = m.discordUsername || m.name || "—";
            const offre = m.tier === "coaching" ? "Coaching" : m.tier === "communaute" ? "Communauté" : "—";
            const si = m.status ? statusInfo(m.status) : { label: "—", tone: "outline" as const };
            const hasRdv = m.nextSessionAt != null;
            return (
              <Row
                key={m._id}
                cols={COLS}
                c={c}
                last={i === filtered.length - 1}
                onClick={() => router.push(`/studio/eleves/${m._id}`)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar name={who} size={32} dark={dark} image={m.image} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</div>
                    <div style={{ ...mono, color: c.muted, marginTop: 2 }}>
                      {m.name && m.name !== who ? `${m.name} · ` : ""}
                      {m.createdAt ? `inscrit ${relativeFromNow(m.createdAt)}` : ""}
                    </div>
                  </div>
                </div>
                <div>
                  <Pill c={c} tone={m.tier === "coaching" ? "ink" : "outline"}>{offre}</Pill>
                </div>
                <div>
                  <Pill c={c} tone={si.tone}>
                    <span style={{ width: 5, height: 5, borderRadius: 5, background: si.tone === "success" ? c.successFg : si.tone === "outline" ? c.faint : "#0B0B0B" }} />
                    {si.label}
                  </Pill>
                </div>
                <div style={{ fontSize: 13.5 }}>{stageLabel(m.coachingStage)}</div>
                <div style={{ ...num, fontSize: 13, color: hasRdv ? c.text : c.faint, whiteSpace: "nowrap" }}>{fmtNextRdv(m.nextSessionAt)}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: m.phone ? c.muted : c.faint, whiteSpace: "nowrap" }}>{m.phone ?? "—"}</div>
                <div style={{ ...mono, color: c.muted }}>{m.lastActiveAt ? relativeFromNow(m.lastActiveAt) : "—"}</div>
                <div style={{ color: c.muted, fontSize: 16, textAlign: "right" }}>›</div>
              </Row>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ padding: "40px 22px", textAlign: "center", color: c.muted, fontSize: 14 }}>
              Aucun élève ne correspond aux filtres.
            </div>
          )}
        </Glass>
        )}
      </div>
    </div>
  );
}

function Row({
  cols,
  c,
  last,
  onClick,
  children,
}: {
  cols: string;
  c: ReturnType<typeof palette>;
  last: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-row"
      style={{
        display: "grid",
        gridTemplateColumns: cols,
        gap: 14,
        padding: "14px 22px",
        borderBottom: last ? "none" : `1px solid ${c.hairline}`,
        alignItems: "center",
        width: "100%",
        background: "transparent",
        border: "none",
        borderRadius: 0,
        textAlign: "left",
        cursor: "pointer",
        color: c.text,
        font: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}
