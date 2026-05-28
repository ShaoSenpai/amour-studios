"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  glassBtn,
  type C,
} from "./glass";
import { useTestMode } from "./test-mode";
import { testStore, selectCurriculum } from "./test-store";

// ============================================================================
// rdv-dialog — modal Glass réutilisable pour CRÉER ou REPROGRAMMER un RDV.
// Overlay fixe + panneau verre (cohérent avec les primitives Glass). Pas de
// dépendance externe (shadcn non requis).
//
// - mode "create"      → api.coaching.createSession({ userId, scheduledAt, endAt, type, notes })
// - mode "reschedule"  → api.coaching.updateSession({ sessionId, scheduledAt, endAt, type })
// - Mode test          → testStore.createSession / updateSession (store sandbox réactif),
//                        l'UI se met à jour, toast « ✓ Enregistré (mode test) ».
//
// scheduledAt / endAt (ms) sont calculés depuis date + heure + durée.
// ============================================================================

type SessionType = "onboarding" | "coaching" | "other";

export type RdvDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "create" | "reschedule";
  /** Élève cible. Si fourni, le sélecteur d'élève est masqué. */
  userId?: Id<"users">;
  /** Liste d'élèves pour le sélecteur (mode create sans userId fixé). */
  students?: { _id: Id<"users">; label: string }[];
  /** Pré-remplissage (reschedule, ou create depuis un créneau du calendrier). */
  initial?: {
    sessionId?: Id<"coachingSessions">;
    scheduledAt?: number;
    endAt?: number;
    type?: SessionType;
    curriculumItemId?: Id<"curriculum">;
  };
};

const DUREES = [30, 45, 60] as const;
const TYPES: { id: SessionType; label: string }[] = [
  { id: "coaching", label: "Coaching" },
  { id: "onboarding", label: "Onboarding" },
  { id: "other", label: "Autre" },
];

