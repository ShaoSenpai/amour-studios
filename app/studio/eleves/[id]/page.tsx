"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { use, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
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
import {
  TAP,
  Field,
  IconBtn,
  StatusSelect,
  FirefliesSummary,
  fieldInput,
} from "./_components/fiche-shared";
import { ActivityTimeline, type TimelineEvent } from "./_components/fiche-activity";
import { CurriculumTimeline } from "./_components/fiche-curriculum";
import { ExercisesBlock } from "./_components/fiche-exercises";
import { OnboardingBlock } from "./_components/fiche-onboarding";
import { PaymentSavSection } from "./_components/fiche-payment";

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
        <Link href="/studio/eleves" className="glass-btn" style={{ ...glassBtn(c, "ink"), textDecoration: "none" }}>← Retour aux élèves</Link>
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
                  className="glass-btn"
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
