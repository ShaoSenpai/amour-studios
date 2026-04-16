import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";

// ============================================================================
// Amour Studios — Exercises CRUD
// ============================================================================

export const listByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    return await ctx.db
      .query("exercises")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

/**
 * Retourne tous les exos de la formation + leur contexte (lesson, module)
 * + leur état pour le user courant (locked/available/completed).
 *
 * Règles :
 *   - admin → tout "available" sauf les exos déjà complétés
 *   - preview (non-VIP) → available uniquement si lesson.previewAccess
 *   - VIP → available si canAccessLesson (règle séquentielle globale)
 *   - completed si progress[lessonId].exerciseCompletedAt est set
 */
export const listAllWithState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Par module, fetch ses lessons + exos dans l'ordre
    const moduleMap = new Map<string, { title: string; order: number; badgeLabel: string }>();
    const lessonsByModule = new Map<string, typeof modules[number] extends never ? never : {
      _id: import("./_generated/dataModel").Id<"lessons">;
      title: string;
      order: number;
      previewAccess?: boolean;
      moduleId: import("./_generated/dataModel").Id<"modules">;
    }[]>();

    for (const m of modules) {
      moduleMap.set(m._id, { title: m.title, order: m.order, badgeLabel: m.badgeLabel });
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_module_order", (q) => q.eq("moduleId", m._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();
      lessonsByModule.set(m._id, lessons);
    }

    // User state
    const user = userId ? await ctx.db.get(userId) : null;
    const isAdmin = user?.role === "admin";
    const hasPurchase = !!user?.purchaseId;

    const progress = userId
      ? await ctx.db
          .query("progress")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];
    const progressMap = new Map(progress.map((p) => [p.lessonId as string, p]));

    // Pour chaque module, déterminer si le MODULE est accessible (séquentiel)
    // Un module VIP est débloqué si toutes les lessons du module précédent sont
    // complétées (ou si order === 0). Preview mode : l'unlock se fait au niveau
    // de la lesson via previewAccess, pas du module.
    const moduleUnlocked = new Map<string, boolean>();
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      if (isAdmin || hasPurchase) {
        if (i === 0) {
          moduleUnlocked.set(m._id, true);
        } else {
          const prev = modules[i - 1];
          const prevLessons = lessonsByModule.get(prev._id) ?? [];
          const allPrevDone = prevLessons.every(
            (l) => progressMap.get(l._id as string)?.lessonCompletedAt
          );
          moduleUnlocked.set(m._id, prevLessons.length === 0 || allPrevDone);
        }
      } else {
        // Preview : considéré "unlocked" mais les exos filtrent via previewAccess
        moduleUnlocked.set(m._id, true);
      }
    }

    // Collecte finale
    const result: Array<{
      _id: import("./_generated/dataModel").Id<"exercises">;
      title: string;
      exerciseUrl?: string;
      config?: string;
      lessonId: import("./_generated/dataModel").Id<"lessons">;
      lessonTitle: string;
      lessonOrder: number;
      lessonPreviewAccess: boolean;
      moduleId: import("./_generated/dataModel").Id<"modules">;
      moduleTitle: string;
      moduleOrder: number;
      moduleBadgeLabel: string;
      state: "locked" | "available" | "completed";
      completedAt?: number;
    }> = [];

    for (const m of modules) {
      const modUnlocked = moduleUnlocked.get(m._id) ?? false;
      const lessons = lessonsByModule.get(m._id) ?? [];

      for (let li = 0; li < lessons.length; li++) {
        const lesson = lessons[li];
        const exos = await ctx.db
          .query("exercises")
          .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
          .collect();
        if (exos.length === 0) continue;

        const lessonProgress = progressMap.get(lesson._id as string);
        const lessonCompleted = !!lessonProgress?.lessonCompletedAt;
        const exerciseCompleted = !!lessonProgress?.exerciseCompletedAt;

        // Accès à la leçon (même logique que canAccessLesson)
        let lessonAvailable: boolean;
        if (isAdmin) {
          lessonAvailable = true;
        } else if (!hasPurchase) {
          lessonAvailable = !!lesson.previewAccess;
        } else if (!modUnlocked) {
          lessonAvailable = false;
        } else {
          // VIP : séquentiel dans le module (première OU précédente complétée)
          lessonAvailable =
            li === 0 ||
            !!progressMap.get(lessons[li - 1]._id as string)?.lessonCompletedAt;
        }

        for (const ex of exos) {
          let state: "locked" | "available" | "completed";
          if (exerciseCompleted || lessonCompleted) {
            state = "completed";
          } else if (lessonAvailable) {
            state = "available";
          } else {
            state = "locked";
          }
          result.push({
            _id: ex._id,
            title: ex.title,
            exerciseUrl: ex.exerciseUrl,
            config: ex.config,
            lessonId: lesson._id,
            lessonTitle: lesson.title,
            lessonOrder: lesson.order,
            lessonPreviewAccess: !!lesson.previewAccess,
            moduleId: m._id,
            moduleTitle: m.title,
            moduleOrder: m.order,
            moduleBadgeLabel: m.badgeLabel,
            state,
            completedAt: lessonProgress?.exerciseCompletedAt,
          });
        }
      }
    }

    return result;
  },
});

export const create = mutation({
  args: {
    lessonId: v.id("lessons"),
    title: v.string(),
    contentMarkdown: v.string(),
    type: v.union(v.literal("checkbox"), v.literal("qcm"), v.literal("text")),
    qcmOptions: v.optional(
      v.array(v.object({ label: v.string(), isCorrect: v.boolean() }))
    ),
    exerciseUrl: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    return await ctx.db.insert("exercises", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    exerciseId: v.id("exercises"),
    title: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    type: v.optional(
      v.union(v.literal("checkbox"), v.literal("qcm"), v.literal("text"))
    ),
    qcmOptions: v.optional(
      v.array(v.object({ label: v.string(), isCorrect: v.boolean() }))
    ),
    exerciseUrl: v.optional(v.string()),
    config: v.optional(v.string()),
  },
  handler: async (ctx, { exerciseId, ...updates }) => {
    await requireAdmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(exerciseId, { ...filtered, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(exerciseId, { deletedAt: Date.now() });
  },
});
