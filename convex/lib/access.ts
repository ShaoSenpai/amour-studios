import { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

// ============================================================================
// Helpers d'accès aux exercices coaching.
//
// Règles :
//  - Admin → tous les modules existants.
//  - Pas de purchase coaching actif → aucun accès ([]).
//  - duree="1mois" → uniquement M1 (le 1er module par `order`).
//  - duree="3mois" → M1 implicite + tous les modules listés dans
//    `users.unlockedModules` (débloqués manuellement par admin OU auto par
//    `exerciseResponses.complete` à la fin du module précédent).
//
// Note : les exos sont rattachés à des LEÇONS de FORMATION (`lessons.moduleId`),
// donc le "moduleNo" utilisé pour le gating = `modules.order` (entier 1+).
// ============================================================================

type Ctx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>;

/** Retrouve le purchase actif (coaching/communauté) lié à un user (par
 *  `purchaseId` ou, à défaut, par email). Renvoie null si rien. */
export async function getActivePurchase(
  ctx: Ctx,
  user: Doc<"users">
): Promise<Doc<"purchases"> | null> {
  if (user.purchaseId) {
    const p = await ctx.db.get(user.purchaseId);
    if (p && isActiveStatus(p.status)) return p;
  }
  if (user.email) {
    const byEmail = await ctx.db
      .query("purchases")
      .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
      .collect();
    const active = byEmail.find((p) => isActiveStatus(p.status));
    if (active) return active;
  }
  return null;
}

function isActiveStatus(status: string): boolean {
  return status === "active" || status === "paid" || status === "past_due";
}

// Modules in scope pour le catalogue /exos coaching. Les autres modules
// (Introduction, Mindset, Communauté…) restent en BDD pour la formation
// legacy mais ne sont JAMAIS exposés côté élève coaching.
export const COACHING_MODULE_ORDERS = [1, 2, 3] as const;

/** Renvoie la liste TRIÉE des `module.order` accessibles à ce user pour les
 *  exercices coaching. Vide si pas d'accès. */
export async function accessibleModules(
  ctx: Ctx,
  user: Doc<"users">
): Promise<number[]> {
  // Admin : tous les modules in-scope coaching (1, 2, 3) — pas de gating.
  if (user.role === "admin") {
    return [...COACHING_MODULE_ORDERS];
  }

  const purchase = await getActivePurchase(ctx, user);
  if (!purchase || purchase.tier !== "coaching") return [];

  const set = new Set<number>();
  // M1 implicite pour tout coaching actif.
  set.add(1);
  // duree="3mois" : modules dérivés des leçons débloquées. SOURCE UNIQUE =
  // `unlockedLessonIds` (le legacy `unlockedModules` n'est plus lu — migré une
  // fois vers les leçons, cf. migrations.migrateUnlockedModulesToLessons).
  // Conséquence : verrouiller une leçon via lockLesson réduit bien l'accès
  // (plus de divergence où le module restait ouvert côté legacy).
  if (purchase.duree === "3mois") {
    const lessonIds = user.unlockedLessonIds ?? [];
    if (lessonIds.length > 0) {
      // Parallélise les reads (Promise.all) au lieu d'un N+1 séquentiel.
      const lessons = await Promise.all(lessonIds.map((lid) => ctx.db.get(lid)));
      for (const lesson of lessons) {
        if (
          lesson?.moduleNo &&
          (COACHING_MODULE_ORDERS as readonly number[]).includes(lesson.moduleNo)
        ) {
          set.add(lesson.moduleNo);
        }
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Renvoie l'ensemble des leçons curriculum accessibles à ce user. Sert à la
 *  timeline parcours interactive de la fiche élève /studio (granularité fine
 *  cercle par cercle). Distinct de `accessibleModules` qui pilote le gating
 *  des exos (par module entier, dérivé en runtime). */
export async function accessibleLessons(
  ctx: Ctx,
  user: Doc<"users">
): Promise<Set<Id<"curriculum">>> {
  const result = new Set<Id<"curriculum">>();

  // Admin : toutes les leçons curriculum.
  if (user.role === "admin") {
    const all = await ctx.db.query("curriculum").collect();
    for (const l of all) result.add(l._id);
    return result;
  }

  const purchase = await getActivePurchase(ctx, user);
  if (!purchase || purchase.tier !== "coaching") return result;

  // M1 implicite pour tout coaching actif.
  const m1 = await ctx.db.query("curriculum").collect();
  for (const l of m1) {
    if (l.moduleNo === 1) result.add(l._id);
  }

  // 3mois : leçons explicitement débloquées (source unique unlockedLessonIds ;
  // le legacy unlockedModules a été migré vers ce champ).
  if (purchase.duree === "3mois") {
    for (const lid of user.unlockedLessonIds ?? []) {
      result.add(lid);
    }
  }

  return result;
}

/** Auto-débloque une leçon curriculum pour ce user, avec guard tier strict.
 *  Single source of truth appelée par `coaching.completeSession`,
 *  `fireflies.attach` et `coaching.autoCompleteSessions`.
 *
 *  Règles :
 *   - Admin → no-op (a tout d'office, pas de stockage).
 *   - Pas de coaching actif → no-op (donnée propre, pas de pollution).
 *   - Leçon hors-curriculum coaching (moduleNo ∉ {1,2,3}) → no-op.
 *   - duree="1mois" + leçon hors M1 → no-op (évite la donnée sale qui
 *     deviendrait rétro-accessible si l'élève upgrade en 3mois plus tard).
 *   - Sinon → push lessonId dans `unlockedLessonIds` si pas déjà présent.
 *
 *  Idempotent (safe à appeler depuis plusieurs sources sur la même leçon).
 */
export async function maybeAutoUnlockLesson(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  lessonId: Id<"curriculum">
): Promise<{ unlocked: boolean; reason?: string }> {
  const user = await ctx.db.get(userId);
  if (!user) return { unlocked: false, reason: "user introuvable" };
  if (user.role === "admin") return { unlocked: false, reason: "admin" };

  const lesson = await ctx.db.get(lessonId);
  if (!lesson) return { unlocked: false, reason: "lesson introuvable" };
  if (!(COACHING_MODULE_ORDERS as readonly number[]).includes(lesson.moduleNo)) {
    return { unlocked: false, reason: "lesson hors curriculum coaching" };
  }

  const purchase = await getActivePurchase(ctx, user);
  if (!purchase || purchase.tier !== "coaching") {
    return { unlocked: false, reason: "pas de coaching actif" };
  }

  // Guard tier strict : 1mois ne peut débloquer que M1.
  if (purchase.duree === "1mois" && lesson.moduleNo !== 1) {
    return { unlocked: false, reason: "1mois ne peut pas débloquer M2/M3" };
  }

  const current = user.unlockedLessonIds ?? [];
  if (current.includes(lessonId)) return { unlocked: false, reason: "déjà débloquée" };

  await ctx.db.patch(userId, {
    unlockedLessonIds: [...current, lessonId],
  });
  return { unlocked: true };
}

/** Récupère le `module.order` d'un exercice (via son lesson). Renvoie null si
 *  la chaîne est cassée (exo sans leçon, leçon sans module). */
export async function moduleOrderOfExercise(
  ctx: Ctx,
  exerciseId: Id<"exercises">
): Promise<number | null> {
  const ex = await ctx.db.get(exerciseId);
  if (!ex) return null;
  const lesson = await ctx.db.get(ex.lessonId);
  if (!lesson) return null;
  const m = await ctx.db.get(lesson.moduleId);
  return m?.order ?? null;
}

/** Calcule la prochaine valeur de `unlockedModules` si tous les exos d'un
 *  module sont marqués completed pour ce user. Retourne `null` si pas de
 *  changement (déjà débloqué, ou tous les exos pas finis). Utilisé par
 *  `exerciseResponses.complete`. */
export async function maybeAutoUnlockNextModule(
  ctx: GenericMutationCtx<DataModel>,
  userId: Id<"users">,
  completedExerciseId: Id<"exercises">
): Promise<{ unlocked: number } | null> {
  const ex = await ctx.db.get(completedExerciseId);
  if (!ex) return null;
  const lesson = await ctx.db.get(ex.lessonId);
  if (!lesson) return null;
  const currentModule = await ctx.db.get(lesson.moduleId);
  if (!currentModule || typeof currentModule.order !== "number") return null;
  const currentOrder = currentModule.order;

  // Trouve le module suivant (order = currentOrder + 1).
  const allModules = await ctx.db.query("modules").collect();
  const next = allModules.find((m) => m.order === currentOrder + 1);
  if (!next) return null;

  const user = await ctx.db.get(userId);
  if (!user) return null;

  // Hors scope coaching (modules 1/2/3) → rien à débloquer côté curriculum.
  if (!(COACHING_MODULE_ORDERS as readonly number[]).includes(next.order)) {
    return null;
  }

  // Guard tier strict (cohérent avec maybeAutoUnlockLesson) : seul un coaching
  // 3 mois actif débloque M2/M3. Un élève 1 mois qui finit M1 ne débloque RIEN
  // (sinon donnée sale, rétro-accessible si l'élève upgrade plus tard).
  if (user.role !== "admin") {
    const purchase = await getActivePurchase(ctx, user);
    if (!purchase || purchase.tier !== "coaching" || purchase.duree !== "3mois") {
      return null;
    }
  }

  // Leçons curriculum du module suivant + check « déjà entièrement débloqué ».
  const nextLessons = await ctx.db
    .query("curriculum")
    .filter((q) => q.eq(q.field("moduleNo"), next.order))
    .collect();
  const currentLessonIds = new Set(
    (user.unlockedLessonIds ?? []).map((id) => id as unknown as string)
  );
  if (
    nextLessons.length > 0 &&
    nextLessons.every((l) => currentLessonIds.has(l._id as unknown as string))
  ) {
    return null;
  }

  // Vérifie que TOUS les exos du module courant sont completed pour ce user.
  const lessonsOfModule = await ctx.db
    .query("lessons")
    .withIndex("by_module", (q) => q.eq("moduleId", currentModule._id))
    .collect();
  const exoIds: Id<"exercises">[] = [];
  for (const l of lessonsOfModule) {
    const xs = await ctx.db
      .query("exercises")
      .withIndex("by_lesson", (q) => q.eq("lessonId", l._id))
      .collect();
    // Aligné avec le filtre catalogue (exerciseUrl requis + non caché) :
    // l'auto-unlock ne compte que les exos réellement exposés à l'élève.
    for (const x of xs) {
      if (x.deletedAt) continue;
      if (x.hiddenFromCoaching === true) continue;
      if (!x.exerciseUrl) continue;
      exoIds.push(x._id);
    }
  }
  if (exoIds.length === 0) return null;

  for (const xid of exoIds) {
    const resp = await ctx.db
      .query("exerciseResponses")
      .withIndex("by_user_exercise", (q) =>
        q.eq("userId", userId).eq("exerciseId", xid)
      )
      .first();
    if (!resp || !resp.completedAt) return null; // pas tout fini → on ne débloque pas
  }

  // Tous les exos du module courant sont complétés → on débloque le module
  // suivant au niveau LEÇON uniquement (source unique `unlockedLessonIds`,
  // lue par la timeline /studio ET le gating /exos via accessibleModules).
  const idsToAdd = nextLessons
    .map((l) => l._id)
    .filter((id) => !currentLessonIds.has(id as unknown as string));
  if (idsToAdd.length > 0) {
    await ctx.db.patch(userId, {
      unlockedLessonIds: [...(user.unlockedLessonIds ?? []), ...idsToAdd],
    });
  }

  return { unlocked: next.order };
}
