"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  Avatar,
  Pill,
  Segmented,
  statusInfo,
  fmtDate,
  fmtDateShort,
  useIsMobile,
  type C,
} from "../_components/glass";
import { useTestMode } from "../_components/test-mode";
import { useTestStore, selectPaymentsOverview } from "../_components/test-store";

// ============================================================================
// Paiements — api.coaching.paymentsOverview. 4 KPI, graphe d'aire 12 mois,
// répartition, table abonnements filtrable.
// ============================================================================

type Filter = "tous" | "actifs" | "echec" | "annule";

function PayKPI({ c, dark, label, value, delta, note, warn = false }: { c: C; dark: boolean; label: string; value: React.ReactNode; delta?: string; note: string; warn?: boolean }) {
  return (
    <Glass c={c} dark={dark} pad={22} strong={warn} style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 160, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ ...mono, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {delta !== undefined && (
          <span style={{ ...mono, fontSize: 10, padding: "4px 9px", borderRadius: 999, background: warn ? ACCENT : "transparent", color: warn ? "#0B0B0B" : c.muted, whiteSpace: "nowrap", flexShrink: 0, border: warn ? "none" : `1px solid ${c.line}` }}>
            {warn ? "▲ " : "↗ "}{delta}
          </span>
        )}
      </div>
      <div style={{ ...num, fontSize: 48, fontWeight: 500, lineHeight: 0.95, whiteSpace: "nowrap", color: warn ? ACCENT : c.text }}>{value}</div>
      <div style={{ ...mono, color: c.faint, marginTop: "auto" }}>{note}</div>
    </Glass>
  );
}

