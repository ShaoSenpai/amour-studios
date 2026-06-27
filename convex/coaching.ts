import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdmin } from "./lib/auth";
import { logEvent } from "./lib/events";
import { maybeAutoUnlockLesson } from "./lib/access";
import { Doc, Id } from "./_generated/dataModel";

const DEFAULT_DUR_MS = 45 * 60 * 1000;

// ============================================================================
// Amour Studios — Back-office coach : suivi élèves & sessions de coaching (RDV)
// ----------------------------------------------------------------------------
// getMemberDetail : tout le détail d'un élève (fiche).
// listSessions / create / update / complete / cancel : gestion des RDV.
// setStage : avancer l'élève dans le parcours.
// upcomingSessions / studentsWithoutUpcoming : pour le calendrier coach + relance.
// Toutes les fonctions sont réservées aux admins (coach).
// ============================================================================

const STAGE = v.union(
  v.literal("onboarding"),
  v.literal("positionnement"),
  v.literal("contenu"),
  v.literal("feedback_analyse"),
  v.literal("termine")
);

const SESSION_TYPE = v.union(
  v.literal("onboarding"),
  v.literal("coaching"),
  v.literal("other")
);

const SESSION_STATUS = v.union(
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("canceled"),
  v.literal("no_show")
);

/**
 * Détail complet d'un élève pour la fiche : profil + paiement + onboarding +
 * sessions (passées/à venir) + prochaine session + progression + badges.
 */
export const getMemberDetail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;

    const onboarding = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const notes = await ctx.db
      .query("coachingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    notes.sort((a, b) => b.createdAt - a.createdAt); // plus récent d'abord

    const rawSessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rawSessions.sort((a, b) => b.scheduledAt - a.scheduledAt); // plus récent d'abord

    // appelNo = rang chronologique (ascendant) parmi les RDV de l'élève.
    const appelNoById = new Map<string, number>();
    [...rawSessions]
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .forEach((s, i) => appelNoById.set(s._id as unknown as string, i + 1));

    // Résoudre le curriculum (module/leçon) lié à chaque session.
    const curById = new Map<string, Doc<"curriculum">>();
    for (const s of rawSessions) {
      if (s.curriculumItemId) {
        const k = s.curriculumItemId as unknown as string;
        if (!curById.has(k)) {
          const ci = await ctx.db.get(s.curriculumItemId);
          if (ci) curById.set(k, ci);
        }
      }
    }
    const enrich = (s: Doc<"coachingSessions">) => ({
      ...s,
      appelNo: appelNoById.get(s._id as unknown as string) ?? null,
      curriculum: s.curriculumItemId
        ? curById.get(s.curriculumItemId as unknown as string) ?? null
        : null,
    });
    const sessions = rawSessions.map(enrich);

    const now = Date.now();
    const rawNext =
      rawSessions
        .filter((s) => s.status === "scheduled" && s.scheduledAt >= now)
        .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null;
    const nextSession = rawNext ? enrich(rawNext) : null;

    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const progressRows = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const lessonsCompleted = progressRows.filter(
      (p) => p.lessonCompletedAt != null
    ).length;
    const totalLessons = (
      await ctx.db.query("lessons").collect()
    ).filter((l) => !l.deletedAt).length;

    return {
      user,
      purchase,
      onboarding,
      notes,
      sessions,
      nextSession,
      coachingStage: user.coachingStage ?? null,
      stats: {
        xp: user.xp ?? 0,
        streakDays: user.streakDays ?? 0,
        badges: badges.length,
        lessonsCompleted,
        totalLessons,
      },
    };
  },
});

/** Liste des sessions d'un élève (plus récent d'abord). */
export const listSessions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const sessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return sessions.sort((a, b) => b.scheduledAt - a.scheduledAt);
  },
});

/** Crée une session (RDV) manuelle. */
export const createSession = mutation({
  args: {
    userId: v.id("users"),
    type: v.optional(SESSION_TYPE),
    scheduledAt: v.number(),
    endAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    summary: v.optional(v.string()),
    curriculumItemId: v.optional(v.id("curriculum")),
  },
  handler: async (ctx, { userId, type, scheduledAt, endAt, notes, summary, curriculumItemId }) => {
    const { userId: coachId } = await requireAdmin(ctx);
    const now = Date.now();
    const sessionId = await ctx.db.insert("coachingSessions", {
      userId,
      coachId,
      type: type ?? "coaching",
      source: "manual",
      scheduledAt,
      endAt,
      status: "scheduled",
      notes,
      summary,
      curriculumItemId,
      createdAt: now,
      updatedAt: now,
    });

    // Sync Google Agenda + Meet (fail-silent ; ne crée rien si creds absentes).
    const user = await ctx.db.get(userId);
    let email = user?.email ?? null;
    if (!email && user?.purchaseId) {
      const p = await ctx.db.get(user.purchaseId);
      email = p?.email ?? null;
    }
    const pseudo = user?.discordUsername || user?.name || "Élève";
    const t = type ?? "coaching";
    const title = `${t === "onboarding" ? "Onboarding" : "Coaching"} · ${pseudo}`;
    await ctx.scheduler.runAfter(0, internal.google.syncCreate, {
      sessionId,
      title,
      startMs: scheduledAt,
      endMs: endAt ?? scheduledAt + DEFAULT_DUR_MS,
      attendeeEmails: email ? [email] : [],
      description: notes ?? undefined,
    });

    await logEvent(ctx, {
      userId,
      type: "rdv.created",
      title: "Nouveau RDV planifié",
      actor: "coach",
      meta: { sessionId, scheduledAt },
    });

    return sessionId;
  },
});

