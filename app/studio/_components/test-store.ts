"use client";

import { useSyncExternalStore } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// TEST STORE — bac à sable réactif du MODE TEST.
// ----------------------------------------------------------------------------
// Singleton en mémoire (module-level), exposé via useSyncExternalStore (même
// pattern que test-mode.tsx). Il détient les ENTITÉS de base (students,
// sessions, notes, onboarding) seedées depuis des données démo, et expose :
//   - des OPÉRATIONS qui mutent les entités puis notifient les subscribers ;
//   - des SÉLECTEURS qui recalculent les formes EXACTES des queries Convex.
// Aucune écriture en base : reset au reload (pas de persistance).
// ============================================================================

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

// ── Types tirés des queries Convex (formes de retour exactes) ───────────────
type Tier = "coaching" | "communaute";
type Status = "active" | "past_due" | "canceled" | "paid";
export type Stage =
  | "onboarding"
  | "positionnement"
  | "contenu"
  | "feedback_analyse"
  | "termine";
export type SessionType = "onboarding" | "coaching" | "other";
export type SessionStatus = "scheduled" | "completed" | "canceled" | "no_show";

type DashboardToday = FunctionReturnType<typeof api.coaching.dashboardToday>;
type StudentsList = FunctionReturnType<typeof api.coaching.studentsList>;
type Curriculum = FunctionReturnType<typeof api.curriculum.listCurriculum>;
type CurriculumItem = Curriculum[number];
type MemberDetail = NonNullable<
  FunctionReturnType<typeof api.coaching.getMemberDetail>
>;
type RangeSessions = FunctionReturnType<typeof api.coaching.sessionsInRange>;
type WithoutUpcoming = FunctionReturnType<
  typeof api.coaching.studentsWithoutUpcoming
>;
type Payments = FunctionReturnType<typeof api.coaching.paymentsOverview>;
type Segments = FunctionReturnType<typeof api.segments.listSegments>;
type SegmentMembers = FunctionReturnType<typeof api.segments.segmentMembers>;
type Campaigns = FunctionReturnType<typeof api.campaigns.listCampaigns>;

// ── Entités internes du store ───────────────────────────────────────────────
type StudentEntity = {
  _id: Id<"users">;
  name: string;
  discordUsername: string;
  discordId: string | null;
  image: string | null;
  email: string;
  createdAt: number;
  lastActiveAt: number;
  coachingStage: Stage | null;
  tier: Tier;
  duree: "1mois" | "3mois" | null;
  status: Status;
  phone: string | null;
};

type SessionEntity = {
  _id: Id<"coachingSessions">;
  userId: Id<"users">;
  type: SessionType;
  source: "manual" | "calendly";
  scheduledAt: number;
  endAt?: number;
  status: SessionStatus;
  summary?: string;
  notes?: string;
  googleEventId?: string;
  meetUrl?: string;
  curriculumItemId?: Id<"curriculum">;
  // Fireflies : résumé de call auto + lien transcript (sessions completed).
  aiSummary?: string;
  transcriptUrl?: string;
  firefliesId?: string;
  createdAt: number;
  updatedAt: number;
};

type NoteEntity = {
  _id: Id<"coachingNotes">;
  userId: Id<"users">;
  content: string;
  createdAt: number;
  updatedAt: number;
};

type OnboardingEntity = {
  tier?: "coaching" | "communaute";
  step?:
    | "awaiting_presentation"
    | "link_sent"
    | "form_done"
    | "rdv_booked"
    | "community_ready";
  firstName?: string;
  lastName?: string;
  phone?: string;
  answers?: Array<{ key: string; label: string; value: string }>;
  presentedAt?: number;
  linkSentAt?: number;
  formCompletedAt?: number;
  rdvBookedAt?: number;
  scheduledAt?: number;
  completedAt?: number;
  notes: string;
};

// Journal d'événements (trace CRM) — même forme que api.events.listForUser.
export type EventEntity = {
  _id: Id<"events">;
  userId: Id<"users">;
  type: string;
  title: string;
  actor?: string;
  at: number;
};

// Campagne (historique) — même forme que api.campaigns.listCampaigns.
type CampaignEntity = {
  _id: Id<"campaigns">;
  _creationTime: number;
  channel: "email" | "whatsapp";
  segment: string;
  subject?: string;
  body: string;
  recipientCount: number;
  createdAt: number;
};

type StoreState = {
  students: StudentEntity[];
  sessions: SessionEntity[];
  curriculum: CurriculumItem[];
  notesByUser: Record<string, NoteEntity[]>;
  onboardingByUser: Record<string, OnboardingEntity>;
  eventsByUser: Record<string, EventEntity[]>;
  campaigns: CampaignEntity[];
  /** Modules débloqués manuellement (LEGACY, conservé pour la rétrocompat
   *  côté Convex). M1 implicite donc jamais stocké. Les nouveaux toggles UI
   *  passent par `unlockedLessonIdsByUser`. */
  unlockedModulesByUser: Record<string, number[]>;
  /** Leçons débloquées au niveau granulaire (timeline parcours interactive).
   *  Clé = userId, valeur = liste d'Id<"curriculum"> (sérialisés en string).
   *  M1 implicite donc jamais stocké. */
  unlockedLessonIdsByUser: Record<string, string[]>;
};

// Helpers de casting d'id (les ids démo ne sont jamais envoyés à Convex en test).
const uid = (s: string) => s as unknown as Id<"users">;
const sid = (s: string) => s as unknown as Id<"coachingSessions">;
const cnid = (s: string) => s as unknown as Id<"coachingNotes">;
const pid = (s: string) => s as unknown as Id<"purchases">;
const curid = (s: string) => s as unknown as Id<"curriculum">;
const evid = (s: string) => s as unknown as Id<"events">;
const cmpid = (s: string) => s as unknown as Id<"campaigns">;

// Compteur d'id stable (évite les collisions et reste typable).
let idCounter = 0;
function genId(prefix: string): string {
  idCounter += 1;
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}_${Date.now()}_${idCounter}`;
}

/**
 * Génère un lien Meet FACTICE pour le mode test (aucun vrai appel Google).
 * Format proche d'un vrai lien : https://meet.google.com/test-xxxxxxx
 */
function fakeMeetUrl(): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `https://meet.google.com/test-${suffix}`;
}

// ── Bornes temporelles (calculées une fois au seed) ─────────────────────────
function startOfTodayTs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeekTs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
/** Timestamp à une heure précise d'un jour donné de la semaine courante. */
function weekTime(dayIndex: number, hour: number, minute = 0): number {
  return startOfWeekTs() + dayIndex * DAY + hour * HOUR + minute * MIN;
}

// ── SEED ─────────────────────────────────────────────────────────────────────
// Curriculum démo aligné sur la VRAIE tracklist : 3 modules × 5 leçons.
// Les ids (`cur_m1l1` …) servent à taguer certaines sessions démo et sont
// stables (réutilisés dans seedSessions). `order` = 0..14 dans cet ordre.
function seedCurriculum(): CurriculumItem[] {
  type Seed = {
    key: string;
    moduleNo: number;
    moduleTitle: string;
    lessonNo: number;
    lessonTitle: string;
  };
  const seeds: Seed[] = [
    // Module 1 — Positionnement
    { key: "m1l1", moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 1, lessonTitle: "Comprendre l'artiste" },
    { key: "m1l2", moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 2, lessonTitle: "Vision board" },
    { key: "m1l3", moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 3, lessonTitle: "Positionnement" },
    { key: "m1l4", moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 4, lessonTitle: "Veille concurrentielle" },
    { key: "m1l5", moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 5, lessonTitle: "Différenciation & valeurs" },
    // Module 2 — Contenu
    { key: "m2l1", moduleNo: 2, moduleTitle: "Contenu", lessonNo: 1, lessonTitle: "Les hooks" },
    { key: "m2l2", moduleNo: 2, moduleTitle: "Contenu", lessonNo: 2, lessonTitle: "Trends & contenus viraux" },
    { key: "m2l3", moduleNo: 2, moduleTitle: "Contenu", lessonNo: 3, lessonTitle: "Structurer son feed" },
    { key: "m2l4", moduleNo: 2, moduleTitle: "Contenu", lessonNo: 4, lessonTitle: "Planning éditorial" },
    { key: "m2l5", moduleNo: 2, moduleTitle: "Contenu", lessonNo: 5, lessonTitle: "Le script" },
    // Module 3 — Feedback & Analyse
    { key: "m3l1", moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 1, lessonTitle: "Le montage" },
    { key: "m3l2", moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 2, lessonTitle: "Analyser son contenu" },
    { key: "m3l3", moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 3, lessonTitle: "Collaboration & monétisation" },
    { key: "m3l4", moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 4, lessonTitle: "Les tendances" },
    { key: "m3l5", moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 5, lessonTitle: "Bilan & clôture" },
  ];
  return seeds.map((s, i) => ({
    _id: curid(`cur_${s.key}`),
    _creationTime: 0,
    moduleNo: s.moduleNo,
    moduleTitle: s.moduleTitle,
    lessonNo: s.lessonNo,
    lessonTitle: s.lessonTitle,
    order: i,
  }));
}

