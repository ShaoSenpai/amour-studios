import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// Données de démo du MODE TEST. Chaque objet est typé pour matcher EXACTEMENT
// le retour de la query Convex correspondante (FunctionReturnType<...>), afin
// que les écrans /studio s'affichent peuplés sans aucune écriture en base.
// Pseudos / chiffres repris des références design (mxlo.beats, MRR 8 247 €…).
// Les timestamps de sessions sont calculés autour de Date.now() pour tomber
// dans la semaine/journée courante affichée.
// ============================================================================

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

// Identifiants factices (le format réel des Id Convex n'a pas d'importance
// en mode test : aucune query/mutation n'est appelée avec).
const uid = (s: string) => s as unknown as Id<"users">;
const sid = (s: string) => s as unknown as Id<"coachingSessions">;
const pid = (s: string) => s as unknown as Id<"purchases">;
const curid = (s: string) => s as unknown as Id<"curriculum">;

// Début du jour courant (00:00) et de la semaine courante (lundi 00:00).
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

/** Construit un timestamp à une heure précise d'un jour donné de la semaine. */
function weekTime(dayIndex: number, hour: number, minute = 0): number {
  return startOfWeekTs() + dayIndex * DAY + hour * HOUR + minute * MIN;
}

// ── 1. dashboardToday ──────────────────────────────────────────────────────

const todayStart = startOfTodayTs();

export const dashboardToday: FunctionReturnType<
  typeof api.coaching.dashboardToday
> = {
  kpis: {
    coachingActifs: { value: 23, delta: "+2", note: "ce mois" },
    communaute: { value: 187, delta: "+14", note: "nouveaux 30j" },
    impayes: { value: 3, delta: "3", note: "à traiter" },
    mrr: { value: "8 247 €", delta: "+612 €", note: "vs mois préc." },
  },
  rdvJour: [
    { userId: uid("u_mxlo"), h: "09:30", who: "mxlo.beats", tag: "Positionnement", dur: "45 min", flag: undefined },
    { userId: uid("u_lena"), h: "11:00", who: "lena__rmr", tag: "Feedback contenu", dur: "30 min", flag: undefined },
    { userId: uid("u_yuko"), h: "14:00", who: "yuko_prod", tag: "Onboarding", dur: "60 min", flag: "1er RDV" },
    { userId: uid("u_soren"), h: "16:30", who: "soren.wav", tag: "Analyse stats", dur: "30 min", flag: undefined },
    { userId: uid("u_kira"), h: "18:00", who: "kira.ldn", tag: "Stratégie reels", dur: "45 min", flag: undefined },
  ],
  rdvSemaine: [
    { jour: "VEN 15", n: 4, date: todayStart },
    { jour: "SAM 16", n: 2, date: todayStart + 1 * DAY },
    { jour: "LUN 18", n: 6, date: todayStart + 2 * DAY },
    { jour: "MAR 19", n: 5, date: todayStart + 3 * DAY },
    { jour: "MER 20", n: 3, date: todayStart + 4 * DAY },
  ],
  semaineTotal: 25,
  relances: [
    { userId: uid("u_amir"), discordId: "223456789012345671", who: "amir.flow", etape: "Contenu", last: "vu il y a 18 j" },
    { userId: uid("u_nour"), discordId: "223456789012345672", who: "nour_tape", etape: "Feedback & Analyse", last: "vu il y a 22 j" },
    { userId: uid("u_octave"), discordId: null, who: "octave.fm", etape: "Positionnement", last: "vu il y a 11 j" },
    { userId: uid("u_valk"), discordId: "223456789012345674", who: "valk.ldr", etape: "Contenu", last: "vu il y a 14 j" },
  ],
  alertes: [
    { purchaseId: pid("p_thibz"), userId: uid("u_thibz"), who: "thibz_prod", type: "Échec paiement", montant: "179 €" },
    { purchaseId: pid("p_selma"), userId: uid("u_selma"), who: "selma.snd", type: "Annulation", montant: "79 €" },
    { purchaseId: pid("p_kaori"), userId: uid("u_kaori"), who: "kaori.b", type: "Échec paiement", montant: "179 €" },
  ],
  onboarding: [
    { userId: uid("u_yuko"), who: "yuko_prod", etape: "Formulaire envoyé", depuis: "2 j" },
    { userId: uid("u_remi"), who: "remi.ssr", etape: "À programmer", depuis: "4 j" },
  ],
  activite: [
    { t: "il y a 12 min", txt: "Paiement reçu — yuko_prod · 179 €", userId: uid("u_yuko"), kind: "payment" },
    { t: "il y a 1 h", txt: "Nouveau membre — h4nna.wav", userId: uid("u_h4nna"), kind: "user" },
    { t: "il y a 2 h", txt: "RDV terminé — mxlo.beats · notes ajoutées", userId: uid("u_mxlo"), kind: "session" },
    { t: "il y a 3 h", txt: "Étape mise à jour — lena__rmr → Feedback", userId: uid("u_lena"), kind: "session" },
    { t: "il y a 5 h", txt: "Paiement reçu — kira.ldn · 79 €", userId: uid("u_kira"), kind: "payment" },
    { t: "hier", txt: "Nouveau membre — soren.wav", userId: uid("u_soren"), kind: "user" },
  ],
  mrrSpark: [62, 64, 63, 68, 71, 70, 74, 78, 76, 80, 78, 82],
};
void todayStart;

