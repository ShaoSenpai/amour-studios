"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { use, useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  Calendar,
  CreditCard,
  Flag,
  StickyNote,
  AlertTriangle,
  CalendarClock,
  Ban,
  UserX,
  Pencil,
  Trash2,
  Video,
  Check,
  Plus,
  RotateCcw,
} from "lucide-react";
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
  glassBtn,
  STAGE_LABELS,
  statusInfo,
  fmtDate,
  fmtDateShort,
  fmtTime,
  relativeFromNow,
  curriculumLabel,
  type C,
  type Stage,
} from "../../_components/glass";
import {
  useLayoutPrefs,
  SortableColumn,
  CollapsibleBlock,
} from "../../_components/sortable-blocks";
import { useTestMode } from "../../_components/test-mode";
import {
  useTestStore,
  testStore,
  selectMemberDetail,
  selectCurriculum,
  selectEvents,
  selectExercisesForUser,
} from "../../_components/test-store";
import { RdvDialog } from "../../_components/rdv-dialog";

type SessionType = "onboarding" | "coaching" | "other";
type RdvState =
  | { mode: "create" }
  | {
      mode: "reschedule";
      sessionId: Id<"coachingSessions">;
      scheduledAt: number;
      endAt?: number;
      type: SessionType;
      curriculumItemId?: Id<"curriculum">;
    };

// ============================================================================
// Fiche élève — api.coaching.getMemberDetail. Hero + stepper 5 étapes +
// rendez-vous (CRUD) + paiement + Discord + notes.
// ============================================================================

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
  transition: { type: "spring" as const, stiffness: 400, damping: 26 },
};