/** Interne : enregistre l'eventId Google + le lien Meet sur la session. */
export const setSessionGoogle = internalMutation({
  args: {
    sessionId: v.id("coachingSessions"),
    googleEventId: v.string(),
    meetUrl: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, googleEventId, meetUrl }) => {
    await ctx.db.patch(sessionId, { googleEventId, meetUrl, updatedAt: Date.now() });
  },
});

/** Met à jour une session (résumé, notes, date, type, statut, fin). */
export const updateSession = mutation({
  args: {
    sessionId: v.id("coachingSessions"),
    summary: v.optional(v.string()),
    notes: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    type: v.optional(SESSION_TYPE),
    status: v.optional(SESSION_STATUS),
    curriculumItemId: v.optional(v.id("curriculum")),
  },
  handler: async (ctx, { sessionId, ...patch }) => {
    await requireAdmin(ctx);
    const clean: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch(sessionId, clean);

    // Reprogrammation → log + synchroniser l'événement Google si lié.
    if (patch.scheduledAt !== undefined || patch.endAt !== undefined) {
      const s = await ctx.db.get(sessionId);
      if (s)
        await logEvent(ctx, {
          userId: s.userId,
          type: "rdv.rescheduled",
          title: "RDV reprogrammé",
          actor: "coach",
          meta: { sessionId },
        });
      if (s?.googleEventId) {
        const startMs = patch.scheduledAt ?? s.scheduledAt;
        await ctx.scheduler.runAfter(0, internal.google.syncUpdate, {
          googleEventId: s.googleEventId,
          startMs,
          endMs: patch.endAt ?? s.endAt ?? startMs + DEFAULT_DUR_MS,
        });
      }
    }
  },
});

/** Marque une session comme effectuée (+ résumé/notes optionnels). */
export const completeSession = mutation({
  args: {
    sessionId: v.id("coachingSessions"),
    summary: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, summary, notes }) => {
    await requireAdmin(ctx);
    const patch: Record<string, unknown> = {
      status: "completed",
      updatedAt: Date.now(),
    };
    if (summary !== undefined) patch.summary = summary;
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(sessionId, patch);
    const done = await ctx.db.get(sessionId);
    if (done) {
      // Auto-unlock leçon (helper unique avec guard tier strict — cf.
      // lib/access.ts → maybeAutoUnlockLesson). Idempotent.
      if (done.curriculumItemId) {
        await maybeAutoUnlockLesson(ctx, done.userId, done.curriculumItemId);
      }
      await logEvent(ctx, {
        userId: done.userId,
        type: "rdv.completed",
        title: "RDV marqué fait",
        actor: "coach",
        meta: { sessionId, curriculumItemId: done.curriculumItemId ?? null },
      });
    }
  },
});

/** Annule une session (no_show ou canceled). */
export const cancelSession = mutation({
  args: {
    sessionId: v.id("coachingSessions"),
    noShow: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionId, noShow }) => {
    await requireAdmin(ctx);
    // On capture le googleEventId AVANT le patch (le patch va le clear).
    const before = await ctx.db.get(sessionId);
    const googleEventId = before?.googleEventId;
    // Marque manual + clear googleEventId pour que la session soit hors-scope
    // du heritable Calendly (upsertCalendlySession ne tagge alors plus son
    // curriculumItemId comme un legs pour les futurs RDV Calendly du user).
    await ctx.db.patch(sessionId, {
      status: noShow ? "no_show" : "canceled",
      source: "manual",
      googleEventId: undefined,
      updatedAt: Date.now(),
    });
    if (before)
      await logEvent(ctx, {
        userId: before.userId,
        type: noShow ? "rdv.no_show" : "rdv.canceled",
        title: noShow ? "RDV no-show" : "RDV annulé",
        actor: "coach",
        meta: { sessionId },
      });
    // Annuler aussi l'événement Google (notifie les invités).
    if (googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.syncDelete, {
        googleEventId,
      });
    }
  },
});

/** Supprime une session (corrige une erreur de saisie). */
export const deleteSession = mutation({
  args: { sessionId: v.id("coachingSessions") },
  handler: async (ctx, { sessionId }) => {
    await requireAdmin(ctx);
    const s = await ctx.db.get(sessionId);
    await ctx.db.delete(sessionId);
    if (s?.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.google.syncDelete, {
        googleEventId: s.googleEventId,
      });
    }
  },
});

/**
 * CRON : passe les RDV planifiés dont l'heure de fin (+ 30 min de grâce) est
 * dépassée au statut « completed » (modifiable manuellement ensuite).
 */
