import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/events";
import { maybeAutoUnlockLesson } from "./lib/access";
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
      console.warn("⚠️ Fireflies sync échec:", err);
      await ctx
        .runMutation(internal.health.recordFailure, {
          service: "fireflies",
          reason: err instanceof Error ? err.message : "sync failed",
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
