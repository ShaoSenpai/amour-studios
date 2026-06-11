import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/auth";
import {
  accessibleModules,
  getActivePurchase,
  COACHING_MODULE_ORDERS,
} from "./lib/access";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ============================================================================
// Amour Studios — Exercises CRUD + lecture côté élève.
//
// Le gating combine 2 règles :
//   1. Module accessible (cf. `accessibleModules` dans lib/access) — selon
//      tier coaching + duree (1mois ⇒ M1, 3mois ⇒ M1 + unlockedModules) +
//      `users.unlockedModules` débloqués manuellement / auto.
//   2. Séquence intra-module (logique préservée) — il faut avoir complété
//      la leçon précédente du même module pour débloquer la suivante.
//
// États retournés :
//   "locked_module"  → module pas accessible (lock dur, raison principale)
//   "locked"         → module OK mais séquence pas faite (lock progressif)
//   "available"      → on peut faire l'exo
//   "completed"      → déjà terminé
// ============================================================================

export const listByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    if (!(await getAuthUserId(ctx))) return []; // contenu formation = connectés
    return await ctx.db
      .query("exercises")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

// Type de sortie commun à listAllWithState / listForUser.
export type ExerciseWithState = {
  _id: Id<"exercises">;
  title: string;
  exerciseUrl?: string;
  config?: string;
  lessonId: Id<"lessons">;
  lessonTitle: string;
  lessonOrder: number;
  lessonPreviewAccess: boolean;
  moduleId: Id<"modules">;
  moduleTitle: string;
  moduleOrder: number;
  moduleBadgeLabel: string;
  state: "locked_module" | "locked" | "available" | "completed";
  lockedReason?: "tier_module" | "previous_lesson" | "previous_module";
  completedAt?: number;
  responseUpdatedAt?: number;
  progressPercent?: number;
};

/** Calcule l'état des exos pour un user donné. Logique partagée par
 *  `listAllWithState` (élève courant) et `listForUser` (admin → fiche). */
async function computeStateForUser(
  ctx: QueryCtx,
  user: Doc<"users"> | null
): Promise<ExerciseWithState[]> {
  const allModules = await ctx.db
    .query("modules")
    .withIndex("by_order")
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();
  // Catalogue /exos = uniquement les modules in-scope coaching (1,2,3).
  // Les modules legacy (Introduction, Mindset, Communauté…) restent en BDD
  // pour la formation mais ne sont JAMAIS exposés ici.
  const coachingOrders = new Set<number>(COACHING_MODULE_ORDERS);
  const modules = allModules
    .filter((m) => coachingOrders.has(m.order))
    .sort((a, b) => a.order - b.order);

  const isAdmin = user?.role === "admin";
  const hasPurchase = !!user?.purchaseId;
  const accessibleSet = user
    ? new Set(await accessibleModules(ctx, user))
    : new Set<number>();

  // Préchargement par module : lessons (ordre) + exos.
  const lessonsByModule = new Map<string, Doc<"lessons">[]>();
  for (const m of modules) {
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module_order", (q) => q.eq("moduleId", m._id))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    lessons.sort((a, b) => a.order - b.order);
    lessonsByModule.set(m._id, lessons);
  }

  // Progression par leçon pour ce user (legacy formation).
  const userId = user?._id;
  const progress = userId
    ? await ctx.db
        .query("progress")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    : [];
  const progressMap = new Map(progress.map((p) => [p.lessonId as string, p]));

  // Réponses utilisateur (pour `completedAt`, `updatedAt`, `progressPercent`).
  const responses = userId
    ? await ctx.db
        .query("exerciseResponses")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    : [];
  const respMap = new Map(responses.map((r) => [r.exerciseId as string, r]));

  const result: ExerciseWithState[] = [];

  for (const m of modules) {
    const moduleAccessible = isAdmin || accessibleSet.has(m.order);
    const lessons = lessonsByModule.get(m._id) ?? [];

    for (let li = 0; li < lessons.length; li++) {
      const lesson = lessons[li];
      const allExos = await ctx.db
        .query("exercises")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();
      // Catalogue /exos = exos coaching avec outil externe uniquement.
      // - `exerciseUrl` requis : seuls les exos qui pointent vers un outil
      //   externe interactif (iframe) sont exposés à l'élève.
      // - `hiddenFromCoaching=true` reste un kill-switch admin si besoin.
      const exos = allExos.filter(
        (x) => x.hiddenFromCoaching !== true && !!x.exerciseUrl
      );
      if (exos.length === 0) continue;

      // Séquence : la leçon est-elle débloquée à l'intérieur du module ?
      let lessonAvailable: boolean;
      let lessonLockedReason: ExerciseWithState["lockedReason"];
      if (isAdmin) {
        lessonAvailable = true;
      } else if (!moduleAccessible) {
        lessonAvailable = false;
        lessonLockedReason = "tier_module";
      } else if (!hasPurchase) {
        lessonAvailable = !!lesson.previewAccess;
        if (!lessonAvailable) lessonLockedReason = "tier_module";
      } else {
        lessonAvailable =
          li === 0 ||
          !!progressMap.get(lessons[li - 1]._id as string)?.lessonCompletedAt;
        if (!lessonAvailable) lessonLockedReason = "previous_lesson";
      }

      for (const ex of exos) {
        const resp = respMap.get(ex._id as string);
        const lessonProgress = progressMap.get(lesson._id as string);
        const completed =
          !!resp?.completedAt ||
          !!lessonProgress?.exerciseCompletedAt ||
          !!lessonProgress?.lessonCompletedAt;

        let state: ExerciseWithState["state"];
        let lockedReason: ExerciseWithState["lockedReason"];
        if (completed) {
          state = "completed";
        } else if (!moduleAccessible && !isAdmin) {
          state = "locked_module";
          lockedReason = "tier_module";
        } else if (!lessonAvailable) {
          state = "locked";
          lockedReason = lessonLockedReason;
        } else {
          state = "available";
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
          lockedReason,
          completedAt:
            resp?.completedAt ?? lessonProgress?.exerciseCompletedAt,
          responseUpdatedAt: resp?.updatedAt,
          progressPercent: resp?.progressPercent,
        });
      }
    }
  }

  return result;
}

