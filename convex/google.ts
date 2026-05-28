import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Amour Studios — Google Calendar + Meet (Brique A de la tour de contrôle).
// ----------------------------------------------------------------------------
// Actions internes appelées par convex/coaching.ts à la création / reprogrammation
// / annulation d'un RDV. Crée l'événement sur l'agenda du coach (calendrier
// `primary`) avec un lien Google Meet, et invite l'élève (sendUpdates=all).
//
// Auth : OAuth refresh token (mêmes identifiants que le bot WhatsApp worker).
//   env : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//
// Fail-silent : si les creds manquent ou que l'API échoue, on log et on ne
// bloque jamais le flux métier (le RDV existe en base de toute façon).
// ============================================================================

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function hasCreds(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Crée l'événement Google + Meet et renvoie {googleEventId, meetUrl} en patchant
 * la session via internal.coaching.setSessionGoogle.
 */
export const syncCreate = internalAction({
  args: {
    sessionId: v.id("coachingSessions"),
    title: v.string(),
    startMs: v.number(),
    endMs: v.number(),
    attendeeEmails: v.array(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!hasCreds()) {
      console.warn("Google creds absentes — événement non créé (RDV en base ok).");
      return;
    }
    try {
      const accessToken = await getAccessToken();
      const body = {
        summary: args.title,
        description: args.description ?? "",
        start: { dateTime: iso(args.startMs), timeZone: "Europe/Paris" },
        end: { dateTime: iso(args.endMs), timeZone: "Europe/Paris" },
        attendees: args.attendeeEmails.filter(Boolean).map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `amour-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
      const res = await fetch(`${CAL_BASE}?conferenceDataVersion=1&sendUpdates=all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`Google Calendar create ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return;
      }
      const data = (await res.json()) as {
        id: string;
        conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
      };
      const meetUrl =
        data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? undefined;
      await ctx.runMutation(internal.coaching.setSessionGoogle, {
        sessionId: args.sessionId,
        googleEventId: data.id,
        meetUrl,
      });
      console.log(`✅ Google event créé (${data.id}) Meet=${meetUrl ?? "—"}`);
    } catch (err) {
      console.warn("⚠️ Google Calendar create échoué:", err);
    }
  },
});

/** Reprogramme (PATCH) l'événement Google. */
export const syncUpdate = internalAction({
  args: {
    googleEventId: v.string(),
    startMs: v.optional(v.number()),
    endMs: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    if (!hasCreds()) return;
    try {
      const accessToken = await getAccessToken();
      const patch: Record<string, unknown> = {};
      if (args.title) patch.summary = args.title;
      if (typeof args.startMs === "number")
        patch.start = { dateTime: iso(args.startMs), timeZone: "Europe/Paris" };
      if (typeof args.endMs === "number")
        patch.end = { dateTime: iso(args.endMs), timeZone: "Europe/Paris" };
      const res = await fetch(
        `${CAL_BASE}/${encodeURIComponent(args.googleEventId)}?sendUpdates=all`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) console.warn(`Google Calendar update ${res.status}`);
    } catch (err) {
      console.warn("⚠️ Google Calendar update échoué:", err);
    }
  },
});

/** Annule (DELETE) l'événement Google. */
export const syncDelete = internalAction({
  args: { googleEventId: v.string() },
  handler: async (_ctx, { googleEventId }) => {
    if (!hasCreds()) return;
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(
        `${CAL_BASE}/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      // 410 = déjà supprimé → ok
      if (!res.ok && res.status !== 410) console.warn(`Google Calendar delete ${res.status}`);
    } catch (err) {
      console.warn("⚠️ Google Calendar delete échoué:", err);
    }
  },
});