/** ms → "YYYY-MM-DD" (heure locale, pour <input type="date">). */
function toDateInput(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ms → "HH:MM" (heure locale, pour <input type="time">). */
function toTimeInput(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/** "YYYY-MM-DD" + "HH:MM" → ms (heure locale). */
function toTimestamp(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  if ([y, m, d, h, min].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

/** Wrapper : porte d'ouverture + remontage du formulaire à chaque ouverture
 * (via une `key` incrémentée) pour réinitialiser proprement l'état sans
 * setState-in-effect. */
export function RdvDialog(props: RdvDialogProps) {
  const { open, onClose } = props;

  // Clé de remontage : incrémentée à chaque transition fermé→ouvert via le
  // pattern React "ajuster l'état pendant le render" (cf. react.dev). Le form
  // est ainsi remonté à neuf à chaque ouverture → état réinitialisé proprement,
  // sans setState-in-effect ni accès ref en render.
  const [instance, setInstance] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setInstance((n) => n + 1);
  }

  // Fermeture à la touche Échap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // AnimatePresence garde le form monté le temps de l'animation de fermeture.
  return (
    <AnimatePresence>
      {open && <RdvForm key={instance} {...props} />}
    </AnimatePresence>
  );
}

function RdvForm({ onClose, mode, userId, students, initial }: RdvDialogProps) {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const { testMode } = useTestMode();
  const createSession = useMutation(api.coaching.createSession);
  const updateSession = useMutation(api.coaching.updateSession);

  // Curriculum (tag Module · Leçon, optionnel). Hook inconditionnel : « skip »
  // en mode test, où l'on lit le curriculum démo du store sandbox.
  const liveCur = useQuery(api.curriculum.listCurriculum, testMode ? "skip" : {});
  const curriculum = useMemo(
    () => (testMode ? selectCurriculum() : liveCur ?? []),
    [testMode, liveCur]
  );

  // État initialisé une seule fois au montage (le wrapper remonte à l'ouverture).
  const startTs =
    initial?.scheduledAt ??
    (() => {
      const base = new Date();
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
      return base.getTime();
    })();
  const initialDuree =
    initial?.scheduledAt && initial?.endAt
      ? Math.max(30, Math.round((initial.endAt - initial.scheduledAt) / 60000))
      : 45;

  const [selectedUser, setSelectedUser] = useState<string>(
    userId ? (userId as unknown as string) : ""
  );
  const [date, setDate] = useState(() => toDateInput(startTs));
  const [time, setTime] = useState(() => toTimeInput(startTs));
  const [duree, setDuree] = useState<number>(initialDuree);
  const [type, setType] = useState<SessionType>(initial?.type ?? "coaching");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Tag curriculum (cascade Module → Leçon). On mémorise l'item choisi par son
  // _id ("" = aucun) + le moduleNo sélectionné. Pré-rempli depuis l'item initial.
  const initialCurId = initial?.curriculumItemId
    ? (initial.curriculumItemId as unknown as string)
    : "";
  const [curItemId, setCurItemId] = useState<string>(initialCurId);
  const initialModule = useMemo(() => {
    if (!initialCurId) return "";
    const it = curriculum.find(
      (x) => (x._id as unknown as string) === initialCurId
    );
    return it ? String(it.moduleNo) : "";
    // Calcul une seule fois au montage (curriculum/initialCurId stables au montage).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [moduleNoStr, setModuleNoStr] = useState<string>(initialModule);

  // Modules distincts (premier item rencontré par moduleNo, ordre du curriculum).
  const modules = useMemo(() => {
    const seen = new Map<number, string>();
    for (const it of curriculum) {
      if (!seen.has(it.moduleNo)) seen.set(it.moduleNo, it.moduleTitle);
    }
    return [...seen.entries()].map(([moduleNo, moduleTitle]) => ({
      moduleNo,
      moduleTitle,
    }));
  }, [curriculum]);

  // Leçons du module sélectionné.
  const lessons = useMemo(() => {
    if (!moduleNoStr) return [];
    const mn = Number(moduleNoStr);
    return curriculum.filter((it) => it.moduleNo === mn);
  }, [curriculum, moduleNoStr]);

  const showStudentSelect = mode === "create" && !userId;
  const resolvedUserId =
    userId ?? (selectedUser ? (selectedUser as Id<"users">) : null);
  const resolvedCurriculumItemId: Id<"curriculum"> | undefined = curItemId
    ? (curItemId as Id<"curriculum">)
    : undefined;

  const handleSubmit = async () => {
    const scheduledAt = toTimestamp(date, time);
    if (scheduledAt === null) {
      toast.error("Date ou heure invalide.");
      return;
    }
    const endAt = scheduledAt + duree * 60000;

    // Mode test : on écrit dans le store sandbox (l'UI se met à jour).
    if (testMode) {
      if (mode === "create") {
        if (!resolvedUserId) {
          toast.error("Sélectionne un élève.");
          return;
        }
        testStore.createSession({
          userId: resolvedUserId,
          scheduledAt,
          endAt,
          type,
          summary: note.trim() || undefined,
          notes: note.trim() || undefined,
          curriculumItemId: resolvedCurriculumItemId,
        });
        toast.success("✓ Enregistré (mode test)");
      } else {
        if (!initial?.sessionId) {
          toast.error("Session introuvable.");
          return;
        }
        testStore.updateSession({
          sessionId: initial.sessionId,
          scheduledAt,
          endAt,
          type,
          curriculumItemId: resolvedCurriculumItemId,
        });
        toast.success("✓ Enregistré (mode test)");
      }
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        if (!resolvedUserId) {
          toast.error("Sélectionne un élève.");
          setSubmitting(false);
          return;
        }
        await createSession({
          userId: resolvedUserId,
          scheduledAt,
          endAt,
          type,
          notes: note.trim() || undefined,
          curriculumItemId: resolvedCurriculumItemId,
        });
        toast.success("RDV créé.");
      } else {
        if (!initial?.sessionId) {
          toast.error("Session introuvable.");
          setSubmitting(false);
          return;
        }
        await updateSession({
          sessionId: initial.sessionId,
          scheduledAt,
          endAt,
          type,
          curriculumItemId: resolvedCurriculumItemId,
        });
        toast.success("RDV reprogrammé.");
      }
      onClose();
    } catch {
      toast.error(
        mode === "create"
          ? "Impossible de créer le RDV."
          : "Impossible de reprogrammer le RDV."
      );
      setSubmitting(false);
    }
  };

  const title = mode === "create" ? "Nouveau rendez-vous" : "Reprogrammer";
  const kicker = mode === "create" ? "Planifier · RDV" : "Agenda · reprogrammer";

  return (
    <motion.div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: dark ? "rgba(4,4,8,0.62)" : "rgba(20,16,8,0.34)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
        style={{
          width: "100%",
          maxWidth: 440,
          background: c.glassStrong,
          backgroundImage: c.sheen,
          backgroundBlendMode: dark ? "plus-lighter" : "normal",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          borderRadius: 22,
          border: `1px solid ${c.line}`,
          boxShadow: `inset 0 1px 0 ${c.inner}, ${c.shadow}`,
          color: c.text,
          overflow: "hidden",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          transformOrigin: "center",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "22px 24px 16px",
            borderBottom: `1px solid ${c.line}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ ...mono, color: c.muted }}>{kicker}</div>
            <div style={{ ...num, fontSize: 26, fontWeight: 500, marginTop: 6, lineHeight: 1 }}>
              {title}
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.08 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: `1px solid ${c.line}`,
              background: c.chip,
              color: c.muted,
              cursor: "pointer",
              fontSize: 15,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ×
          </motion.button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {showStudentSelect && (
            <Field label="Élève" c={c}>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={inputStyle(c)}
              >
                <option value="">— Sélectionner —</option>
                {(students ?? []).map((s) => (
                  <option key={s._id as unknown as string} value={s._id as unknown as string}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Date" c={c}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle(c)}
              />
            </Field>
            <Field label="Heure" c={c}>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={inputStyle(c)}
              />
            </Field>
          </div>

          <Field label="Durée" c={c}>
            <div style={{ display: "flex", gap: 8 }}>
              {DUREES.map((d) => {
                const active = duree === d;
                return (
                  <button
                    key={d}
                    onClick={() => setDuree(d)}
                    style={{
                      ...mono,
                      flex: 1,
                      fontSize: 11,
                      padding: "10px 0",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: active ? ACCENT : c.chip,
                      color: active ? "#0B0B0B" : c.text,
                      border: `1px solid ${active ? "transparent" : c.line}`,
                      fontWeight: 500,
                    }}
                  >
                    {d} min
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Type" c={c}>
            <div style={{ display: "flex", gap: 8 }}>
              {TYPES.map((t) => {
                const active = type === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    style={{
                      ...mono,
                      flex: 1,
                      fontSize: 10.5,
                      padding: "10px 0",
                      borderRadius: 12,
                      cursor: "pointer",
                      background: active ? (dark ? "rgba(255,255,255,0.92)" : "#0B0B0B") : c.chip,
                      color: active ? (dark ? "#0B0B0B" : "#FFF") : c.text,
                      border: `1px solid ${active ? "transparent" : c.line}`,
                      fontWeight: 500,
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Tag curriculum (optionnel) : Module → Leçon en cascade. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Module (optionnel)" c={c}>
              <select
                value={moduleNoStr}
                onChange={(e) => {
                  setModuleNoStr(e.target.value);
                  setCurItemId(""); // changer de module réinitialise la leçon
                }}
                style={inputStyle(c)}
              >
                <option value="">— Aucun —</option>
                {modules.map((m) => (
                  <option key={m.moduleNo} value={String(m.moduleNo)}>
                    Module {m.moduleNo} — {m.moduleTitle}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Leçon (optionnel)" c={c}>
              <select
                value={curItemId}
                onChange={(e) => setCurItemId(e.target.value)}
                disabled={!moduleNoStr}
                style={{ ...inputStyle(c), opacity: moduleNoStr ? 1 : 0.55 }}
              >
                <option value="">— Aucune —</option>
                {lessons.map((l) => (
                  <option
                    key={l._id as unknown as string}
                    value={l._id as unknown as string}
                  >
                    {String(l.lessonNo).padStart(2, "0")} - {l.lessonTitle}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {mode === "create" && (
            <Field label="Note (optionnel)" c={c}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Sujet du RDV, contexte…"
                style={{ ...inputStyle(c), resize: "vertical", lineHeight: 1.5 }}
              />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${c.line}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={onClose}
            style={glassBtn(c, "ghost")}
          >
            Annuler
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: submitting ? 1 : 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{ ...glassBtn(c, "solid"), opacity: submitting ? 0.6 : 1, cursor: submitting ? "default" : "pointer" }}
          >
            {mode === "create" ? "Créer le RDV" : "Reprogrammer"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({
  label,
  c,
  children,
}: {
  label: string;
  c: C;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ ...mono, color: c.muted, fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(c: C): React.CSSProperties {
  return {
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 12,
    padding: "11px 13px",
    color: c.text,
    outline: "none",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    colorScheme: c.dark ? "dark" : "light",
  };
}