export const autoCompleteSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const GRACE = 30 * 60 * 1000;
    // Index composé : on ne lit QUE les RDV encore "scheduled" passés (ensemble
    // naturellement petit = pipeline de RDV non confirmés), au lieu de scanner
    // tout l'historique des sessions via by_scheduledAt.
    const scheduled = await ctx.db
      .query("coachingSessions")
      .withIndex("by_status_scheduledAt", (q) =>
        q.eq("status", "scheduled").lt("scheduledAt", now)
      )
      .collect();
    let completed = 0;
    for (const s of scheduled) {
      const endPlusGrace = (s.endAt ?? s.scheduledAt + 45 * 60 * 1000) + GRACE;
      if (endPlusGrace > now) continue;
      await ctx.db.patch(s._id, { status: "completed", updatedAt: now });
      // PAS d'auto-unlock ici : le cron ne PROUVE pas que le call a eu lieu
      // (l'élève a pu no-show sans que Walid l'ait marqué). Seuls les chemins
      // avec preuve débloquent la leçon — Fireflies (transcript) et la
      // complétion manuelle par Walid (completeSession).
      await logEvent(ctx, {
        userId: s.userId,
        type: "rdv.completed",
        title: "RDV terminé (auto)",
        actor: "system",
        meta: { sessionId: s._id },
      });
      completed++;
    }
    return { completed };
  },
});

/** Change l'étape du parcours coaching d'un élève. */
export const setStage = mutation({
  args: { userId: v.id("users"), stage: STAGE },
  handler: async (ctx, { userId, stage }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { coachingStage: stage });
    await logEvent(ctx, {
      userId,
      type: "stage.changed",
      title: `Étape du parcours : ${stage}`,
      actor: "coach",
      meta: { stage },
    });
  },
});

// ── Notes CRM libres par élève ──────────────────────────────────────────────

/** Ajoute une note libre sur un élève. */
export const addNote = mutation({
  args: { userId: v.id("users"), content: v.string() },
  handler: async (ctx, { userId, content }) => {
    const { userId: coachId } = await requireAdmin(ctx);
    const trimmed = content.trim();
    if (!trimmed) throw new Error("Note vide");
    const now = Date.now();
    const id = await ctx.db.insert("coachingNotes", {
      userId,
      coachId,
      content: trimmed,
      createdAt: now,
      updatedAt: now,
    });
    await logEvent(ctx, {
      userId,
      type: "note.added",
      title: "Note ajoutée",
      actor: "coach",
    });
    return id;
  },
});

/** Modifie une note. */
export const updateNote = mutation({
  args: { noteId: v.id("coachingNotes"), content: v.string() },
  handler: async (ctx, { noteId, content }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(noteId, { content: content.trim(), updatedAt: Date.now() });
  },
});

/** Supprime une note. */
export const deleteNote = mutation({
  args: { noteId: v.id("coachingNotes") },
  handler: async (ctx, { noteId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(noteId);
  },
});

/** Liste les notes d'un élève (plus récent d'abord). */
export const listNotes = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const notes = await ctx.db
      .query("coachingNotes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return notes.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Note d'onboarding éditable. Upsert sur la table `onboardings` (nouvelle).
 *  Si l'user n'a pas encore de row d'onboarding (cas legacy), on en crée une
 *  minimale pour porter la note. */
export const updateOnboardingNote = mutation({
  args: { userId: v.id("users"), notes: v.string() },
  handler: async (ctx, { userId, notes }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { notes, updatedAt: Date.now() });
      return;
    }
    const now = Date.now();
    await ctx.db.insert("onboardings", {
      userId,
      tier: "communaute",
      step: "community_ready",
      token: crypto.randomUUID(),
      notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Liste de tous les élèves (non supprimés) avec palier, statut paiement,
 * téléphone, étape, dernière activité ET prochain RDV — pour la page Élèves
 * (évite le N+1 de getMemberDetail par ligne).
 */
export const studentsList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const users = (await ctx.db.query("users").collect()).filter(
      (u) => !u.deletedAt && u.role !== "admin"
    );

    // Prochain RDV par élève (sessions futures planifiées).
    const future = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) => q.gte("scheduledAt", now))
      .collect();
    const nextByUser = new Map<string, number>();
    for (const s of future) {
      if (s.status !== "scheduled") continue;
      const k = s.userId as unknown as string;
      const cur = nextByUser.get(k);
      if (cur === undefined || s.scheduledAt < cur) nextByUser.set(k, s.scheduledAt);
    }

    return await Promise.all(
      users.map(async (u) => {
        const purchase = u.purchaseId ? await ctx.db.get(u.purchaseId) : null;
        return {
          _id: u._id,
          name: u.name ?? null,
          discordUsername: u.discordUsername ?? null,
          image: u.image ?? null,
          // Date d'inscription : `createdAt` custom souvent absent (comptes Discord
          // OAuth) → fallback sur `_creationTime` (toujours posé) pour que le tri
          // « dernier inscrit en haut » soit fiable.
          createdAt: u.createdAt ?? u._creationTime,
          lastActiveAt: u.lastActiveAt ?? null,
          coachingStage: u.coachingStage ?? null,
          tier: purchase?.tier ?? null,
          status: purchase?.status ?? null,
          phone: purchase?.phone ?? null,
          nextSessionAt: nextByUser.get(u._id as unknown as string) ?? null,
        };
      })
    );
  },
});

/**
 * Tous les RDV à venir (ou dans une fenêtre), enrichis du nom/pseudo élève.
 * Pour le calendrier coach.
 */
export const upcomingSessions = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { from, to }) => {
    await requireAdmin(ctx);
    const start = from ?? Date.now();
    const end = to ?? start + 60 * 24 * 60 * 60 * 1000; // 60 jours par défaut

    const sessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) =>
        q.gte("scheduledAt", start).lte("scheduledAt", end)
      )
      .collect();

    const scheduled = sessions
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => a.scheduledAt - b.scheduledAt);

    return await Promise.all(
      scheduled.map(async (s) => {
        const u = await ctx.db.get(s.userId);
        return {
          ...s,
          student: u
            ? {
                _id: u._id,
                name: u.name ?? null,
                discordUsername: u.discordUsername ?? null,
                image: u.image ?? null,
              }
            : null,
        };
      })
    );
  },
});

