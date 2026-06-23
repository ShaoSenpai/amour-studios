import { query, internalQuery, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getActivePurchase } from "./lib/access";
import {
  computeNextStep,
  type JourneyInput,
  type JourneyState,
  type Tier,
  type OnboardingStep,
  type PurchaseStatus,
} from "./lib/journey";

// ============================================================================
// journey.ts — expose l'état canonique du parcours (cf. lib/journey.ts +
// 1_DOCS/projet/AUDIT_PARCOURS_CLIENT.md). Deux entrées :
//
//  • nextStep        — query READ-ONLY pour la surface WEB (membre connecté,
//                      résolu via getAuthUserId/session). Consommée par
//                      app/page.tsx (dispatcher), /onboarding/welcome, /compte.
//
//  • journeyForUser  — internalQuery pour les surfaces SERVEUR (bot Discord,
//                      emails, crons de relance) qui connaissent un userId mais
//                      n'ont PAS de session. Foundation Phase 4 : posée SANS
//                      consumer live pour l'instant (comme nextStep en Phase 0)
//                      → impossible de casser les DM/relances existants.
//
// Les deux partagent loadInputForUser() : UNE seule façon de lire les 4 états
// bruts (paiement × liaison × étape onboarding × rôle) depuis la DB.
// ============================================================================

const ANON: JourneyInput = {
  authed: false,
  isAdmin: false,
  purchase: null,
  onboarding: null,
  onboardingToken: null,
};

// Charge les 4 états bruts d'un user → JourneyInput (authed=true).
// Retourne null si le user est introuvable. Purchase pertinent : l'abonnement
// ACTIF (getActivePurchase, source de vérité accès) ; à défaut, le plus récent
// CANCELED (pour l'état « accès terminé » + chemin de retour).
async function loadInputForUser(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<JourneyInput | null> {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  let purchase = await getActivePurchase(ctx, user);
  if (!purchase && user.email) {
    const email = user.email.toLowerCase();
    const list = await ctx.db
      .query("purchases")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    purchase =
      list
        .filter((p) => p.status === "canceled")
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
  }

  const ob = await ctx.db
    .query("onboardings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  return {
    authed: true,
    isAdmin: user.role === "admin",
    purchase: purchase
      ? {
          status: purchase.status as PurchaseStatus,
          tier: (purchase.tier ?? null) as Tier | null,
          duree: purchase.duree ?? null,
        }
      : null,
    onboarding: ob
      ? { step: ob.step as OnboardingStep, tier: (ob.tier ?? null) as Tier | null }
      : null,
    onboardingToken: ob?.token ?? null,
  };
}

// WEB — membre connecté (session). Anonyme → état not_authed.
export const nextStep = query({
  args: {},
  handler: async (ctx): Promise<JourneyState> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return computeNextStep(ANON);
    const input = await loadInputForUser(ctx, userId);
    return computeNextStep(input ?? ANON);
  },
});

// SERVEUR — état canonique d'UN membre par son userId (bot/emails/crons).
// internalQuery : non exposée publiquement (lecture d'état arbitraire par id),
// appelable depuis les internalActions serveur et le CLI (`npx convex run`).
export const journeyForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<JourneyState> => {
    const input = await loadInputForUser(ctx, userId);
    return computeNextStep(input ?? ANON);
  },
});

// SERVEUR/BOT — état canonique par discordId (le robot Discord ne connaît que
// le discordId à l'arrivée serveur). Si aucun compte lié → not_authed (= le bot
// lit « pas de compte lié → lie ton compte »). Sinon, l'état réel du parcours.
export const journeyByDiscordId = internalQuery({
  args: { discordId: v.string() },
  handler: async (ctx, { discordId }): Promise<JourneyState> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discord", (q) => q.eq("discordId", discordId))
      .first();
    if (!user) return computeNextStep(ANON);
    const input = await loadInputForUser(ctx, user._id);
    return computeNextStep(input ?? ANON);
  },
});
