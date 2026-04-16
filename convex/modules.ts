import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Modules CRUD
// ============================================================================

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("modules")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
  },
});

/**
 * Tous les modules avec leurs leçons — pour le panneau "Plan du cours"
 * qui permet de naviguer entre modules et leçons depuis la page leçon.
 * Un seul roundtrip au lieu de N queries listByModule côté client.
 */
export const listWithLessons = query({
  args: {},
  handler: async (ctx) => {
    const modules = await ctx.db
      .query("modules")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const result = [];
    for (const m of modules) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_module_order", (q) => q.eq("moduleId", m._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();
      result.push({ ...m, lessons });
    }
    return result;
  },
});

export const get = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    return await ctx.db.get(moduleId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    badgeLabel: v.string(),
    iconName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    // Auto-order: mettre en dernier
    const existing = await ctx.db
      .query("modules")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    const order = existing.length;

    return await ctx.db.insert("modules", {
      ...args,
      order,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    moduleId: v.id("modules"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    badgeLabel: v.optional(v.string()),
    iconName: v.optional(v.string()),
  },
  handler: async (ctx, { moduleId, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(moduleId, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(moduleId, { deletedAt: Date.now() });

    // Cascade soft-delete to lessons
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module", (q) => q.eq("moduleId", moduleId))
      .collect();
    for (const lesson of lessons) {
      if (!lesson.deletedAt) {
        await ctx.db.patch(lesson._id, { deletedAt: Date.now() });
      }
    }
  },
});

export const reorder = mutation({
  args: {
    moduleIds: v.array(v.id("modules")),
  },
  handler: async (ctx, { moduleIds }) => {
    await requireAdmin(ctx);
    for (let i = 0; i < moduleIds.length; i++) {
      await ctx.db.patch(moduleIds[i], { order: i, updatedAt: Date.now() });
    }
  },
});

/**
 * Get progress for a specific module (lessons completed / total).
 */
export const getProgress = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { completed: 0, total: 0, percent: 0 };

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module", (q) => q.eq("moduleId", moduleId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const total = lessons.length;
    if (total === 0) return { completed: 0, total: 0, percent: 0 };

    const progress = await ctx.db
      .query("progress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const progressMap = new Map(progress.map((p) => [p.lessonId as string, p]));
    const completed = lessons.filter((l) => progressMap.get(l._id as string)?.lessonCompletedAt).length;

    return { completed, total, percent: Math.round((completed / total) * 100) };
  },
});