/**
 * Élèves coaching actifs SANS RDV à venir → à relancer.
 */
export const studentsWithoutUpcoming = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();

    // userIds ayant au moins un RDV à venir
    const futureSessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) => q.gte("scheduledAt", now))
      .collect();
    const withUpcoming = new Set<string>(
      futureSessions
        .filter((s) => s.status === "scheduled")
        .map((s) => s.userId as unknown as string)
    );

    const users = await ctx.db.query("users").collect();
    const result: Array<{
      _id: Id<"users">;
      name: string | null;
      discordUsername: string | null;
      image: string | null;
      coachingStage: string | null;
    }> = [];

    for (const u of users) {
      if (u.deletedAt) continue;
      if (!u.purchaseId) continue;
      const purchase = await ctx.db.get(u.purchaseId);
      const isActiveCoaching =
        purchase?.tier === "coaching" &&
        (purchase?.status === "active" || purchase?.status === "paid");
      if (!isActiveCoaching) continue;
      if (withUpcoming.has(u._id as unknown as string)) continue;
      result.push({
        _id: u._id,
        name: u.name ?? null,
        discordUsername: u.discordUsername ?? null,
        image: u.image ?? null,
        coachingStage: u.coachingStage ?? null,
      });
    }
    return result;
  },
});

/**
 * Tableau de bord "Aujourd'hui" : agrège tout ce dont le coach a besoin à
 * l'ouverture (KPI, RDV du jour/semaine, relances, alertes paiement, onboarding,
 * activité, MRR + sparkline). Une seule query pour l'écran d'accueil.
 */