function seedStudents(now: number): StudentEntity[] {
  type Seed = {
    key: string;
    discordUsername: string;
    discordId: string | null;
    name: string;
    tier: Tier;
    duree?: "1mois" | "3mois";
    status: Status;
    stage: Stage | null;
    phone: string | null;
    inscritDaysAgo: number;
    lastActiveMs: number;
  };
  const seeds: Seed[] = [
    { key: "mxlo", discordUsername: "mxlo.beats", discordId: "123456789012345678", name: "Maxime Lefèvre", tier: "coaching", duree: "3mois", status: "active", stage: "positionnement", phone: "+33 6 12 34 56 78", inscritDaysAgo: 120, lastActiveMs: 6 * HOUR },
    { key: "lena", discordUsername: "lena__rmr", discordId: "223456789012345601", name: "Léna R.", tier: "coaching", duree: "1mois", status: "active", stage: "feedback_analyse", phone: "+33 6 22 11 09 87", inscritDaysAgo: 62, lastActiveMs: 1 * DAY },
    { key: "yuko", discordUsername: "yuko_prod", discordId: "223456789012345602", name: "Yuko P.", tier: "coaching", duree: "3mois", status: "active", stage: "onboarding", phone: "+33 6 43 22 11 33", inscritDaysAgo: 8, lastActiveMs: 3 * HOUR },
    { key: "soren", discordUsername: "soren.wav", discordId: "223456789012345603", name: "Soren D.", tier: "coaching", duree: "3mois", status: "active", stage: "contenu", phone: "+33 6 14 23 67 12", inscritDaysAgo: 182, lastActiveMs: 1 * DAY },
    { key: "kira", discordUsername: "kira.ldn", discordId: "223456789012345604", name: "Kira N.", tier: "coaching", duree: "1mois", status: "active", stage: "contenu", phone: "+33 6 78 91 02 33", inscritDaysAgo: 92, lastActiveMs: 4 * HOUR },
    { key: "thibz", discordUsername: "thibz_prod", discordId: "223456789012345605", name: "Thibault Z.", tier: "coaching", duree: "3mois", status: "past_due", stage: "contenu", phone: "+33 6 19 38 45 22", inscritDaysAgo: 150, lastActiveMs: 6 * DAY },
    { key: "amir", discordUsername: "amir.flow", discordId: "223456789012345671", name: "Amir F.", tier: "coaching", duree: "1mois", status: "active", stage: "contenu", phone: "+33 6 87 33 12 09", inscritDaysAgo: 31, lastActiveMs: 18 * DAY },
    { key: "nour", discordUsername: "nour_tape", discordId: "223456789012345672", name: "Nour T.", tier: "coaching", duree: "3mois", status: "active", stage: "feedback_analyse", phone: "+33 6 14 88 21 04", inscritDaysAgo: 120, lastActiveMs: 22 * DAY },
    { key: "octave", discordUsername: "octave.fm", discordId: null, name: "Octave M.", tier: "coaching", duree: "1mois", status: "active", stage: "positionnement", phone: "+33 6 22 09 87 33", inscritDaysAgo: 62, lastActiveMs: 11 * DAY },
    { key: "valk", discordUsername: "valk.ldr", discordId: "223456789012345674", name: "Valentin K.", tier: "coaching", duree: "3mois", status: "active", stage: "contenu", phone: "+33 6 65 41 28 73", inscritDaysAgo: 150, lastActiveMs: 14 * DAY },
    { key: "selma", discordUsername: "selma.snd", discordId: "223456789012345606", name: "Selma D.", tier: "communaute", status: "canceled", stage: "termine", phone: "+33 6 88 22 11 09", inscritDaysAgo: 92, lastActiveMs: 8 * DAY },
    { key: "kaori", discordUsername: "kaori.b", discordId: "223456789012345607", name: "Kaori B.", tier: "coaching", duree: "1mois", status: "past_due", stage: "positionnement", phone: "+33 6 03 45 67 89", inscritDaysAgo: 31, lastActiveMs: 2 * DAY },
    { key: "hanna", discordUsername: "h4nna.wav", discordId: "223456789012345608", name: "Hanna V.", tier: "communaute", status: "active", stage: null, phone: null, inscritDaysAgo: 1, lastActiveMs: 1 * HOUR },
    { key: "remi", discordUsername: "remi.ssr", discordId: "223456789012345609", name: "Rémi S.", tier: "coaching", duree: "1mois", status: "active", stage: "onboarding", phone: "+33 6 71 23 45 67", inscritDaysAgo: 4, lastActiveMs: 4 * DAY },
  ];
  return seeds.map((s) => ({
    _id: uid(`u_${s.key}`),
    name: s.name,
    discordUsername: s.discordUsername,
    discordId: s.discordId,
    image: null,
    email: `${s.discordUsername}@example.com`,
    createdAt: now - s.inscritDaysAgo * DAY,
    lastActiveAt: now - s.lastActiveMs,
    coachingStage: s.stage,
    tier: s.tier,
    duree: s.tier === "coaching" ? (s.duree ?? "1mois") : null,
    status: s.status,
    phone: s.phone,
  }));
}