// ── 2. listMembers (api.admin.listMembers) ──────────────────────────────────

type Members = FunctionReturnType<typeof api.admin.listMembers>;
type Member = Members[number];

type Tier = "coaching" | "communaute";
type Status = "active" | "past_due" | "canceled";
type Stage =
  | "onboarding"
  | "positionnement"
  | "contenu"
  | "feedback_analyse"
  | "termine";

/** Fabrique un membre de démo entièrement typé (user + purchase). */
function member(opts: {
  key: string;
  discordUsername: string;
  name: string;
  tier: Tier;
  duree?: "1mois" | "3mois";
  status: Status;
  stage: Stage | null;
  phone: string | null;
  inscritDaysAgo: number;
  lastActiveMs: number; // ms écoulées depuis maintenant
  periodEndDays: number; // jours avant prochaine échéance
}): Member {
  const now = Date.now();
  const createdAt = now - opts.inscritDaysAgo * DAY;
  const purchase: Member["purchase"] = {
    _id: pid(`p_${opts.key}`),
    _creationTime: createdAt,
    email: `${opts.discordUsername}@example.com`,
    stripeSessionId: `cs_demo_${opts.key}`,
    stripePaymentIntentId: `pi_demo_${opts.key}`,
    amount: opts.tier === "coaching" ? 17900 : 7900,
    currency: "eur",
    status: opts.status,
    userId: uid(`u_${opts.key}`),
    createdAt,
    paidAt: createdAt,
    tier: opts.tier,
    duree: opts.tier === "coaching" ? (opts.duree ?? "1mois") : undefined,
    currentPeriodEnd: now + opts.periodEndDays * DAY,
    phone: opts.phone ?? undefined,
    source: "stripe",
  };
  return {
    _id: uid(`u_${opts.key}`),
    _creationTime: createdAt,
    name: opts.name,
    email: `${opts.discordUsername}@example.com`,
    discordUsername: opts.discordUsername,
    role: "member",
    coachingStage: opts.stage ?? undefined,
    purchaseId: pid(`p_${opts.key}`),
    createdAt,
    lastActiveAt: now - opts.lastActiveMs,
    onboarding: null,
    purchase,
  };
}