export const dashboardToday = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStart = startOfToday.getTime();
    const todayEnd = todayStart + DAY;
    const monthAgo = now - 30 * DAY;

    const users = await ctx.db.query("users").collect();
    const liveUsers = users.filter((u) => !u.deletedAt);

    // Purchases actifs (par user), avec tier.
    const purchaseByUser = new Map<string, Doc<"purchases">>();
    for (const u of liveUsers) {
      if (!u.purchaseId) continue;
      const p = await ctx.db.get(u.purchaseId);
      if (p && (p.status === "active" || p.status === "paid")) {
        purchaseByUser.set(u._id as unknown as string, p);
      }
    }
    const userById = new Map<string, Doc<"users">>(
      liveUsers.map((u) => [u._id as unknown as string, u])
    );
    const nameOf = (u: Doc<"users"> | null | undefined) =>
      u?.discordUsername || u?.name || "—";

    // KPI
    let coachingActifs = 0;
    let communaute = 0;
    let mrr = 0;
    let coachingNew30 = 0;
    let mrrNew30 = 0;
    for (const [, p] of purchaseByUser) {
      const price = p.tier === "coaching" ? 179 : 79;
      // Les accès OFFERTS (gift) ne sont pas du revenu → exclus du MRR (aligné
      // sur la vue Paiements). On les garde dans le compte des membres actifs.
      const isGift = p.source === "gift";
      if (!isGift) mrr += price;
      if (p.tier === "coaching") coachingActifs += 1;
      communaute += 1; // coaching inclut la communauté
      if ((p.paidAt ?? p.createdAt ?? 0) >= monthAgo) {
        if (p.tier === "coaching") coachingNew30 += 1;
        if (!isGift) mrrNew30 += price;
      }
    }
    const communauteNew30 = liveUsers.filter(
      (u) => (u.createdAt ?? 0) >= monthAgo
    ).length;

    // Alertes paiement : past_due / canceled récents
    const allPurchases = await ctx.db.query("purchases").collect();
    const alertesRows = allPurchases
      .filter(
        (p) =>
          p.status === "past_due" ||
          (p.status === "canceled" && (p.revokedAt ?? p.createdAt ?? 0) >= monthAgo)
      )
      .slice(0, 6)
      .map((p) => ({
        purchaseId: p._id,
        userId: p.userId ?? null,
        who: p.email?.split("@")[0] ?? "—",
        type: p.status === "past_due" ? "Échec paiement" : "Annulation",
        montant: `${p.tier === "coaching" ? 179 : 79} €`,
      }));
    const impayes = allPurchases.filter((p) => p.status === "past_due").length;

    // Sessions à venir (jour + semaine).
    const upcoming = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) => q.gte("scheduledAt", todayStart))
      .collect();
    const scheduled = upcoming.filter((s) => s.status === "scheduled");

    const fmtH = (ts: number) =>
      new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const rdvJour = scheduled
      .filter((s) => s.scheduledAt >= todayStart && s.scheduledAt < todayEnd)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .map((s) => {
        const u = userById.get(s.userId as unknown as string);
        const dur = s.endAt ? `${Math.round((s.endAt - s.scheduledAt) / 60000)} min` : "—";
        return {
          userId: s.userId,
          h: fmtH(s.scheduledAt),
          who: nameOf(u),
          tag: s.type === "onboarding" ? "Onboarding" : s.summary || "Coaching",
          dur,
          flag: s.type === "onboarding" ? "1er RDV" : undefined,
        };
      });

    // Semaine à venir : 5 prochains jours.
    const rdvSemaine: Array<{ jour: string; n: number; date: number }> = [];
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
      rdvSemaine.push({ jour: label, n, date: dStart });
    }
    const semaineTotal = scheduled.filter(
      (s) => s.scheduledAt < todayStart + 7 * DAY
    ).length;

    // Relances : coaching actif sans RDV à venir.
    const withUpcoming = new Set(
      scheduled.map((s) => s.userId as unknown as string)
    );
    const relances: Array<{
      userId?: Id<"users">;
      discordId?: string | null;
      who: string;
      etape: string;
      last: string;
    }> = [];
    const stageLabel: Record<string, string> = {
      onboarding: "Onboarding",
      positionnement: "Positionnement",
      contenu: "Contenu",
      feedback_analyse: "Feedback & Analyse",
      termine: "Terminé",
    };
    for (const [uid, p] of purchaseByUser) {
      if (p.tier !== "coaching") continue;
      if (withUpcoming.has(uid)) continue;
      const u = userById.get(uid);
      const last = u?.lastActiveAt
        ? `vu il y a ${Math.max(1, Math.round((now - u.lastActiveAt) / DAY))} j`
        : "jamais vu";
      relances.push({
        userId: u?._id,
        discordId: u?.discordId ?? null,
        who: nameOf(u),
        etape: stageLabel[u?.coachingStage as string] ?? "—",
        last,
      });
      if (relances.length >= 6) break;
    }

    // Onboarding en attente : étape onboarding (ou non défini) pour coaching actif.
    const onboarding: Array<{
      userId?: Id<"users">;
      who: string;
      etape: string;
      depuis: string;
    }> = [];
    for (const [uid, p] of purchaseByUser) {
      if (p.tier !== "coaching") continue;
      const u = userById.get(uid);
      if (u?.coachingStage && u.coachingStage !== "onboarding") continue;
      if (u?.onboardingCompletedAt) continue;
      const depuis = `${Math.max(1, Math.round((now - (p.paidAt ?? p.createdAt ?? now)) / DAY))} j`;
      onboarding.push({
        userId: u?._id,
        who: nameOf(u),
        etape: u?.coachingStage ? "À programmer" : "Formulaire envoyé",
        depuis,
      });
      if (onboarding.length >= 5) break;
    }

    // Activité récente (paiements + nouveaux membres + sessions complétées).
    type Act = {
      at: number;
      txt: string;
      userId?: Id<"users">;
      kind: "payment" | "user" | "session";
    };
    const acts: Act[] = [];
    for (const p of allPurchases) {
      if (p.paidAt) {
        const u = p.userId ? userById.get(p.userId as unknown as string) : null;
        acts.push({
          at: p.paidAt,
          userId: u?._id,
          kind: "payment",
          txt: `Paiement reçu — ${nameOf(u) !== "—" ? nameOf(u) : p.email?.split("@")[0]} · ${p.tier === "coaching" ? "179 €" : "79 €"}`,
        });
      }
    }
    for (const u of liveUsers) {
      if (u.createdAt)
        acts.push({ at: u.createdAt, userId: u._id, kind: "user", txt: `Nouveau membre — ${nameOf(u)}` });
    }
    const completedSessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    for (const s of completedSessions) {
      const u = userById.get(s.userId as unknown as string);
      acts.push({ at: s.updatedAt, userId: s.userId, kind: "session", txt: `RDV terminé — ${nameOf(u)} · notes ajoutées` });
    }
    const rel = (at: number) => {
      const diff = now - at;
      if (diff < 60 * 60 * 1000) return `il y a ${Math.max(1, Math.round(diff / 60000))} min`;
      if (diff < DAY) return `il y a ${Math.round(diff / (60 * 60 * 1000))} h`;
      if (diff < 2 * DAY) return "hier";
      return `il y a ${Math.round(diff / DAY)} j`;
    };
    const activite = acts
      .sort((a, b) => b.at - a.at)
      .slice(0, 6)
      .map((a) => ({ t: rel(a.at), txt: a.txt, userId: a.userId ?? null, kind: a.kind }));

    // Sparkline MRR : nb d'abonnements actifs cumulés sur 12 mois (approx).
    const mrrSpark: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthEnd = now - i * 30 * DAY;
      const count = allPurchases.filter(
        (p) =>
          (p.status === "active" || p.status === "paid") &&
          (p.paidAt ?? p.createdAt ?? 0) <= monthEnd
      ).length;
      mrrSpark.push(count);
    }

    const fmtEur = (n: number) =>
      `${n.toLocaleString("fr-FR").replace(/ /g, " ")} €`;

    return {
      kpis: {
        coachingActifs: {
          value: coachingActifs,
          delta: `+${coachingNew30}`,
          note: "ce mois",
        },
        communaute: {
          value: communaute,
          delta: `+${communauteNew30}`,
          note: "nouveaux 30j",
        },
        impayes: { value: impayes, delta: `${impayes}`, note: "à traiter" },
        mrr: { value: fmtEur(mrr), delta: `+${fmtEur(mrrNew30)}`, note: "vs mois préc." },
      },
      rdvJour,
      rdvSemaine,
      semaineTotal,
      relances,
      alertes: alertesRows,
      onboarding,
      activite,
      mrrSpark,
    };
  },
});

/**
 * Toutes les sessions d'une fenêtre (tous statuts), enrichies de l'élève.
 * Pour la vue calendrier (semaine) qui affiche aussi fait/no-show/annulé.
 */