export default function PaiementsPage() {
  const dark = useIsDark();
  const isMobile = useIsMobile();
  const { testMode } = useTestMode();
  const c = palette(dark, ACCENT);
  const live = useQuery(api.coaching.paymentsOverview);
  useTestStore();
  // Deep-link : ?status= pré-règle le filtre, ?highlight=<purchaseId> surligne
  // et scrolle la ligne concernée (depuis le dashboard « Aujourd'hui »).
  const searchParams = useSearchParams();
  const initFilter = ((): Filter => {
    const s = searchParams.get("status");
    if (s === "echec" || s === "past_due") return "echec";
    if (s === "actifs" || s === "active") return "actifs";
    if (s === "annule" || s === "canceled") return "annule";
    return "tous";
  })();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);
  const [filter, setFilter] = useState<Filter>(initFilter);

  const data = testMode ? selectPaymentsOverview() : live;

  const subs = useMemo(() => data?.subscriptions ?? [], [data]);
  const counts = useMemo(() => {
    let actifs = 0, echec = 0, annule = 0;
    for (const s of subs) {
      if (s.statut === "active" || s.statut === "paid") actifs++;
      else if (s.statut === "past_due") echec++;
      else if (s.statut === "canceled") annule++;
    }
    return { actifs, echec, annule };
  }, [subs]);

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (filter === "actifs") return s.statut === "active" || s.statut === "paid";
      if (filter === "echec") return s.statut === "past_due";
      if (filter === "annule") return s.statut === "canceled";
      return true;
    });
  }, [subs, filter]);

  if (data === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  const rep = data.repartition;
  // Offre coaching unique (le « 1 mois » a été retiré) : on fusionne en une
  // seule ligne « Coaching » (coaching3m + tout reliquat 1 mois historique).
  const coachingN = rep.coaching3m + rep.coaching1m;
  const repItems = [
    { label: "Coaching", n: coachingN, montant: coachingN * 179 },
    { label: "Communauté", n: rep.communaute, montant: rep.communaute * 79 },
  ];
  const repTotal = repItems.reduce((a, x) => a + x.n, 0) || 1;
  const repColor = (i: number) =>
    i === 0 ? ACCENT : (dark ? "rgba(255,255,255,0.4)" : "rgba(11,11,11,0.35)");

  const COLS = "minmax(200px, 1.3fr) 140px 100px 120px 130px 130px";

  const cardStyle = {
    display: "flex", flexDirection: "column" as const, gap: 8,
    padding: 14, borderRadius: 14,
    background: c.chip, border: `1px solid ${c.line}`,
    width: "100%", fontFamily: "inherit", color: c.text, textAlign: "left" as const,
  };
  const chipStyle = {
    ...mono, fontSize: 10, padding: "3px 8px", borderRadius: 999,
    background: c.chip, border: `1px solid ${c.line}`, color: c.muted,
  };

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: isMobile ? 14 : 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "26px 30px", display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted }}>Revenus · abonnements</div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>Paiements</div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                <span style={{ color: c.text, fontWeight: 500 }}>{counts.actifs} abonnements actifs</span> ·
                <span style={{ color: ACCENT, fontWeight: 500 }}> {counts.echec} incidents</span> ·
                <span> {counts.annule} annulé</span>
              </div>
            </div>
          </div>
        </Glass>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))", gap: 16, marginBottom: 16 }}>
          <PayKPI c={c} dark={dark} label="MRR" value={data.kpis.mrr} note="Revenu mensuel récurrent" />
          <PayKPI c={c} dark={dark} label="Abonnements actifs" value={data.kpis.actifs} note="Coaching + communauté" />
          <PayKPI c={c} dark={dark} label="Incidents" value={data.kpis.incidents} note="À traiter" warn />
          <PayKPI c={c} dark={dark} label="Churn 30j" value={data.kpis.churn30} note="Annulations 30 derniers j" />
        </div>

        {/* Chart + repartition */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.6fr) minmax(0,1fr)", gap: 16, marginBottom: 16 }}>
          <Glass c={c} dark={dark} pad={0}>
            <div style={{ padding: "22px 26px 8px" }}>
              <div style={{ ...mono, color: c.muted }}>Revenu mensuel · 12 mois</div>
              <div style={{ ...num, fontSize: 36, fontWeight: 500, lineHeight: 1, marginTop: 10 }}>{data.kpis.mrr}</div>
            </div>
            <AreaChart c={c} data={data.mrrSeries} />
          </Glass>

          <Glass c={c} dark={dark}>
            <div style={{ ...mono, color: c.muted, marginBottom: 6 }}>Répartition des abonnements</div>
            <div style={{ ...num, fontSize: 28, fontWeight: 500, lineHeight: 1, marginTop: 8 }}>
              {repItems.reduce((a, x) => a + x.n, 0)} <span style={{ ...num, fontSize: 14, color: c.muted }}>abos</span>
            </div>
            <div style={{ display: "flex", height: 12, marginTop: 20, marginBottom: 18, gap: 2, borderRadius: 999, overflow: "hidden" }}>
              {repItems.map((r, i) => (
                <div key={i} style={{ width: `${(r.n / repTotal) * 100}%`, background: repColor(i) }} />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {repItems.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, background: repColor(i), borderRadius: 2 }} />
                    <span style={{ fontSize: 13 }}>{r.label}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ ...num, fontSize: 13, fontWeight: 500 }}>{r.montant.toLocaleString("fr-FR")} €</div>
                    <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{r.n} abos</div>
                  </div>
                </div>
              ))}
            </div>
          </Glass>
        </div>

        {/* Subs table */}
        <Glass c={c} dark={dark} pad={0}>
          <div style={{ padding: "20px 24px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...mono, color: c.muted }}>Abonnements</div>
              <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 6 }}>{filtered.length} résultats</div>
            </div>
            <Segmented
              c={c}
              value={filter}
              onChange={setFilter}
              items={[
                { id: "tous", label: `Tous · ${subs.length}` },
                { id: "actifs", label: `Actifs · ${counts.actifs}` },
                { id: "echec", label: `Échec · ${counts.echec}` },
                { id: "annule", label: `Annulés · ${counts.annule}` },
              ]}
            />
          </div>

          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: filtered.length ? "14px 14px" : 0 }}>
              {filtered.map((s) => {
                const si = statusInfo(s.statut);
                const isHighlighted = highlightId != null && s.id === highlightId;
                return (
                  <div
                    key={s.id}
                    ref={isHighlighted ? highlightRef : undefined}
                    style={{
                      ...cardStyle,
                      background: isHighlighted ? `${ACCENT}1A` : c.chip,
                      border: isHighlighted ? `1px solid ${ACCENT}` : `1px solid ${c.line}`,
                    }}
                  >
                    {/* Identité */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Avatar name={s.who} size={34} dark={dark} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.who}</div>
                        {s.phone && <div style={{ ...mono, color: c.faint, marginTop: 2 }}>{s.phone}</div>}
                      </div>
                    </div>
                    {/* Infos clés en chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      <Pill c={c} tone={s.offre.startsWith("Coaching") ? "ink" : "outline"}>{s.offre}</Pill>
                      <Pill c={c} tone={si.tone}>
                        <span style={{ width: 5, height: 5, borderRadius: 5, background: si.tone === "success" ? c.successFg : si.tone === "outline" ? c.faint : "#0B0B0B" }} />
                        {si.label}
                      </Pill>
                      <span style={{ ...num, fontSize: 13, fontWeight: 500 }}>{s.montant}</span>
                      <span style={chipStyle}>📅 {fmtDateShort(s.echeance)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "12px 24px", borderBottom: `1px solid ${c.line}`, borderTop: `1px solid ${c.line}`, ...mono, color: c.faint }}>
                <div>Élève</div>
                <div>Offre</div>
                <div style={{ textAlign: "right" }}>Montant</div>
                <div>Statut</div>
                <div>Échéance</div>
                <div>Depuis</div>
              </div>

              {filtered.map((s, i) => {
                const si = statusInfo(s.statut);
                const isHighlighted = highlightId != null && s.id === highlightId;
                return (
                  <div key={s.id} ref={isHighlighted ? highlightRef : undefined} style={{ display: "grid", gridTemplateColumns: COLS, gap: 14, padding: "14px 24px", borderBottom: i < filtered.length - 1 ? `1px solid ${c.hairline}` : "none", alignItems: "center", background: isHighlighted ? `${ACCENT}1A` : "transparent", boxShadow: isHighlighted ? `inset 0 0 0 1px ${ACCENT}` : "none", borderRadius: isHighlighted ? 12 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <Avatar name={s.who} size={30} dark={dark} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.who}</div>
                        {s.phone && <div style={{ ...mono, color: c.faint, marginTop: 2 }}>{s.phone}</div>}
                      </div>
                    </div>
                    <div>
                      <Pill c={c} tone={s.offre.startsWith("Coaching") ? "ink" : "outline"}>{s.offre}</Pill>
                    </div>
                    <div style={{ ...num, fontSize: 14, fontWeight: 500, textAlign: "right" }}>{s.montant}</div>
                    <div>
                      <Pill c={c} tone={si.tone}>
                        <span style={{ width: 5, height: 5, borderRadius: 5, background: si.tone === "success" ? c.successFg : si.tone === "outline" ? c.faint : "#0B0B0B" }} />
                        {si.label}
                      </Pill>
                    </div>
                    <div style={{ ...num, fontSize: 13, color: s.echeance ? c.text : c.faint }}>{fmtDateShort(s.echeance)}</div>
                    <div style={{ ...mono, color: c.muted }}>{fmtDate(s.depuis)}</div>
                  </div>
                );
              })}
            </>
          )}

          {filtered.length === 0 && (
            <div style={{ padding: "40px 22px", textAlign: "center", color: c.muted, fontSize: 14 }}>
              Aucun abonnement pour ce filtre.
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function AreaChart({ c, data }: { c: C; data: number[] }) {
  const W = 720, H = 200, PAD_L = 50, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  if (!data.length) return <div style={{ padding: "8px 24px 20px", ...mono, color: c.faint }}>Pas de données.</div>;
  const max = Math.max(Math.ceil(Math.max(...data) / 1000) * 1000, 1000);
  const stepX = innerW / (data.length - 1 || 1);
  const points = data.map((v, i) => [PAD_L + i * stepX, PAD_T + innerH - (v / max) * innerH]);
  const linePath = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0]},${PAD_T + innerH} L${points[0][0]},${PAD_T + innerH} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ y: PAD_T + innerH - t * innerH, v: Math.round(max * t) }));

  // 12 month labels relative to now
  const monthLabels = data.map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (data.length - 1 - i));
    return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d).toUpperCase().replace(".", "");
  });

  return (
    <div style={{ padding: "8px 24px 20px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block", width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="studio-rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke={c.hairline} strokeWidth="1" strokeDasharray={i === 0 ? "" : "2 3"} />
            <text x={PAD_L - 8} y={t.y + 3} fontSize="9" fill={c.faint} fontFamily="'DM Mono', monospace" textAnchor="end">
              {(t.v / 1000).toFixed(0)}K
            </text>
          </g>
        ))}
        <path d={areaPath} fill="url(#studio-rev-grad)" />
        <path d={linePath} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === points.length - 1 ? 4 : 0} fill={ACCENT} />
        ))}
        {monthLabels.map((m, i) => (
          <text key={i} x={PAD_L + i * stepX} y={H - 10} fontSize="9" fill={i === data.length - 1 ? c.text : c.faint} fontFamily="'DM Mono', monospace" textAnchor="middle" letterSpacing="0.06em">
            {m}
          </text>
        ))}
      </svg>
    </div>
  );
}