export const listMembers: Members = [
  member({ key: "mxlo", discordUsername: "mxlo.beats", name: "Maxime Lefèvre", tier: "coaching", duree: "3mois", status: "active", stage: "positionnement", phone: "+33 6 12 34 56 78", inscritDaysAgo: 120, lastActiveMs: 2 * DAY, periodEndDays: 16 }),
  member({ key: "lena", discordUsername: "lena__rmr", name: "Léna R.", tier: "coaching", duree: "1mois", status: "active", stage: "feedback_analyse", phone: "+33 6 22 11 09 87", inscritDaysAgo: 62, lastActiveMs: 1 * DAY, periodEndDays: 7 }),
  member({ key: "yuko", discordUsername: "yuko_prod", name: "Yuko P.", tier: "coaching", duree: "3mois", status: "active", stage: "onboarding", phone: "+33 6 43 22 11 33", inscritDaysAgo: 8, lastActiveMs: 3 * HOUR, periodEndDays: 22 }),
  member({ key: "soren", discordUsername: "soren.wav", name: "Soren D.", tier: "coaching", duree: "3mois", status: "active", stage: "contenu", phone: "+33 6 14 23 67 12", inscritDaysAgo: 182, lastActiveMs: 1 * DAY, periodEndDays: 4 }),
  member({ key: "kira", discordUsername: "kira.ldn", name: "Kira N.", tier: "coaching", duree: "1mois", status: "active", stage: "contenu", phone: "+33 6 78 91 02 33", inscritDaysAgo: 92, lastActiveMs: 4 * HOUR, periodEndDays: 7 }),
  member({ key: "thibz", discordUsername: "thibz_prod", name: "Thibault Z.", tier: "coaching", duree: "3mois", status: "past_due", stage: "contenu", phone: "+33 6 19 38 45 22", inscritDaysAgo: 150, lastActiveMs: 6 * DAY, periodEndDays: -2 }),
  member({ key: "amir", discordUsername: "amir.flow", name: "Amir F.", tier: "coaching", duree: "1mois", status: "active", stage: "contenu", phone: "+33 6 87 33 12 09", inscritDaysAgo: 31, lastActiveMs: 18 * DAY, periodEndDays: 16 }),
  member({ key: "nour", discordUsername: "nour_tape", name: "Nour T.", tier: "coaching", duree: "3mois", status: "active", stage: "feedback_analyse", phone: "+33 6 14 88 21 04", inscritDaysAgo: 120, lastActiveMs: 22 * DAY, periodEndDays: 8 }),
  member({ key: "octave", discordUsername: "octave.fm", name: "Octave M.", tier: "coaching", duree: "1mois", status: "active", stage: "positionnement", phone: "+33 6 22 09 87 33", inscritDaysAgo: 62, lastActiveMs: 11 * DAY, periodEndDays: 22 }),
  member({ key: "valk", discordUsername: "valk.ldr", name: "Valentin K.", tier: "coaching", duree: "3mois", status: "active", stage: "contenu", phone: "+33 6 65 41 28 73", inscritDaysAgo: 150, lastActiveMs: 14 * DAY, periodEndDays: -1 }),
  member({ key: "selma", discordUsername: "selma.snd", name: "Selma D.", tier: "communaute", status: "canceled", stage: "termine", phone: "+33 6 88 22 11 09", inscritDaysAgo: 92, lastActiveMs: 8 * DAY, periodEndDays: 0 }),
  member({ key: "kaori", discordUsername: "kaori.b", name: "Kaori B.", tier: "coaching", duree: "1mois", status: "past_due", stage: "positionnement", phone: "+33 6 03 45 67 89", inscritDaysAgo: 31, lastActiveMs: 2 * DAY, periodEndDays: -1 }),
  member({ key: "hanna", discordUsername: "h4nna.wav", name: "Hanna V.", tier: "communaute", status: "active", stage: null, phone: null, inscritDaysAgo: 1, lastActiveMs: 1 * HOUR, periodEndDays: 29 }),
  member({ key: "remi", discordUsername: "remi.ssr", name: "Rémi S.", tier: "coaching", duree: "1mois", status: "active", stage: "onboarding", phone: "+33 6 71 23 45 67", inscritDaysAgo: 4, lastActiveMs: 4 * DAY, periodEndDays: 26 }),
];

// ── 2b. studentsList (api.coaching.studentsList) ─────────────────────────────
// 14 élèves avec tier/status/phone/coachingStage/nextSessionAt/lastActiveAt.
// Dérivé de listMembers pour rester cohérent (mêmes pseudos / ids u_*).

type StudentsList = FunctionReturnType<typeof api.coaching.studentsList>;
type Student = StudentsList[number];

// Quelques RDV à venir (timestamps autour d'aujourd'hui) pour la colonne
// « Prochain RDV ». Les autres élèves restent à null (« — »).
const nextByKey: Record<string, number> = {
  mxlo: startOfTodayTs() + 9 * HOUR + 30 * MIN,
  lena: startOfTodayTs() + 11 * HOUR,
  yuko: startOfTodayTs() + 1 * DAY + 14 * HOUR,
  soren: startOfTodayTs() + 16 * HOUR + 30 * MIN,
  kira: startOfTodayTs() + 2 * DAY + 18 * HOUR,
  remi: startOfTodayTs() + 3 * DAY + 15 * HOUR + 30 * MIN,
};