/** Résumé d'accès du user courant : tier coaching, modules accessibles.
 *  Utilisé par le layout /exos pour décider quel écran montrer. */
export const accessSummary = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    isAuthed: boolean;
    isAdmin: boolean;
    tier: "coaching" | "communaute" | null;
    duree: "1mois" | "3mois" | null;
    unlockedModules: number[];
    accessibleModules: number[];
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        isAuthed: false,
        isAdmin: false,
        tier: null,
        duree: null,
        unlockedModules: [],
        accessibleModules: [],
      };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return {
        isAuthed: false,
        isAdmin: false,
        tier: null,
        duree: null,
        unlockedModules: [],
        accessibleModules: [],
      };
    }
    const purchase = await getActivePurchase(ctx, user);
    return {
      isAuthed: true,
      isAdmin: user.role === "admin",
      tier: purchase?.tier ?? null,
      duree: purchase?.duree ?? null,
      unlockedModules: user.unlockedModules ?? [],
      accessibleModules: await accessibleModules(ctx, user),
    };
  },
});

/** Liste les exos avec leur état pour l'utilisateur courant. Page /exos. */
export const listAllWithState = query({
  args: {},
  handler: async (ctx): Promise<ExerciseWithState[]> => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    return computeStateForUser(ctx, user);
  },
});

/** Liste les exos d'un user donné — pour le bloc « Exercices » de la fiche
 *  élève côté studio. Admin only. */
export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<ExerciseWithState[]> => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return [];
    return computeStateForUser(ctx, user);
  },
});

/** Détail d'un exo pour la page /exos/[id].
 *  Retourne null si non trouvé. Inclut le gating module : si le module n'est
 *  pas accessible (et user pas admin), `accessible=false` et on n'envoie PAS
 *  la `data` de réponse précédente. */
export const getExerciseForUser = query({
  args: { exerciseId: v.id("exercises") },
  handler: async (
    ctx,
    { exerciseId }
  ): Promise<{
    exercise: Doc<"exercises">;
    lesson: { _id: Id<"lessons">; title: string; order: number };
    module: { _id: Id<"modules">; title: string; order: number; badgeLabel: string };
    accessible: boolean;
    lockedReason?: "auth" | "tier_module" | "previous_lesson";
    response: Doc<"exerciseResponses"> | null;
  } | null> => {
    const ex = await ctx.db.get(exerciseId);
    if (!ex || ex.deletedAt) return null;
    const lesson = await ctx.db.get(ex.lessonId);
    if (!lesson) return null;
    const mod = await ctx.db.get(lesson.moduleId);
    if (!mod) return null;

    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;

    if (!user) {
      return {
        exercise: ex,
        lesson: { _id: lesson._id, title: lesson.title, order: lesson.order },
        module: {
          _id: mod._id,
          title: mod.title,
          order: mod.order,
          badgeLabel: mod.badgeLabel,
        },
        accessible: false,
        lockedReason: "auth",
        response: null,
      };
    }

    const isAdmin = user.role === "admin";
    // Catalogue coaching uniquement : exos avec outil externe (exerciseUrl),
    // non taggés cachés, sur modules in-scope (1,2,3).
    const inCoachingCatalog =
      !ex.hiddenFromCoaching &&
      !!ex.exerciseUrl &&
      (COACHING_MODULE_ORDERS as readonly number[]).includes(mod.order);
    const allowed = isAdmin
      ? inCoachingCatalog
      : inCoachingCatalog &&
        (await accessibleModules(ctx, user)).includes(mod.order);

    const response = allowed
      ? await ctx.db
          .query("exerciseResponses")
          .withIndex("by_user_exercise", (q) =>
            q.eq("userId", user._id).eq("exerciseId", ex._id)
          )
          .first()
      : null;

    return {
      exercise: ex,
      lesson: { _id: lesson._id, title: lesson.title, order: lesson.order },
      module: {
        _id: mod._id,
        title: mod.title,
        order: mod.order,
        badgeLabel: mod.badgeLabel,
      },
      accessible: allowed,
      lockedReason: allowed ? undefined : "tier_module",
      response,
    };
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
      Object.entries(updates).filter(([, val]) => val !== undefined)
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
