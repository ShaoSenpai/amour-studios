"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  Avatar,
  Sparkline,
  Pill,
  GlassButton,
  useIsMobile,
  SPACE,
  type C,
} from "./_components/glass";
import { useTestMode } from "./_components/test-mode";
import {
  useTestStore,
  selectDashboardToday,
  selectStudentsList,
} from "./_components/test-store";
import { RdvDialog } from "./_components/rdv-dialog";
import { OnboardingsPendingBlock } from "./_components/onboardings-pending";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

// ============================================================================
// Aujourd'hui — écran d'accueil du back-office coach (Glass Chunky).
// Données réelles via api.coaching.dashboardToday.
// ============================================================================

function KPI({
  c,
  dark,
  label,
  value,
  delta,
  note,
  warn = false,
  featured = false,
  isMobile = false,
  onClick,
}: {
  c: C;
  dark: boolean;
  label: string;
  value: ReactNode;
  delta: string;
  note: string;
  warn?: boolean;
  featured?: boolean;
  isMobile?: boolean;
  onClick?: () => void;
}) {
  const deltaStyle: CSSProperties = {
    ...mono,
    fontSize: 10,
    padding: "4px 9px",
    borderRadius: 999,
    background: warn ? ACCENT : "transparent",
    color: warn ? "#0B0B0B" : c.muted,
    whiteSpace: "nowrap",
    flexShrink: 0,
    border: warn ? "none" : `1px solid ${c.line}`,
  };
  return (
    <Glass c={c} dark={dark} strong={featured} pad={22} onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: isMobile ? 120 : 168, minWidth: 0, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ ...mono, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={deltaStyle}>
          {warn ? "▲ " : "↗ "}
          {delta}
        </span>
      </div>
      <div style={{ ...num, fontSize: 56, fontWeight: 500, lineHeight: 0.95, whiteSpace: "nowrap", color: featured ? ACCENT : c.text }}>{value}</div>
      <div style={{ ...mono, color: c.faint, marginTop: "auto" }}>{note}</div>
    </Glass>
  );
}