export const studentsList: StudentsList = listMembers.map((m): Student => {
  const key = (m._id as unknown as string).replace(/^u_/, "");
  return {
    _id: m._id,
    name: m.name ?? null,
    discordUsername: m.discordUsername ?? null,
    image: m.image ?? null,
    createdAt: m.createdAt ?? null,
    lastActiveAt: m.lastActiveAt ?? null,
    coachingStage: m.coachingStage ?? null,
    tier: m.purchase?.tier ?? null,
    status: m.purchase?.status ?? null,
    phone: m.purchase?.phone ?? null,
    nextSessionAt: nextByKey[key] ?? null,
  };
});

// ── 3. getMemberDetail (api.coaching.getMemberDetail) ────────────────────────
// Un élève de démo complet (mxlo.beats). Renvoyé quel que soit l'id en test.

type Detail = NonNullable<
  FunctionReturnType<typeof api.coaching.getMemberDetail>
>;
type Session = Detail["sessions"][number];

const detailNow = Date.now();

function detailSession(opts: {
  key: string;
  daysFromNow: number;
  hour: number;
  durMin: number;
  status: Session["status"];
  type: Session["type"];
  summary?: string;
  notes?: string;
}): Session {
  const d = new Date();
  d.setHours(opts.hour, 0, 0, 0);
  const scheduledAt = d.getTime() + opts.daysFromNow * DAY;
  return {
    _id: sid(`s_${opts.key}`),
    _creationTime: scheduledAt - 3 * DAY,
    userId: uid("u_mxlo"),
    coachId: uid("u_coach"),
    type: opts.type,
    source: "manual",
    scheduledAt,
    endAt: scheduledAt + opts.durMin * MIN,
    status: opts.status,
    summary: opts.summary,
    notes: opts.notes,
    appelNo: null,
    curriculum: null,
    createdAt: scheduledAt - 3 * DAY,
    updatedAt: scheduledAt - 1 * DAY,
  };
}

const detailNextSession: Session = detailSession({ key: "next", daysFromNow: 0, hour: 9, durMin: 45, status: "scheduled", type: "coaching", summary: "Positionnement" });

