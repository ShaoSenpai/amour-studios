import { v } from "convex/values";
import {
  internalAction,
  internalQuery,
  internalMutation,
  query,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/events";
import { maybeAutoUnlockLesson } from "./lib/access";
import { requireAdmin } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// Fireflies — résumé automatique des calls (Brique D).
// Par POLLING (comme le worker WhatsApp) : un cron interroge l'API Fireflies,
// rattache chaque réunion à la session de coaching correspondante (heure +
// participant), récupère le résumé et le stocke sur la session.
// Fail-silent si FIREFLIES_API_KEY absente. Env : FIREFLIES_API_KEY.
// ============================================================================

const FF_URL = "https://api.fireflies.ai/graphql";
const WINDOW = 3 * 60 * 60 * 1000; // ±3h pour matcher une réunion à un RDV

async function ffGraphQL(
  query: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(FF_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown };
  if (json.errors) throw new Error(`Fireflies GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.data ?? {};
}

type FFMeeting = {
  id: string;
  title?: string;
  date?: number;
  participants?: string[];
  transcript_url?: string;
};

/** CRON : récupère les transcripts Fireflies récents et les rattache aux RDV. */
export const sync = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!process.env.FIREFLIES_API_KEY) {
      console.warn("FIREFLIES_API_KEY absente — sync Fireflies ignorée.");
      return;
    }
    try {
      const data = await ffGraphQL(
        `query($limit:Int){ transcripts(limit:$limit){ id title date participants transcript_url } }`,
        { limit: 15 }
      );
      const meetings = (data.transcripts as FFMeeting[] | undefined) ?? [];
      const now = Date.now();
      for (const m of meetings) {
        if (!m.id || !m.date || now - m.date > 7 * 86400000) continue; // < 7 jours
        const match = await ctx.runQuery(internal.fireflies.findSessionForMeeting, {
          dateMs: m.date,
          participants: m.participants ?? [],
        });
        // Ni match ni candidats → réunion hors coaching, on ignore.
        if (!match.sessionId && !match.hadCandidates) continue;

        const det = await ffGraphQL(
          `query($id:String!){ transcript(id:$id){ id transcript_url summary{ overview action_items } } }`,
          { id: m.id }
        );
        const t = (det.transcript ?? {}) as {
          transcript_url?: string;
          summary?: { overview?: string; action_items?: string };
        };
        const overview = t.summary?.overview ?? "";
        const actions = t.summary?.action_items ?? "";
        const aiSummary =
          (overview || "Résumé indisponible") + (actions ? `\n\nActions :\n${actions}` : "");
        const transcriptUrl = t.transcript_url ?? m.transcript_url;

        if (match.sessionId) {
          await ctx.runMutation(internal.fireflies.attach, {
            sessionId: match.sessionId,
            firefliesId: m.id,
            transcriptUrl,
            aiSummary,
          });
        } else {
          // Orphelin : RDV proches mais aucun match email (élève sur un autre
          // compte Google). On stocke pour rattachement manuel + alerte Walid,
          // au lieu d'un console.warn perdu dans les logs.
          await ctx.runMutation(internal.fireflies.recordOrphan, {
            firefliesId: m.id,
            title: m.title,
            meetingDate: m.date,
            participants: m.participants ?? [],
            transcriptUrl,
            aiSummary,
          });
        }
      }
      await ctx.runMutation(internal.health.recordSuccess, { service: "fireflies" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "sync failed";
      // Rate-limit Fireflies (429 / too_many_requests) : ce N'EST PAS une panne
      // d'intégration (clé valide, juste throttlé). On NE le compte PAS comme un
      // échec santé (sinon alerte « N échecs consécutifs » trompeuse). On
      // réessaie au prochain cron / après le reset quotidien Fireflies.
      if (/too[\s_]?many[\s_]?requests|rate[\s_]?limit|\b429\b/i.test(msg)) {
        console.warn("⏳ Fireflies rate-limited — skip ce run (pas une panne):", msg.slice(0, 120));
        return;
      }
      console.warn("⚠️ Fireflies sync échec:", err);
      await ctx
        .runMutation(internal.health.recordFailure, {
          service: "fireflies",
          reason: msg,
        })
        .catch(() => {});
    }
  },
});

/** Trouve le RDV correspondant à une réunion Fireflies (heure ± participant).
 *  Renvoie { sessionId, hadCandidates } : hadCandidates=true signale qu'il y
 *  avait des RDV proches mais aucun match email → vrai orphelin à stocker
 *  (vs aucune session = réunion hors coaching, à ignorer). */
export const findSessionForMeeting = internalQuery({
  args: { dateMs: v.number(), participants: v.array(v.string()) },
  handler: async (
    ctx,
    { dateMs, participants }
  ): Promise<{
    sessionId: Id<"coachingSessions"> | null;
    hadCandidates: boolean;
  }> => {
    const cands = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) =>
        q.gte("scheduledAt", dateMs - WINDOW).lte("scheduledAt", dateMs + WINDOW)
      )
      .collect();
    const open = cands.filter((s) => !s.firefliesId && s.status !== "canceled");
    if (open.length === 0) return { sessionId: null, hadCandidates: false };
    const emails = new Set(participants.map((e) => (e || "").toLowerCase()));
    for (const s of open) {
      const u = await ctx.db.get(s.userId);
      if (u?.email && emails.has(u.email.toLowerCase())) {
        return { sessionId: s._id, hadCandidates: true };
      }
    }
    // Aucun match email → on refuse l'attachement (anti-contamination cross-élève)
    // mais il y avait des candidats : c'est un orphelin que Walid devra rattacher.
    return { sessionId: null, hadCandidates: true };
  },
});

/** Stocke le résumé Fireflies sur la session (+ marque fait + log). */
export const attach = internalMutation({
  args: {
    sessionId: v.id("coachingSessions"),
    firefliesId: v.string(),
    transcriptUrl: v.optional(v.string()),
    aiSummary: v.string(),
  },
  handler: async (ctx, { sessionId, firefliesId, transcriptUrl, aiSummary }) => {
    const s = await ctx.db.get(sessionId);
    if (!s) return;
    // Idempotence : on ne skippe TOTALEMENT que si la session a déjà été
    // résumée AVEC SUCCÈS (firefliesId + aiSummary non placeholder). Sinon,
    // on retente l'attach — utile si une 1re passe a échoué partiellement
    // (par ex. auto-unlock leçon raté). L'opération reste idempotente côté
    // maybeAutoUnlockLesson + logEvent (création d'un nouvel event = trace).
    if (
      s.firefliesId &&
      s.aiSummary &&
      s.aiSummary !== "Résumé indisponible"
    ) {
      console.log(`Fireflies: session ${sessionId} déjà résumée, skip`);
      return;
    }
    const willComplete = s.status === "scheduled";
    // patch construit dynamiquement : ne PAS mettre transcriptUrl undefined
    // dans le patch — Convex.patch supprime le champ si on passe undefined.
    const patch: Record<string, unknown> = {
      firefliesId,
      status: willComplete ? "completed" : s.status,
      updatedAt: Date.now(),
    };
    if (transcriptUrl !== undefined) patch.transcriptUrl = transcriptUrl;
    // N'écrase JAMAIS un aiSummary déjà présent (notes manuelles de Walid
    // saisies pendant le call, peu importe que le status soit scheduled ou
    // completed). Walid garde la main.
    if (!s.aiSummary) {
      patch.aiSummary = aiSummary;
    }
    await ctx.db.patch(sessionId, patch);
    // Auto-unlock leçon via helper unique avec guard tier strict
    // (cf. lib/access.ts → maybeAutoUnlockLesson). Idempotent.
    if (willComplete && s.curriculumItemId) {
      await maybeAutoUnlockLesson(ctx, s.userId, s.curriculumItemId);
    }
    await logEvent(ctx, {
      userId: s.userId,
      type: "call.summary",
      title: "Résumé du call ajouté (Fireflies)",
      actor: "fireflies",
      meta: { sessionId },
    });
  },
});

/** Stocke un transcript orphelin (aucun RDV matché par email) pour rattachement
 *  manuel par Walid + alerte Discord. Idempotent sur firefliesId. */
export const recordOrphan = internalMutation({
  args: {
    firefliesId: v.string(),
    title: v.optional(v.string()),
    meetingDate: v.number(),
    participants: v.array(v.string()),
    transcriptUrl: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("firefliesOrphans")
      .withIndex("by_fireflies", (q) => q.eq("firefliesId", args.firefliesId))
      .first();
    if (existing) return; // déjà enregistré
    await ctx.db.insert("firefliesOrphans", {
      firefliesId: args.firefliesId,
      title: args.title,
      meetingDate: args.meetingDate,
      participants: args.participants,
      transcriptUrl: args.transcriptUrl,
      aiSummary: args.aiSummary,
      createdAt: Date.now(),
    });
    // Alerte Walid une seule fois (à la création de l'orphelin).
    await ctx.scheduler.runAfter(0, internal.discord.postAlertToStaff, {
      content:
        `🟣 **Transcript Fireflies non rattaché**\n` +
        `Réunion « ${args.title ?? "sans titre"} » (${new Date(args.meetingDate).toLocaleString("fr-FR")}).\n` +
        `Participants : ${args.participants.join(", ") || "?"}\n` +
        `→ Aucun RDV ne matche par email. À rattacher manuellement dans /studio.`,
    });
  },
});

// ── Rattachement manuel des orphelins (écran /studio, admin) ────────────────

/** Liste les transcripts orphelins non résolus (plus récent d'abord). */
export const listOrphans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("firefliesOrphans")
      .withIndex("by_resolved", (q) => q.eq("resolvedAt", undefined))
      .collect();
    return rows.sort((a, b) => b.meetingDate - a.meetingDate);
  },
});

/** Sessions de coaching candidates au rattachement d'un orphelin : sans
 *  transcript, non annulées, dans une fenêtre ±2 jours autour de la réunion.
 *  Renvoie le nom de l'élève pour que Walid choisisse la bonne. */
export const attachableSessionsForOrphan = query({
  args: { orphanId: v.id("firefliesOrphans") },
  handler: async (ctx, { orphanId }) => {
    await requireAdmin(ctx);
    const orphan = await ctx.db.get(orphanId);
    if (!orphan) return [];
    const W = 2 * 24 * 60 * 60 * 1000; // ±2 jours
    const cands = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) =>
        q
          .gte("scheduledAt", orphan.meetingDate - W)
          .lte("scheduledAt", orphan.meetingDate + W)
      )
      .collect();
    const open = cands.filter((s) => !s.firefliesId && s.status !== "canceled");
    const withNames = await Promise.all(
      open.map(async (s) => {
        const u = await ctx.db.get(s.userId);
        return {
          _id: s._id,
          scheduledAt: s.scheduledAt,
          type: s.type,
          status: s.status,
          studentName: u?.name ?? u?.discordUsername ?? u?.email ?? "Élève",
          studentEmail: u?.email ?? null,
        };
      })
    );
    return withNames.sort((a, b) => b.scheduledAt - a.scheduledAt);
  },
});

/** Rattache un orphelin à une session : copie transcript/résumé sur la session
 *  (sans écraser un résumé manuel), complète le RDV, auto-unlock la leçon liée,
 *  et marque l'orphelin résolu. */
export const resolveOrphan = mutation({
  args: {
    orphanId: v.id("firefliesOrphans"),
    sessionId: v.id("coachingSessions"),
  },
  handler: async (ctx, { orphanId, sessionId }) => {
    await requireAdmin(ctx);
    const orphan = await ctx.db.get(orphanId);
    if (!orphan) throw new Error("Orphelin introuvable");
    if (orphan.resolvedAt) throw new Error("Orphelin déjà rattaché");
    const s = await ctx.db.get(sessionId);
    if (!s) throw new Error("Session introuvable");

    const willComplete = s.status === "scheduled";
    const patch: Record<string, unknown> = {
      firefliesId: orphan.firefliesId,
      status: willComplete ? "completed" : s.status,
      updatedAt: Date.now(),
    };
    if (orphan.transcriptUrl !== undefined) patch.transcriptUrl = orphan.transcriptUrl;
    // N'écrase pas un résumé déjà saisi (notes manuelles de Walid).
    if (!s.aiSummary && orphan.aiSummary) patch.aiSummary = orphan.aiSummary;
    await ctx.db.patch(sessionId, patch);

    // Auto-unlock leçon si le RDV pointe une leçon (guards via le helper SSoT).
    if (willComplete && s.curriculumItemId) {
      await maybeAutoUnlockLesson(ctx, s.userId, s.curriculumItemId);
    }

    await ctx.db.patch(orphanId, {
      resolvedAt: Date.now(),
      resolvedSessionId: sessionId,
    });

    await logEvent(ctx, {
      userId: s.userId,
      type: "call.summary",
      title: "Résumé du call rattaché (Fireflies, manuel)",
      actor: "coach",
      meta: { sessionId, firefliesId: orphan.firefliesId },
    });
    return { ok: true };
  },
});

/** Ignore un orphelin (réunion hors coaching, doublon…) sans le rattacher. */
export const dismissOrphan = mutation({
  args: { orphanId: v.id("firefliesOrphans") },
  handler: async (ctx, { orphanId }) => {
    await requireAdmin(ctx);
    const orphan = await ctx.db.get(orphanId);
    if (!orphan) return { ok: true };
    await ctx.db.patch(orphanId, { resolvedAt: Date.now() });
    return { ok: true };
  },
});

// ============================================================================
// Rabatteur Fireflies — envoie le bot (Fred) sur CHAQUE RDV qui démarre, via
// l'API `addToLiveMeeting`. Filet INDÉPENDANT de l'auto-join calendrier Fireflies
// (qui peut ne pas être configuré / rater) → garantit une présence à tous les
// RDV (1ers RDV Calendly + coachings manuels). Idempotent (firefliesDispatchedAt).
// ============================================================================

/** Résout le VRAI lien meet.google.com. Les RDV Calendly stockent une redirection
 *  `calendly.com/.../google_meet` (302 → meet.google.com) que le bot ne sait pas
 *  suivre ; on la résout ici. Renvoie null si non résoluble. */
async function resolveMeetUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.includes("meet.google.com")) return url;
  if (url.includes("calendly.com")) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "manual" });
      const loc = res.headers.get("location");
      if (loc && loc.includes("meet.google.com")) return loc;
    } catch {
      /* fail-silent */
    }
    return null;
  }
  return url; // autre visio (zoom…) : on tente tel quel
}

/** RDV à couvrir : programmés, démarrant dans ±5 min, avec un lien visio, pas
 *  encore dispatchés. Fenêtre > intervalle du cron (5 min) → chaque RDV couvert
 *  une fois près de son début. */
export const _sessionsToDispatch = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const from = now - 5 * 60 * 1000;
    const to = now + 5 * 60 * 1000;
    const rows = await ctx.db
      .query("coachingSessions")
      .withIndex("by_status_scheduledAt", (q) =>
        q.eq("status", "scheduled").gte("scheduledAt", from).lte("scheduledAt", to)
      )
      .collect();
    return rows
      .filter((s) => s.meetUrl && !s.firefliesDispatchedAt)
      .map((s) => ({ _id: s._id, meetUrl: s.meetUrl as string }));
  },
});

export const _markDispatched = internalMutation({
  args: { sessionId: v.id("coachingSessions") },
  handler: async (ctx, { sessionId }) => {
    await ctx.db.patch(sessionId, { firefliesDispatchedAt: Date.now() });
  },
});

/** CRON (toutes les 5 min, 6-21h) : envoie le bot Fireflies sur les RDV qui
 *  démarrent. Fail-silent par RDV. */
export const dispatchUpcomingNotetakers = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<
    | { ok: false; reason: "no_key" }
    | { ok: true; candidates: number; sent: number }
  > => {
    if (!process.env.FIREFLIES_API_KEY)
      return { ok: false as const, reason: "no_key" as const };
    const sessions: Array<{ _id: Id<"coachingSessions">; meetUrl: string }> =
      await ctx.runQuery(internal.fireflies._sessionsToDispatch, {});
    let sent = 0;
    for (const s of sessions) {
      const link = await resolveMeetUrl(s.meetUrl);
      if (!link) continue;
      try {
        await ffGraphQL(
          `mutation($link:String!){ addToLiveMeeting(meeting_link:$link){ success } }`,
          { link }
        );
        await ctx.runMutation(internal.fireflies._markDispatched, { sessionId: s._id });
        sent++;
        console.log(`🤖 Fireflies dispatché sur ${link} (session ${s._id})`);
      } catch (err) {
        console.warn(
          "⚠️ dispatch Fireflies échec:",
          err instanceof Error ? err.message : err
        );
      }
    }
    return { ok: true as const, candidates: sessions.length, sent };
  },
});

/** Vérif ponctuelle : liste les mutations Fireflies dispo (pour confirmer le nom
 *  exact de addToLiveMeeting SANS envoyer de bot). CLI :
 *  npx convex run fireflies:_ffIntrospectMutations --prod */
export const _ffIntrospectMutations = internalAction({
  args: {},
  handler: async () => {
    const data = await ffGraphQL(
      `query{ __type(name:"Mutation"){ fields{ name type{ name kind ofType{ name fields{ name } } fields{ name } } } } }`,
      {}
    );
    const fields =
      (data.__type as
        | {
            fields?: Array<{
              name: string;
              type?: { name?: string; fields?: Array<{ name: string }>; ofType?: { name?: string; fields?: Array<{ name: string }> } };
            }>;
          }
        | undefined)?.fields ?? [];
    const addToLive = fields.find((f) => f.name === "addToLiveMeeting");
    const retType = addToLive?.type;
    return {
      hasAddToLiveMeeting: !!addToLive,
      returnTypeName: retType?.name ?? retType?.ofType?.name ?? null,
      returnFields: (retType?.fields ?? retType?.ofType?.fields ?? []).map((f) => f.name),
    };
  },
});