export default function AujourdhuiPage() {
  const dark = useIsDark();
  const router = useRouter();
  const { testMode } = useTestMode();
  const live = useQuery(api.coaching.dashboardToday);
  const liveStudents = useQuery(api.coaching.studentsList);
  // Abonnement réactif au store sandbox (re-render à chaque mutation en test).
  useTestStore();
  const isMobile = useIsMobile();
  const c = palette(dark, ACCENT);

  const [rdvOpen, setRdvOpen] = useState(false);

  const d = testMode ? selectDashboardToday() : live;
  const studentsRaw = testMode ? selectStudentsList() : liveStudents;

  // Options pour le sélecteur d'élève du dialog RDV (pseudo Discord en priorité).
  const studentOptions = useMemo(
    () =>
      (studentsRaw ?? []).map((s) => ({
        _id: s._id,
        label: s.discordUsername || s.name || "—",
      })),
    [studentsRaw]
  );

  if (d === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  // Helpers deep-link : YYYY-MM-DD pour ouvrir l'agenda sur un jour précis.
  // ⚠️ Format en date LOCALE (pas toISOString, qui passe en UTC et recule d'un
  // jour en été à Paris UTC+2 : minuit local 11 juin → "10 juin" en UTC).
  const toISODate = (ts: number) => {
    const dt = new Date(ts);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const todayISO = toISODate(Date.now());

  return (
    <div style={{ background: c.bgGrad, color: c.text, minHeight: "100vh", fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", padding: isMobile ? SPACE.md : 26, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: isMobile ? SPACE.md : 16, maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: isMobile ? "20px 16px" : "28px 32px", display: "flex", flexDirection: "column", gap: 14, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted, textTransform: "capitalize" }}>{dateStr} · {timeStr}</div>
              <div style={{ ...num, fontSize: 46, fontWeight: 500, lineHeight: 1 }}>Bonjour Papi Amour.</div>
              <div style={{ fontSize: 15, color: c.muted, marginTop: -2 }}>
                <span onClick={() => router.push(`/studio/calendrier?date=${todayISO}&view=day`)} style={{ color: c.text, fontWeight: 500, cursor: "pointer" }}>{d.rdvJour.length} rendez-vous</span>,
                <span onClick={() => router.push("/studio/paiements?status=echec")} style={{ color: ACCENT, fontWeight: 500, cursor: "pointer" }}> {d.alertes.length} alertes</span>,
                <span onClick={() => router.push("/studio/eleves?status=incident")} style={{ color: c.text, cursor: "pointer" }}> {d.relances.length} élèves à relancer</span>.
              </div>
            </div>
            <div style={{ padding: isMobile ? "0 16px 20px" : 22, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, alignItems: isMobile ? "stretch" : "center", width: isMobile ? "100%" : undefined }}>
              <GlassButton c={c} kind="solid" onClick={() => setRdvOpen(true)} style={{ width: isMobile ? "100%" : undefined }}>＋ Nouveau RDV</GlassButton>
            </div>
          </div>
        </Glass>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))", gap: isMobile ? SPACE.md : 16 }}>
          <KPI c={c} dark={dark} isMobile={isMobile} label="Coaching actifs" value={d.kpis.coachingActifs.value} delta={d.kpis.coachingActifs.delta} note={d.kpis.coachingActifs.note} onClick={() => router.push("/studio/eleves?tier=coaching")} />
          <KPI c={c} dark={dark} isMobile={isMobile} label="Communauté" value={d.kpis.communaute.value} delta={d.kpis.communaute.delta} note={d.kpis.communaute.note} onClick={() => router.push("/studio/eleves?tier=commu")} />
          <KPI c={c} dark={dark} isMobile={isMobile} label="Impayés" value={d.kpis.impayes.value} delta={d.kpis.impayes.delta} note={d.kpis.impayes.note} warn featured onClick={() => router.push("/studio/paiements?status=echec")} />
          <KPI c={c} dark={dark} isMobile={isMobile} label="MRR" value={d.kpis.mrr.value} delta={d.kpis.mrr.delta} note={d.kpis.mrr.note} onClick={() => router.push("/studio/paiements")} />
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)", gap: isMobile ? SPACE.md : 16 }}>
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? SPACE.md : 16 }}>
            {/* RDV du jour */}
            <Glass c={c} dark={dark} pad={0}>
              <div style={{ padding: "20px 24px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...mono, color: c.muted }}>Programme · aujourd&apos;hui</div>
                  <div style={{ ...num, fontSize: 30, fontWeight: 500, marginTop: 6, lineHeight: 1 }}>{d.rdvJour.length} sessions</div>
                </div>
                <div style={{ display: "flex", gap: 2, background: c.chip, padding: 4, borderRadius: 999, border: `1px solid ${c.line}` }}>
                  {["Jour", "Semaine", "Mois"].map((s, i) => (
                    <span key={s} onClick={() => router.push(`/studio/calendrier?view=${s === "Jour" ? "jour" : s === "Semaine" ? "semaine" : "mois"}`)} style={{ ...mono, fontSize: 10.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer", background: i === 0 ? (dark ? "rgba(255,255,255,0.92)" : "#0B0B0B") : "transparent", color: i === 0 ? (dark ? "#0B0B0B" : "#FFF") : c.muted }}>{s}</span>
                  ))}
                </div>
              </div>
              <div style={{ padding: "0 14px 16px" }}>
                {d.rdvJour.length === 0 && (
                  <div style={{ ...mono, color: c.faint, padding: "18px 14px" }}>Aucun rendez-vous aujourd&apos;hui.</div>
                )}
                {d.rdvJour.map((r, i) => {
                  const isNext = i === 0;
                  // Le lien Meet est le CTA accent du prochain RDV ; sinon « Démarrer »
                  // reste accent. Sans lien Meet, comportement inchangé.
                  const actionPrimary = isNext && !r.meetUrl;
                  const meetBtn = r.meetUrl ? (
                    <a
                      href={r.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Rejoindre le Google Meet"
                      onClick={(e) => e.stopPropagation()}
                      style={{ ...mono, fontSize: 10.5, padding: "9px 14px", borderRadius: 999, border: `1px solid ${isNext ? "transparent" : ACCENT}`, background: isNext ? ACCENT : "transparent", color: isNext ? "#0B0B0B" : ACCENT, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'DM Mono', ui-monospace, monospace" }}
                    >
                      📹 Rejoindre
                    </a>
                  ) : null;
                  const actionBtn = (
                    <button
                      onClick={() => router.push(`/studio/eleves/${r.userId}`)}
                      style={{ ...mono, fontSize: 10.5, padding: "9px 14px", borderRadius: 999, border: `1px solid ${actionPrimary ? "transparent" : c.line}`, background: actionPrimary ? ACCENT : c.chip, color: actionPrimary ? "#0B0B0B" : c.text, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "'DM Mono', ui-monospace, monospace" }}
                    >
                      {isNext ? "Démarrer →" : "Ouvrir →"}
                    </button>
                  );
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "auto 1fr" : "82px 1fr auto auto", gap: isMobile ? 12 : 14, alignItems: "center", padding: "14px", marginTop: i === 0 ? 0 : 4, background: isNext ? c.glass : "transparent", borderRadius: 16, border: isNext ? `1px solid ${c.line}` : "1px solid transparent", boxShadow: isNext ? `inset 0 1px 0 ${c.inner}` : "none" }}>
                      <div>
                        <div style={{ ...num, fontSize: 22, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap" }}>{r.h}</div>
                        <div style={{ ...mono, marginTop: 4, color: c.muted }}>{r.dur}</div>
                      </div>
                      {isMobile ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <div style={{ position: "relative", flexShrink: 0 }}>
                              <Avatar name={r.who} size={32} dark={dark} />
                              {isNext && <div style={{ position: "absolute", inset: -3, borderRadius: 999, border: `2px solid ${ACCENT}`, pointerEvents: "none" }} />}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</div>
                              <div style={{ ...mono, marginTop: 3, color: c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.tag}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                            {r.flag && <Pill c={c} tone="accent">{r.flag}</Pill>}
                            {meetBtn}
                            {actionBtn}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <div style={{ position: "relative" }}>
                              <Avatar name={r.who} size={38} dark={dark} />
                              {isNext && <div style={{ position: "absolute", inset: -3, borderRadius: 999, border: `2px solid ${ACCENT}`, pointerEvents: "none" }} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</div>
                              <div style={{ ...mono, marginTop: 3, color: c.muted }}>{r.tag}</div>
                            </div>
                          </div>
                          <div>{r.flag && <Pill c={c} tone="accent">{r.flag}</Pill>}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {meetBtn}
                            {actionBtn}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </Glass>

            {/* Relances + Alertes */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? SPACE.md : 16 }}>
              <Glass c={c} dark={dark} pad={0}>
                <div style={{ padding: "20px 22px 10px" }}>
                  <div style={{ ...mono, color: c.muted }}>À relancer</div>
                  <div style={{ ...num, fontSize: 26, fontWeight: 500, marginTop: 6 }}>{d.relances.length} silencieux</div>
                </div>
                <div style={{ padding: "4px 14px 16px" }}>
                  {d.relances.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Avatar name={r.who} size={30} dark={dark} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.who}</div>
                          <div style={{ ...mono, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.etape} · {r.last}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (r.discordId) window.open(`https://discord.com/users/${r.discordId}`, "_blank", "noopener,noreferrer");
                          else if (r.userId) router.push(`/studio/eleves/${r.userId}`);
                        }}
                        style={{ ...mono, fontSize: 10, padding: "6px 10px", borderRadius: 999, background: "transparent", border: `1px solid ${c.line}`, color: c.muted, cursor: "pointer", flexShrink: 0 }}
                      >
                        DM
                      </button>
                    </div>
                  ))}
                </div>
              </Glass>

              <Glass c={c} dark={dark} pad={0} tint={dark ? "rgba(50, 22, 12, 0.36)" : "rgba(255, 232, 220, 0.42)"}>
                <div style={{ padding: "20px 22px 10px" }}>
                  <div style={{ ...mono, color: c.muted }}>Paiements</div>
                  <div style={{ ...num, fontSize: 26, fontWeight: 500, marginTop: 6, color: ACCENT }}>{d.alertes.length} alertes</div>
                </div>
                <div style={{ padding: "4px 14px 16px" }}>
                  {d.alertes.map((a, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        if (a.userId) router.push(`/studio/eleves/${a.userId}`);
                        else router.push(`/studio/paiements?highlight=${a.purchaseId}`);
                      }}
                      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: "pointer", borderRadius: 10 }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.who}</div>
                        <div style={{ ...mono, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.type}</div>
                      </div>
                      <div style={{ ...num, fontSize: 14, whiteSpace: "nowrap" }}>{a.montant}</div>
                    </div>
                  ))}
                </div>
              </Glass>
            </div>

            {/* Onboardings en attente (Phase E) */}
            <OnboardingsPendingBlock />
          </div>

          {/* RIGHT */}
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? SPACE.md : 16 }}>
            {/* MRR */}
            <Glass c={c} dark={dark} pad={0} style={{ overflow: "hidden" }}>
              <div style={{ padding: "24px 26px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ ...mono, color: c.muted }}>MRR</div>
                    <div style={{ ...num, fontSize: 46, fontWeight: 500, marginTop: 10, lineHeight: 1, whiteSpace: "nowrap" }}>{d.kpis.mrr.value}</div>
                    <div style={{ ...mono, color: ACCENT, marginTop: 10 }}>↗ {d.kpis.mrr.delta}</div>
                  </div>
                  <span style={{ ...mono, color: c.muted }}>12 MOIS</span>
                </div>
              </div>
              <div style={{ padding: "14px 16px 20px", marginTop: 6 }}>
                <Sparkline data={d.mrrSpark} color={ACCENT} fill={`${ACCENT}28`} />
              </div>
            </Glass>

            {/* Semaine */}
            <Glass c={c} dark={dark}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                <div>
                  <div style={{ ...mono, color: c.muted }}>Semaine à venir</div>
                  <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 4 }}>{d.semaineTotal} sessions</div>
                </div>
              </div>
              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.rdvSemaine.map((day, i) => (
                    <button key={i} onClick={() => router.push(`/studio/calendrier?date=${toISODate(day.date)}&view=day`)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48, padding: "0 14px", borderRadius: 12, background: i === 0 ? ACCENT : c.chip, color: i === 0 ? "#0B0B0B" : c.text, border: `1px solid ${i === 0 ? "transparent" : c.line}`, fontFamily: "inherit", width: "100%", cursor: "pointer" }}>
                      <span style={{ ...mono, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{day.jour}</span>
                      <span style={{ ...mono, fontSize: 11, flexShrink: 0, color: i === 0 ? "#0B0B0B" : day.n ? ACCENT : c.faint }}>{day.n ? `${day.n} RDV` : "—"}</span>
                    </button>
                  ))}
                </div>
              ) : (
              <div style={{ overflowX: undefined, margin: undefined }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, minWidth: undefined }}>
                {d.rdvSemaine.map((day, i) => (
                  <div key={i} onClick={() => router.push(`/studio/calendrier?date=${toISODate(day.date)}&view=day`)} style={{ background: i === 0 ? ACCENT : c.chip, color: i === 0 ? "#0B0B0B" : c.text, borderRadius: 14, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: `1px solid ${i === 0 ? "transparent" : c.line}`, boxShadow: `inset 0 1px 0 ${i === 0 ? "rgba(255,255,255,0.2)" : c.inner}`, cursor: "pointer" }}>
                    <div style={{ ...mono, fontSize: 9.5, opacity: 0.7 }}>{day.jour}</div>
                    <div style={{ ...num, fontSize: 22, fontWeight: 500 }}>{day.n}</div>
                  </div>
                ))}
              </div>
              </div>
              )}
            </Glass>

            {/* Onboarding */}
            <Glass c={c} dark={dark} pad={0}>
              <div style={{ padding: "18px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...mono, color: c.muted }}>Onboarding</div>
                <span style={{ ...mono, color: c.faint }}>{d.onboarding.length} en attente</span>
              </div>
              <div style={{ padding: "4px 14px 14px" }}>
                {d.onboarding.length === 0 && <div style={{ ...mono, color: c.faint, padding: "8px 6px" }}>Rien en attente.</div>}
                {d.onboarding.map((o, i) => (
                  <div key={i} onClick={() => { if (o.userId) router.push(`/studio/eleves/${o.userId}`); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: o.userId ? "pointer" : "default", borderRadius: 10 }}>
                    <Avatar name={o.who} size={28} dark={dark} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.who}</div>
                      <div style={{ ...mono, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.etape}</div>
                    </div>
                    <div style={{ ...mono, color: c.faint, flexShrink: 0 }}>+{o.depuis}</div>
                  </div>
                ))}
              </div>
            </Glass>

            {/* Activité */}
            <Glass c={c} dark={dark} pad={0} style={{ flex: 1 }}>
              <div style={{ padding: "18px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...mono, color: c.muted }}>Activité</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, background: ACCENT, borderRadius: 6, boxShadow: `0 0 10px ${ACCENT}` }} />
                  <span style={{ ...mono, color: c.faint, fontSize: 9.5 }}>LIVE</span>
                </div>
              </div>
              <div style={{ padding: "4px 18px 14px" }}>
                {d.activite.map((a, i) => (
                  <div key={i} onClick={() => { if (a.userId) router.push(`/studio/eleves/${a.userId}`); }} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: a.userId ? "pointer" : "default" }}>
                    <div style={{ ...mono, color: c.faint, width: 84, flexShrink: 0, fontSize: 9.5 }}>{a.t}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.txt}</div>
                  </div>
                ))}
              </div>
            </Glass>
          </div>
        </div>
      </div>

      <RdvDialog
        open={rdvOpen}
        onClose={() => setRdvOpen(false)}
        mode="create"
        students={studentOptions}
      />
    </div>
  );
}
