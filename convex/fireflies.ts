import { v } from "convex/values";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/events";
import { maybeAutoUnlockLesson } from "./lib/access";

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
        const sessionId = await ctx.runQuery(internal.fireflies.findSessionForMeeting, {
          dateMs: m.date,
          participants: m.participants ?? [],
        });
        if (!sessionId) continue;
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
        await ctx.runMutation(internal.fireflies.attach, {
          sessionId,
          firefliesId: m.id,
          transcriptUrl: t.transcript_url ?? m.transcript_url,
          aiSummary,
        });
      }
    } catch (err) {
      console.warn("⚠️ Fireflies sync échec:", err);
    }
  },
});

/** Trouve le RDV correspondant à une réunion Fireflies (heure ± participant). */
export const findSessionForMeeting = internalQuery({
  args: { dateMs: v.number(), participants: v.array(v.string()) },
  handler: async (ctx, { dateMs, participants }) => {
    const cands = await ctx.db
      .query("coachingSessions")
      .withIndex("by_scheduledAt", (q) =>
        q.gte("scheduledAt", dateMs - WINDOW).lte("scheduledAt", dateMs + WINDOW)
      )
      .collect();
    const open = cands.filter((s) => !s.firefliesId && s.status !== "canceled");
    if (open.length === 0) return null;
    const emails = new Set(participants.map((e) => (e || "").toLowerCase()));
    for (const s of open) {
      const u = await ctx.db.get(s.userId);
      if (u?.email && emails.has(u.email.toLowerCase())) return s._id;
    }
    // Aucun match email → on refuse l'attachement. Évite la contamination
    // cross-élève (transcript de A attribué à B juste parce que B avait un
    // RDV ±3h plus tard). Le transcript reste « orphelin » côté Fireflies,
    // Walid peut le rattacher manuellement si besoin.
    console.warn(
      `Fireflies: aucun match email pour réunion ${new Date(dateMs).toISOString()} ` +
        `(${open.length} sessions candidates, participants=${participants.join(",")}). Transcript ignoré.`
    );
    return null;
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
