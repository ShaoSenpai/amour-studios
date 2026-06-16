"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SPRING } from "@/lib/motion";
import { useAppSpring } from "@/lib/use-app-spring";
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
  GlassButton,
  curriculumLabel,
  SPACE,
  type C,
} from "../_components/glass";
import { useTestMode } from "../_components/test-mode";
import {
  useTestStore,
  testStore,
  selectSessionsInRange,
  selectStudentsWithoutUpcoming,
  selectStudentsList,
} from "../_components/test-store";
import { RdvDialog } from "../_components/rdv-dialog";

type SessionType = "onboarding" | "coaching" | "other";
type RdvState =
  | { mode: "create"; scheduledAt?: number }
  | {
      mode: "reschedule";
      userId: Id<"users">;
      sessionId: Id<"coachingSessions">;
      scheduledAt: number;
      endAt?: number;
      type: SessionType;
      curriculumItemId?: Id<"curriculum">;
    };

// ============================================================================
// Calendrier — vue semaine (7j × grille 8h-20h) via api.coaching.sessionsInRange.
// Couleurs par statut, ligne "now", bloc Sans RDV, + RDV manuel.
// ============================================================================

const START_HOUR = 8;
const END_HOUR = 20;
const ROW_HEIGHT = 56;
const DAY_MS = 86400000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - dow);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

type CalView = "day" | "week" | "month";
const VIEW_LABELS: { id: CalView; label: string }[] = [
  { id: "day", label: "Jour" },
  { id: "week", label: "Semaine" },
  { id: "month", label: "Mois" },
];
const VIEW_WORD: Record<CalView, string> = { day: "jour", week: "semaine", month: "mois" };

// Filtres du bloc latéral « Rendez-vous » : on choisit le statut affiché.
const RDV_FILTERS = [
  { id: "scheduled" as const, label: "À venir", color: "#3B82F6" },
  { id: "completed" as const, label: "Passés", color: "#1FA463" },
  { id: "no_show" as const, label: "No-show", color: "#E03131" },
  { id: "canceled" as const, label: "Annulé", color: "#F97316" },
];
type RdvFilter = (typeof RDV_FILTERS)[number]["id"];

/** ms → "12 mars · 14:30". */
function fmtWhen(ts: number): string {
  const d = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(ts));
  const t = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
  return `${d} · ${t}`;
}

