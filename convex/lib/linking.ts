import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { logEvent } from "./events";

type Ctx = GenericMutationCtx<DataModel>;

/**
 * Un ID Discord est un snowflake numérique (17-20 chiffres). Tout le reste
 * (un pseudo tapé à la main dans un outil admin, ex. « papi_94645 ») est REFUSÉ.
 * C'est la garde qui empêche de créer des comptes fantômes que le bot ne
 * retrouvera jamais (`by_discord` cherche l'ID numérique).
 */
export function isNumericDiscordId(s?: string | null): boolean {
  return typeof s === "string" && /^\d{15,25}$/.test(s.trim());
}

/**
 * PRIMITIF UNIQUE de liaison paiement → membre. Toute liaison (claim par token,
 * par code, ou par l'admin) passe par ici → une seule logique fiable.
 *
 * - Identité = le `userId` fourni (compte Discord authentifié, jamais un email).
 * - Écrit `purchase.userId` ET `user.purchaseId` (le champ que getActivePurchase
 *   lit en priorité → l'accès devient indépendant de l'email).
 * - Gère le TRANSFERT (purchase déjà lié à un autre user) : délie l'ancien,
 *   retire ses rôles Discord, repointe l'onboarding.
 * - Pose les rôles Discord UNIQUEMENT si le discordId est numérique (sinon skip).
 * - Démarre l'onboarding selon le palier.
 *
 * Idempotent. Renvoie { transferred }.
 */
export async function linkPurchaseToUser(
  ctx: Ctx,
  purchase: Doc<"purchases">,
  userId: Id<"users">
): Promise<{ transferred: boolean }> {
  const isTransfer = !!purchase.userId && purchase.userId !== userId;
  let oldUser: Doc<"users"> | null = null;
  if (isTransfer) {
    oldUser = await ctx.db.get(purchase.userId!);
    if (oldUser && oldUser.purchaseId === purchase._id) {
      await ctx.db.patch(oldUser._id, { purchaseId: undefined });
    }
  }

  // Lien bidirectionnel.
  if (isTransfer || !purchase.userId) {
    await ctx.db.patch(purchase._id, { userId });
  }
  const user = await ctx.db.get(userId);
  if (user && !user.purchaseId) {
    await ctx.db.patch(userId, { purchaseId: purchase._id });
  }

  // Transfert : rattache l'onboarding de l'ancien user au nouveau (préserve la
  // progression) si le nouveau n'a pas déjà la sienne.
  if (isTransfer && oldUser) {
    const newUserOb = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const oldUserOb = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", oldUser!._id))
      .first();
    if (!newUserOb && oldUserOb) {
      await ctx.db.patch(oldUserOb._id, { userId, updatedAt: Date.now() });
    }
  }

  const accessGranted =
    purchase.status === "paid" || purchase.status === "active";

  // Transfert : retire les rôles de l'ANCIEN compte (s'il avait un ID valide).
  if (isTransfer && isNumericDiscordId(oldUser?.discordId)) {
    await ctx.scheduler.runAfter(0, internal.stripe.removeDiscordRoles, {
      discordId: oldUser!.discordId!,
      email: oldUser!.email ?? "",
    });
    await ctx.scheduler.runAfter(0, internal.stripe.removeOnboardedRole, {
      discordId: oldUser!.discordId!,
    });
  }

  // Rôles du NOUVEAU compte — UNIQUEMENT si discordId numérique valide.
  if (accessGranted && isNumericDiscordId(user?.discordId) && user?.email) {
    await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
      discordId: user!.discordId!,
      email: user!.email,
      tier: purchase.tier ?? undefined,
    });
  }

  // Démarre l'onboarding selon le palier (idempotent).
  if (accessGranted && purchase.tier) {
    await ctx.scheduler.runAfter(0, internal.onboardings.linkAndStartOnboarding, {
      userId,
      tier: purchase.tier,
    });
  }

  await logEvent(ctx, {
    userId,
    type: isTransfer ? "purchase.transferred" : "purchase.linked",
    title: isTransfer
      ? "Paiement transféré vers un nouveau compte"
      : "Paiement lié au compte",
    actor: "system",
    meta: {
      purchaseId: purchase._id,
      fromUserId: oldUser?._id ?? null,
      fromDiscordId: oldUser?.discordId ?? null,
      toDiscordId: user?.discordId ?? null,
    },
  });

  return { transferred: isTransfer };
}
