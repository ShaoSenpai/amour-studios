import { v } from "convex/values";
import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Amour Studios — Segmentation CRM (Brique E). Admin only.
// ----------------------------------------------------------------------------
// classify(ctx) range chaque user (non supprimé) dans un ou plusieurs segments
// selon son purchase + sa dernière activité + l'existence d'un RDV futur.
// listSegments → compteurs par segment ; segmentMembers → destinataires.
// ============================================================================

const DAY = 24 * 60 * 60 * 1000;
const INACTIVE_THRESHOLD = 21 * DAY;

export type SegmentKey =
  | "prospects"
  | "communaute"
  | "coaching"
  | "coaching_termine"
  | "impayes"
  | "annules"
  | "inactifs"
  | "sans_rdv";

// Métadonnées des segments, dans l'ordre d'affichage souhaité.
export const SEGMENTS: ReadonlyArray<{
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

type ClassifiedMember = {
  userId: Id<"users">;
  name: string | null;
  discordUsername: string | null;
  email: string | null;
  phone: string | null;
};

type Classification = Record<SegmentKey, ClassifiedMember[]>;

function emptyClassification(): Classification {
  return {
    prospects: [],
    communaute: [],
    coaching: [],
    coaching_termine: [],
    impayes: [],
    annules: [],
    inactifs: [],
    sans_rdv: [],
  };
}

const ACTIVE_STATUSES = new Set(["active", "paid"]);

/**
 * Charge les users non supprimés + leur purchase + les userIds ayant un RDV
 * futur planifié, puis range chaque user dans ses segments. Un user peut
 * appartenir à plusieurs segments (ex. coaching + inactif + sans_rdv).
 */
async function classify(ctx: QueryCtx): Promise<Classification> {
  const now = Date.now();
  const result = emptyClassification();

  // userIds ayant au moins un RDV planifié futur.
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

  for (const u of users) {
    if (u.deletedAt) continue;

    const purchase: Doc<"purchases"> | null = u.purchaseId
      ? await ctx.db.get(u.purchaseId)
      : null;

    const member: ClassifiedMember = {
      userId: u._id,
      name: u.name ?? null,
      discordUsername: u.discordUsername ?? null,
      email: u.email ?? purchase?.email ?? null,
      phone: purchase?.phone ?? null,
    };

    const status = purchase?.status ?? null;
    const tier = purchase?.tier ?? null;
    const isActive = status !== null && ACTIVE_STATUSES.has(status);

    // prospects — aucun abonnement actif.
    if (!purchase || !isActive) {
      result.prospects.push(member);
    }

    // communaute / coaching — abonnement actif par tier.
    if (isActive && tier === "communaute") result.communaute.push(member);
    if (isActive && tier === "coaching") {
      result.coaching.push(member);
      if (!withUpcoming.has(u._id as unknown as string)) {
        result.sans_rdv.push(member);
      }
    }

    // coaching_termine — coaching résilié (à renouveler).
    if (tier === "coaching" && status === "canceled") {
      result.coaching_termine.push(member);
    }

    // impayes — past_due.
    if (status === "past_due") result.impayes.push(member);

    // annules — canceled (tous tiers).
    if (status === "canceled") result.annules.push(member);

    // inactifs — lastActiveAt défini et > 21 jours.
    if (u.lastActiveAt != null && now - u.lastActiveAt > INACTIVE_THRESHOLD) {
      result.inactifs.push(member);
    }
  }

  return result;
}

/** Liste des segments avec leur compteur, dans l'ordre de SEGMENTS. */
export const listSegments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const c = await classify(ctx);
    return SEGMENTS.map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      count: c[s.key].length,
    }));
  },
});

/** Membres d'un segment (triés par nom). */
export const segmentMembers = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAdmin(ctx);
    const c = await classify(ctx);
    const members = c[key as SegmentKey] ?? [];
    return [...members].sort((a, b) => {
      const an = (a.name ?? a.discordUsername ?? "").toLowerCase();
      const bn = (b.name ?? b.discordUsername ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
  },
});