export const sessionsInRange = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    await requireAdmin(ctx);
    const sessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) =>
        q.gte("scheduledAt", from).lte("scheduledAt", to)
      )
      .collect();
    return await Promise.all(
      sessions
        .sort((a, b) => a.scheduledAt - b.scheduledAt)
        .map(async (s) => {
          const u = await ctx.db.get(s.userId);
          const curriculum = s.curriculumItemId
            ? await ctx.db.get(s.curriculumItemId)
            : null;
          return {
            ...s,
            curriculum,
            student: u
              ? {
                  _id: u._id,
                  name: u.name ?? null,
                  discordUsername: u.discordUsername ?? null,
                  image: u.image ?? null,
                }
              : null,
          };
        })
    );
  },
});

/**
 * Vue d'ensemble paiements : KPI (MRR, actifs, incidents, churn), série MRR 12 mois,
 * répartition par offre, et liste des abonnements.
 */
export const paymentsOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * DAY;

    const purchases = await ctx.db.query("purchases").collect();
    const priceOf = (p: Doc<"purchases">) => (p.tier === "coaching" ? 179 : 79);
    const isActive = (p: Doc<"purchases">) =>
      p.status === "active" || p.status === "paid";

    let mrr = 0;
    let actifs = 0;
    let coaching3m = 0;
    let coaching1m = 0;
    let communaute = 0;
    for (const p of purchases) {
      if (!isActive(p)) continue;
      actifs += 1;
      // Accès offerts (source "gift") : comptés comme membres actifs mais PAS
      // dans le MRR (ce n'est pas du revenu).
      if (p.source !== "gift") mrr += priceOf(p);
      if (p.tier === "coaching") {
        if (p.duree === "3mois") coaching3m += 1;
        else coaching1m += 1;
      } else communaute += 1;
    }
    const incidents = purchases.filter((p) => p.status === "past_due").length;
    const churn30 = purchases.filter(
      (p) => p.status === "canceled" && (p.revokedAt ?? p.createdAt ?? 0) >= monthAgo
    ).length;

    // Série MRR sur 12 mois (somme des prix des abos actifs créés avant chaque mois).
    const mrrSeries: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthEnd = now - i * 30 * DAY;
      let sum = 0;
      for (const p of purchases) {
        if (!isActive(p) || p.source === "gift") continue;
        if ((p.paidAt ?? p.createdAt ?? 0) <= monthEnd) sum += priceOf(p);
      }
      mrrSeries.push(sum);
    }

    // Liste des abonnements (actifs + incidents + annulés récents).
    const userByPurchase = new Map<string, Doc<"users">>();
    const allUsers = await ctx.db.query("users").collect();
    for (const u of allUsers) {
      if (u.purchaseId) userByPurchase.set(u.purchaseId as unknown as string, u);
    }
    const list = purchases
      .filter(
        (p) =>
          isActive(p) ||
          p.status === "past_due" ||
          (p.status === "canceled" && (p.revokedAt ?? p.createdAt ?? 0) >= monthAgo)
      )
      .sort((a, b) => (b.paidAt ?? b.createdAt) - (a.paidAt ?? a.createdAt))
      .map((p) => {
        const u = userByPurchase.get(p._id as unknown as string);
        return {
          id: p._id,
          // _id de l'élève lié (pour ouvrir sa fiche depuis Paiements). null si le
          // paiement n'est rattaché à aucun compte (achat non lié).
          eleveId: u?._id ?? null,
          who: u?.discordUsername || u?.name || p.email?.split("@")[0] || "—",
          offre:
            p.tier === "coaching"
              ? `Coaching${p.duree === "3mois" ? " 3 mois" : p.duree === "1mois" ? " 1 mois" : ""}`
              : "Communauté",
          montant: p.source === "gift" ? "Offert" : `${priceOf(p)} €`,
          offert: p.source === "gift",
          statut: p.status,
          echeance: p.currentPeriodEnd ?? null,
          depuis: p.paidAt ?? p.createdAt,
          phone: p.phone ?? null,
        };
      });

    const fmtEur = (n: number) => `${n.toLocaleString("fr-FR")} €`;
    return {
      kpis: {
        mrr: fmtEur(mrr),
        actifs,
        incidents,
        churn30,
      },
      mrrSeries,
      repartition: { coaching3m, coaching1m, communaute },
      subscriptions: list,
    };
  },
});

// ── Calendly (webhook) : fonctions internes sans auth admin ─────────────────

/**
 * Interne : upsert d'une session depuis un event Calendly `invitee.created`.
 * Rattache l'élève par email. Si aucun user ne correspond, on ignore (l'élève
 * doit avoir un compte) — log côté webhook. Idempotent par calendlyEventUri.
 */
