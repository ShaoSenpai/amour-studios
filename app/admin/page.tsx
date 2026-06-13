"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

// ============================================================================
// Aujourd'hui — écran d'accueil du back-office coach.
// Direction "Glass Chunky" (validée en design) : verre translucide, orbes
// orange en fond, Schibsted Grotesk XXL + DM Mono. Light + dark.
// Données réelles via api.coaching.dashboardToday.
// ============================================================================

const ACCENT = "#FF5A1F";

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setDark(document.documentElement.getAttribute("data-theme") === "dark");
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

function palette(dark: boolean, accent: string) {
  return dark
    ? {
        bgGrad: `radial-gradient(ellipse 90% 70% at 12% 8%, ${accent}38, transparent 55%),
                 radial-gradient(ellipse 70% 60% at 88% 92%, ${accent}22, transparent 65%),
                 radial-gradient(ellipse 80% 50% at 50% 50%, #4A2E1A2A, transparent 70%),
                 #08080C`,
        glass: "rgba(28, 28, 36, 0.28)",
        glassStrong: "rgba(34, 34, 44, 0.42)",
        sheen:
          "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 28%, transparent 50%, transparent 72%, rgba(255,255,255,0.03) 100%)",
        text: "#F5F2EC",
        muted: "rgba(245,242,236,0.58)",
        faint: "rgba(245,242,236,0.32)",
        line: "rgba(255,255,255,0.07)",
        hairline: "rgba(255,255,255,0.05)",
        chip: "rgba(255,255,255,0.06)",
        inner: "rgba(255,255,255,0.06)",
        shadow: "0 30px 60px -30px rgba(0,0,0,0.6)",
      }
    : {
        bgGrad: `radial-gradient(ellipse 80% 60% at 10% 6%, ${accent}48, transparent 55%),
                 radial-gradient(ellipse 60% 50% at 94% 94%, ${accent}36, transparent 65%),
                 radial-gradient(ellipse 70% 40% at 55% 45%, #FFFFFF70, transparent 65%),
                 #E8E3D7`,
        glass: "rgba(255, 252, 246, 0.32)",
        glassStrong: "rgba(255, 252, 246, 0.50)",
        sheen:
          "linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.10) 28%, transparent 50%, transparent 72%, rgba(255,255,255,0.18) 100%)",
        text: "#0B0B0B",
        muted: "rgba(11,11,11,0.58)",
        faint: "rgba(11,11,11,0.34)",
        line: "rgba(11,11,11,0.07)",
        hairline: "rgba(11,11,11,0.06)",
        chip: "rgba(11,11,11,0.05)",
        inner: "rgba(255,255,255,0.55)",
        shadow: "0 30px 60px -28px rgba(20,16,8,0.16)",
      };
}

type C = ReturnType<typeof palette>;

const mono: CSSProperties = {
  fontFamily: "'DM Mono', ui-monospace, monospace",
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 400,
};
const num: CSSProperties = {
  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.025em",
};
const R = 22;

