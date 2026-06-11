import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ============================================================================
// Amour Studios — Migrations one-shot.
// Lancées manuellement via `npx convex run migrations:<nom>` après un deploy.
// ============================================================================

/**
 * Migre le legacy `users.unlockedModules` (tableau de moduleNo) vers la source
 * unique `users.unlockedLessonIds` (toutes les leçons curriculum du module).
 *
 * Idempotent : on ne ré-ajoute jamais une leçon déjà présente. À lancer une
 * fois après le passage des helpers d'accès en « lessonIds only ». Les rows
 * sans unlockedModules ou déjà migrées sont ignorées.
 *
 * `npx convex run migrations:migrateUnlockedModulesToLessons`
 */
export const migrateUnlockedModulesToLessons = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    // Curriculum chargé une fois, indexé par moduleNo.
    const curriculum = await ctx.db.query("curriculum").collect();
    const lessonsByModule = new Map<number, Id<"curriculum">[]>();
    for (const l of curriculum) {
      const arr = lessonsByModule.get(l.moduleNo) ?? [];
      arr.push(l._id);
      lessonsByModule.set(l.moduleNo, arr);
    }

    let migrated = 0;
    let lessonsAdded = 0;
    for (const u of users) {
      const mods = u.unlockedModules ?? [];
      if (mods.length === 0) continue;
      const current = new Set(
        (u.unlockedLessonIds ?? []).map((id) => id as unknown as string)
      );
      const toAdd: Id<"curriculum">[] = [];
      for (const mod of mods) {
        for (const lid of lessonsByModule.get(mod) ?? []) {
          if (!current.has(lid as unknown as string)) {
            toAdd.push(lid);
            current.add(lid as unknown as string);
          }
        }
      }
      if (toAdd.length > 0) {
        await ctx.db.patch(u._id, {
          unlockedLessonIds: [...(u.unlockedLessonIds ?? []), ...toAdd],
        });
        migrated++;
        lessonsAdded += toAdd.length;
      }
    }
    return { migrated, lessonsAdded, scannedUsers: users.length };
  },
});