const detailSessions: Session[] = [
  detailNextSession,
  detailSession({ key: "h1", daysFromNow: -6, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Positionnement", notes: "Identité visuelle clarifiée. Travailler le hook des reels — moins de monologue, plus de geste musical. À vu : ref Fred Again." }),
  detailSession({ key: "h2", daysFromNow: -20, hour: 15, durMin: 30, status: "completed", type: "coaching", summary: "Contenu", notes: "Storyboard 5 reels validés. Calendrier de publi : mar/jeu/sam. Objectif : 3 reels/sem." }),
  detailSession({ key: "h3", daysFromNow: -34, hour: 11, durMin: 60, status: "completed", type: "onboarding", summary: "Onboarding", notes: "Définition du persona artiste, audit IG. 800 abonnés, 2.1% d'engagement. Vidéos trop longues (>90s)." }),
  detailSession({ key: "h4", daysFromNow: -48, hour: 14, durMin: 60, status: "no_show", type: "coaching", summary: "Découverte", notes: "1er RDV manqué — relancé sur Discord." }),
].sort((a, b) => b.scheduledAt - a.scheduledAt);

// Notes CRM de démo (timeline, plus récent d'abord).
type Note = Detail["notes"][number];
const detailNotes: Note[] = [
  {
    _id: "cn_mxlo_1" as unknown as Id<"coachingNotes">,
    _creationTime: detailNow - 2 * DAY,
    userId: uid("u_mxlo"),
    coachId: uid("u_coach"),
    content:
      "Très motivé sur les reels. A enfin lâché les vidéos > 90s. Continuer à pousser le hook dès la 1re seconde.",
    createdAt: detailNow - 2 * DAY,
    updatedAt: detailNow - 2 * DAY,
  },
  {
    _id: "cn_mxlo_2" as unknown as Id<"coachingNotes">,
    _creationTime: detailNow - 16 * DAY,
    userId: uid("u_mxlo"),
    coachId: uid("u_coach"),
    content:
      "Hésite encore sur son positionnement (lo-fi vs hyperpop). Trancher avant la phase contenu — lui demander 3 refs assumées.",
    createdAt: detailNow - 16 * DAY,
    updatedAt: detailNow - 14 * DAY,
  },
  {
    _id: "cn_mxlo_3" as unknown as Id<"coachingNotes">,
    _creationTime: detailNow - 40 * DAY,
    userId: uid("u_mxlo"),
    coachId: uid("u_coach"),
    content: "1er contact très réceptif. Sensible aux retours négatifs — emballer doucement.",
    createdAt: detailNow - 40 * DAY,
    updatedAt: detailNow - 40 * DAY,
  },
].sort((a, b) => b.createdAt - a.createdAt);

export const getMemberDetail: Detail = {
  user: {
    _id: uid("u_mxlo"),
    _creationTime: detailNow - 120 * DAY,
    name: "Maxime Lefèvre",
    email: "mxlo.beats@example.com",
    discordId: "123456789012345678",
    discordUsername: "mxlo.beats",
    role: "member",
    coachingStage: "positionnement",
    purchaseId: pid("p_mxlo"),
    createdAt: detailNow - 120 * DAY,
    lastActiveAt: detailNow - 6 * HOUR,
    xp: 1240,
    streakDays: 9,
    unlockedModules: [2],
    unlockedLessonIds: [curid("cur_m2l1"), curid("cur_m2l2")],
  },
  purchase: {
    _id: pid("p_mxlo"),
    _creationTime: detailNow - 120 * DAY,
    email: "mxlo.beats@example.com",
    stripeSessionId: "cs_demo_mxlo",
    stripePaymentIntentId: "pi_demo_mxlo",
    amount: 17900,
    currency: "eur",
    status: "active",
    userId: uid("u_mxlo"),
    createdAt: detailNow - 120 * DAY,
    paidAt: detailNow - 120 * DAY,
    tier: "coaching",
    duree: "3mois",
    currentPeriodEnd: detailNow + 16 * DAY,
    phone: "+33 6 12 34 56 78",
    source: "stripe",
  },
  onboarding: {
    _id: "n_mxlo" as unknown as Id<"onboardings">,
    _creationTime: detailNow - 118 * DAY,
    userId: uid("u_mxlo"),
    tier: "coaching" as const,
    step: "rdv_booked" as const,
    token: "tk_demo_mxlo",
    firstName: "Maxime",
    lastName: "Lefèvre",
    phone: "+33 6 12 34 56 78",
    presentedAt: detailNow - 118 * DAY,
    linkSentAt: detailNow - 118 * DAY,
    formCompletedAt: detailNow - 117 * DAY,
    rdvBookedAt: detailNow - 116 * DAY,
    notes:
      "Très impliqué, livre toujours en avance. Sensible aux retours négatifs — emballer doucement. Pousser sur la voix off / présence physique en story.",
    createdAt: detailNow - 118 * DAY,
    updatedAt: detailNow - 116 * DAY,
  },
  notes: detailNotes,
  sessions: detailSessions,
  nextSession: detailNextSession,
  coachingStage: "positionnement",
  stats: { xp: 1240, streakDays: 9, badges: 4, lessonsCompleted: 18, totalLessons: 32 },
};

// ── 4. sessionsInRange (api.coaching.sessionsInRange) ────────────────────────
// Events répartis sur la semaine courante (lun=0 … dim=6), heures 8h-20h.

type RangeSessions = FunctionReturnType<typeof api.coaching.sessionsInRange>;
type RangeSession = RangeSessions[number];

function rangeSession(opts: {
  key: string;
  studentKey: string;
  who: string;
  dayIndex: number;
  hour: number;
  minute?: number;
  durMin: number;
  status: RangeSession["status"];
  type: RangeSession["type"];
  summary?: string;
}): RangeSession {
  const scheduledAt = weekTime(opts.dayIndex, opts.hour, opts.minute ?? 0);
  return {
    _id: sid(`cal_${opts.key}`),
    _creationTime: scheduledAt - 2 * DAY,
    userId: uid(`u_${opts.studentKey}`),
    coachId: uid("u_coach"),
    type: opts.type,
    source: "manual",
    scheduledAt,
    endAt: scheduledAt + opts.durMin * MIN,
    status: opts.status,
    summary: opts.summary,
    curriculum: null,
    createdAt: scheduledAt - 2 * DAY,
    updatedAt: scheduledAt - 1 * DAY,
    student: {
      _id: uid(`u_${opts.studentKey}`),
      name: null,
      discordUsername: opts.who,
      image: null,
    },
  };
}

export const sessionsInRange: RangeSessions = [
  // Lundi
  rangeSession({ key: "1", studentKey: "octave", who: "octave.fm", dayIndex: 0, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Positionnement" }),
  rangeSession({ key: "2", studentKey: "valk", who: "valk.ldr", dayIndex: 0, hour: 15, durMin: 30, status: "completed", type: "coaching", summary: "Contenu" }),
  // Mardi
  rangeSession({ key: "3", studentKey: "soren", who: "soren.wav", dayIndex: 1, hour: 9, durMin: 30, status: "completed", type: "coaching", summary: "Analyse stats" }),
  rangeSession({ key: "4", studentKey: "lena", who: "lena__rmr", dayIndex: 1, hour: 11, durMin: 45, status: "completed", type: "coaching", summary: "Feedback" }),
  rangeSession({ key: "5", studentKey: "thibz", who: "thibz_prod", dayIndex: 1, hour: 16, durMin: 45, status: "no_show", type: "coaching", summary: "Contenu" }),
  // Mercredi
  rangeSession({ key: "6", studentKey: "kira", who: "kira.ldn", dayIndex: 2, hour: 10, durMin: 45, status: "completed", type: "coaching", summary: "Stratégie reels" }),
  rangeSession({ key: "7", studentKey: "nour", who: "nour_tape", dayIndex: 2, hour: 14, durMin: 30, status: "canceled", type: "coaching", summary: "Feedback" }),
  // Jeudi
  rangeSession({ key: "8", studentKey: "mxlo", who: "mxlo.beats", dayIndex: 3, hour: 9, minute: 30, durMin: 45, status: "scheduled", type: "coaching", summary: "Positionnement" }),
  rangeSession({ key: "9", studentKey: "lena", who: "lena__rmr", dayIndex: 3, hour: 11, durMin: 30, status: "scheduled", type: "coaching", summary: "Feedback contenu" }),
  rangeSession({ key: "10", studentKey: "yuko", who: "yuko_prod", dayIndex: 3, hour: 14, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" }),
  rangeSession({ key: "11", studentKey: "soren", who: "soren.wav", dayIndex: 3, hour: 16, minute: 30, durMin: 30, status: "scheduled", type: "coaching", summary: "Analyse stats" }),
  rangeSession({ key: "12", studentKey: "kira", who: "kira.ldn", dayIndex: 3, hour: 18, durMin: 45, status: "scheduled", type: "coaching", summary: "Stratégie reels" }),
  // Vendredi
  rangeSession({ key: "13", studentKey: "amir", who: "amir.flow", dayIndex: 4, hour: 10, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" }),
  rangeSession({ key: "14", studentKey: "octave", who: "octave.fm", dayIndex: 4, hour: 13, durMin: 30, status: "scheduled", type: "coaching", summary: "Contenu" }),
  rangeSession({ key: "15", studentKey: "remi", who: "remi.ssr", dayIndex: 4, hour: 15, minute: 30, durMin: 60, status: "scheduled", type: "onboarding", summary: "Onboarding" }),
  rangeSession({ key: "16", studentKey: "valk", who: "valk.ldr", dayIndex: 4, hour: 18, durMin: 45, status: "scheduled", type: "coaching", summary: "Feedback" }),
  // Samedi
  rangeSession({ key: "17", studentKey: "kira", who: "kira.ldn", dayIndex: 5, hour: 11, durMin: 30, status: "scheduled", type: "coaching", summary: "Contenu" }),
  rangeSession({ key: "18", studentKey: "mxlo", who: "mxlo.beats", dayIndex: 5, hour: 14, durMin: 45, status: "scheduled", type: "coaching", summary: "Reels" }),
];

// ── 5. studentsWithoutUpcoming (api.coaching.studentsWithoutUpcoming) ────────

type WithoutUpcoming = FunctionReturnType<
  typeof api.coaching.studentsWithoutUpcoming
>;

export const studentsWithoutUpcoming: WithoutUpcoming = [
  { _id: uid("u_amir"), name: "Amir F.", discordUsername: "amir.flow", image: null, coachingStage: "contenu" },
  { _id: uid("u_nour"), name: "Nour T.", discordUsername: "nour_tape", image: null, coachingStage: "feedback_analyse" },
  { _id: uid("u_thibz"), name: "Thibault Z.", discordUsername: "thibz_prod", image: null, coachingStage: "contenu" },
];

// ── 6. paymentsOverview (api.coaching.paymentsOverview) ──────────────────────

type Payments = FunctionReturnType<typeof api.coaching.paymentsOverview>;
type Sub = Payments["subscriptions"][number];

const payNow = Date.now();
const inDays = (n: number) => payNow + n * DAY;
const agoDays = (n: number) => payNow - n * DAY;

function sub(opts: {
  key: string;
  who: string;
  offre: string;
  montant: number;
  statut: Sub["statut"];
  echeanceDays: number | null;
  depuisDays: number;
  phone?: string | null;
}): Sub {
  return {
    id: pid(`p_${opts.key}`),
    who: opts.who,
    offre: opts.offre,
    montant: `${opts.montant} €`,
    statut: opts.statut,
    echeance: opts.echeanceDays === null ? null : inDays(opts.echeanceDays),
    depuis: agoDays(opts.depuisDays),
    phone: opts.phone ?? null,
  };
}

export const paymentsOverview: Payments = {
  kpis: {
    mrr: "8 247 €",
    actifs: 23,
    incidents: 3,
    churn30: 2,
  },
  mrrSeries: [4920, 5180, 5410, 5870, 6240, 6480, 6920, 7140, 7280, 7635, 7635, 8247],
  repartition: { coaching3m: 11, coaching1m: 7, communaute: 134 },
  subscriptions: [
    sub({ key: "mxlo", who: "mxlo.beats", offre: "Coaching 3 mois", montant: 179, statut: "active", echeanceDays: 16, depuisDays: 120, phone: "+33 6 12 34 56 78" }),
    sub({ key: "lena", who: "lena__rmr", offre: "Coaching 1 mois", montant: 179, statut: "active", echeanceDays: 7, depuisDays: 62, phone: "+33 6 22 11 09 87" }),
    sub({ key: "yuko", who: "yuko_prod", offre: "Coaching 3 mois", montant: 179, statut: "active", echeanceDays: 22, depuisDays: 8, phone: "+33 6 43 22 11 33" }),
    sub({ key: "soren", who: "soren.wav", offre: "Coaching 3 mois", montant: 179, statut: "active", echeanceDays: 4, depuisDays: 182, phone: "+33 6 14 23 67 12" }),
    sub({ key: "thibz", who: "thibz_prod", offre: "Coaching 3 mois", montant: 179, statut: "past_due", echeanceDays: null, depuisDays: 150, phone: "+33 6 19 38 45 22" }),
    sub({ key: "kira", who: "kira.ldn", offre: "Coaching 1 mois", montant: 179, statut: "active", echeanceDays: 7, depuisDays: 92, phone: "+33 6 78 91 02 33" }),
    sub({ key: "kaori", who: "kaori.b", offre: "Coaching 1 mois", montant: 179, statut: "past_due", echeanceDays: null, depuisDays: 31, phone: "+33 6 03 45 67 89" }),
    sub({ key: "amir", who: "amir.flow", offre: "Coaching 1 mois", montant: 179, statut: "active", echeanceDays: 16, depuisDays: 31, phone: "+33 6 87 33 12 09" }),
    sub({ key: "octave", who: "octave.fm", offre: "Coaching 1 mois", montant: 179, statut: "active", echeanceDays: 22, depuisDays: 62, phone: "+33 6 22 09 87 33" }),
    sub({ key: "nour", who: "nour_tape", offre: "Coaching 3 mois", montant: 179, statut: "active", echeanceDays: 8, depuisDays: 120, phone: "+33 6 14 88 21 04" }),
    sub({ key: "valk", who: "valk.ldr", offre: "Coaching 3 mois", montant: 179, statut: "active", echeanceDays: 1, depuisDays: 150, phone: "+33 6 65 41 28 73" }),
    sub({ key: "selma", who: "selma.snd", offre: "Communauté", montant: 79, statut: "canceled", echeanceDays: null, depuisDays: 92, phone: "+33 6 88 22 11 09" }),
    sub({ key: "hanna", who: "h4nna.wav", offre: "Communauté", montant: 79, statut: "active", echeanceDays: 29, depuisDays: 1, phone: null }),
    sub({ key: "remi", who: "remi.ssr", offre: "Coaching 1 mois", montant: 179, statut: "active", echeanceDays: 26, depuisDays: 4, phone: "+33 6 71 23 45 67" }),
  ],
};