function Glass({
  c,
  dark,
  children,
  pad = 22,
  strong = false,
  tint,
  style = {},
}: {
  c: C;
  dark: boolean;
  children: ReactNode;
  pad?: number;
  strong?: boolean;
  tint?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: tint || (strong ? c.glassStrong : c.glass),
        backgroundImage: c.sheen,
        backgroundBlendMode: dark ? "plus-lighter" : "normal",
        backdropFilter: "blur(40px) saturate(150%)",
        WebkitBackdropFilter: "blur(40px) saturate(150%)",
        borderRadius: R,
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

function Avatar({ name, size = 28, dark = false }: { name: string; size?: number; dark?: boolean }) {
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
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

function Sparkline({ data, color, fill, width = 400, height = 60 }: { data: number[]; color: string; fill: string; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1 || 1);
  const points = data.map((v, i) => [i * stepX, height - 2 - ((v - min) / range) * (height - 4)]);
  const d = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

function glassBtn(c: C, kind: "solid" | "ghost"): CSSProperties {
  const base: CSSProperties = {
    fontFamily: "'DM Mono', ui-monospace, monospace",
    fontSize: 11,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: "12px 16px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
  if (kind === "solid")
    return {
      ...base,
      background: ACCENT,
      color: "#0B0B0B",
      boxShadow: `0 8px 24px -8px ${ACCENT}80, inset 0 1px 0 rgba(255,255,255,0.3)`,
    };
  return { ...base, background: c.chip, color: c.text, border: `1px solid ${c.line}`, backdropFilter: "blur(12px)" };
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 10,
        background: ACCENT,
        color: "#0B0B0B",
        padding: "5px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </span>
  );
}

function KPI({ c, dark, label, value, delta, note, warn = false, featured = false }: { c: C; dark: boolean; label: string; value: ReactNode; delta: string; note: string; warn?: boolean; featured?: boolean }) {
  return (
    <Glass c={c} dark={dark} strong={featured} pad={22} style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 168, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ ...mono, color: c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <span style={{ ...mono, fontSize: 10, padding: "4px 9px", borderRadius: 999, background: warn ? ACCENT : "transparent", color: warn ? "#0B0B0B" : c.muted, whiteSpace: "nowrap", flexShrink: 0, border: warn ? "none" : `1px solid ${c.line}` }}>
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
  const user = useQuery(api.users.current);
  const dark = useIsDark();
  const d = useQuery(api.coaching.dashboardToday);
  const c = palette(dark, ACCENT);

  if (user === undefined || d === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }
  if (!user || user.role !== "admin") {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ ...mono, color: c.muted }}>◦ Accès refusé</p>
      </main>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ background: c.bgGrad, color: c.text, minHeight: "100vh", fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", padding: 26, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 14, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted, textTransform: "capitalize" }}>{dateStr} · {timeStr}</div>
              <div style={{ ...num, fontSize: 46, fontWeight: 500, lineHeight: 1 }}>{"Bonjour Papi Amour."}</div>
              <div style={{ fontSize: 15, color: c.muted, marginTop: -2 }}>
                <span style={{ color: c.text, fontWeight: 500 }}>{d.rdvJour.length} rendez-vous</span>,
                <span style={{ color: ACCENT, fontWeight: 500 }}> {d.alertes.length} alertes</span>,
                <span style={{ color: c.text }}> {d.relances.length} élèves à relancer</span>.
              </div>
            </div>
            <div style={{ padding: 22, display: "flex", gap: 8, alignItems: "center" }}>
              <button className="glass-btn" style={glassBtn(c, "ghost")}>＋ Note</button>
              <button className="glass-btn" style={glassBtn(c, "solid")}>＋ Nouveau RDV</button>
            </div>
          </div>
        </Glass>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
          <KPI c={c} dark={dark} label="Coaching actifs" value={d.kpis.coachingActifs.value} delta={d.kpis.coachingActifs.delta} note={d.kpis.coachingActifs.note} />
          <KPI c={c} dark={dark} label="Communauté" value={d.kpis.communaute.value} delta={d.kpis.communaute.delta} note={d.kpis.communaute.note} />
          <KPI c={c} dark={dark} label="Impayés" value={d.kpis.impayes.value} delta={d.kpis.impayes.delta} note={d.kpis.impayes.note} warn featured />
          <KPI c={c} dark={dark} label="MRR" value={d.kpis.mrr.value} delta={d.kpis.mrr.delta} note={d.kpis.mrr.note} />
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16 }}>
          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* RDV du jour */}
            <Glass c={c} dark={dark} pad={0}>
              <div style={{ padding: "20px 24px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...mono, color: c.muted }}>{"Programme · aujourd'hui"}</div>
                  <div style={{ ...num, fontSize: 30, fontWeight: 500, marginTop: 6, lineHeight: 1 }}>
                    {d.rdvJour.length} sessions
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2, background: c.chip, padding: 4, borderRadius: 999, border: `1px solid ${c.line}` }}>
                  {["Jour", "Semaine", "Mois"].map((s, i) => (
                    <button key={s} style={{ ...mono, fontSize: 10.5, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: i === 0 ? (dark ? "rgba(255,255,255,0.92)" : "#0B0B0B") : "transparent", color: i === 0 ? (dark ? "#0B0B0B" : "#FFF") : c.muted }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: "0 14px 16px" }}>
                {d.rdvJour.length === 0 && (
                  <div style={{ ...mono, color: c.faint, padding: "18px 14px" }}>Aucun rendez-vous aujourd&apos;hui.</div>
                )}
                {d.rdvJour.map((r, i) => {
                  const isNext = i === 0;
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "82px 1fr auto auto", gap: 14, alignItems: "center", padding: "14px", marginTop: i === 0 ? 0 : 4, background: isNext ? c.glass : "transparent", borderRadius: 16, border: isNext ? `1px solid ${c.line}` : "1px solid transparent", boxShadow: isNext ? `inset 0 1px 0 ${c.inner}` : "none" }}>
                      <div>
                        <div style={{ ...num, fontSize: 22, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap" }}>{r.h}</div>
                        <div style={{ ...mono, marginTop: 4, color: c.muted }}>{r.dur}</div>
                      </div>
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
                      <div>{r.flag && <Pill>{r.flag}</Pill>}</div>
                      <button style={{ ...mono, fontSize: 10.5, padding: "9px 14px", borderRadius: 999, border: `1px solid ${isNext ? "transparent" : c.line}`, background: isNext ? ACCENT : c.chip, color: isNext ? "#0B0B0B" : c.text, cursor: "pointer", whiteSpace: "nowrap" }}>{isNext ? "Démarrer →" : "Ouvrir →"}</button>
                    </div>
                  );
                })}
              </div>
            </Glass>

            {/* Relances + Alertes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                          <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{r.etape} · {r.last}</div>
                        </div>
                      </div>
                      <button style={{ ...mono, fontSize: 10, padding: "6px 10px", borderRadius: 999, background: "transparent", border: `1px solid ${c.line}`, color: c.muted, cursor: "pointer" }}>DM</button>
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
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.who}</div>
                        <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{a.type}</div>
                      </div>
                      <div style={{ ...num, fontSize: 14, whiteSpace: "nowrap" }}>{a.montant}</div>
                    </div>
                  ))}
                </div>
              </Glass>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {d.rdvSemaine.map((day, i) => (
                  <div key={i} style={{ background: i === 0 ? ACCENT : c.chip, color: i === 0 ? "#0B0B0B" : c.text, borderRadius: 14, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: `1px solid ${i === 0 ? "transparent" : c.line}`, boxShadow: `inset 0 1px 0 ${i === 0 ? "rgba(255,255,255,0.2)" : c.inner}` }}>
                    <div style={{ ...mono, fontSize: 9.5, opacity: 0.7 }}>{day.jour}</div>
                    <div style={{ ...num, fontSize: 22, fontWeight: 500 }}>{day.n}</div>
                  </div>
                ))}
              </div>
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
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                    <Avatar name={o.who} size={28} dark={dark} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o.who}</div>
                      <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{o.etape}</div>
                    </div>
                    <div style={{ ...mono, color: c.faint }}>+{o.depuis}</div>
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
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                    <div style={{ ...mono, color: c.faint, width: 84, flexShrink: 0, fontSize: 9.5 }}>{a.t}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.txt}</div>
                  </div>
                ))}
              </div>
            </Glass>
          </div>
        </div>
      </div>
    </div>
  );
}