function seedSessions(now: number): SessionEntity[] {
  type Seed = {
    key: string;
    userKey: string;
    dayIndex: number;
    hour: number;
    minute?: number;
    durMin: number;
    status: SessionStatus;
    type: SessionType;
    summary?: string;
    notes?: string;
    meet?: boolean;
    curriculumKey?: string;
    aiSummary?: string;
    transcriptUrl?: string;
    firefliesId?: string;
  };
  const seeds: Seed[] = [
    // Semaine précédente (events passés, complétés / no-show) — pour l'historique fiche.
    { key: "prev1", userKey: "mxlo", dayIndex: -6, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Positionnement", notes: "Identité visuelle clarifiée. Travailler le hook des reels — moins de monologue, plus de geste musical.", curriculumKey: "m1l2", aiSummary: "Overview : session centrée sur le positionnement artistique de Maxime. Il hésite encore entre une direction lo-fi et hyperpop ; on a tranché en faveur d'un univers lo-fi assumé, plus cohérent avec ses refs.\n\nPoints clés :\n- Le hook des reels arrive trop tard (monologue d'intro de 8-10s).\n- L'identité visuelle (palette, typo) manque de constance d'une vidéo à l'autre.\n- Bonne énergie face caméra une fois lancé.\n\nActions :\n- Refaire 3 hooks avec un geste musical dès la 1re seconde.\n- Figer une palette de 3 couleurs + 1 typo pour tous les reels.\n- Republier 2 anciens contenus retravaillés avant le prochain call.", transcriptUrl: "https://app.fireflies.ai/view/demo-mxlo-positionnement", firefliesId: "ff_demo_mxlo_01" },
    { key: "prev2", userKey: "lena", dayIndex: -5, hour: 11, durMin: 30, status: "completed", type: "coaching", summary: "Feedback contenu", notes: "Storyboard 5 reels validés.", curriculumKey: "m2l2", aiSummary: "Overview : revue du storyboard des 5 prochains reels de Léna. Le fil narratif est solide, le rythme de montage est sa vraie force.\n\nPoints clés :\n- Storyboard des 5 reels validé sans changement majeur.\n- Régularité de publication encore irrégulière (2-3 posts/semaine visés).\n- Les CTA en fin de vidéo sont absents.\n\nActions :\n- Planifier les 5 reels sur 2 semaines (jours/heures fixes).\n- Ajouter un CTA clair sur chaque vidéo (abonnement / partage).\n- Préparer 1 idée de collab pour le prochain point.", transcriptUrl: "https://app.fireflies.ai/view/demo-lena-feedback", firefliesId: "ff_demo_lena_01" },
    { key: "prev3", userKey: "soren", dayIndex: -4, hour: 14, durMin: 60, status: "no_show", type: "coaching", summary: "Découverte", notes: "RDV manqué — relancé sur Discord." },
    // Lundi (semaine courante)
    { key: "1", userKey: "octave", dayIndex: 0, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Positionnement" },
    { key: "2", userKey: "valk", dayIndex: 0, hour: 15, durMin: 30, status: "completed", type: "coaching", summary: "Contenu" },
    // Mardi
    { key: "3", userKey: "soren", dayIndex: 1, hour: 9, durMin: 30, status: "completed", type: "coaching", summary: "Analyse stats" },
    { key: "4", userKey: "lena", dayIndex: 1, hour: 11, durMin: 45, status: "completed", type: "coaching", summary: "Feedback" },
    { key: "5", userKey: "thibz", dayIndex: 1, hour: 16, durMin: 45, status: "no_show", type: "coaching", summary: "Contenu" },
    // Mercredi
    { key: "6", userKey: "kira", dayIndex: 2, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Stratégie reels" },
    { key: "7", userKey: "nour", dayIndex: 2, hour: 14, durMin: 30, status: "canceled", type: "coaching", summary: "Feedback" },
    // Jeudi
    { key: "8", userKey: "mxlo", dayIndex: 3, hour: 9, minute: 30, durMin: 45, status: "scheduled", type: "coaching", summary: "Positionnement", meet: true, curriculumKey: "m1l3" },
    { key: "9", userKey: "lena", dayIndex: 3, hour: 11, durMin: 30, status: "scheduled", type: "coaching", summary: "Feedback contenu", meet: true },
    { key: "10", userKey: "yuko", dayIndex: 3, hour: 14, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" },
    { key: "11", userKey: "soren", dayIndex: 3, hour: 16, minute: 30, durMin: 30, status: "scheduled", type: "coaching", summary: "Analyse stats" },
    { key: "12", userKey: "kira", dayIndex: 3, hour: 18, durMin: 45, status: "scheduled", type: "coaching", summary: "Stratégie reels" },
    // Vendredi
    { key: "13", userKey: "amir", dayIndex: 4, hour: 10, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" },
    { key: "14", userKey: "octave", dayIndex: 4, hour: 13, durMin: 30, status: "scheduled", type: "coaching", summary: "Contenu" },
    { key: "15", userKey: "remi", dayIndex: 4, hour: 15, minute: 30, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" },
    { key: "16", userKey: "valk", dayIndex: 4, hour: 18, durMin: 45, status: "scheduled", type: "coaching", summary: "Feedback" },
    // Samedi
    { key: "17", userKey: "kira", dayIndex: 5, hour: 11, durMin: 30, status: "scheduled", type: "coaching", summary: "Contenu" },
    { key: "18", userKey: "mxlo", dayIndex: 5, hour: 14, durMin: 45, status: "scheduled", type: "coaching", summary: "Reels" },
    // Semaine suivante
    { key: "next1", userKey: "yuko", dayIndex: 8, hour: 14, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding suite" },
    { key: "next2", userKey: "kira", dayIndex: 9, hour: 18, durMin: 45, status: "scheduled", type: "coaching", summary: "Stratégie reels" },
  ];
  return seeds.map((s) => {
    const scheduledAt = weekTime(s.dayIndex, s.hour, s.minute ?? 0);
    return {
      _id: sid(`cal_${s.key}`),
      userId: uid(`u_${s.userKey}`),
      type: s.type,
      source: "manual",
      scheduledAt,
      endAt: scheduledAt + s.durMin * MIN,
      status: s.status,
      summary: s.summary,
      notes: s.notes,
      googleEventId: s.meet ? `evt_${s.key}` : undefined,
      meetUrl: s.meet ? fakeMeetUrl() : undefined,
      curriculumItemId: s.curriculumKey ? curid(`cur_${s.curriculumKey}`) : undefined,
      aiSummary: s.aiSummary,
      transcriptUrl: s.transcriptUrl,
      firefliesId: s.firefliesId,
      createdAt: now - 3 * DAY,
      updatedAt: now - 1 * DAY,
    };
  });
}

function seedNotes(now: number): Record<string, NoteEntity[]> {
  const byUser: Record<string, NoteEntity[]> = {};
  byUser["u_mxlo"] = [
    { _id: cnid("cn_mxlo_1"), userId: uid("u_mxlo"), content: "Très motivé sur les reels. A enfin lâché les vidéos > 90s. Continuer à pousser le hook dès la 1re seconde.", createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY },
    { _id: cnid("cn_mxlo_2"), userId: uid("u_mxlo"), content: "Hésite encore sur son positionnement (lo-fi vs hyperpop). Trancher avant la phase contenu — lui demander 3 refs assumées.", createdAt: now - 16 * DAY, updatedAt: now - 14 * DAY },
    { _id: cnid("cn_mxlo_3"), userId: uid("u_mxlo"), content: "1er contact très réceptif. Sensible aux retours négatifs — emballer doucement.", createdAt: now - 40 * DAY, updatedAt: now - 40 * DAY },
  ];
  byUser["u_lena"] = [
    { _id: cnid("cn_lena_1"), userId: uid("u_lena"), content: "Très autonome sur le montage. Pousser sur la régularité de publication.", createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY },
  ];
  byUser["u_soren"] = [
    { _id: cnid("cn_soren_1"), userId: uid("u_soren"), content: "Bon niveau technique. Travailler l'image de marque et la cohérence visuelle.", createdAt: now - 9 * DAY, updatedAt: now - 9 * DAY },
  ];
  return byUser;
}

function seedOnboarding(now: number): Record<string, OnboardingEntity> {
  return {
    // Onboarding complet (riche) pour Maxime — illustre tous les blocs.
    u_mxlo: {
      tier: "coaching",
      step: "rdv_booked",
      firstName: "Maxime",
      lastName: "Lefèvre",
      phone: "+33 6 12 34 56 78",
      presentedAt: now - 118 * DAY,
      linkSentAt: now - 118 * DAY,
      formCompletedAt: now - 117 * DAY,
      rdvBookedAt: now - 116 * DAY,
      completedAt: now - 116 * DAY,
      answers: [
        { key: "artist_name", label: "Ton nom d'artiste / pseudo ?", value: "mxlo.beats" },
        { key: "style", label: "Style musical principal + 2-3 artistes de référence", value: "Trap mélodique. Refs : Werenoi, Tiakola, Niska." },
        { key: "level", label: "Où en es-tu ?", value: "J'ai déjà sorti 4 morceaux sur Spotify, ~3k streams chacun." },
        { key: "platform", label: "Plateforme principale", value: "Instagram + TikTok" },
        { key: "links", label: "Tes comptes", value: "https://instagram.com/mxlo.beats — https://tiktok.com/@mxlobeats" },
        { key: "followers", label: "Combien d'abonnés au total ?", value: "~2.4k toutes plateformes" },
        { key: "goal_3m", label: "Objectif à 3 mois", value: "Atteindre 10k IG + 1 collab solide." },
        { key: "goal_1y", label: "Objectif à 1 an", value: "Signer en label indé, sortir un EP de 5 morceaux." },
        { key: "blocker", label: "Qu'est-ce qui te bloque ?", value: "Manque de régularité sur le contenu + identité visuelle floue." },
        { key: "expectations", label: "Tes attentes du coaching", value: "Structurer ma stratégie + débloquer mon contenu IG." },
      ],
      notes: "Très impliqué, livre toujours en avance. Sensible aux retours négatifs — emballer doucement. Pousser sur la voix off / présence physique en story.",
    },
    // Yuko — link envoyé, pas encore rempli.
    u_yuko: {
      tier: "coaching",
      step: "link_sent",
      presentedAt: now - 3 * DAY,
      linkSentAt: now - 3 * DAY,
      notes: "Formulaire envoyé. Audit IG à faire au 1er RDV.",
    },
    // Remi — en attente de présentation Discord.
    u_remi: {
      tier: "coaching",
      step: "awaiting_presentation",
      notes: "À programmer — premier contact très enthousiaste.",
    },
  };
}

// Journal d'événements démo. Titres FR alignés sur le backend, timestamps
// répartis sur les derniers jours. `actor` : stripe / calendly / coach / system.
function seedEvents(now: number): Record<string, EventEntity[]> {
  type Seed = {
    userKey: string;
    type: string;
    title: string;
    actor?: string;
    daysAgo: number;
    hoursAgo?: number;
  };
  const seeds: Seed[] = [
    // mxlo — parcours riche
    { userKey: "mxlo", type: "payment.paid", title: "Paiement reçu · 179 €", actor: "stripe", daysAgo: 120 },
    { userKey: "mxlo", type: "rdv.booked", title: "RDV réservé · Onboarding", actor: "calendly", daysAgo: 118 },
    { userKey: "mxlo", type: "stage.changed", title: "Étape → Positionnement", actor: "coach", daysAgo: 116 },
    { userKey: "mxlo", type: "note.added", title: "Note ajoutée", actor: "coach", daysAgo: 40 },
    { userKey: "mxlo", type: "rdv.completed", title: "RDV terminé · Positionnement", actor: "coach", daysAgo: 6 },
    { userKey: "mxlo", type: "note.added", title: "Note ajoutée", actor: "coach", daysAgo: 2 },
    { userKey: "mxlo", type: "rdv.booked", title: "RDV réservé · Coaching", actor: "calendly", daysAgo: 1 },
    // lena
    { userKey: "lena", type: "payment.paid", title: "Paiement reçu · 179 €", actor: "stripe", daysAgo: 62 },
    { userKey: "lena", type: "rdv.completed", title: "RDV terminé · Feedback contenu", actor: "coach", daysAgo: 5 },
    { userKey: "lena", type: "stage.changed", title: "Étape → Feedback & Analyse", actor: "coach", daysAgo: 4 },
    { userKey: "lena", type: "note.added", title: "Note ajoutée", actor: "coach", daysAgo: 5 },
    // soren
    { userKey: "soren", type: "payment.paid", title: "Paiement reçu · 179 €", actor: "stripe", daysAgo: 182 },
    { userKey: "soren", type: "rdv.no_show", title: "Absence au RDV · Découverte", actor: "system", daysAgo: 4 },
    { userKey: "soren", type: "rdv.rescheduled", title: "RDV reprogrammé", actor: "coach", daysAgo: 3 },
    // thibz — impayé
    { userKey: "thibz", type: "payment.paid", title: "Paiement reçu · 179 €", actor: "stripe", daysAgo: 150 },
    { userKey: "thibz", type: "payment.failed", title: "Échec de paiement · 179 €", actor: "stripe", daysAgo: 6 },
    { userKey: "thibz", type: "rdv.no_show", title: "Absence au RDV · Contenu", actor: "system", daysAgo: 5 },
    // selma — résiliée
    { userKey: "selma", type: "payment.paid", title: "Paiement reçu · 79 €", actor: "stripe", daysAgo: 92 },
    { userKey: "selma", type: "subscription.canceled", title: "Abonnement résilié", actor: "stripe", daysAgo: 8 },
    // yuko — nouveau
    { userKey: "yuko", type: "payment.paid", title: "Paiement reçu · 179 €", actor: "stripe", daysAgo: 8 },
    { userKey: "yuko", type: "rdv.booked", title: "RDV réservé · Onboarding", actor: "calendly", daysAgo: 7 },
  ];
  const byUser: Record<string, EventEntity[]> = {};
  let i = 0;
  for (const s of seeds) {
    i += 1;
    const key = `u_${s.userKey}`;
    const at = now - s.daysAgo * DAY - (s.hoursAgo ?? 0) * HOUR;
    const ev: EventEntity = {
      _id: evid(`ev_seed_${i}`),
      userId: uid(key),
      type: s.type,
      title: s.title,
      actor: s.actor,
      at,
    };
    (byUser[key] ??= []).push(ev);
  }
  return byUser;
}

// Historique de campagnes démo (plus récent d'abord, comme listCampaigns).
function seedCampaigns(now: number): CampaignEntity[] {
  type Seed = {
    channel: "email" | "whatsapp";
    segment: string;
    subject?: string;
    body: string;
    recipientCount: number;
    daysAgo: number;
  };
  const seeds: Seed[] = [
    {
      channel: "email",
      segment: "coaching",
      subject: "Ta session de la semaine 🎯",
      body: "Salut {prenom}, prêt(e) à passer à la vitesse supérieure cette semaine ? Réserve ton créneau.",
      recipientCount: 9,
      daysAgo: 2,
    },
    {
      channel: "whatsapp",
      segment: "impayes",
      body: "Coucou {prenom}, ton paiement n'est pas passé — règle-le ici pour ne pas perdre l'accès 🙏",
      recipientCount: 2,
      daysAgo: 4,
    },
    {
      channel: "email",
      segment: "prospects",
      subject: "Une place se libère dans le coaching",
      body: "Hey {prenom}, on rouvre quelques places de coaching. Tu veux en discuter ?",
      recipientCount: 4,
      daysAgo: 9,
    },
    {
      channel: "email",
      segment: "annules",
      subject: "On t'a gardé une place 💛",
      body: "Salut {prenom}, ça fait un moment ! Reviens quand tu veux, ta progression t'attend.",
      recipientCount: 1,
      daysAgo: 16,
    },
  ];
  return seeds.map((s, i) => {
    const createdAt = now - s.daysAgo * DAY;
    return {
      _id: cmpid(`cmp_seed_${i + 1}`),
      _creationTime: createdAt,
      channel: s.channel,
      segment: s.segment,
      subject: s.subject,
      body: s.body,
      recipientCount: s.recipientCount,
      createdAt,
    };
  });
}

function createInitialState(): StoreState {
  const now = Date.now();
  return {
    students: seedStudents(now),
    sessions: seedSessions(now),
    curriculum: seedCurriculum(),
    notesByUser: seedNotes(now),
    onboardingByUser: seedOnboarding(now),
    eventsByUser: seedEvents(now),
    campaigns: seedCampaigns(now),
    // LEGACY (rétrocompat). Maxime garde M2 dans son legacy pour démo.
    unlockedModulesByUser: { u_mxlo: [2] },
    // NOUVEAU : Maxime a 2 leçons individuelles débloquées dans M2 pour
    // illustrer la granularité fine (timeline parcours interactive).
    unlockedLessonIdsByUser: {
      u_mxlo: ["cur_m2l1", "cur_m2l2"],
    },
  };
}

// ── Store réactif ────────────────────────────────────────────────────────────
let state: StoreState = createInitialState();
const listeners = new Set<() => void>();

function emit() {
  // Nouvelle référence d'état pour que useSyncExternalStore détecte le changement.
  state = {
    students: state.students,
    sessions: state.sessions,
    curriculum: state.curriculum,
    notesByUser: state.notesByUser,
    onboardingByUser: state.onboardingByUser,
    eventsByUser: state.eventsByUser,
    campaigns: state.campaigns,
    unlockedModulesByUser: state.unlockedModulesByUser,
    unlockedLessonIdsByUser: state.unlockedLessonIdsByUser,
  };
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): StoreState {
  return state;
}

// ── OPÉRATIONS (mutent + notifient) ──────────────────────────────────────────

function findStudent(userId: string): StudentEntity | undefined {
  return state.students.find((s) => (s._id as unknown as string) === userId);
}

/**
 * Ajoute un event au journal d'un user (sans `emit()` : l'op appelante émet).
 * `actor` par défaut "coach" (les ops du store proviennent des actions du coach).
 */
function pushEvent(input: {
  userId: Id<"users">;
  type: string;
  title: string;
  actor?: string;
}): void {
  const key = input.userId as unknown as string;
  const ev: EventEntity = {
    _id: evid(genId("ev")),
    userId: input.userId,
    type: input.type,
    title: input.title,
    actor: input.actor ?? "coach",
    at: Date.now(),
  };
  state.eventsByUser = {
    ...state.eventsByUser,
    [key]: [ev, ...(state.eventsByUser[key] ?? [])],
  };
}

export const testStore = {
  /** Crée une session (RDV). Retourne l'id généré. */
  createSession(input: {
    userId: Id<"users">;
    scheduledAt: number;
    endAt?: number;
    type?: SessionType;
    summary?: string;
    notes?: string;
    curriculumItemId?: Id<"curriculum">;
  }): Id<"coachingSessions"> {
    const now = Date.now();
    const id = sid(genId("s"));
    const session: SessionEntity = {
      _id: id,
      userId: input.userId,
      type: input.type ?? "coaching",
      source: "manual",
      scheduledAt: input.scheduledAt,
      endAt: input.endAt,
      status: "scheduled",
      summary: input.summary,
      notes: input.notes,
      curriculumItemId: input.curriculumItemId,
      // En réel, meetUrl se remplit de façon asynchrone après création de
      // l'event Google. En test on le simule immédiatement pour visualiser
      // le bouton « Rejoindre le Meet ».
      googleEventId: genId("evt"),
      meetUrl: fakeMeetUrl(),
      createdAt: now,
      updatedAt: now,
    };
    state.sessions = [...state.sessions, session];
    pushEvent({
      userId: input.userId,
      type: "rdv.created",
      title: `RDV créé · ${input.summary || (session.type === "onboarding" ? "Onboarding" : "Coaching")}`,
    });
    emit();
    return id;
  },

  /** Met à jour une session (date, fin, type, statut, résumé, notes). */
  updateSession(input: {
    sessionId: Id<"coachingSessions">;
    scheduledAt?: number;
    endAt?: number;
    type?: SessionType;
    status?: SessionStatus;
    summary?: string;
    notes?: string;
    curriculumItemId?: Id<"curriculum">;
  }): void {
    const key = input.sessionId as unknown as string;
    const target = state.sessions.find((s) => (s._id as unknown as string) === key);
    // `curriculumItemId` est mis à jour seulement si la clé est présente, ce qui
    // permet de l'effacer (passer `undefined` explicitement → « Aucun »).
    const setsCurriculum = "curriculumItemId" in input;
    // Reprogrammation = changement de date sans changement de statut.
    const rescheduled = input.scheduledAt != null && input.status == null;
    state.sessions = state.sessions.map((s) => {
      if ((s._id as unknown as string) !== key) return s;
      return {
        ...s,
        scheduledAt: input.scheduledAt ?? s.scheduledAt,
        endAt: input.endAt ?? s.endAt,
        type: input.type ?? s.type,
        status: input.status ?? s.status,
        summary: input.summary ?? s.summary,
        notes: input.notes ?? s.notes,
        curriculumItemId: setsCurriculum
          ? input.curriculumItemId
          : s.curriculumItemId,
        updatedAt: Date.now(),
      };
    });
    if (target && rescheduled) {
      pushEvent({
        userId: target.userId,
        type: "rdv.rescheduled",
        title: "RDV reprogrammé",
      });
    }
    emit();
  },

  /** Marque une session effectuée (+ résumé/notes optionnels). */
  completeSession(input: {
    sessionId: Id<"coachingSessions">;
    summary?: string;
    notes?: string;
  }): void {
    const key = input.sessionId as unknown as string;
    const target = state.sessions.find((s) => (s._id as unknown as string) === key);
    state.sessions = state.sessions.map((s) =>
      (s._id as unknown as string) === key
        ? {
            ...s,
            status: "completed",
            summary: input.summary ?? s.summary,
            notes: input.notes ?? s.notes,
            updatedAt: Date.now(),
          }
        : s
    );
    if (target) {
      // Auto-unlock côté granularité fine : mirroir exact de
      // `convex/coaching.completeSession`. Si le RDV cible une leçon du
      // curriculum, on l'ajoute à `unlockedLessonIdsByUser` du user.
      if (target.curriculumItemId) {
        const userKey = target.userId as unknown as string;
        const lessonKey = target.curriculumItemId as unknown as string;
        const cur = state.unlockedLessonIdsByUser[userKey] ?? [];
        if (!cur.includes(lessonKey)) {
          state.unlockedLessonIdsByUser = {
            ...state.unlockedLessonIdsByUser,
            [userKey]: [...cur, lessonKey],
          };
        }
      }
      pushEvent({
        userId: target.userId,
        type: "rdv.completed",
        title: `RDV terminé · ${target.summary || (target.type === "onboarding" ? "Onboarding" : "Coaching")}`,
      });
    }
    emit();
  },

  /** Annule une session (canceled ou no_show). */
  cancelSession(input: {
    sessionId: Id<"coachingSessions">;
    noShow?: boolean;
  }): void {
    const key = input.sessionId as unknown as string;
    const target = state.sessions.find((s) => (s._id as unknown as string) === key);
    state.sessions = state.sessions.map((s) =>
      (s._id as unknown as string) === key
        ? {
            ...s,
            status: input.noShow ? "no_show" : "canceled",
            updatedAt: Date.now(),
          }
        : s
    );
    if (target) {
      const label = target.summary || (target.type === "onboarding" ? "Onboarding" : "Coaching");
      pushEvent({
        userId: target.userId,
        type: input.noShow ? "rdv.no_show" : "rdv.canceled",
        title: input.noShow ? `Absence au RDV · ${label}` : `RDV annulé · ${label}`,
        actor: input.noShow ? "system" : "coach",
      });
    }
    emit();
  },

  /** Supprime une session. */
  deleteSession(input: { sessionId: Id<"coachingSessions"> }): void {
    const key = input.sessionId as unknown as string;
    state.sessions = state.sessions.filter(
      (s) => (s._id as unknown as string) !== key
    );
    emit();
  },

  /** Change l'étape du parcours coaching d'un élève. */
  setStage(input: { userId: Id<"users">; stage: Stage }): void {
    const key = input.userId as unknown as string;
    state.students = state.students.map((s) =>
      (s._id as unknown as string) === key
        ? { ...s, coachingStage: input.stage }
        : s
    );
    pushEvent({
      userId: input.userId,
      type: "stage.changed",
      title: `Étape → ${STAGE_LABEL[input.stage] ?? input.stage}`,
    });
    emit();
  },

  /** Ajoute une note CRM. */
  addNote(input: { userId: Id<"users">; content: string }): Id<"coachingNotes"> {
    const content = input.content.trim();
    const now = Date.now();
    const id = cnid(genId("cn"));
    const key = input.userId as unknown as string;
    const note: NoteEntity = {
      _id: id,
      userId: input.userId,
      content,
      createdAt: now,
      updatedAt: now,
    };
    state.notesByUser = {
      ...state.notesByUser,
      [key]: [note, ...(state.notesByUser[key] ?? [])],
    };
    pushEvent({ userId: input.userId, type: "note.added", title: "Note ajoutée" });
    emit();
    return id;
  },

  /** Modifie une note CRM. */
  updateNote(input: { noteId: Id<"coachingNotes">; content: string }): void {
    const key = input.noteId as unknown as string;
    const next: Record<string, NoteEntity[]> = {};
    for (const [u, arr] of Object.entries(state.notesByUser)) {
      next[u] = arr.map((n) =>
        (n._id as unknown as string) === key
          ? { ...n, content: input.content.trim(), updatedAt: Date.now() }
          : n
      );
    }
    state.notesByUser = next;
    emit();
  },

  /** Supprime une note CRM. */
  deleteNote(input: { noteId: Id<"coachingNotes"> }): void {
    const key = input.noteId as unknown as string;
    const next: Record<string, NoteEntity[]> = {};
    for (const [u, arr] of Object.entries(state.notesByUser)) {
      next[u] = arr.filter((n) => (n._id as unknown as string) !== key);
    }
    state.notesByUser = next;
    emit();
  },

  /** Édite la note d'onboarding d'un élève. */
  updateOnboardingNote(input: { userId: Id<"users">; notes: string }): void {
    const key = input.userId as unknown as string;
    const existing = state.onboardingByUser[key];
    state.onboardingByUser = {
      ...state.onboardingByUser,
      [key]: { ...(existing ?? {}), notes: input.notes },
    };
    emit();
  },

  /** Toggle d'une LEÇON débloquée pour un élève (timeline parcours interactive).
   *  M1 implicite côté Convex : ici on accepte quand même les toggles M1 pour
   *  la démo (le helper côté UI évite de re-locker une leçon M1 en pratique). */
  toggleUnlockedLesson(input: {
    userId: Id<"users">;
    lessonId: Id<"curriculum">;
    on: boolean;
  }): void {
    const key = input.userId as unknown as string;
    const lessonKey = input.lessonId as unknown as string;
    const cur = state.unlockedLessonIdsByUser[key] ?? [];
    const set = new Set(cur);
    if (input.on) set.add(lessonKey);
    else set.delete(lessonKey);
    state.unlockedLessonIdsByUser = {
      ...state.unlockedLessonIdsByUser,
      [key]: [...set],
    };
    emit();
  },

  /**
   * Simule l'envoi d'une campagne (mode test) : ajoute une entrée à
   * l'historique + pousse un event GLOBAL `campaign.sent` (sans userId, comme
   * le backend). Aucun message réel n'est envoyé.
   */
  simulateCampaign(input: {
    channel: "email" | "whatsapp";
    segment: string;
    subject?: string;
    body: string;
    recipientCount: number;
  }): void {
    const now = Date.now();
    const campaign: CampaignEntity = {
      _id: cmpid(genId("cmp")),
      _creationTime: now,
      channel: input.channel,
      segment: input.segment,
      subject: input.channel === "email" ? input.subject : undefined,
      body: input.body,
      recipientCount: input.recipientCount,
      createdAt: now,
    };
    state.campaigns = [campaign, ...state.campaigns];
    const ev: EventEntity = {
      _id: evid(genId("ev")),
      // Event global (pas rattaché à un élève) — userId factice non résolu.
      userId: uid("__global__"),
      type: "campaign.sent",
      title: `Campagne ${input.channel} → ${input.segment} (${input.recipientCount})`,
      actor: "coach",
      at: now,
    };
    state.eventsByUser = {
      ...state.eventsByUser,
      __global__: [ev, ...(state.eventsByUser["__global__"] ?? [])],
    };
    emit();
  },
};

// ── SÉLECTEURS (recalculent les formes des écrans) ───────────────────────────

const STAGE_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  positionnement: "Positionnement",
  contenu: "Contenu",
  feedback_analyse: "Feedback & Analyse",
  termine: "Terminé",
};

function isActiveStatus(status: Status): boolean {
  return status === "active" || status === "paid";
}

function nextSessionTsFor(userId: string, now: number): number | null {
  let min: number | null = null;
  for (const s of state.sessions) {
    if ((s.userId as unknown as string) !== userId) continue;
    if (s.status !== "scheduled") continue;
    if (s.scheduledAt < now) continue;
    if (min === null || s.scheduledAt < min) min = s.scheduledAt;
  }
  return min;
}

function relativeDays(from: number, now: number): string {
  const diff = now - from;
  if (diff < HOUR) return `il y a ${Math.max(1, Math.round(diff / MIN))} min`;
  if (diff < DAY) return `il y a ${Math.round(diff / HOUR)} h`;
  if (diff < 2 * DAY) return "hier";
  return `il y a ${Math.round(diff / DAY)} j`;
}

function fmtEur(n: number): string {
  return `${n.toLocaleString("fr-FR")} €`;
}

/** Résout l'item de curriculum lié à une session (ou null). */
function resolveCurriculum(
  curriculumItemId?: Id<"curriculum">
): CurriculumItem | null {
  if (!curriculumItemId) return null;
  const key = curriculumItemId as unknown as string;
  return (
    state.curriculum.find((c) => (c._id as unknown as string) === key) ?? null
  );
}

/** Curriculum démo, même forme (et tri) que api.curriculum.listCurriculum. */
export function selectCurriculum(): Curriculum {
  return [...state.curriculum].sort((a, b) => a.order - b.order);
}

// Démo d'exos par user — VOLONTAIREMENT VIDE en mode test. Le mode test ne
// connaît pas la BDD prod ; la vraie liste d'exos (créée via /admin/content)
// remontera côté prod via `api.exercises.listForUser`. Retourner une liste
// fictive ici donnerait l'illusion de voir des exos qui n'existent pas.
type DemoExercise = {
  _id: string;
  title: string;
  state: "available" | "completed" | "locked" | "locked_module";
  moduleOrder: number;
  moduleTitle: string;
  lessonTitle: string;
  completedAt?: number;
  responseUpdatedAt?: number;
  progressPercent?: number;
};
export function selectExercisesForUser(): DemoExercise[] {
  return [];
}

/**
 * Journal d'événements d'un user, plus récent d'abord (même forme que
 * api.events.listForUser). User inconnu → tableau vide.
 */
export function selectEvents(userId: string): EventEntity[] {
  return [...(state.eventsByUser[userId] ?? [])].sort((a, b) => b.at - a.at);
}

export function selectDashboardToday(): DashboardToday {
  const now = Date.now();
  const todayStart = startOfTodayTs();
  const todayEnd = todayStart + DAY;
  const monthAgo = now - 30 * DAY;
  const { students, sessions } = state;

  // KPIs
  let coachingActifs = 0;
  let communaute = 0;
  let mrr = 0;
  let coachingNew30 = 0;
  let mrrNew30 = 0;
  for (const s of students) {
    if (!isActiveStatus(s.status)) continue;
    const price = s.tier === "coaching" ? 179 : 79;
    mrr += price;
    communaute += 1;
    if (s.tier === "coaching") coachingActifs += 1;
    if (s.createdAt >= monthAgo) {
      mrrNew30 += price;
      if (s.tier === "coaching") coachingNew30 += 1;
    }
  }
  const communauteNew30 = students.filter((s) => s.createdAt >= monthAgo).length;
  const impayes = students.filter((s) => s.status === "past_due").length;

  // RDV du jour (sessions planifiées aujourd'hui).
  const scheduled = sessions.filter((s) => s.status === "scheduled");
  const fmtH = (ts: number) =>
    new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const rdvJour: DashboardToday["rdvJour"] = scheduled
    .filter((s) => s.scheduledAt >= todayStart && s.scheduledAt < todayEnd)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((s) => {
      const u = findStudent(s.userId as unknown as string);
      const dur = s.endAt ? `${Math.round((s.endAt - s.scheduledAt) / MIN)} min` : "—";
      return {
        userId: s.userId,
        h: fmtH(s.scheduledAt),
        who: u?.discordUsername || u?.name || "—",
        tag: s.type === "onboarding" ? "Onboarding" : s.summary || "Coaching",
        dur,
        flag: s.type === "onboarding" ? "1er RDV" : undefined,
      };
    });

  // Semaine à venir : 5 prochains jours.
  const rdvSemaine: DashboardToday["rdvSemaine"] = [];
  for (let i = 0; i < 5; i++) {
    const dStart = todayStart + i * DAY;
    const dEnd = dStart + DAY;
    const n = scheduled.filter(
      (s) => s.scheduledAt >= dStart && s.scheduledAt < dEnd
    ).length;
    const label = new Date(dStart)
      .toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" })
      .toUpperCase()
      .replace(".", "");
    rdvSemaine.push({ jour: label, n });
  }
  const semaineTotal = scheduled.filter(
    (s) => s.scheduledAt >= todayStart && s.scheduledAt < todayStart + 7 * DAY
  ).length;

  // Relances : coaching actif sans RDV à venir.
  const withUpcoming = new Set(
    scheduled
      .filter((s) => s.scheduledAt >= now)
      .map((s) => s.userId as unknown as string)
  );
  const relances: DashboardToday["relances"] = [];
  for (const s of students) {
    if (s.tier !== "coaching" || !isActiveStatus(s.status)) continue;
    if (withUpcoming.has(s._id as unknown as string)) continue;
    relances.push({
      userId: s._id,
      discordId: s.discordId,
      who: s.discordUsername || s.name || "—",
      etape: s.coachingStage ? STAGE_LABEL[s.coachingStage] ?? "—" : "—",
      last: relativeDays(s.lastActiveAt, now),
    });
    if (relances.length >= 6) break;
  }

  // Alertes paiement : past_due / canceled.
  const alertes: DashboardToday["alertes"] = students
    .filter((s) => s.status === "past_due" || s.status === "canceled")
    .slice(0, 6)
    .map((s) => ({
      who: s.discordUsername || s.name || "—",
      type: s.status === "past_due" ? "Échec paiement" : "Annulation",
      montant: `${s.tier === "coaching" ? 179 : 79} €`,
    }));

  // Onboarding en attente : coaching actif à l'étape onboarding (ou non définie).
  const onboarding: DashboardToday["onboarding"] = [];
  for (const s of students) {
    if (s.tier !== "coaching" || !isActiveStatus(s.status)) continue;
    if (s.coachingStage && s.coachingStage !== "onboarding") continue;
    const onb = state.onboardingByUser[s._id as unknown as string];
    if (onb?.completedAt) continue;
    const depuis = `${Math.max(1, Math.round((now - s.createdAt) / DAY))} j`;
    onboarding.push({
      who: s.discordUsername || s.name || "—",
      etape: s.coachingStage ? "À programmer" : "Formulaire envoyé",
      depuis,
    });
    if (onboarding.length >= 5) break;
  }

  // Activité récente : sessions complétées + nouveaux membres.
  type Act = { at: number; txt: string };
  const acts: Act[] = [];
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const u = findStudent(s.userId as unknown as string);
    acts.push({
      at: s.updatedAt,
      txt: `RDV terminé — ${u?.discordUsername || u?.name || "—"} · notes ajoutées`,
    });
  }
  for (const s of students) {
    acts.push({ at: s.createdAt, txt: `Nouveau membre — ${s.discordUsername || s.name || "—"}` });
  }
  const activite: DashboardToday["activite"] = acts
    .sort((a, b) => b.at - a.at)
    .slice(0, 6)
    .map((a) => ({ t: relativeDays(a.at, now), txt: a.txt }));

  const mrrSpark = [62, 64, 63, 68, 71, 70, 74, 78, 76, 80, 78, 82];

  return {
    kpis: {
      coachingActifs: { value: coachingActifs, delta: `+${coachingNew30}`, note: "ce mois" },
      communaute: { value: communaute, delta: `+${communauteNew30}`, note: "nouveaux 30j" },
      impayes: { value: impayes, delta: `${impayes}`, note: "à traiter" },
      mrr: { value: fmtEur(mrr), delta: `+${fmtEur(mrrNew30)}`, note: "vs mois préc." },
    },
    rdvJour,
    rdvSemaine,
    semaineTotal,
    relances,
    alertes,
    onboarding,
    activite,
    mrrSpark,
  };
}

export function selectStudentsList(): StudentsList {
  const now = Date.now();
  return state.students.map((s) => ({
    _id: s._id,
    name: s.name ?? null,
    discordUsername: s.discordUsername ?? null,
    image: s.image ?? null,
    createdAt: s.createdAt ?? null,
    lastActiveAt: s.lastActiveAt ?? null,
    coachingStage: s.coachingStage ?? null,
    tier: s.tier ?? null,
    status: s.status ?? null,
    phone: s.phone ?? null,
    nextSessionAt: nextSessionTsFor(s._id as unknown as string, now),
  }));
}

export function selectMemberDetail(id: string): MemberDetail {
  const now = Date.now();
  const student = findStudent(id) ?? state.students[0];
  const key = student._id as unknown as string;

  const userSessions = state.sessions.filter(
    (s) => (s.userId as unknown as string) === key
  );
  // appelNo = rang chronologique ASCENDANT parmi les RDV de l'élève (idem backend).
  const appelNoById = new Map<string, number>();
  [...userSessions]
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .forEach((s, i) => appelNoById.set(s._id as unknown as string, i + 1));

  const sessions: MemberDetail["sessions"] = userSessions
    .sort((a, b) => b.scheduledAt - a.scheduledAt)
    .map((s) => ({
      _id: s._id,
      _creationTime: s.createdAt,
      userId: s.userId,
      coachId: uid("u_coach"),
      type: s.type,
      source: s.source,
      scheduledAt: s.scheduledAt,
      endAt: s.endAt,
      status: s.status,
      summary: s.summary,
      notes: s.notes,
      googleEventId: s.googleEventId,
      meetUrl: s.meetUrl,
      curriculumItemId: s.curriculumItemId,
      aiSummary: s.aiSummary,
      transcriptUrl: s.transcriptUrl,
      firefliesId: s.firefliesId,
      appelNo: appelNoById.get(s._id as unknown as string) ?? null,
      curriculum: resolveCurriculum(s.curriculumItemId),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

  const nextSession =
    sessions
      .filter((s) => s.status === "scheduled" && s.scheduledAt >= now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null;

  const notes: MemberDetail["notes"] = (state.notesByUser[key] ?? [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n) => ({
      _id: n._id,
      _creationTime: n.createdAt,
      userId: n.userId,
      coachId: uid("u_coach"),
      content: n.content,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));

  const onb = state.onboardingByUser[key];
  const onboarding: MemberDetail["onboarding"] = onb
    ? {
        _id: `n_${key}` as unknown as Id<"onboardings">,
        _creationTime: student.createdAt,
        userId: student._id,
        tier: onb.tier ?? "coaching",
        step: onb.step ?? "awaiting_presentation",
        token: `tk_demo_${key}`,
        firstName: onb.firstName,
        lastName: onb.lastName,
        phone: onb.phone,
        answers: onb.answers,
        presentedAt: onb.presentedAt,
        linkSentAt: onb.linkSentAt,
        formCompletedAt: onb.formCompletedAt,
        rdvBookedAt: onb.rdvBookedAt,
        notes: onb.notes,
        createdAt: student.createdAt,
        updatedAt: student.createdAt,
      }
    : null;

  const montant = student.tier === "coaching" ? 17900 : 7900;
  const purchase: MemberDetail["purchase"] = {
    _id: pid(`p_${key}`),
    _creationTime: student.createdAt,
    email: student.email,
    stripeSessionId: `cs_demo_${key}`,
    stripePaymentIntentId: `pi_demo_${key}`,
    amount: montant,
    currency: "eur",
    status: student.status,
    userId: student._id,
    createdAt: student.createdAt,
    paidAt: student.createdAt,
    tier: student.tier,
    duree: student.tier === "coaching" ? (student.duree ?? "1mois") : undefined,
    currentPeriodEnd: now + 16 * DAY,
    phone: student.phone ?? undefined,
    source: "stripe",
  };

  const user: MemberDetail["user"] = {
    _id: student._id,
    _creationTime: student.createdAt,
    name: student.name,
    email: student.email,
    discordId: student.discordId ?? undefined,
    discordUsername: student.discordUsername,
    role: "member",
    coachingStage: student.coachingStage ?? undefined,
    purchaseId: pid(`p_${key}`),
    createdAt: student.createdAt,
    lastActiveAt: student.lastActiveAt,
    xp: 1240,
    streakDays: 9,
    unlockedModules: state.unlockedModulesByUser[key],
    unlockedLessonIds: (state.unlockedLessonIdsByUser[key] ?? []) as unknown as Id<"curriculum">[],
  };

  return {
    user,
    purchase,
    onboarding,
    notes,
    sessions,
    nextSession,
    coachingStage: student.coachingStage ?? null,
    stats: { xp: 1240, streakDays: 9, badges: 4, lessonsCompleted: 18, totalLessons: 32 },
  };
}

export function selectSessionsInRange(from: number, to: number): RangeSessions {
  return state.sessions
    .filter((s) => s.scheduledAt >= from && s.scheduledAt <= to)
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((s) => {
      const u = findStudent(s.userId as unknown as string);
      return {
        _id: s._id,
        _creationTime: s.createdAt,
        userId: s.userId,
        coachId: uid("u_coach"),
        type: s.type,
        source: s.source,
        scheduledAt: s.scheduledAt,
        endAt: s.endAt,
        status: s.status,
        summary: s.summary,
        notes: s.notes,
        googleEventId: s.googleEventId,
        meetUrl: s.meetUrl,
        curriculumItemId: s.curriculumItemId,
        curriculum: resolveCurriculum(s.curriculumItemId),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        student: u
          ? {
              _id: u._id,
              name: u.name ?? null,
              discordUsername: u.discordUsername ?? null,
              image: u.image ?? null,
            }
          : null,
      };
    });
}

export function selectStudentsWithoutUpcoming(): WithoutUpcoming {
  const now = Date.now();
  const withUpcoming = new Set<string>();
  for (const s of state.sessions) {
    if (s.status === "scheduled" && s.scheduledAt >= now) {
      withUpcoming.add(s.userId as unknown as string);
    }
  }
  return state.students
    .filter(
      (s) =>
        s.tier === "coaching" &&
        isActiveStatus(s.status) &&
        !withUpcoming.has(s._id as unknown as string)
    )
    .map((s) => ({
      _id: s._id,
      name: s.name ?? null,
      discordUsername: s.discordUsername ?? null,
      image: s.image ?? null,
      coachingStage: s.coachingStage ?? null,
    }));
}

export function selectPaymentsOverview(): Payments {
  const now = Date.now();
  const { students } = state;

  let mrr = 0;
  let actifs = 0;
  let coaching3m = 0;
  let coaching1m = 0;
  let communaute = 0;
  for (const s of students) {
    if (!isActiveStatus(s.status)) continue;
    actifs += 1;
    mrr += s.tier === "coaching" ? 179 : 79;
    if (s.tier === "coaching") {
      if (s.duree === "3mois") coaching3m += 1;
      else coaching1m += 1;
    } else communaute += 1;
  }
  const incidents = students.filter((s) => s.status === "past_due").length;
  const churn30 = students.filter((s) => s.status === "canceled").length;

  const mrrSeries = [4920, 5180, 5410, 5870, 6240, 6480, 6920, 7140, 7280, 7635, 7635, mrr];

  const subscriptions: Payments["subscriptions"] = students
    .filter(
      (s) => isActiveStatus(s.status) || s.status === "past_due" || s.status === "canceled"
    )
    .map((s) => {
      const offre =
        s.tier === "coaching"
          ? `Coaching${s.duree === "3mois" ? " 3 mois" : s.duree === "1mois" ? " 1 mois" : ""}`
          : "Communauté";
      const incident = s.status === "past_due" || s.status === "canceled";
      return {
        id: pid(`p_${s._id as unknown as string}`),
        who: s.discordUsername || s.name || "—",
        offre,
        montant: `${s.tier === "coaching" ? 179 : 79} €`,
        statut: s.status,
        echeance: incident ? null : now + 16 * DAY,
        depuis: s.createdAt,
        phone: s.phone ?? null,
      };
    });

  return {
    kpis: { mrr: fmtEur(mrr), actifs, incidents, churn30 },
    mrrSeries,
    repartition: { coaching3m, coaching1m, communaute },
    subscriptions,
  };
}

// ── Segmentation CRM (mode test) ─────────────────────────────────────────────
// Mêmes clés / libellés / ordre que convex/segments.ts (SEGMENTS), et mêmes
// règles de classification (dérivées des élèves démo). Un élève peut tomber
// dans plusieurs segments (ex. coaching + inactif + sans_rdv).

type SegmentKey =
  | "prospects"
  | "communaute"
  | "coaching"
  | "coaching_termine"
  | "impayes"
  | "annules"
  | "inactifs"
  | "sans_rdv";

const SEGMENT_META: ReadonlyArray<{
  key: SegmentKey;
  label: string;
  description: string;
}> = [
  { key: "prospects", label: "Leads non payés", description: "Aucun abonnement actif." },
  { key: "communaute", label: "Communauté", description: "Abonnement Communauté actif." },
  { key: "coaching", label: "Coaching actifs", description: "Abonnement Coaching actif." },
  {
    key: "coaching_termine",
    label: "Coaching terminé (à renouveler)",
    description: "Coaching résilié — relance renouvellement.",
  },
  { key: "impayes", label: "Impayés", description: "Paiement en échec (past_due)." },
  { key: "annules", label: "Annulés (win-back)", description: "Abonnement résilié." },
  { key: "inactifs", label: "Inactifs 21j+", description: "Pas de connexion depuis 21 jours." },
  {
    key: "sans_rdv",
    label: "Coaching sans RDV",
    description: "Coaching actif sans RDV planifié à venir.",
  },
];

const INACTIVE_THRESHOLD = 21 * DAY;

/** Range les élèves démo dans leurs segments (mêmes règles que le backend). */
function classifyStudents(): Record<SegmentKey, StudentEntity[]> {
  const now = Date.now();
  const out: Record<SegmentKey, StudentEntity[]> = {
    prospects: [],
    communaute: [],
    coaching: [],
    coaching_termine: [],
    impayes: [],
    annules: [],
    inactifs: [],
    sans_rdv: [],
  };
  for (const s of state.students) {
    const isActive = isActiveStatus(s.status);
    const hasUpcoming = nextSessionTsFor(s._id as unknown as string, now) != null;

    if (!isActive) out.prospects.push(s);
    if (isActive && s.tier === "communaute") out.communaute.push(s);
    if (isActive && s.tier === "coaching") {
      out.coaching.push(s);
      if (!hasUpcoming) out.sans_rdv.push(s);
    }
    if (s.tier === "coaching" && s.status === "canceled") out.coaching_termine.push(s);
    if (s.status === "past_due") out.impayes.push(s);
    if (s.status === "canceled") out.annules.push(s);
    if (now - s.lastActiveAt > INACTIVE_THRESHOLD) out.inactifs.push(s);
  }
  return out;
}

/** Liste des segments + compteurs (même forme/ordre que listSegments). */
export function selectSegments(): Segments {
  const c = classifyStudents();
  return SEGMENT_META.map((s) => ({
    key: s.key,
    label: s.label,
    description: s.description,
    count: c[s.key].length,
  }));
}

/** Membres d'un segment (triés par nom), même forme que segmentMembers. */
export function selectSegmentMembers(key: string): SegmentMembers {
  const c = classifyStudents();
  const members = c[key as SegmentKey] ?? [];
  return [...members]
    .map((s) => ({
      userId: s._id,
      name: s.name ?? null,
      discordUsername: s.discordUsername ?? null,
      email: s.email ?? null,
      phone: s.phone ?? null,
    }))
    .sort((a, b) => {
      const an = (a.name ?? a.discordUsername ?? "").toLowerCase();
      const bn = (b.name ?? b.discordUsername ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
}

/** Historique des campagnes démo (plus récent d'abord, comme listCampaigns). */
export function selectCampaigns(): Campaigns {
  return [...state.campaigns].sort((a, b) => b.createdAt - a.createdAt);
}

// ── Hook réactif ──────────────────────────────────────────────────────────────
/**
 * S'abonne au store sandbox et re-render le composant à chaque mutation.
 * Appeler INCONDITIONNELLEMENT (même hors mode test) ; en mode réel la valeur
 * est simplement ignorée. Le snapshot serveur renvoie l'état initial.
 */
export function useTestStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