export default function FichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const userId = id as Id<"users">;
  const dark = useIsDark();
  const isMobile = useIsMobile();
  const { testMode } = useTestMode();
  const c = palette(dark, ACCENT);
  // En mode test, l'id de l'URL est un id démo (ex. "u_mxlo") qui n'est pas un
  // vrai Id Convex → on "skip" la query (sinon ArgumentValidationError) et on
  // affiche l'élève de démo.
  const liveDetail = useQuery(
    api.coaching.getMemberDetail,
    testMode ? "skip" : { userId }
  );
  useTestStore();
  // En test, l'élève est résolu PAR id (pas toujours le même) via le store.
  const detail = testMode ? selectMemberDetail(id) : liveDetail;

  // Curriculum complet (15 leçons) pour dériver la timeline « où il en est ».
  const liveCur = useQuery(api.curriculum.listCurriculum, testMode ? "skip" : {});
  const curriculum = testMode ? selectCurriculum() : liveCur ?? [];

  // Journal d'événements (trace CRM). En test : depuis le sandbox (réactif).
  const liveEv = useQuery(api.events.listForUser, testMode ? "skip" : { userId });
  const events: TimelineEvent[] = testMode ? selectEvents(id) : (liveEv ?? []);

  const updateSession = useMutation(api.coaching.updateSession);
  const completeSession = useMutation(api.coaching.completeSession);
  const cancelSession = useMutation(api.coaching.cancelSession);
  const deleteSession = useMutation(api.coaching.deleteSession);
  const addNote = useMutation(api.coaching.addNote);
  const updateNote = useMutation(api.coaching.updateNote);
  const deleteNote = useMutation(api.coaching.deleteNote);
  const updateOnboardingNote = useMutation(api.coaching.updateOnboardingNote);

  // Exos de l'élève (gating coaching + modules débloqués).
  const liveExercises = useQuery(
    api.exercises.listForUser,
    testMode ? "skip" : { userId }
  );
  const exercisesList = testMode ? (selectExercisesForUser() ?? []) : (liveExercises ?? []);
  // Mutations granularité fine : toggle lock/unlock par leçon depuis la
  // timeline parcours (les anciennes mutations modules sont conservées côté
  // Convex pour rétrocompat mais ne sont plus appelées depuis l'UI).
  const unlockLessonMut = useMutation(api.users.unlockLesson);
  const lockLessonMut = useMutation(api.users.lockLesson);

  const [editingId, setEditingId] = useState<Id<"coachingSessions"> | null>(null);
  const [draftSummary, setDraftSummary] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  // Dialog RDV (create ou reschedule).
  const [rdv, setRdv] = useState<RdvState | null>(null);

  // « Maintenant » figé au montage (sert à trouver la prochaine session).
  const [nowTs] = useState(() => Date.now());

  // Notes CRM.
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<Id<"coachingNotes"> | null>(null);
  const [draftNoteContent, setDraftNoteContent] = useState("");

  // Note d'onboarding éditable.
  const [editingOnb, setEditingOnb] = useState(false);
  const [draftOnb, setDraftOnb] = useState("");

  // Disposition des blocs (ordre par colonne + repliés), mémorisée localement.
  const { orders, collapsed, setOrder, toggle, reset } = useLayoutPrefs(
    "studio:fiche-layout-v1",
    {
      left: ["parcours", "rdv", "exercises"],
      right: ["paiement", "discord", "onboarding", "notes", "activite"],
    }
  );

  if (detail === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }
  if (detail === null) {
    return (
      <main style={{ background: c.bgGrad, color: c.text, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
        <p style={{ ...mono, color: c.muted }}>◦ Élève introuvable</p>
        <Link href="/studio/eleves" style={{ ...glassBtn(c, "ink"), textDecoration: "none" }}>← Retour aux élèves</Link>
      </main>
    );
  }

  const { user, purchase, sessions, coachingStage, notes } = detail;
  const who = user.discordUsername || user.name || "—";
  const stage = (coachingStage ?? "positionnement") as Stage;
  const si = purchase ? statusInfo(purchase.status) : { label: "—", tone: "outline" as const };
  const tier = purchase?.tier ?? null;
  const offreLabel =
    tier === "coaching"
      ? `Coaching${purchase?.duree === "3mois" ? " · 3 mois" : purchase?.duree === "1mois" ? " · 1 mois" : ""}`
      : tier === "communaute"
      ? "Communauté"
      : "—";
  const montant = tier === "coaching" ? 179 : tier === "communaute" ? 79 : 0;

  // Dérivation « où il en est » à partir des RDV tagués au curriculum.
  // doneIds : leçons des sessions completed. next : prochaine session planifiée
  // (curriculum != null). lastDone : dernière session completed avec curriculum.
  const doneIds = new Set<string>();
  for (const s of sessions) {
    if (s.status === "completed" && s.curriculum) {
      doneIds.add(s.curriculum._id as unknown as string);
    }
  }
  const nextCur = sessions
    .filter((s) => s.status === "scheduled" && s.scheduledAt >= nowTs && s.curriculum != null)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
  const lastDoneCur = sessions
    .filter((s) => s.status === "completed" && s.curriculum != null)
    .sort((a, b) => b.scheduledAt - a.scheduledAt)[0];
  const currentId =
    (nextCur?.curriculum?._id ?? lastDoneCur?.curriculum?._id ?? null) as
      | string
      | null;

  // RDV : on sépare les rendez-vous à venir (status "scheduled") du passé
  // (faits / annulés / no-show). Le bloc « à venir » porte toutes les actions ;
  // l'historique ne montre plus que le passé → fin du doublon.
  const upcoming = sessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.scheduledAt - b.scheduledAt);
  const past = sessions.filter((s) => s.status !== "scheduled");

  // Prochaine leçon à traiter : 1re leçon du curriculum (par `order`) qui
  // n'est ni dans doneIds, ni déjà couverte par un RDV scheduled. Sert à
  // pré-remplir le dialog RDV en mode create → Walid n'a plus à choisir la
  // leçon à chaque nouveau RDV. Si Walid planifie 3 RDV d'avance, ils se
  // taggent L1 → L2 → L3 successivement (pas tous sur la même).
  const bookedLessonIds = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions) {
      if (sess.status === "scheduled" && sess.curriculum) {
        s.add(sess.curriculum._id as unknown as string);
      }
    }
    return s;
  }, [sessions]);
  const nextLessonId = useMemo(() => {
    const sorted = [...curriculum].sort((a, b) => a.order - b.order);
    const next = sorted.find((it) => {
      const idStr = it._id as unknown as string;
      return !doneIds.has(idStr) && !bookedLessonIds.has(idStr);
    });
    return (next?._id ?? null) as Id<"curriculum"> | null;
  }, [curriculum, doneIds, bookedLessonIds]);

  // Set memoized des lessonIds débloqués — évite la nouvelle référence à
  // chaque render (sinon CurriculumTimeline recompute son state visuel à
  // chaque tick, et chaque Dot re-render inutilement).
  const unlockedLessonIdsSet = useMemo(
    () =>
      new Set(
        (user.unlockedLessonIds ?? []).map((id) => id as unknown as string)
      ),
    [user.unlockedLessonIds]
  );

  const openCreateRdv = () => setRdv({ mode: "create" });
  const openRescheduleRdv = (s: (typeof sessions)[number]) =>
    setRdv({
      mode: "reschedule",
      sessionId: s._id,
      scheduledAt: s.scheduledAt,
      endAt: s.endAt ?? undefined,
      type: (s.type as SessionType) ?? "coaching",
      curriculumItemId: s.curriculum?._id ?? undefined,
    });

  // ── Notes CRM ──────────────────────────────────────────────────────────────
  const handleAddNote = async () => {
    const content = newNote.trim();
    if (!content) return;
    if (testMode) {
      testStore.addNote({ userId: user._id, content });
      toast.success("✓ Enregistré (mode test)");
      setNewNote("");
      return;
    }
    try {
      await addNote({ userId, content });
      toast.success("Note ajoutée.");
      setNewNote("");
    } catch {
      toast.error("Impossible d'ajouter la note.");
    }
  };
  const handleSaveNote = async (noteId: Id<"coachingNotes">) => {
    const content = draftNoteContent.trim();
    if (!content) return;
    if (testMode) {
      testStore.updateNote({ noteId, content });
      toast.success("✓ Enregistré (mode test)");
      setEditingNoteId(null);
      return;
    }
    try {
      await updateNote({ noteId, content });
      toast.success("Note mise à jour.");
      setEditingNoteId(null);
    } catch {
      toast.error("Impossible de modifier la note.");
    }
  };
  const handleDeleteNote = (noteId: Id<"coachingNotes">) => {
    // Confirmation explicite (action destructive, déclenchée par une icône).
    toast("Supprimer cette note ?", {
      description: "Cette action est définitive.",
      duration: 8000,
      action: {
        label: "Supprimer",
        onClick: () => {
          if (testMode) {
            testStore.deleteNote({ noteId });
            toast.success("✓ Supprimé (mode test)");
            return;
          }
          void deleteNote({ noteId })
            .then(() => toast.success("Note supprimée."))
            .catch(() => toast.error("Impossible de supprimer la note."));
        },
      },
      cancel: { label: "Annuler", onClick: () => {} },
    });
  };

  // ── Note d'onboarding ────────────────────────────────────────────────────
  const handleSaveOnb = async () => {
    if (testMode) {
      testStore.updateOnboardingNote({ userId: user._id, notes: draftOnb });
      toast.success("✓ Enregistré (mode test)");
      setEditingOnb(false);
      return;
    }
    try {
      await updateOnboardingNote({ userId, notes: draftOnb });
      toast.success("Note d'onboarding enregistrée.");
      setEditingOnb(false);
    } catch {
      toast.error("Impossible d'enregistrer la note.");
    }
  };

  const startEdit = (s: (typeof sessions)[number]) => {
    setEditingId(s._id);
    setDraftSummary(s.summary ?? "");
    setDraftNotes(s.notes ?? "");
  };
  const saveEdit = async (sessionId: Id<"coachingSessions">) => {
    if (testMode) {
      testStore.updateSession({ sessionId, summary: draftSummary, notes: draftNotes });
      toast.success("✓ Enregistré (mode test)");
      setEditingId(null);
      return;
    }
    try {
      await updateSession({ sessionId, summary: draftSummary, notes: draftNotes });
      toast.success("Session mise à jour.");
      setEditingId(null);
    } catch {
      toast.error("Échec de la mise à jour.");
    }
  };

  // Helpers pour les actions inline (Marquer fait / Annuler / No-show / Supprimer).
  // En mode test : toast simulé, aucun appel backend.
  const doComplete = (sessionId: Id<"coachingSessions">) => {
    if (testMode) {
      testStore.completeSession({ sessionId });
      toast.success("✓ Enregistré (mode test)");
      return;
    }
    void completeSession({ sessionId })
      .then(() => toast.success("Marqué fait."))
      .catch(() => toast.error("Échec de l'opération, réessaie."));
  };
  const doCancel = (sessionId: Id<"coachingSessions">, noShow = false) => {
    if (testMode) {
      testStore.cancelSession({ sessionId, noShow });
      toast.success("✓ Enregistré (mode test)");
      return;
    }
    void cancelSession({ sessionId, noShow })
      .then(() => toast.success(noShow ? "No-show." : "Annulé."))
      .catch(() => toast.error("Échec de l'opération, réessaie."));
  };
  const doDelete = (sessionId: Id<"coachingSessions">) => {
    // Confirmation explicite avant suppression (action destructive).
    toast("Supprimer ce rendez-vous ?", {
      description: "Cette action est définitive.",
      duration: 8000,
      action: {
        label: "Supprimer",
        onClick: () => {
          if (testMode) {
            testStore.deleteSession({ sessionId });
            toast.success("✓ Supprimé (mode test)");
            return;
          }
          void deleteSession({ sessionId })
            .then(() => toast.success("Supprimé."))
            .catch(() => toast.error("Échec de l'opération, réessaie."));
        },
      },
      cancel: { label: "Annuler", onClick: () => {} },
    });
  };

  // Changement de statut depuis le badge : route vers la bonne mutation.
  // « à venir » (scheduled) repasse via updateSession ; les autres réutilisent
  // les helpers existants (test mode + toast + log gérés là).
  const setSessionStatus = (
    s: (typeof sessions)[number],
    target: "scheduled" | "completed" | "canceled" | "no_show"
  ) => {
    if (target === s.status) return;
    if (target === "completed") return doComplete(s._id);
    if (target === "no_show") return doCancel(s._id, true);
    if (target === "canceled") return doCancel(s._id);
    // target === "scheduled" → remettre « à venir »
    if (testMode) {
      testStore.updateSession({ sessionId: s._id, status: "scheduled" });
      toast.success("✓ Enregistré (mode test)");
      return;
    }
    void updateSession({ sessionId: s._id, status: "scheduled" })
      .then(() => toast.success("Remis à venir."))
      .catch(() => toast.error("Échec de l'opération, réessaie."));
  };

  // Mise en avant du bloc « à venir » : contour + fond légèrement teintés accent.
  const accentBorder = "rgba(255,90,31,0.55)";
  const accentTint = dark ? "rgba(255,90,31,0.13)" : "rgba(255,90,31,0.07)";
  const GREEN = "#1FA463"; // « Marquer fait » = action validante.

  // Formulaire d'édition inline (résumé + notes), partagé à venir / historique.
  const renderEditForm = (s: (typeof sessions)[number]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        value={draftSummary}
        onChange={(e) => setDraftSummary(e.target.value)}
        placeholder="Résumé"
        style={fieldInput(c)}
      />
      <textarea
        value={draftNotes}
        onChange={(e) => setDraftNotes(e.target.value)}
        placeholder="Notes"
        rows={3}
        style={{ ...fieldInput(c), resize: "vertical" }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <motion.button {...TAP} onClick={() => void saveEdit(s._id)} style={glassBtn(c, "solid")}>Enregistrer</motion.button>
        <motion.button {...TAP} onClick={() => setEditingId(null)} style={glassBtn(c, "ghost")}>Annuler</motion.button>
      </div>
    </div>
  );

  // Hiérarchie d'actions d'un RDV à venir :
  //  - « Marquer fait » = action principale, bouton vert plein.
  //  - actions secondaires (reprogrammer / annuler / no-show / éditer /
  //    supprimer) = boutons-icônes. (« Rejoindre le Meet » est en haut à droite.)
  const scheduledActions = (s: (typeof sessions)[number]) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <IconBtn c={c} title="Reprogrammer" onClick={() => openRescheduleRdv(s)}>
        <CalendarClock size={16} />
      </IconBtn>
      <IconBtn c={c} title="Annuler" onClick={() => doCancel(s._id)}>
        <Ban size={16} />
      </IconBtn>
      <IconBtn c={c} title="No-show" onClick={() => doCancel(s._id, true)}>
        <UserX size={16} />
      </IconBtn>
      <IconBtn c={c} title="Éditer" onClick={() => startEdit(s)}>
        <Pencil size={16} />
      </IconBtn>
      <IconBtn c={c} title="Supprimer" danger onClick={() => doDelete(s._id)}>
        <Trash2 size={16} />
      </IconBtn>
      {/* Action principale poussée en bas à droite. */}
      <motion.button
        {...TAP}
        onClick={() => doComplete(s._id)}
        style={{
          ...glassBtn(c, "solid"),
          marginLeft: "auto",
          background: GREEN,
          color: "#FFFFFF",
          boxShadow: `0 8px 24px -8px ${GREEN}99, inset 0 1px 0 rgba(255,255,255,0.25)`,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Check size={15} strokeWidth={2.6} /> Marquer fait
      </motion.button>
    </div>
  );

  // Carte d'un RDV à venir (featured = le prochain, plus grand + ombre accent).
  const upcomingCard = (s: (typeof sessions)[number], featured: boolean) => {
    const editing = editingId === s._id;
    return (
      <div
        key={s._id}
        style={{
          border: `1.5px solid ${accentBorder}`,
          background: accentTint,
          borderRadius: 18,
          padding: "16px 18px",
          marginBottom: 10,
          boxShadow: featured ? "0 10px 34px rgba(255,90,31,0.16)" : "none",
        }}
      >
        <div style={{ ...mono, color: ACCENT, fontSize: 9.5, marginBottom: 12, display: "flex", gap: 7, alignItems: "center", letterSpacing: 0.4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 6, background: ACCENT, boxShadow: `0 0 0 3px ${dark ? "rgba(255,90,31,0.28)" : "rgba(255,90,31,0.18)"}` }} />
          {featured ? "PROCHAIN RDV" : "À VENIR ENSUITE"}
        </div>
        {editing ? (
          renderEditForm(s)
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 18, alignItems: "stretch" }}>
              <div>
                <div style={{ ...num, fontSize: featured ? 30 : 22, fontWeight: 500, lineHeight: 1 }}>{fmtTime(s.scheduledAt)}</div>
                <div style={{ ...mono, color: c.muted, marginTop: 5 }}>{fmtDateShort(s.scheduledAt)}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                {s.appelNo != null && (
                  <div style={{ ...mono, color: ACCENT, fontSize: 9.5, marginBottom: 4 }}>Appel n°{s.appelNo}</div>
                )}
                <div style={{ fontSize: featured ? 16 : 14.5, fontWeight: 500 }}>{s.summary || (s.type === "onboarding" ? "Onboarding" : "Coaching")}</div>
                {s.curriculum && (
                  <div style={{ ...mono, color: c.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {curriculumLabel(s.curriculum)}
                  </div>
                )}
                <div style={{ ...mono, color: c.muted, marginTop: 4 }}>{s.endAt ? `${Math.round((s.endAt - s.scheduledAt) / 60000)} min` : "Durée —"}</div>
                {s.aiSummary && (
                  <FirefliesSummary c={c} aiSummary={s.aiSummary} transcriptUrl={s.transcriptUrl ?? undefined} />
                )}
              </div>
              {s.meetUrl ? (
                <motion.a
                  {...TAP}
                  href={s.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...glassBtn(c, "ink"),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    textAlign: "center",
                    textDecoration: "none",
                    alignSelf: "stretch",
                    padding: "12px 20px",
                    minWidth: 120,
                    lineHeight: 1.25,
                  }}
                >
                  <Video size={18} />
                  <span>Rejoindre<br />le Meet</span>
                </motion.a>
              ) : (
                <div
                  title="Le lien Meet est généré quand le RDV est synchronisé à Google Agenda."
                  style={{
                    ...glassBtn(c, "ghost"),
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    textAlign: "center",
                    alignSelf: "stretch",
                    padding: "12px 20px",
                    minWidth: 120,
                    lineHeight: 1.25,
                    color: c.faint,
                    cursor: "default",
                  }}
                >
                  <Video size={18} />
                  <span>Meet<br />à venir</span>
                </div>
              )}
            </div>
            <div style={{ height: 1, background: accentBorder, opacity: 0.4, margin: "14px 0" }} />
            {scheduledActions(s)}
          </>
        )}
      </div>
    );
  };

  // Contenu (bare) de chaque bloc repliable/réordonnable de la fiche.
  const BLOCKS: Record<
    string,
    { title: string; count?: number; headerRight?: React.ReactNode; body: React.ReactNode }
  > = {
    parcours: {
      title: "Parcours",
      body: (
        <CurriculumTimeline
          c={c}
          curriculum={curriculum}
          doneIds={doneIds}
          currentId={currentId}
          unlockedLessonIds={unlockedLessonIdsSet}
          duree={purchase?.duree ?? null}
          onToggleLesson={(lessonId, on) => {
            const lid = lessonId as unknown as Id<"curriculum">;
            if (testMode) {
              testStore.toggleUnlockedLesson({ userId, lessonId: lid, on });
              return;
            }
            if (on) void unlockLessonMut({ userId, lessonId: lid });
            else void lockLessonMut({ userId, lessonId: lid });
          }}
        />
      ),
    },
    rdv: {
      title: "Rendez-vous",
      count: sessions.length,
      headerRight: (
        <IconBtn c={c} title="Nouveau RDV" size={32} onClick={openCreateRdv}>
          <Plus size={16} />
        </IconBtn>
      ),
      body: (
        <>
          {/* À venir — toutes les actions sont ici (prochain mis en avant) */}
          <div>
            <div style={{ ...mono, color: c.faint, marginBottom: 10, padding: "0 2px" }}>À venir</div>
            {upcoming.length === 0 && (
              <div style={{ ...mono, color: c.faint, padding: "2px 2px 10px" }}>Aucun RDV à venir.</div>
            )}
            {upcoming.map((s, i) => upcomingCard(s, i === 0))}
          </div>

          {/* Historique — passé uniquement (faits / annulés / no-show) */}
          <div style={{ marginTop: 14 }}>
            <div style={{ ...mono, color: c.faint, marginBottom: 10 }}>Historique</div>
            {past.length === 0 && <div style={{ ...mono, color: c.faint, padding: "8px 0" }}>Aucune session passée.</div>}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {past.map((s, i) => {
                const editing = editingId === s._id;
                return (
                  <div key={s._id} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 16, padding: "14px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                    <div>
                      <div style={{ ...num, fontSize: 15, fontWeight: 500 }}>{fmtDateShort(s.scheduledAt)}</div>
                      <div style={{ ...mono, color: c.faint, marginTop: 4 }}>{fmtTime(s.scheduledAt)}</div>
                      <div style={{ marginTop: 8 }}>
                        <StatusSelect c={c} dark={dark} value={s.status} onChange={(t) => setSessionStatus(s, t)} />
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {editing ? (
                        renderEditForm(s)
                      ) : (
                        <>
                          {(s.appelNo != null || s.curriculum) && (
                            <div style={{ ...mono, fontSize: 9.5, marginBottom: 4, color: c.muted }}>
                              {s.appelNo != null && <span style={{ color: ACCENT }}>Appel n°{s.appelNo}</span>}
                              {s.appelNo != null && s.curriculum && <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>}
                              {s.curriculum && <span>{curriculumLabel(s.curriculum)}</span>}
                            </div>
                          )}
                          {s.summary && <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{s.summary}</div>}
                          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: c.muted, textDecoration: s.status === "canceled" ? "line-through" : "none" }}>
                            {s.notes || "—"}
                          </div>
                          {s.aiSummary && (
                            <FirefliesSummary c={c} aiSummary={s.aiSummary} transcriptUrl={s.transcriptUrl ?? undefined} />
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <IconBtn c={c} title="Éditer" onClick={() => startEdit(s)}>
                              <Pencil size={16} />
                            </IconBtn>
                            {s.meetUrl && (
                              <IconBtn c={c} title="Rejoindre le Meet" href={s.meetUrl}>
                                <Video size={16} />
                              </IconBtn>
                            )}
                            <IconBtn c={c} title="Supprimer" danger onClick={() => doDelete(s._id)}>
                              <Trash2 size={16} />
                            </IconBtn>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ),
    },
    paiement: {
      title: "Paiement",
      headerRight: (
        <Pill c={c} tone={si.tone}>
          <span style={{ width: 5, height: 5, borderRadius: 5, background: si.tone === "success" ? c.successFg : si.tone === "outline" ? c.faint : "#0B0B0B" }} />
          {si.label}
        </Pill>
      ),
      body: (
        <>
          <div style={{ ...num, fontSize: 32, fontWeight: 500, lineHeight: 1 }}>
            {montant}&nbsp;€<span style={{ color: c.muted, fontSize: 16 }}> /mois</span>
          </div>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field c={c} label="Offre" value={offreLabel} />
            <Field c={c} label="Engagement" value={purchase?.duree === "3mois" ? "3 mois" : purchase?.duree === "1mois" ? "1 mois" : "—"} />
            <Field c={c} label="Prochaine échéance" value={fmtDate(purchase?.currentPeriodEnd)} />
            <Field c={c} label="Client depuis" value={fmtDate(purchase?.paidAt ?? purchase?.createdAt)} />
          </div>
          {purchase?.cancelAtPeriodEnd && (
            <div style={{ ...mono, marginTop: 10, fontSize: 10.5, color: "#F97316" }}>
              ⚠ Annulation prévue à la fin de la période
            </div>
          )}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.hairline}` }}>
            <Field c={c} label="Téléphone (facturation)" value={purchase?.phone ?? "—"} mono />
          </div>
          <PaymentSavSection
            c={c}
            testMode={testMode}
            purchaseId={purchase?._id ?? null}
            currentTier={tier}
            hasSubscription={!!purchase?.stripeSubscriptionId}
            hasCustomer={!!purchase?.stripeCustomerId}
            cancelAtPeriodEnd={purchase?.cancelAtPeriodEnd ?? false}
            status={purchase?.status ?? null}
            amountCents={purchase?.amount ?? (tier === "coaching" ? 17900 : tier === "communaute" ? 7900 : 0)}
          />
        </>
      ),
    },
    discord: {
      title: "Discord",
      headerRight: user.discordUsername ? <Pill c={c} tone="outline">@{user.discordUsername}</Pill> : undefined,
      body: (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field c={c} label="Ancienneté" value={user.createdAt ? relativeFromNow(user.createdAt).replace("il y a ", "") : "—"} />
            <Field c={c} label="Rôle" value={user.role === "admin" ? "Admin" : tier === "coaching" ? "Élève coaching" : "Membre"} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Field c={c} label="Dernière activité" value={user.lastActiveAt ? relativeFromNow(user.lastActiveAt) : "—"} />
          </div>
        </>
      ),
    },
    onboarding: {
      title: "Onboarding",
      headerRight: !editingOnb ? (
        <IconBtn
          c={c}
          title="Éditer la note"
          size={32}
          onClick={() => {
            setDraftOnb(detail.onboarding?.notes ?? "");
            setEditingOnb(true);
          }}
        >
          <Pencil size={14} />
        </IconBtn>
      ) : undefined,
      body: (
        <OnboardingBlock
          c={c}
          dark={dark}
          ob={detail.onboarding}
          editingOnb={editingOnb}
          draftOnb={draftOnb}
          setDraftOnb={setDraftOnb}
          onSave={() => void handleSaveOnb()}
          onCancel={() => setEditingOnb(false)}
        />
      ),
    },
    notes: {
      title: "Notes CRM",
      count: notes.length,
      body: (
        <>
          {/* Ajouter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: notes.length ? 18 : 0 }}>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={2}
              placeholder="Ajouter une note…"
              style={{ ...fieldInput(c), resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <motion.button
                {...TAP}
                onClick={() => void handleAddNote()}
                disabled={!newNote.trim()}
                style={{ ...glassBtn(c, "solid"), opacity: newNote.trim() ? 1 : 0.5, cursor: newNote.trim() ? "pointer" : "default" }}
              >
                ＋ Ajouter
              </motion.button>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {notes.map((n, i) => {
              const editing = editingNoteId === n._id;
              return (
                <div key={n._id} style={{ padding: "14px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none" }}>
                  {editing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        value={draftNoteContent}
                        onChange={(e) => setDraftNoteContent(e.target.value)}
                        rows={3}
                        style={{ ...fieldInput(c), resize: "vertical", lineHeight: 1.5 }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <motion.button {...TAP} onClick={() => void handleSaveNote(n._id)} style={glassBtn(c, "solid")}>Enregistrer</motion.button>
                        <motion.button {...TAP} onClick={() => setEditingNoteId(null)} style={glassBtn(c, "ghost")}>Annuler</motion.button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                        <span style={{ ...mono, color: c.faint, fontSize: 9.5 }}>{relativeFromNow(n.createdAt)}{n.updatedAt > n.createdAt ? " · modifié" : ""}</span>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <IconBtn c={c} title="Éditer" size={32} onClick={() => { setEditingNoteId(n._id); setDraftNoteContent(n.content); }}>
                            <Pencil size={14} />
                          </IconBtn>
                          <IconBtn c={c} title="Supprimer" size={32} danger onClick={() => handleDeleteNote(n._id)}>
                            <Trash2 size={14} />
                          </IconBtn>
                        </div>
                      </div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: c.text, whiteSpace: "pre-wrap" }}>{n.content}</div>
                    </>
                  )}
                </div>
              );
            })}
            {notes.length === 0 && (
              <div style={{ ...mono, color: c.faint, marginTop: 14 }}>Aucune note pour le moment.</div>
            )}
          </div>
        </>
      ),
    },
    activite: {
      title: "Activité",
      count: events.length,
      body: <ActivityTimeline c={c} events={events} />,
    },
    exercises: {
      title: "Exercices",
      count: exercisesList.filter((e) => e.state === "completed").length,
      body: <ExercisesBlock c={c} exercises={exercisesList} />,
    },
  };

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link href="/studio/eleves" style={{ ...mono, fontSize: 10.5, padding: "8px 12px", background: c.chip, border: `1px solid ${c.line}`, color: c.text, borderRadius: 999, textDecoration: "none" }}>← Élèves</Link>
          <span style={{ ...mono, color: c.muted }}>
            Élèves <span style={{ margin: "0 6px", opacity: 0.5 }}>/</span>
            <span style={{ color: c.text }}>{who}</span>
          </span>
          <motion.button
            {...TAP}
            onClick={reset}
            title="Remettre l'ordre et l'affichage des blocs par défaut"
            style={{ ...mono, fontSize: 10.5, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: c.chip, border: `1px solid ${c.line}`, color: c.muted, borderRadius: 999, cursor: "pointer" }}
          >
            <RotateCcw size={13} /> Réinitialiser la disposition
          </motion.button>
        </div>

        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ padding: "28px 30px", display: "flex", alignItems: "center", gap: 20, flex: 1, minWidth: 280 }}>
              <div style={{ position: "relative" }}>
                <Avatar name={who} size={88} dark={dark} image={user.image} />
                <div style={{ position: "absolute", inset: -4, borderRadius: 999, border: `2px solid ${ACCENT}`, pointerEvents: "none" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...mono, color: c.muted }}>Élève</div>
                <div style={{ ...num, fontSize: 38, fontWeight: 500, lineHeight: 1, marginTop: 4 }}>{who}</div>
                <div style={{ fontSize: 14.5, color: c.muted, marginTop: 6 }}>{user.name ?? "—"}{user.email ? ` · ${user.email}` : ""}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  <Pill c={c} tone="ink">{offreLabel}</Pill>
                  <Pill c={c} tone={si.tone}>{si.label}</Pill>
                  <Pill c={c} tone="outline">{STAGE_LABELS[stage]}</Pill>
                </div>
              </div>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", borderLeft: `1px solid ${c.line}`, minWidth: 220 }}>
              <motion.button {...TAP} onClick={openCreateRdv} style={glassBtn(c, "solid")}>＋ Planifier RDV</motion.button>
              {user.discordId && (
                <motion.a {...TAP} href={`discord://-/users/${user.discordId}`} style={{ ...glassBtn(c, "ghost"), textAlign: "center", textDecoration: "none" }}>Ouvrir DM Discord</motion.a>
              )}
            </div>
          </div>
        </Glass>

        {/* Main grid — blocs repliables & réordonnables par colonne (drag) */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          {(["left", "right"] as const).map((col) => (
            <SortableColumn key={col} ids={orders[col]} onReorder={(ids) => setOrder(col, ids)}>
              {orders[col].map((bid) => {
                const b = BLOCKS[bid];
                if (!b) return null;
                return (
                  <CollapsibleBlock
                    key={bid}
                    value={bid}
                    c={c}
                    dark={dark}
                    title={b.title}
                    count={b.count}
                    headerRight={b.headerRight}
                    collapsed={!!collapsed[bid]}
                    onToggle={() => toggle(bid)}
                  >
                    {b.body}
                  </CollapsibleBlock>
                );
              })}
            </SortableColumn>
          ))}
        </div>
      </div>

      <RdvDialog
        open={rdv !== null}
        onClose={() => setRdv(null)}
        mode={rdv?.mode ?? "create"}
        userId={userId}
        initial={
          rdv && rdv.mode === "reschedule"
            ? {
                sessionId: rdv.sessionId,
                scheduledAt: rdv.scheduledAt,
                endAt: rdv.endAt,
                type: rdv.type,
                curriculumItemId: rdv.curriculumItemId,
              }
            : rdv && rdv.mode === "create" && nextLessonId
            ? { curriculumItemId: nextLessonId }
            : undefined
        }
      />
    </div>
  );
}

// ── Activité (trace CRM) ──────────────────────────────────────────────────
// Forme minimale commune au sandbox (selectEvents) et au backend
// (api.events.listForUser) : seuls ces champs servent au rendu de la timeline.
type TimelineEvent = {
  _id: Id<"events">;
  type: string;
  title: string;
  actor?: string;
  at: number;
};

// Mapping type d'event → couleur + icône, cohérent avec le design Glass.
type EventVisual = {
  color: string;
  Icon: React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number | string }>;
};

function eventVisual(type: string, c: C): EventVisual {
  if (type.startsWith("rdv.")) return { color: ACCENT, Icon: Calendar };
  if (type === "payment.paid") return { color: c.successFg, Icon: CreditCard };
  if (type === "payment.failed" || type === "subscription.canceled")
    return { color: "#E5484D", Icon: AlertTriangle };
  if (type === "stage.changed") return { color: c.text, Icon: Flag };
  if (type === "note.added") return { color: c.muted, Icon: StickyNote };
  return { color: c.muted, Icon: Flag };
}

function ActivityTimeline({
  c,
  events,
}: {
  c: C;
  events: TimelineEvent[];
}) {
  return (
    <>
      {events.length === 0 ? (
        <div style={{ ...mono, color: c.faint }}>Aucune activité pour l&apos;instant.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((ev, i) => {
            const { color, Icon } = eventVisual(ev.type, c);
            const last = i === events.length - 1;
            return (
              <div key={ev._id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, position: "relative" }}>
                {/* Colonne point + trait vertical */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${color}1A`,
                      border: `1px solid ${color}`,
                      color,
                    }}
                  >
                    <Icon size={13} color={color} strokeWidth={2} />
                  </div>
                  {!last && <div style={{ flex: 1, width: 2, background: c.line, marginTop: 2 }} />}
                </div>
                {/* Contenu */}
                <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: c.text }}>{ev.title}</span>
                    <span style={{ ...mono, color: c.faint, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>{relativeFromNow(ev.at)}</span>
                  </div>
                  {ev.actor && (
                    <span style={{ ...mono, color: c.muted, fontSize: 9, marginTop: 4, display: "inline-block", padding: "2px 7px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}` }}>
                      {ev.actor}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

type CurItem = {
  _id: Id<"curriculum">;
  moduleNo: number;
  moduleTitle: string;
  lessonNo: number;
  lessonTitle: string;
  order: number;
};

function CurriculumTimeline({
  c,
  curriculum,
  doneIds,
  currentId,
  unlockedLessonIds,
  duree,
  onToggleLesson,
}: {
  c: C;
  curriculum: CurItem[];
  doneIds: Set<string>;
  currentId: string | null;
  unlockedLessonIds: Set<string>;
  duree: "1mois" | "3mois" | null;
  onToggleLesson: (lessonId: string, on: boolean) => void;
}) {
  const items = [...curriculum].sort((a, b) => a.order - b.order);

  // Item « actuellement » + libellé d'en-tête.
  const currentItem =
    currentId != null
      ? items.find((it) => (it._id as unknown as string) === currentId) ?? null
      : null;
  const total = items.length;
  const doneCount = items.filter((it) => doneIds.has(it._id as unknown as string)).length;
  const allDone = total > 0 && doneCount === total;
  const notStarted = doneCount === 0 && currentItem == null;
  const headLabel = allDone
    ? "Parcours terminé"
    : notStarted
    ? "Parcours non démarré"
    : currentItem
    ? curriculumLabel(currentItem)
    : "—";

  // Regroupement par module (trié), pastilles par leçon (triées par lessonNo).
  const moduleOrder: number[] = [];
  const byModule = new Map<number, CurItem[]>();
  for (const it of items) {
    if (!byModule.has(it.moduleNo)) {
      byModule.set(it.moduleNo, []);
      moduleOrder.push(it.moduleNo);
    }
    byModule.get(it.moduleNo)!.push(it);
  }
  moduleOrder.sort((a, b) => a - b);

  // Helper : une leçon est-elle débloquée ? M1 toujours implicite.
  const isUnlocked = (item: CurItem) =>
    item.moduleNo === 1 || unlockedLessonIds.has(item._id as unknown as string);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              ...mono,
              fontSize: 9.5,
              padding: "4px 9px",
              borderRadius: 999,
              background: allDone ? ACCENT : notStarted ? c.chip : `${ACCENT}1A`,
              color: allDone ? "#0B0B0B" : notStarted ? c.muted : ACCENT,
              border: `1px solid ${allDone ? "transparent" : notStarted ? c.line : ACCENT}`,
              whiteSpace: "nowrap",
            }}
          >
            Actuellement •
          </span>
          <span style={{ ...num, fontSize: 17, fontWeight: 500 }}>{headLabel}</span>
        </div>
        <span style={{ ...mono, color: c.faint, fontSize: 9.5 }}>{doneCount}/{total}</span>
      </div>

      {/* Lignes par module */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {moduleOrder.map((mNo) => {
          const lessons = (byModule.get(mNo) ?? []).slice().sort((a, b) => a.lessonNo - b.lessonNo);
          const mTitle = lessons[0]?.moduleTitle ?? "";
          const mDone = lessons.filter((l) => doneIds.has(l._id as unknown as string)).length;
          // Engagement 1 mois : seul M1 est manipulable, M2/M3 sont verrouillés.
          const restrictedBy1Mois = duree === "1mois" && mNo !== 1;
          // Module entièrement verrouillé : aucune leçon débloquée (hors M1).
          const moduleAllLocked =
            mNo !== 1 && lessons.every((l) => !isUnlocked(l));
          const rowOpacity = restrictedBy1Mois || moduleAllLocked ? 0.5 : 1;
          return (
            <div
              key={mNo}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                opacity: rowOpacity,
                transition: "opacity 160ms ease",
              }}
              title={
                restrictedBy1Mois
                  ? "Engagement 3 mois requis"
                  : moduleAllLocked
                  ? "Module verrouillé · click sur un cercle pour débloquer une leçon"
                  : undefined
              }
            >
              <div style={{ minWidth: 150, flex: "1 1 150px" }}>
                <div style={{ ...num, fontSize: 14.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  M{mNo} · {mTitle}
                  {(moduleAllLocked || restrictedBy1Mois) && (
                    <span aria-label="verrouillé" style={{ fontSize: 12, opacity: 0.7 }}>🔒</span>
                  )}
                </div>
                <div style={{ ...mono, color: c.faint, fontSize: 9, marginTop: 2 }}>
                  {restrictedBy1Mois || moduleAllLocked
                    ? "Verrouillé"
                    : `${mDone}/${lessons.length}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {lessons.map((l, i) => {
                  const idStr = l._id as unknown as string;
                  const isCurrent = currentId != null && idStr === currentId;
                  const isDone = doneIds.has(idStr);
                  const unlocked = isUnlocked(l);
                  // Détermine l'état visuel + interactivité.
                  let state: "done" | "current" | "todo" | "locked";
                  if (isDone) state = "done";
                  else if (isCurrent) state = "current";
                  else if (unlocked) state = "todo";
                  else state = "locked";
                  // Click handler : on ne touche jamais aux leçons faites/en cours
                  // (sécurité pour pas perdre la progression). M1 est implicite
                  // pour tout coaching actif et n'est jamais stockée — le
                  // backend court-circuite silencieusement. On rend donc M1
                  // visuellement non-cliquable pour éviter une UX confuse
                  // (curseur pointer + zéro feedback au click).
                  const canClick =
                    !restrictedBy1Mois &&
                    l.moduleNo !== 1 &&
                    !isDone &&
                    !isCurrent &&
                    (state === "todo" || state === "locked");
                  const handleClick = () => {
                    if (!canClick) return;
                    onToggleLesson(idStr, state === "locked");
                  };
                  return (
                    <div key={idStr} style={{ display: "flex", alignItems: "center" }}>
                      <Dot
                        c={c}
                        state={state}
                        lessonNo={l.lessonNo}
                        canClick={canClick}
                        onClick={handleClick}
                      />
                      {i < lessons.length - 1 && (
                        <div style={{ width: 10, height: 2, background: c.line }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div style={{ ...mono, color: c.faint, fontSize: 9, marginTop: 16 }}>
        ✓ faite · ◉ en cours · ○ à venir · 🔒 verrouillée · click sur un cercle pour (dé)verrouiller
      </div>
    </>
  );
}

function Dot({
  c,
  state,
  lessonNo,
  canClick,
  onClick,
}: {
  c: C;
  state: "done" | "current" | "todo" | "locked";
  lessonNo: number;
  canClick?: boolean;
  onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...mono,
    fontSize: 10.5,
    fontWeight: 500,
    flexShrink: 0,
    cursor: canClick ? "pointer" : "default",
    transition: "transform 120ms ease, box-shadow 160ms ease, background 160ms ease",
  };
  if (state === "done") {
    return (
      <div
        title={`Leçon ${lessonNo} · faite`}
        style={{ ...base, background: ACCENT, color: "#0B0B0B", border: "1px solid transparent" }}
      >
        ✓
      </div>
    );
  }
  if (state === "current") {
    return (
      <div
        title={`Leçon ${lessonNo} · en cours`}
        style={{
          ...base,
          background: `${ACCENT}1A`,
          color: ACCENT,
          border: `2px solid ${ACCENT}`,
          boxShadow: `0 0 0 5px ${ACCENT}22`,
        }}
      >
        {lessonNo}
      </div>
    );
  }
  if (state === "locked") {
    return (
      <div
        role={canClick ? "button" : undefined}
        tabIndex={canClick ? 0 : -1}
        aria-label={`Déverrouiller la leçon ${lessonNo}`}
        title={
          canClick
            ? `Leçon ${lessonNo} · verrouillée · click pour débloquer`
            : `Leçon ${lessonNo} · verrouillée`
        }
        onClick={canClick ? onClick : undefined}
        onKeyDown={
          canClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        style={{
          ...base,
          background: c.chip,
          color: c.faint,
          border: `1px dashed ${c.line}`,
          opacity: 0.55,
        }}
        onMouseEnter={(e) => {
          if (canClick) e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          if (canClick) e.currentTarget.style.opacity = "0.55";
        }}
      >
        🔒
      </div>
    );
  }
  return (
    <div
      role={canClick ? "button" : undefined}
      tabIndex={canClick ? 0 : -1}
      aria-label={canClick ? `Verrouiller la leçon ${lessonNo}` : undefined}
      title={
        canClick
          ? `Leçon ${lessonNo} · à venir · click pour reverrouiller`
          : `Leçon ${lessonNo} · à venir`
      }
      onClick={canClick ? onClick : undefined}
      onKeyDown={
        canClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{ ...base, background: "transparent", color: c.muted, border: `1px solid ${c.line}` }}
      onMouseEnter={(e) => {
        if (canClick) e.currentTarget.style.background = c.chip;
      }}
      onMouseLeave={(e) => {
        if (canClick) e.currentTarget.style.background = "transparent";
      }}
    >
      {lessonNo}
    </div>
  );
}

// Bloc « Exercices » — liste lecture seule des exos de l'élève + état + date.
type FicheExerciseItem = {
  _id: Id<"exercises"> | string;
  title: string;
  state: "available" | "locked" | "locked_module" | "completed";
  moduleOrder: number;
  moduleTitle: string;
  lessonTitle: string;
  completedAt?: number;
  responseUpdatedAt?: number;
  progressPercent?: number;
};
function ExercisesBlock({
  c,
  exercises,
}: {
  c: C;
  exercises: FicheExerciseItem[];
}) {
  if (exercises.length === 0) {
    return <div style={{ ...mono, color: c.faint }}>Aucun exercice pour cet élève.</div>;
  }
  const sorted = [...exercises].sort((a, b) => {
    if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
    return (a.title || "").localeCompare(b.title || "");
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((ex, i) => {
        const isCompleted = ex.state === "completed";
        const isLocked = ex.state === "locked" || ex.state === "locked_module";
        const tone = isCompleted ? "#1FA463" : isLocked ? c.muted : ACCENT;
        const subLabel =
          ex.state === "completed"
            ? ex.completedAt
              ? `Terminé · ${fmtDateShort(ex.completedAt)}`
              : "Terminé"
            : ex.state === "locked_module"
            ? "Module verrouillé"
            : ex.state === "locked"
            ? "À débloquer (séquence)"
            : ex.responseUpdatedAt
            ? `En cours · ${Math.round(ex.progressPercent ?? 0)} %`
            : "À commencer";
        return (
          <a
            key={(ex._id as unknown as string) + i}
            href={`/exos/${ex._id as unknown as string}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: c.chip,
              border: `1px solid ${c.hairline}`,
              textDecoration: "none",
              color: c.text,
              fontFamily: "inherit",
              alignItems: "center",
              opacity: isLocked ? 0.65 : 1,
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: 9,
                padding: "3px 7px",
                borderRadius: 999,
                background: `${tone}1F`,
                border: `1px solid ${tone}66`,
                color: tone,
                whiteSpace: "nowrap",
              }}
            >
              M{ex.moduleOrder}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
              <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>{subLabel}</div>
            </div>
            <span style={{ color: c.muted, fontSize: 14 }}>↗</span>
          </a>
        );
      })}
    </div>
  );
}

function Field({ c, label, value, mono: isMono = false }: { c: C; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ ...mono, color: c.faint, fontSize: 9.5 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 14, fontWeight: 500, fontFamily: isMono ? "'DM Mono', monospace" : "inherit" }}>{value}</div>
    </div>
  );
}

// Bloc Onboarding (fiche élève) : statut + coordonnées + dates + réponses
// + note libre admin éditable.
const ONB_STEP_LABEL: Record<string, { label: string; color: string }> = {
  awaiting_presentation: { label: "En attente présentation", color: "#F97316" },
  link_sent: { label: "Lien envoyé", color: "#3B82F6" },
  form_done: { label: "Formulaire rempli", color: "#3B82F6" },
  rdv_booked: { label: "1er RDV réservé", color: "#1FA463" },
  community_ready: { label: "Communauté prête", color: "#1FA463" },
};

type OnboardingData = {
  tier?: "coaching" | "communaute";
  step?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  answers?: Array<{ key: string; label: string; value: string }> | null;
  presentedAt?: number | null;
  linkSentAt?: number | null;
  formCompletedAt?: number | null;
  rdvBookedAt?: number | null;
  notes?: string | null;
} | null;

function OnboardingBlock({
  c,
  dark,
  ob,
  editingOnb,
  draftOnb,
  setDraftOnb,
  onSave,
  onCancel,
}: {
  c: C;
  dark: boolean;
  ob: OnboardingData;
  editingOnb: boolean;
  draftOnb: string;
  setDraftOnb: (s: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const stepMeta = ob?.step ? ONB_STEP_LABEL[ob.step] : null;
  const fullName =
    ob?.firstName || ob?.lastName
      ? `${ob?.firstName ?? ""} ${ob?.lastName ?? ""}`.trim()
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Statut */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {stepMeta ? (
          <span
            style={{
              ...mono,
              fontSize: 10,
              padding: "5px 10px",
              borderRadius: 999,
              background: `${stepMeta.color}1F`,
              border: `1px solid ${stepMeta.color}66`,
              color: dark ? "#FFFFFF" : stepMeta.color,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 6, background: stepMeta.color }} />
            {stepMeta.label}
          </span>
        ) : (
          <span style={{ ...mono, color: c.faint }}>Pas d&apos;onboarding</span>
        )}
        {ob?.tier && (
          <span style={{ ...mono, fontSize: 9.5, color: c.muted }}>
            · {ob.tier === "coaching" ? "Coaching 179€" : "Communauté 79€"}
          </span>
        )}
      </div>

      {/* Coordonnées */}
      {(fullName || ob?.phone) && (
        <div
          style={{
            padding: 14,
            background: c.chip,
            border: `1px solid ${c.line}`,
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field c={c} label="Nom complet" value={fullName || "—"} />
          <Field c={c} label="Téléphone" value={ob?.phone || "—"} mono />
        </div>
      )}

      {/* Étapes / dates */}
      {ob && (ob.presentedAt || ob.linkSentAt || ob.formCompletedAt || ob.rdvBookedAt) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ob.presentedAt && <Field c={c} label="Présenté Discord" value={fmtDateShort(ob.presentedAt)} mono />}
          {ob.linkSentAt && <Field c={c} label="Lien envoyé" value={fmtDateShort(ob.linkSentAt)} mono />}
          {ob.formCompletedAt && <Field c={c} label="Formulaire rempli" value={fmtDateShort(ob.formCompletedAt)} mono />}
          {ob.rdvBookedAt && <Field c={c} label="1er RDV réservé" value={fmtDateShort(ob.rdvBookedAt)} mono />}
        </div>
      )}

      {/* Réponses du questionnaire */}
      {ob?.answers && ob.answers.length > 0 && (
        <div>
          <div style={{ ...mono, color: c.muted, fontSize: 9.5, marginBottom: 8 }}>
            Questionnaire ({ob.answers.length} réponses)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ob.answers.map((a) => (
              <div
                key={a.key}
                style={{ padding: "10px 12px", background: c.chip, border: `1px solid ${c.hairline}`, borderRadius: 10 }}
              >
                <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginBottom: 4 }}>{a.label}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.text, whiteSpace: "pre-wrap" }}>
                  {a.value || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note libre admin */}
      <div>
        <div style={{ ...mono, color: c.muted, fontSize: 9.5, marginBottom: 8 }}>Note libre</div>
        {editingOnb ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={draftOnb}
              onChange={(e) => setDraftOnb(e.target.value)}
              rows={3}
              placeholder="Note libre…"
              style={{ ...fieldInput(c), resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <motion.button {...TAP} onClick={onSave} style={glassBtn(c, "solid")}>
                Enregistrer
              </motion.button>
              <motion.button {...TAP} onClick={onCancel} style={glassBtn(c, "ghost")}>
                Annuler
              </motion.button>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: c.chip,
              border: `1px solid ${c.line}`,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: ob?.notes ? c.text : c.faint,
              minHeight: 60,
              whiteSpace: "pre-wrap",
            }}
          >
            {ob?.notes || "Aucune note."}
          </div>
        )}
      </div>
    </div>
  );
}

// Bouton-icône (actions secondaires) : carré, infobulle au survol. Rendu comme
// lien (<a>) si `href` est fourni, sinon comme bouton.
function IconBtn({ c, title, onClick, href, danger = false, size = 40, children }: { c: C; title: string; onClick?: () => void; href?: string; danger?: boolean; size?: number; children: React.ReactNode }) {
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
function StatusSelect({ c, dark, value, onChange }: { c: C; dark: boolean; value: string; onChange: (s: SessionStatus) => void }) {
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
function FirefliesSummary({
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

function fieldInput(c: C): React.CSSProperties {
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

// ============================================================================
// PaymentSavSection — actions Stripe SAV (admin) sur la fiche élève.
//  • Customer Portal • Changer plan • Annuler • Refund • Force re-sync
// Toutes destructives passent par une confirmation modale.
// ============================================================================

type SavModal =
  | { kind: "changeTier" }
  | { kind: "cancel" }
  | { kind: "refund" }
  | { kind: "forceSync" }
  | null;

function PaymentSavSection({
  c,
  testMode,
  purchaseId,
  currentTier,
  hasSubscription,
  hasCustomer,
  cancelAtPeriodEnd,
  status,
  amountCents,
}: {
  c: C;
  testMode: boolean;
  purchaseId: Id<"purchases"> | null;
  currentTier: "communaute" | "coaching" | null;
  hasSubscription: boolean;
  hasCustomer: boolean;
  cancelAtPeriodEnd: boolean;
  status: string | null;
  amountCents: number;
}) {
  const cancelSub = useAction(api.stripe.cancelSubscription);
  const refundInvoice = useAction(api.stripe.refundLastInvoice);
  const portal = useAction(api.stripe.createCustomerPortalLink);
  const changeTier = useAction(api.stripe.changeTier);
  const forceSync = useAction(api.stripe.forceSyncFromStripe);

  const [modal, setModal] = useState<SavModal>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // États propres aux modals.
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<
    "" | "duplicate" | "fraudulent" | "requested_by_customer"
  >("");
  const [tierProrate, setTierProrate] = useState(true);

  const closeModal = () => {
    setModal(null);
    setCancelImmediate(false);
    setCancelReason("");
    setRefundAmount("");
    setRefundReason("");
    setTierProrate(true);
  };

  const guardTest = () => {
    if (testMode) {
      toast.success("✓ Action SAV simulée (mode test)");
      return true;
    }
    return false;
  };

  const handlePortal = async () => {
    if (guardTest()) return;
    if (!purchaseId) return toast.error("Pas d'achat lié.");
    if (!hasCustomer) return toast.error("Pas de customer Stripe sur cet achat.");
    setBusy("portal");
    try {
      const { url } = await portal({ purchaseId });
      window.open(url, "_blank", "noopener");
      toast.success("Customer Portal ouvert.");
    } catch (e) {
      toast.error(`Échec ouverture portal : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("cancel");
    try {
      await cancelSub({
        purchaseId,
        immediate: cancelImmediate,
        reason: cancelReason.trim() || undefined,
      });
      toast.success(
        cancelImmediate
          ? "Abonnement annulé immédiatement."
          : "Annulation programmée à la fin de la période."
      );
      closeModal();
    } catch (e) {
      toast.error(`Échec annulation : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRefund = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("refund");
    try {
      const amount =
        refundAmount.trim()
          ? Math.round(parseFloat(refundAmount.replace(",", ".")) * 100)
          : undefined;
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
        toast.error("Montant invalide (€).");
        setBusy(null);
        return;
      }
      const res = await refundInvoice({
        purchaseId,
        amount,
        reason: refundReason || undefined,
      });
      toast.success(`Remboursement émis (${(res.amount / 100).toFixed(2)}€).`);
      closeModal();
    } catch (e) {
      toast.error(`Échec remboursement : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleChangeTier = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId || !currentTier) return;
    const next = currentTier === "coaching" ? "communaute" : "coaching";
    setBusy("changeTier");
    try {
      await changeTier({ purchaseId, newTier: next, prorate: tierProrate });
      toast.success(`Palier passé à « ${next} ».`);
      closeModal();
    } catch (e) {
      toast.error(`Échec changement plan : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleForceSync = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("forceSync");
    try {
      const res = await forceSync({ purchaseId });
      toast.success(`Sync Stripe OK (${res.oldStatus} → ${res.newStatus}).`);
      closeModal();
    } catch (e) {
      toast.error(`Échec sync : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const disabled = !purchaseId;
  const noSub = !hasSubscription;
  const tierOther = currentTier === "coaching" ? "communauté" : "coaching";

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.hairline}` }}>
      <div style={{ ...mono, fontSize: 9.5, color: c.faint, marginBottom: 10 }}>
        Actions SAV
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          disabled={disabled || !hasCustomer || busy !== null}
          onClick={() => void handlePortal()}
          style={{
            ...glassBtn(c, "ghost"),
            opacity: disabled || !hasCustomer || busy !== null ? 0.55 : 1,
            cursor: disabled || !hasCustomer || busy !== null ? "default" : "pointer",
          }}
          title={!hasCustomer ? "Pas de customer Stripe" : "Customer Portal (auto-gestion)"}
        >
          {busy === "portal" ? "…" : "Customer Portal ↗"}
        </button>
        <button
          type="button"
          disabled={disabled || noSub || !currentTier || busy !== null}
          onClick={() => setModal({ kind: "changeTier" })}
          style={{
            ...glassBtn(c, "ghost"),
            opacity: disabled || noSub || !currentTier || busy !== null ? 0.55 : 1,
            cursor: disabled || noSub || !currentTier || busy !== null ? "default" : "pointer",
          }}
          title={noSub ? "Pas d'abonnement Stripe" : `Passer en ${tierOther}`}
        >
          Changer plan
        </button>
        <button
          type="button"
          disabled={
            disabled ||
            noSub ||
            busy !== null ||
            status === "canceled"
          }
          onClick={() => setModal({ kind: "cancel" })}
          style={{
            ...glassBtn(c, "ghost"),
            opacity:
              disabled || noSub || busy !== null || status === "canceled" ? 0.55 : 1,
            cursor:
              disabled || noSub || busy !== null || status === "canceled"
                ? "default"
                : "pointer",
            color: "#F97316",
            borderColor: "rgba(249,115,22,0.35)",
          }}
          title={
            status === "canceled"
              ? "Déjà annulé"
              : cancelAtPeriodEnd
              ? "Annulation déjà programmée — reconfigurable"
              : "Annuler l'abonnement"
          }
        >
          Annuler abonnement
        </button>
        <button
          type="button"
          disabled={disabled || !hasCustomer || busy !== null}
          onClick={() => setModal({ kind: "refund" })}
          style={{
            ...glassBtn(c, "ghost"),
            opacity: disabled || !hasCustomer || busy !== null ? 0.55 : 1,
            cursor: disabled || !hasCustomer || busy !== null ? "default" : "pointer",
            color: "#E03131",
            borderColor: "rgba(224,49,49,0.35)",
          }}
          title={!hasCustomer ? "Pas de customer Stripe" : "Rembourser la dernière facture"}
        >
          Refund
        </button>
        <button
          type="button"
          disabled={disabled || noSub || busy !== null}
          onClick={() => setModal({ kind: "forceSync" })}
          style={{
            ...glassBtn(c, "ghost"),
            opacity: disabled || noSub || busy !== null ? 0.55 : 1,
            cursor: disabled || noSub || busy !== null ? "default" : "pointer",
          }}
          title={noSub ? "Pas d'abonnement Stripe" : "Forcer la re-sync depuis Stripe"}
        >
          {busy === "forceSync" ? "…" : "Re-sync Stripe"}
        </button>
      </div>

      {modal?.kind === "changeTier" && (
        <SavModalShell c={c} title="Changer le plan" onClose={closeModal}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Faire passer cet abonnement de{" "}
            <strong style={{ color: c.text }}>{currentTier}</strong> à{" "}
            <strong style={{ color: c.text }}>{tierOther}</strong>.
          </div>
          <label
            style={{
              ...mono,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              fontSize: 11,
              color: c.muted,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={tierProrate}
              onChange={(e) => setTierProrate(e.target.checked)}
            />
            Appliquer un prorata (recommandé)
          </label>
          <SavActions
            c={c}
            onCancel={closeModal}
            onConfirm={() => void handleChangeTier()}
            confirming={busy === "changeTier"}
            confirmLabel={`Passer en ${tierOther}`}
          />
        </SavModalShell>
      )}

      {modal?.kind === "cancel" && (
        <SavModalShell c={c} title="Annuler l'abonnement" onClose={closeModal}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Choisis le mode d'annulation. La version « fin de période » laisse
            l'accès jusqu'à l'échéance courante.
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 14,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: `1px solid ${!cancelImmediate ? c.line : c.hairline}`,
                background: !cancelImmediate ? c.chip : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="cancelMode"
                checked={!cancelImmediate}
                onChange={() => setCancelImmediate(false)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  À la fin de la période (safe)
                </div>
                <div style={{ ...mono, fontSize: 10, color: c.muted, marginTop: 2 }}>
                  Accès maintenu, pas de prélèvement au prochain cycle.
                </div>
              </div>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: `1px solid ${cancelImmediate ? "rgba(249,115,22,0.4)" : c.hairline}`,
                background: cancelImmediate ? "rgba(249,115,22,0.06)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="cancelMode"
                checked={cancelImmediate}
                onChange={() => setCancelImmediate(true)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "#F97316" }}>
                  Immédiatement (retire les accès)
                </div>
                <div style={{ ...mono, fontSize: 10, color: c.muted, marginTop: 2 }}>
                  Coupe l'abonnement maintenant. Rôles Discord coaching retirés.
                </div>
              </div>
            </label>
          </div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Raison (optionnel — utile pour le CRM)"
            rows={2}
            style={{ ...fieldInput(c), resize: "vertical", marginTop: 12 }}
          />
          <SavActions
            c={c}
            onCancel={closeModal}
            onConfirm={() => void handleCancel()}
            confirming={busy === "cancel"}
            confirmLabel={cancelImmediate ? "Annuler maintenant" : "Programmer l'annulation"}
            danger={cancelImmediate}
          />
        </SavModalShell>
      )}

      {modal?.kind === "refund" && (
        <SavModalShell c={c} title="Rembourser la dernière facture" onClose={closeModal}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Laisse le montant vide pour un remboursement intégral.
            Dernier débit connu : <strong style={{ color: c.text }}>{(amountCents / 100).toFixed(2)} €</strong>.
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ ...mono, fontSize: 10, color: c.faint, marginBottom: 6 }}>
              Montant (€)
            </div>
            <input
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="ex : 79.00 (vide = intégral)"
              inputMode="decimal"
              style={fieldInput(c)}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 10, color: c.faint, marginBottom: 6 }}>
              Raison (Stripe)
            </div>
            <select
              value={refundReason}
              onChange={(e) =>
                setRefundReason(
                  e.target.value as "" | "duplicate" | "fraudulent" | "requested_by_customer"
                )
              }
              style={fieldInput(c)}
            >
              <option value="">— Aucune —</option>
              <option value="requested_by_customer">Demande du client</option>
              <option value="duplicate">Doublon</option>
              <option value="fraudulent">Frauduleux</option>
            </select>
          </div>
          <SavActions
            c={c}
            onCancel={closeModal}
            onConfirm={() => void handleRefund()}
            confirming={busy === "refund"}
            confirmLabel="Rembourser"
            danger
          />
        </SavModalShell>
      )}

      {modal?.kind === "forceSync" && (
        <SavModalShell c={c} title="Forcer la re-sync Stripe" onClose={closeModal}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Récupère l'état actuel côté Stripe et écrase les champs locaux
            (status, période, palier, rôles Discord). À utiliser si un webhook
            a été raté.
          </div>
          <SavActions
            c={c}
            onCancel={closeModal}
            onConfirm={() => void handleForceSync()}
            confirming={busy === "forceSync"}
            confirmLabel="Re-sync maintenant"
          />
        </SavModalShell>
      )}
    </div>
  );
}

function SavModalShell({
  c,
  title,
  onClose,
  children,
}: {
  c: C;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Modal portal (overlay full-screen + Glass C inline).
  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: c.glass,
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          borderRadius: 18,
          border: `1px solid ${c.line}`,
          boxShadow: `inset 0 1px 0 ${c.inner}, ${c.shadow}`,
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, color: c.text }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...mono,
              fontSize: 10,
              color: c.faint,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕ Fermer
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function SavActions({
  c,
  onCancel,
  onConfirm,
  confirming,
  confirmLabel,
  danger = false,
}: {
  c: C;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmLabel: string;
  danger?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={confirming}
        style={{
          ...glassBtn(c, "ghost"),
          cursor: confirming ? "default" : "pointer",
          opacity: confirming ? 0.6 : 1,
        }}
      >
        Annuler
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirming}
        style={{
          ...glassBtn(c, "solid"),
          cursor: confirming ? "default" : "pointer",
          opacity: confirming ? 0.7 : 1,
          ...(danger
            ? {
                background: "#E03131",
                color: "#FFFFFF",
                boxShadow:
                  "0 8px 24px -8px rgba(224,49,49,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
              }
            : {}),
        }}
      >
        {confirming ? "…" : confirmLabel}
      </button>
    </div>
  );
}