export const upsertCalendlySession = internalMutation({
  args: {
    email: v.string(),
    calendlyEventUri: v.string(),
    calendlyInviteeUri: v.optional(v.string()),
    scheduledAt: v.number(),
    endAt: v.optional(v.number()),
    eventName: v.optional(v.string()),
    // Fallback : token onboarding passé via utm_source côté widget Calendly.
    // Si l'email Calendly ne match aucun user, on retrouve le user via ce token.
    fallbackOnboardingToken: v.optional(v.string()),
    // Lien de visio fourni par Calendly (location.join_url quand l'event type est
    // configuré en Google Meet). C'est CE lien qui alimente le bouton « Rejoindre
    // le Meet » de la fiche élève (sans ça il reste grisé).
    meetUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    // Fallback par token onboarding si pas matché par email.
    if (!user && args.fallbackOnboardingToken) {
      const ob = await ctx.db
        .query("onboardings")
        .withIndex("by_token", (q) => q.eq("token", args.fallbackOnboardingToken!))
        .first();
      if (ob) {
        user = await ctx.db.get(ob.userId);
        console.warn(
          `Calendly: email ${args.email} pas matché, fallback token onboarding OK pour user ${ob.userId}`
        );
      }
    }
    if (!user) return { matched: false as const };

    const now = Date.now();
    const isOnboarding = !user.coachingStage || user.coachingStage === "onboarding";

    // Convention produit : Calendly = TOUJOURS le 1er RDV = M1 Leçon 1.
    // Les RDV suivants sont planifiés manuellement entre Walid et l'élève
    // (jusqu'à ce qu'on ouvre un sélecteur de créneaux dédié plus tard).
    // → On auto-attache le curriculumItemId au premier item du curriculum
    //   (trié par `order` croissant). Si l'admin veut dévier, le dialog RDV
    //   permet de réassigner à la main.
    const firstLesson = await ctx.db
      .query("curriculum")
      .withIndex("by_order")
      .order("asc")
      .first();
    let autoCurriculumItemId = firstLesson?._id;

    // Reschedule Calendly : invitee.canceled (ancienne URI) + invitee.created
    // (nouvelle URI) → si on trouve une session de ce user récemment annulée
    // (< 24h) qui avait un curriculumItemId tagué (potentiellement édité à la
    // main par Walid), on l'hérite plutôt que de retomber sur M1 L1.
    const RESCHEDULE_WINDOW = 24 * 60 * 60 * 1000;
    const recentCanceled = await ctx.db
      .query("coachingSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const heritable = recentCanceled
      .filter(
        (s) =>
          s.status === "canceled" &&
          s.source === "calendly" &&
          s.curriculumItemId &&
          now - (s.updatedAt ?? 0) < RESCHEDULE_WINDOW
      )
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (heritable?.curriculumItemId) {
      autoCurriculumItemId = heritable.curriculumItemId;
    }

    const existing = await ctx.db
      .query("coachingSessions")
      .withIndex("by_calendly_event", (q) =>
        q.eq("calendlyEventUri", args.calendlyEventUri)
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        userId: user._id,
        scheduledAt: args.scheduledAt,
        endAt: args.endAt,
        updatedAt: now,
      };
      // Guard de transition : on ne fait JAMAIS revenir une session terminale
      // (completed / no_show) à "scheduled". Un replay Calendly (invitee.created
      // re-livré) sur un RDV déjà passé/fait ne doit pas écraser son état.
      // On ne (ré)active que si la session est encore scheduled ou canceled
      // (cas légitime d'un reschedule qui réactive un créneau annulé).
      if (existing.status === "scheduled" || existing.status === "canceled") {
        patch.status = "scheduled";
      }
      // Remplit le lien Meet s'il est désormais connu et pas encore stocké
      // (webhook initial sans join_url → backfill via resyncCalendly).
      if (args.meetUrl && !existing.meetUrl) {
        patch.meetUrl = args.meetUrl;
      }
      // On NE re-tagge PLUS le curriculumItemId sur une session déjà
      // existante : si Walid l'a vidé volontairement (ou si la valeur
      // courante est legit), un webhook Calendly de mise à jour ne doit
      // pas la re-set en arrière-plan. Le tag M1L1 reste donc uniquement
      // sur la 1re création (branche insert ci-dessous).
      await ctx.db.patch(existing._id, patch);
      return {
        matched: true as const,
        sessionId: existing._id,
        userId: user._id,
        isOnboarding,
      };
    }

    const sessionId = await ctx.db.insert("coachingSessions", {
      userId: user._id,
      type: isOnboarding ? "onboarding" : "coaching",
      source: "calendly",
      calendlyEventUri: args.calendlyEventUri,
      calendlyInviteeUri: args.calendlyInviteeUri,
      scheduledAt: args.scheduledAt,
      endAt: args.endAt,
      status: "scheduled",
      summary: args.eventName,
      curriculumItemId: autoCurriculumItemId,
      meetUrl: args.meetUrl,
      createdAt: now,
      updatedAt: now,
    });
    return {
      matched: true as const,
      sessionId,
      userId: user._id,
      isOnboarding,
    };
  },
});

/**
 * Interne : marque comme annulée la session liée à un event Calendly
 * (`invitee.canceled`).
 */
export const cancelCalendlySession = internalMutation({
  args: { calendlyEventUri: v.string() },
  handler: async (ctx, { calendlyEventUri }) => {
    const sessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_calendly_event", (q) =>
        q.eq("calendlyEventUri", calendlyEventUri)
      )
      .collect();
    const now = Date.now();
    for (const s of sessions) {
      // Guard de transition : ne pas annuler une session déjà terminale
      // (completed / no_show). Un invitee.canceled tardif ne doit pas effacer
      // un RDV qui a réellement eu lieu.
      if (s.status === "completed" || s.status === "no_show") continue;
      // Capture googleEventId AVANT le patch (le patch va le clear).
      const googleEventId = s.googleEventId;
      // On garde source="calendly" : ce cancel vient bien d'un webhook
      // Calendly (invitee.canceled), donc la session reste candidate au
      // heritable curriculumItemId si l'élève reschedule dans la fenêtre.
      // Mais on clear googleEventId pour éviter qu'un patch ultérieur ne
      // tente de re-syncDelete sur un event déjà supprimé.
      await ctx.db.patch(s._id, {
        status: "canceled",
        googleEventId: undefined,
        updatedAt: now,
      });
      // Supprime l'événement Google Meet de l'ancien créneau, sinon il reste
      // bloqué sur le calendrier de Walid alors que l'élève a reschedule.
      if (googleEventId) {
        await ctx.scheduler.runAfter(0, internal.google.syncDelete, {
          googleEventId,
        });
      }
    }
    return { canceled: sessions.length };
  },
});

