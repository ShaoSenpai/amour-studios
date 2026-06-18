import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

// ============================================================================
// Rate limit basique : fenêtre glissante de 60s par clé.
// ============================================================================

const WINDOW_MS = 60_000;

/**
 * Logique de rate-limit réutilisable depuis n'importe quelle mutation/action
 * (fonction simple, pas une Convex function → pas de ctx.runMutation requis).
 */
export async function rateLimit(
  ctx: GenericMutationCtx<DataModel>,
  key: string,
  max: number
): Promise<{ allowed: boolean; count: number }> {
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!existing) {
    await ctx.db.insert("rateLimits", { key, count: 1, windowStart: now });
    return { allowed: true, count: 1 };
  }
  // Fenêtre expirée → reset
  if (now - existing.windowStart > WINDOW_MS) {
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return { allowed: true, count: 1 };
  }
  if (existing.count >= max) {
    return { allowed: false, count: existing.count };
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return { allowed: true, count: existing.count + 1 };
}

/**
 * Incrémente le compteur pour `key`. Si le quota `max` est dépassé dans la
 * fenêtre courante, renvoie { allowed:false }.
 */
export const checkAndIncrement = internalMutation({
  args: { key: v.string(), max: v.number() },
  handler: async (ctx, { key, max }) => rateLimit(ctx, key, max),
});

/** Outil : vide tous les compteurs de rate-limit (débloque un test bloqué). */
export const _clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rateLimits").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { cleared: rows.length };
  },
});
