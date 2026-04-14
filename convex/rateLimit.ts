import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ============================================================================
// Rate limit basique : fenêtre glissante de 60s par clé.
// ============================================================================

const WINDOW_MS = 60_000;

/**
 * Incrémente le compteur pour `key`. Si le quota `max` est dépassé dans la
 * fenêtre courante, throw.
 */
export const checkAndIncrement = internalMutation({
  args: { key: v.string(), max: v.number() },
  handler: async (ctx, { key, max }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (!existing) {
      await ctx.db.insert("rateLimits", {
        key,
        count: 1,
        windowStart: now,
      });
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
  },
});