/**
 * Interne (action) : RATTRAPAGE des RDV Calendly manqués (webhook jamais reçu /
 * rejeté pour signature). Rapatrie les `scheduled_events` actifs des N derniers
 * jours via l'API Calendly et les (ré)upsert via `upsertCalendlySession`
 * (idempotent par calendlyEventUri) en réutilisant le matching email + token
 * onboarding (utm_source). No-op propre si `CALENDLY_API_TOKEN` absent.
 */
export const resyncCalendly = internalAction({
  args: { sinceDays: v.optional(v.number()) },
  handler: async (ctx, { sinceDays }) => {
    const token = process.env.CALENDLY_API_TOKEN;
    if (!token) {
      console.warn("resyncCalendly: CALENDLY_API_TOKEN absent — no-op");
      return { ok: false as const, reason: "no_token" as const };
    }
    const auth = { Authorization: `Bearer ${token}` };
    const apiBase = "https://api.calendly.com";

    // 1) Organisation du compte connecté.
    const meRes = await fetch(`${apiBase}/users/me`, { headers: auth });
    if (!meRes.ok) {
      console.warn(`resyncCalendly: /users/me ${meRes.status}`);
      return { ok: false as const, reason: "auth_failed" as const };
    }
    const me = (await meRes.json()) as {
      resource?: { current_organization?: string };
    };
    const org = me.resource?.current_organization;
    if (!org) return { ok: false as const, reason: "no_org" as const };

    // 2) Events actifs depuis N jours (1 page de 100 suffit largement).
    const days = sinceDays ?? 30;
    const minStart = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000
    ).toISOString();
    const evUrl = new URL(`${apiBase}/scheduled_events`);
    evUrl.searchParams.set("organization", org);
    evUrl.searchParams.set("min_start_time", minStart);
    evUrl.searchParams.set("status", "active");
    evUrl.searchParams.set("count", "100");
    const evRes = await fetch(evUrl.toString(), { headers: auth });
    if (!evRes.ok) {
      console.warn(`resyncCalendly: scheduled_events ${evRes.status}`);
      return { ok: false as const, reason: "events_failed" as const };
    }
    const evData = (await evRes.json()) as {
      collection?: Array<{
        uri?: string;
        name?: string;
        start_time?: string;
        end_time?: string;
        location?: { type?: string; join_url?: string | null };
      }>;
    };
    const events = evData.collection ?? [];

    let scanned = 0;
    let matched = 0;
    let unmatched = 0;
    for (const ev of events) {
      if (!ev.uri || !ev.start_time) continue;
      scanned++;
      // Invité (email + tracking utm_source) du RDV.
      const invRes = await fetch(`${ev.uri}/invitees?count=10`, { headers: auth });
      if (!invRes.ok) {
        unmatched++;
        continue;
      }
      const invData = (await invRes.json()) as {
        collection?: Array<{
          email?: string;
          status?: string;
          tracking?: { utm_source?: string };
        }>;
      };
      const list = invData.collection ?? [];
      const inv = list.find((i) => i.status === "active") ?? list[0];
      const email = (inv?.email ?? "").trim().toLowerCase();
      if (!email) {
        unmatched++;
        continue;
      }
      const utm = (inv?.tracking?.utm_source ?? "").trim();
      const fallbackToken = utm.startsWith("onboarding-")
        ? utm.slice("onboarding-".length)
        : undefined;

      const res = await ctx.runMutation(internal.coaching.upsertCalendlySession, {
        email,
        calendlyEventUri: ev.uri,
        scheduledAt: Date.parse(ev.start_time),
        endAt: ev.end_time ? Date.parse(ev.end_time) : undefined,
        eventName: ev.name,
        fallbackOnboardingToken: fallbackToken,
        meetUrl: ev.location?.join_url ?? undefined,
      });
      if (res.matched) {
        matched++;
        if (res.isOnboarding) {
          await ctx.runMutation(internal.onboardings.markRdvBookedByUser, {
            userId: res.userId,
            sessionId: res.sessionId,
          });
        }
      } else {
        unmatched++;
      }
    }
    console.log(
      `🔁 resyncCalendly: ${scanned} events scannés, ${matched} rattachés, ${unmatched} non rattachés`
    );
    return { ok: true as const, scanned, matched, unmatched };
  },
});

/**
 * Admin : lance le rattrapage Calendly à la demande (bouton studio). Les
 * sessions manquantes réapparaissent sur le calendrier dès le run (réactif).
 */
export const resyncCalendlyNow = mutation({
  args: { sinceDays: v.optional(v.number()) },
  handler: async (ctx, { sinceDays }) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.coaching.resyncCalendly, {
      sinceDays,
    });
    return { ok: true as const, scheduled: true as const };
  },
});
