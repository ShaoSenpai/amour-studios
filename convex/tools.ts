import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Tools (templates / cheat-sheets / ressources statiques)
// ----------------------------------------------------------------------------
// Alimenté depuis l'admin. Affiché dans /dashboard/outils section "Outils".
// ============================================================================

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tools")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    fileUrl: v.string(),
    category: v.optional(v.string()),
    iconName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return await ctx.db.insert("tools", {
      ...args,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    category: v.optional(v.string()),
    iconName: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(toolId, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(toolId, { deletedAt: Date.now() });
  },
});