export default function CalendrierPage() {
  const dark = useIsDark();
  const isMobile = useIsMobile();
  const router = useRouter();
  const { testMode } = useTestMode();
  const c = palette(dark, ACCENT);
  const spring = useAppSpring(SPRING);

  // Deep-link : ?date=YYYY-MM-DD ouvre ce jour, ?view= force la vue (depuis le
  // dashboard « Aujourd'hui » : cases « Semaine à venir », toggle Jour/Sem/Mois).
  const searchParams = useSearchParams();
  const initView: CalView = (() => {
    const v = searchParams.get("view");
    if (v === "jour" || v === "day") return "day";
    if (v === "semaine" || v === "week") return "week";
    if (v === "mois" || v === "month") return "month";
    if (searchParams.get("date")) return "day"; // date précise sans vue → jour
    return "week";
  })();
  const initAnchor: Date = (() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const parsed = new Date(d + "T12:00:00"); // midi : évite les bascules TZ
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  })();

  const [view, setView] = useState<CalView>(initView);
  const [anchor, setAnchor] = useState<Date>(() => initAnchor);

  // Mobile : démarrer en vue Jour (1 colonne lisible) au premier rendu, sans
  // casser le SSR (l'init reste `initView`) ni empêcher l'utilisateur de
  // rechoisir semaine/mois ensuite. One-shot via une garde useRef.
  const didInitView = useRef(false);
  useEffect(() => {
    if (didInitView.current) return;
    didInitView.current = true;
    if (isMobile) setView("day");
  }, [isMobile]);

  // Plage affichée selon la vue : `cols` = colonnes de la grille horaire
  // (1 jour / 7 jours), `monthCells` = 42 cases du mois. `from`/`to` couvrent
  // la période visible (sert à la query sessionsInRange).
  const range = useMemo(() => {
    if (view === "day") {
      const d = startOfDay(anchor);
      const from = d.getTime();
      return {
        from,
        to: from + DAY_MS,
        cols: [d],
        monthCells: [] as Date[],
        label: new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d),
      };
    }
    if (view === "month") {
      const first = startOfMonth(anchor);
      const gridStart = startOfWeek(first);
      const from = gridStart.getTime();
      const monthCells = Array.from({ length: 42 }, (_, i) => new Date(from + i * DAY_MS));
      return {
        from,
        to: from + 42 * DAY_MS,
        cols: [] as Date[],
        monthCells,
        label: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(first),
      };
    }
    const ws = startOfWeek(anchor);
    const from = ws.getTime();
    const cols = Array.from({ length: 7 }, (_, i) => new Date(from + i * DAY_MS));
    const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(d);
    return { from, to: from + 7 * DAY_MS, cols, monthCells: [] as Date[], label: `${fmt(ws)} → ${fmt(new Date(from + 6 * DAY_MS))}` };
  }, [view, anchor]);
  const { from, to, cols, monthCells, label: rangeLabel } = range;
  const monthIndex = anchor.getMonth();

  // Navigation : décale l'ancre d'une unité selon la vue.
  const shift = (dir: number) =>
    setAnchor((a) => {
      const d = new Date(a);
      if (view === "day") d.setDate(d.getDate() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });

  const liveSessions = useQuery(api.coaching.sessionsInRange, { from, to });
  const liveWithout = useQuery(api.coaching.studentsWithoutUpcoming);
  const liveStudents = useQuery(api.coaching.studentsList);
  const completeSession = useMutation(api.coaching.completeSession);
  const cancelSession = useMutation(api.coaching.cancelSession);
  const updateSession = useMutation(api.coaching.updateSession);
  const resyncCalendly = useMutation(api.coaching.resyncCalendlyNow);
  const [resyncing, setResyncing] = useState(false);
  // Snapshot réactif : sert de dépendance aux mémos des sélecteurs sandbox.
  const storeState = useTestStore();

  // En mode test : sessions du store sandbox, filtrées sur la fenêtre [from,to]
  // de la semaine affichée. Création/annulation/complétion se reflètent ici.
  // Mémoïsé pour préserver l'optimisation du React Compiler sur from/weekStart.
  const sessions = useMemo(() => {
    void storeState; // dépendance réactive : recalcul à chaque mutation du store
    return testMode ? selectSessionsInRange(from, to) : liveSessions;
  }, [testMode, from, to, liveSessions, storeState]);
  const without = useMemo(() => {
    void storeState;
    return testMode ? selectStudentsWithoutUpcoming() : liveWithout;
  }, [testMode, liveWithout, storeState]);

  // Bloc latéral « Rendez-vous » : filtre par statut sur la semaine affichée.
  const [rdvFilter, setRdvFilter] = useState<RdvFilter>("scheduled");
  const filteredRdv = useMemo(() => {
    const list = (sessions ?? []).filter((s) => s.status === rdvFilter);
    list.sort((a, b) =>
      rdvFilter === "scheduled" ? a.scheduledAt - b.scheduledAt : b.scheduledAt - a.scheduledAt
    );
    return list;
  }, [sessions, rdvFilter]);
  const studentsRaw = useMemo(() => {
    void storeState;
    return testMode ? selectStudentsList() : liveStudents;
  }, [testMode, liveStudents, storeState]);

  // Dialog RDV + popover d'actions sur un event.
  const [rdv, setRdv] = useState<RdvState | null>(null);
  const [activeEvent, setActiveEvent] = useState<string | null>(null);

  const studentOptions = useMemo(
    () =>
      (studentsRaw ?? []).map((s) => ({
        _id: s._id,
        label: s.discordUsername || s.name || "—",
      })),
    [studentsRaw]
  );

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  // "now" en state pour rester pur côté render + rafraîchir la ligne now.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Fermeture du menu d'event au clic extérieur (remplace l'overlay plein écran
  // qui, dans une carte glass/backdrop-filter, passait AU-DESSUS du menu et
  // interceptait clics + survol).
  useEffect(() => {
    if (activeEvent === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("[data-evpopover]") || t.closest("[data-evbtn]"))) return;
      setActiveEvent(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeEvent]);
  const isTodayInRange = nowTs >= from && nowTs < to;
  const todayStr = new Date(nowTs).toDateString();

  const statusColor = (s: string) => {
    if (s === "completed") return { bg: c.chip, border: c.line, color: c.muted };
    if (s === "no_show")
      return {
        bg: dark ? "rgba(255,90,31,0.18)" : "rgba(255,90,31,0.16)",
        border: dark ? "rgba(255,90,31,0.4)" : "rgba(255,90,31,0.5)",
        color: ACCENT,
      };
    if (s === "canceled") return { bg: "transparent", border: c.line, color: c.faint };
    return { bg: c.glassStrong, border: c.line, color: c.text };
  };

  // « + RDV manuel » → dialog create avec sélecteur d'élève.
  const openManual = () => setRdv({ mode: "create" });

  // Clic sur un créneau vide → dialog create pré-rempli (jour + heure).
  const openSlot = (day: Date, hour: number) => {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    setRdv({ mode: "create", scheduledAt: d.getTime() });
  };

  // Mini-actions sur un event.
  const doComplete = (sessionId: Id<"coachingSessions">) => {
    setActiveEvent(null);
    if (testMode) {
      testStore.completeSession({ sessionId });
      toast.success("✓ Enregistré (mode test)");
      return;
    }
    void completeSession({ sessionId }).then(() => toast.success("Marqué fait."));
  };
  const doCancel = (sessionId: Id<"coachingSessions">) => {
    setActiveEvent(null);
    if (testMode) {
      testStore.cancelSession({ sessionId });
      toast.success("✓ Enregistré (mode test)");
      return;
    }
    void cancelSession({ sessionId }).then(() => toast.success("Annulé."));
  };

  // Glisser-déposer : déplacer un RDV vers un autre jour/créneau (durée conservée).
  const handleMove = (sessionIdStr: string, day: Date, hour: number) => {
    const s = (sessions ?? []).find(
      (x) => (x._id as unknown as string) === sessionIdStr
    );
    if (!s) return;
    const dur = s.endAt ? s.endAt - s.scheduledAt : 45 * 60000;
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const scheduledAt = start.getTime();
    if (scheduledAt === s.scheduledAt) return;
    if (testMode) {
      testStore.updateSession({ sessionId: s._id, scheduledAt, endAt: scheduledAt + dur });
      toast.success("✓ Déplacé (mode test)");
      return;
    }
    void updateSession({ sessionId: s._id, scheduledAt, endAt: scheduledAt + dur }).then(
      () => toast.success("RDV déplacé.")
    );
  };

  const total = sessions?.length ?? 0;
  const noShows = sessions?.filter((s) => s.status === "no_show").length ?? 0;
  const canceled = sessions?.filter((s) => s.status === "canceled").length ?? 0;

  if (sessions === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: isMobile ? SPACE.md : 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "26px 30px", display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted }}>Agenda · vue {VIEW_WORD[view]}</div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>Calendrier</div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                <span style={{ color: c.text, fontWeight: 500 }}>{total} sessions</span>
                {" sur la période · "}
                <span style={{ color: ACCENT, fontWeight: 500 }}>{without?.length ?? 0} élèves sans RDV</span>
              </div>
            </div>
            <div style={{ padding: isMobile ? SPACE.md : 22, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <GlassButton
                c={c}
                disabled={resyncing}
                onClick={async () => {
                  if (resyncing) return;
                  setResyncing(true);
                  try {
                    await resyncCalendly({});
                    toast.success("Resync Calendly lancé — les RDV manquants vont apparaître.");
                  } catch (err) {
                    toast.error((err as Error).message ?? "Resync échoué.");
                  } finally {
                    setResyncing(false);
                  }
                }}
              >
                {resyncing ? "Resync…" : "🔁 Resync Calendly"}
              </GlassButton>
              <GlassButton c={c} kind="solid" onClick={openManual}>＋ RDV manuel</GlassButton>
            </div>
          </div>
        </Glass>

        {/* Controls : navigation + sélecteur de vue. Sur mobile : empilé proprement
            (nav ‹ › + vue sur une ligne, label de période centré sur la sienne). */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          {isMobile ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => shift(-1)} style={navBtn(c)}>‹</button>
                  <button onClick={() => shift(1)} style={navBtn(c)}>›</button>
                </div>
                {/* Sélecteur de vue (Jour seul sur mobile) */}
                <div style={{ display: "flex", gap: 4, padding: 4, background: c.chip, borderRadius: 999, border: `1px solid ${c.line}` }}>
                  {VIEW_LABELS.filter((v) => v.id === "day").map((v) => {
                    const active = view === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setView(v.id)}
                        style={{
                          ...mono,
                          fontSize: 10.5,
                          padding: "7px 14px",
                          borderRadius: 999,
                          cursor: "pointer",
                          border: "none",
                          background: active ? ACCENT : "transparent",
                          color: active ? "#0B0B0B" : c.muted,
                          fontWeight: 500,
                        }}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ ...num, fontSize: 20, fontWeight: 500, textTransform: "capitalize", textAlign: "center" }}>{rangeLabel}</div>
            </>
          ) : (
          <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => shift(-1)} style={navBtn(c)}>‹</button>
              <button onClick={() => shift(1)} style={navBtn(c)}>›</button>
            </div>
            <div style={{ ...num, fontSize: 20, fontWeight: 500, textTransform: "capitalize" }}>{rangeLabel}</div>
          </div>
          {/* Sélecteur Jour / Semaine / Mois (desktop : 3 vues inchangées) */}
          <div style={{ display: "flex", gap: 4, padding: 4, background: c.chip, borderRadius: 999, border: `1px solid ${c.line}` }}>
            {VIEW_LABELS.map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  style={{
                    ...mono,
                    fontSize: 10.5,
                    padding: "7px 14px",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: "none",
                    background: active ? ACCENT : "transparent",
                    color: active ? "#0B0B0B" : c.muted,
                    fontWeight: 500,
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
          </>
          )}
        </div>

        {/* Grid + sidebar */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 320px", gap: 16 }}>
          {/* Calendar */}
          <Glass c={c} dark={dark} pad={0} style={{ overflow: "hidden" }}>
            {view === "month" ? (
              <MonthGrid
                c={c}
                dark={dark}
                isMobile={isMobile}
                cells={monthCells}
                sessions={sessions ?? []}
                monthIndex={monthIndex}
                todayStr={todayStr}
                statusColor={statusColor}
                onPickDay={(d) => {
                  setAnchor(d);
                  setView("day");
                }}
              />
            ) : (
            // En mobile : scroll horizontal seulement en vue semaine (7 colonnes).
            // En vue Jour (1 colonne) on laisse la grille remplir la largeur sans
            // minWidth, sinon scroll + vide à droite inutiles à 375px.
            <div style={{ overflowX: isMobile && cols.length > 1 ? "auto" : "visible" }}>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(${cols.length}, 1fr)`, minWidth: isMobile && cols.length > 1 ? 700 : undefined, borderBottom: `1px solid ${c.line}` }}>
              <div />
              {cols.map((d, i) => {
                const isToday = todayStr === d.toDateString();
                const dayCount = sessions.filter((s) => new Date(s.scheduledAt).toDateString() === d.toDateString()).length;
                const dow = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d).toUpperCase().replace(".", "");
                return (
                  <div key={i} style={{ padding: "14px 12px", borderLeft: `1px solid ${c.hairline}`, display: "flex", flexDirection: "column", gap: 4, background: isToday ? (dark ? "rgba(255,90,31,0.06)" : "rgba(255,90,31,0.05)") : "transparent" }}>
                    <div style={{ ...mono, fontSize: 9.5, color: isToday ? ACCENT : c.muted }}>{dow}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ ...num, fontSize: 22, fontWeight: 500, color: isToday ? ACCENT : c.text }}>{d.getDate()}</div>
                      {isToday && <Pill c={c} tone="accent">AUJ.</Pill>}
                      {!isToday && dayCount > 0 && <span style={{ ...mono, color: c.faint }}>{dayCount} RDV</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Body */}
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: `56px repeat(${cols.length}, 1fr)`, minWidth: isMobile && cols.length > 1 ? 700 : undefined }}>
              {/* gutter */}
              <div>
                {hours.map((h) => (
                  <div key={h} style={{ height: ROW_HEIGHT, borderTop: `1px solid ${c.hairline}`, position: "relative" }}>
                    <div style={{ ...mono, color: c.faint, fontSize: 9.5, position: "absolute", top: -7, right: 8 }}>
                      {h.toString().padStart(2, "0")}:00
                    </div>
                  </div>
                ))}
              </div>

              {cols.map((d, dayIdx) => {
                const isToday = todayStr === d.toDateString();
                const dayEvents = sessions.filter((s) => new Date(s.scheduledAt).toDateString() === d.toDateString());
                return (
                  <div key={dayIdx} style={{ position: "relative", borderLeft: `1px solid ${c.hairline}`, background: isToday ? (dark ? "rgba(255,90,31,0.04)" : "rgba(255,90,31,0.025)") : "transparent" }}>
                    {hours.map((h) => (
                      <button
                        key={h}
                        onClick={() => openSlot(d, h)}
                        title={`Nouveau RDV · ${h.toString().padStart(2, "0")}:00`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.background = c.chip;
                        }}
                        onDragLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.background = "transparent";
                          const id = e.dataTransfer.getData("text/plain");
                          if (id) handleMove(id, d, h);
                        }}
                        style={{ display: "block", width: "100%", height: ROW_HEIGHT, borderTop: `1px solid ${c.hairline}`, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "transparent", cursor: "pointer", padding: 0 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      />
                    ))}

                    {isToday && isTodayInRange && <NowLine nowTs={nowTs} />}

                    {dayEvents.map((ev) => {
                      const dt = new Date(ev.scheduledAt);
                      const startMin = (dt.getHours() - START_HOUR) * 60 + dt.getMinutes();
                      if (startMin < 0 || dt.getHours() > END_HOUR) return null;
                      const durMin = ev.endAt ? Math.max(20, (ev.endAt - ev.scheduledAt) / 60000) : 45;
                      const top = (startMin / 60) * ROW_HEIGHT;
                      const height = (durMin / 60) * ROW_HEIGHT;
                      const tone = statusColor(ev.status);
                      const who = ev.student?.discordUsername || ev.student?.name || "—";
                      const fmtHm = (d: Date) =>
                        new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(d);
                      const time = fmtHm(dt);
                      const endTime = ev.endAt ? fmtHm(new Date(ev.endAt)) : null;
                      const lessonLabel = ev.curriculum ? curriculumLabel(ev.curriculum) : null;
                      const statusLabel =
                        ev.status === "scheduled"
                          ? "À venir"
                          : ev.status === "completed"
                          ? "Fait"
                          : ev.status === "canceled"
                          ? "Annulé"
                          : ev.status === "no_show"
                          ? "No-show"
                          : ev.status;
                      // Tooltip (survol) = tout le RDV d'un coup d'œil.
                      const tooltip = [
                        `${who} — ${time}${endTime ? `–${endTime}` : ""}`,
                        lessonLabel ? `Leçon : ${lessonLabel}` : null,
                        `${Math.round(durMin)} min · ${statusLabel}`,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      // Bloc court → contenu compact (1 ligne) pour ne rien couper.
                      const compact = height < 40;
                      const evKey = ev._id as unknown as string;
                      const popoverOpen = activeEvent === evKey;
                      const lateInWeek = dayIdx >= 5;
                      return (
                        <div key={ev._id} style={{ position: "absolute", top, left: 4, right: 4, height: Math.max(height - 2, 20), zIndex: popoverOpen ? 30 : 1 }}>
                          <button
                            data-evbtn=""
                            draggable={ev.status === "scheduled"}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", evKey);
                              e.dataTransfer.effectAllowed = "move";
                              setActiveEvent(null);
                            }}
                            onClick={() => setActiveEvent(popoverOpen ? null : evKey)}
                            title={tooltip}
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: tone.bg,
                              cursor: ev.status === "scheduled" ? "grab" : "pointer",
                              border: `1px solid ${popoverOpen ? ACCENT : tone.border}`,
                              backdropFilter: "blur(20px)",
                              WebkitBackdropFilter: "blur(20px)",
                              borderRadius: 10,
                              padding: compact ? "2px 8px" : "6px 8px",
                              textAlign: "left",
                              fontFamily: "inherit",
                              color: tone.color,
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: compact ? "row" : "column",
                              alignItems: compact ? "baseline" : "stretch",
                              gap: compact ? 6 : 2,
                              boxShadow: ev.status === "scheduled" ? `inset 0 1px 0 ${c.inner}` : "none",
                            }}
                          >
                            {compact ? (
                              // Bloc court : heure + nom sur une ligne, rien de coupé.
                              <>
                                <span style={{ ...mono, fontSize: 9, opacity: 0.7, flexShrink: 0 }}>{time}</span>
                                <span
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: 500,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    textDecoration: ev.status === "canceled" ? "line-through" : "none",
                                  }}
                                >
                                  {who}
                                </span>
                              </>
                            ) : (
                              <>
                                <div style={{ ...mono, fontSize: 9, opacity: 0.7 }}>
                                  {time}
                                  {endTime ? `–${endTime}` : ""}
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 500, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", textDecoration: ev.status === "canceled" ? "line-through" : "none" }}>
                                  {who}
                                </div>
                                {lessonLabel && height >= 52 && (
                                  <div style={{ ...mono, fontSize: 8.5, opacity: 0.6, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                    {lessonLabel}
                                  </div>
                                )}
                              </>
                            )}
                          </button>

                          {popoverOpen && (
                            <EventPopover
                              c={c}
                              dark={dark}
                              alignRight={lateInWeek}
                              isScheduled={ev.status === "scheduled"}
                              meetUrl={ev.meetUrl}
                              onOpen={() => {
                                setActiveEvent(null);
                                if (ev.student) router.push(`/studio/eleves/${ev.student._id}`);
                              }}
                              onReschedule={() => {
                                setActiveEvent(null);
                                if (!ev.student) return;
                                setRdv({
                                  mode: "reschedule",
                                  userId: ev.student._id,
                                  sessionId: ev._id,
                                  scheduledAt: ev.scheduledAt,
                                  endAt: ev.endAt ?? undefined,
                                  type: (ev.type as SessionType) ?? "coaching",
                                  curriculumItemId:
                                    ev.curriculum?._id ?? undefined,
                                });
                              }}
                              onComplete={() => doComplete(ev._id)}
                              onCancel={() => doCancel(ev._id)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </div>
            )}
          </Glass>

          {/* Agenda mobile : la sidebar RDV disparaît en mobile (grille 1 colonne),
              on rend donc la même liste agenda SOUS la grille du jour. Même source
              de données (filteredRdv / rdvFilter) et même item de rendu que la sidebar. */}
          {isMobile && (
            <Glass c={c} dark={dark}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8 }}>
                <div style={{ ...mono, color: c.muted }}>
                  Rendez-vous <span style={{ color: c.faint }}>· {VIEW_WORD[view]}</span>
                </div>
                <span style={{ ...mono, color: c.faint }}>{filteredRdv.length}</span>
              </div>

              {/* Sélecteur de statut — grille 1fr 1fr sur mobile */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                {RDV_FILTERS.map((f) => {
                  const active = rdvFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setRdvFilter(f.id)}
                      style={{
                        ...mono,
                        fontSize: 10.5,
                        padding: "9px 10px",
                        borderRadius: 12,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        background: active ? f.color : c.chip,
                        color: active ? "#FFFFFF" : c.muted,
                        border: `1px solid ${active ? "transparent" : c.line}`,
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Liste agenda — même item de rendu que la sidebar desktop. */}
              <div
                style={{
                  maxHeight: 360,
                  overflowY: "auto",
                  marginRight: -8,
                  paddingRight: 8,
                  scrollbarWidth: "thin",
                  scrollbarColor: `${c.line} transparent`,
                }}
              >
                <motion.div layout transition={spring}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {filteredRdv.length === 0 ? (
                      <motion.div
                        key={`empty-m-${rdvFilter}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ ...mono, color: c.faint, padding: "10px 0 2px" }}
                      >
                        Aucun RDV {RDV_FILTERS.find((f) => f.id === rdvFilter)?.label.toLowerCase()} cette semaine.
                      </motion.div>
                    ) : (
                      filteredRdv.map((s, i) => {
                        const who = s.student?.discordUsername || s.student?.name || "—";
                        return (
                          <motion.div
                            key={s._id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={spring}
                          >
                            <button
                              onClick={() => s.student && router.push(`/studio/eleves/${s.student._id}`)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", background: "transparent", border: "none", width: "100%", cursor: "pointer", color: c.text, fontFamily: "inherit", textAlign: "left" }}
                            >
                              <Avatar name={who} size={28} dark={dark} image={s.student?.image} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</div>
                                <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{fmtWhen(s.scheduledAt)}</div>
                              </div>
                              <span style={{ color: c.muted, fontSize: 14 }}>›</span>
                            </button>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </Glass>
          )}

          {/* Sidebar — desktop uniquement (sur mobile l'agenda ci-dessus la remplace). */}
          {!isMobile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Glass c={c} dark={dark}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8 }}>
                <div style={{ ...mono, color: c.muted }}>
                  Rendez-vous <span style={{ color: c.faint }}>· {VIEW_WORD[view]}</span>
                </div>
                <span style={{ ...mono, color: c.faint }}>{filteredRdv.length}</span>
              </div>

              {/* Sélecteur de statut */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {RDV_FILTERS.map((f) => {
                  const active = rdvFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setRdvFilter(f.id)}
                      style={{
                        ...mono,
                        fontSize: 9.5,
                        padding: "6px 10px",
                        borderRadius: 999,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        background: active ? f.color : c.chip,
                        color: active ? "#FFFFFF" : c.muted,
                        border: `1px solid ${active ? "transparent" : c.line}`,
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Liste scrollable (hauteur plafonnée → n'allonge pas la page) +
                  animation fluide des items au changement de filtre. */}
              <div
                style={{
                  maxHeight: 340,
                  overflowY: "auto",
                  marginRight: -8,
                  paddingRight: 8,
                  scrollbarWidth: "thin",
                  scrollbarColor: `${c.line} transparent`,
                }}
              >
                <motion.div layout transition={spring}>
                  <AnimatePresence initial={false} mode="popLayout">
                    {filteredRdv.length === 0 ? (
                      <motion.div
                        key={`empty-${rdvFilter}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{ ...mono, color: c.faint, padding: "10px 0 2px" }}
                      >
                        Aucun RDV {RDV_FILTERS.find((f) => f.id === rdvFilter)?.label.toLowerCase()} cette semaine.
                      </motion.div>
                    ) : (
                      filteredRdv.map((s, i) => {
                        const who = s.student?.discordUsername || s.student?.name || "—";
                        return (
                          <motion.div
                            key={s._id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={spring}
                          >
                            <button
                              onClick={() => s.student && router.push(`/studio/eleves/${s.student._id}`)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", background: "transparent", border: "none", width: "100%", cursor: "pointer", color: c.text, fontFamily: "inherit", textAlign: "left" }}
                            >
                              <Avatar name={who} size={28} dark={dark} image={s.student?.image} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{who}</div>
                                <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{fmtWhen(s.scheduledAt)}</div>
                              </div>
                              <span style={{ color: c.muted, fontSize: 14 }}>›</span>
                            </button>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </Glass>

            {/* Stats */}
            <Glass c={c} dark={dark}>
              <div style={{ ...mono, color: c.muted, marginBottom: 14 }}>Cette semaine</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <Mini c={c} label="Sessions" value={total} />
                <Mini c={c} label="No-shows" value={noShows} warn />
                <Mini c={c} label="Annulés" value={canceled} />
                <Mini c={c} label="Faits" value={sessions.filter((s) => s.status === "completed").length} />
              </div>
            </Glass>

            {/* Légende */}
            <Glass c={c} dark={dark}>
              <div style={{ ...mono, color: c.muted, marginBottom: 12 }}>Statut</div>
              <Legend c={c} dot={c.glassStrong} label="À venir" border={c.line} />
              <Legend c={c} dot={c.chip} label="Fait" border={c.line} />
              <Legend c={c} dot={dark ? "rgba(255,90,31,0.18)" : "rgba(255,90,31,0.16)"} label="No-show" border={dark ? "rgba(255,90,31,0.4)" : "rgba(255,90,31,0.5)"} />
              <Legend c={c} dot="transparent" label="Annulé" border={c.line} strike />
            </Glass>
          </div>
          )}
        </div>
      </div>


      <RdvDialog
        open={rdv !== null}
        onClose={() => setRdv(null)}
        mode={rdv?.mode ?? "create"}
        userId={rdv && rdv.mode === "reschedule" ? rdv.userId : undefined}
        students={rdv && rdv.mode === "create" ? studentOptions : undefined}
        initial={
          rdv && rdv.mode === "reschedule"
            ? { sessionId: rdv.sessionId, scheduledAt: rdv.scheduledAt, endAt: rdv.endAt, type: rdv.type, curriculumItemId: rdv.curriculumItemId }
            : rdv && rdv.mode === "create" && rdv.scheduledAt
            ? { scheduledAt: rdv.scheduledAt }
            : undefined
        }
      />
    </div>
  );
}

// Vue Mois : grille 6×7. Chaque case = un jour (n° + jusqu'à 3 RDV colorés par
// statut, « +N » au-delà). Clic sur une case → bascule en vue Jour.
type MonthSession = {
  _id: unknown;
  scheduledAt: number;
  status: string;
  student?: { discordUsername?: string | null; name?: string | null } | null;
};
function MonthGrid({
  c,
  dark,
  isMobile,
  cells,
  sessions,
  monthIndex,
  todayStr,
  statusColor,
  onPickDay,
}: {
  c: C;
  dark: boolean;
  isMobile: boolean;
  cells: Date[];
  sessions: MonthSession[];
  monthIndex: number;
  todayStr: string;
  statusColor: (s: string) => { bg: string; border: string; color: string };
  onPickDay: (d: Date) => void;
}) {
  const WEEKDAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${c.line}` }}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ ...mono, fontSize: isMobile ? 8 : 9.5, color: c.muted, padding: isMobile ? "8px 4px" : "12px", borderLeft: i ? `1px solid ${c.hairline}` : "none" }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === monthIndex;
          const isToday = todayStr === d.toDateString();
          const evs = sessions
            .filter((s) => new Date(s.scheduledAt).toDateString() === d.toDateString())
            .sort((a, b) => a.scheduledAt - b.scheduledAt);
          return (
            <button
              key={i}
              onClick={() => onPickDay(d)}
              onMouseEnter={(e) => { if (!isToday) e.currentTarget.style.background = c.chip; }}
              onMouseLeave={(e) => { if (!isToday) e.currentTarget.style.background = "transparent"; }}
              style={{
                textAlign: "left",
                border: "none",
                borderTop: `1px solid ${c.hairline}`,
                borderLeft: i % 7 ? `1px solid ${c.hairline}` : "none",
                background: isToday ? (dark ? "rgba(255,90,31,0.06)" : "rgba(255,90,31,0.05)") : "transparent",
                minHeight: isMobile ? 70 : 104,
                padding: isMobile ? 4 : "7px 8px",
                cursor: "pointer",
                fontFamily: "inherit",
                color: c.text,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                opacity: inMonth ? 1 : 0.4,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...num, fontSize: isMobile ? 10 : 14, fontWeight: 500, color: isToday ? ACCENT : c.text }}>{d.getDate()}</span>
                {evs.length > 0 && <span style={{ ...mono, fontSize: 8.5, color: c.faint }}>{evs.length}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {evs.slice(0, 3).map((ev) => {
                  const tone = statusColor(ev.status);
                  const who = ev.student?.discordUsername || ev.student?.name || "—";
                  const t = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(ev.scheduledAt));
                  return (
                    <div
                      key={ev._id as string}
                      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: isMobile ? 8 : 10, background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color, borderRadius: 6, padding: isMobile ? "1px 3px" : "2px 5px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textDecoration: ev.status === "canceled" ? "line-through" : "none" }}
                    >
                      <span style={{ ...mono, fontSize: 8, opacity: 0.8 }}>{t}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{who}</span>
                    </div>
                  );
                })}
                {evs.length > 3 && <span style={{ ...mono, fontSize: 8.5, color: c.muted }}>+{evs.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NowLine({ nowTs }: { nowTs: number }) {
  const n = new Date(nowTs);
  const nowMin = (n.getHours() - START_HOUR) * 60 + n.getMinutes();
  if (nowMin < 0 || n.getHours() > END_HOUR) return null;
  const top = (nowMin / 60) * ROW_HEIGHT;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, height: 2, background: ACCENT, zIndex: 5, boxShadow: `0 0 8px ${ACCENT}` }}>
      <div style={{ position: "absolute", left: -5, top: -4, width: 10, height: 10, background: ACCENT, borderRadius: 999 }} />
    </div>
  );
}

function navBtn(c: C): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    border: `1px solid ${c.line}`,
    background: c.chip,
    color: c.text,
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function Mini({ c, label, value, warn = false }: { c: C; label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <div style={{ ...num, fontSize: 26, fontWeight: 500, lineHeight: 1, color: warn ? ACCENT : c.text }}>{value}</div>
      <div style={{ ...mono, color: c.muted, fontSize: 9.5, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function EventPopover({
  c,
  dark,
  alignRight,
  isScheduled,
  meetUrl,
  onOpen,
  onReschedule,
  onComplete,
  onCancel,
}: {
  c: C;
  dark: boolean;
  alignRight: boolean;
  isScheduled: boolean;
  meetUrl?: string;
  onOpen: () => void;
  onReschedule: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-evpopover=""
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        ...(alignRight ? { right: 0 } : { left: 0 }),
        zIndex: 40,
        minWidth: 170,
        background: dark ? "rgba(28,28,36,0.94)" : "rgba(255,252,246,0.94)",
        backdropFilter: "blur(40px) saturate(150%)",
        WebkitBackdropFilter: "blur(40px) saturate(150%)",
        border: `1px solid ${c.line}`,
        borderRadius: 14,
        boxShadow: dark ? "0 20px 40px rgba(0,0,0,0.6)" : "0 20px 40px rgba(0,0,0,0.15)",
        padding: 4,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <PopItem c={c} onClick={onOpen}>Ouvrir la fiche</PopItem>
      {meetUrl && (
        <a
          href={meetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ ...mono, fontSize: 10.5, textAlign: "left", padding: "9px 11px", borderRadius: 9, background: "transparent", border: "none", cursor: "pointer", color: ACCENT, width: "100%", textDecoration: "none", display: "block" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          📹 Rejoindre le Meet
        </a>
      )}
      {isScheduled && (
        <>
          <PopItem c={c} onClick={onReschedule}>Reprogrammer</PopItem>
          <PopItem c={c} onClick={onComplete}>Marquer fait</PopItem>
          <PopItem c={c} danger onClick={onCancel}>Annuler</PopItem>
        </>
      )}
    </div>
  );
}

function PopItem({ c, children, onClick, danger = false }: { c: C; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...mono,
        fontSize: 10.5,
        textAlign: "left",
        padding: "9px 11px",
        borderRadius: 9,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: danger ? ACCENT : c.text,
        width: "100%",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function Legend({ c, dot, label, border, strike = false }: { c: C; dot: string; label: string; border: string; strike?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <div style={{ width: 24, height: 14, background: dot, border: `1px solid ${border}`, borderRadius: 4 }} />
      <span style={{ fontSize: 12, color: c.text, textDecoration: strike ? "line-through" : "none" }}>{label}</span>
    </div>
  );
}
