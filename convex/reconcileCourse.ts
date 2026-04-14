import { internalMutation } from "./_generated/server";

// ============================================================================
// Reconciliation one-shot : aligne les modules/leçons Convex sur le Drive
// original de Walid (titres ton/tes, ajoute leçons manquantes, retire
// l'Introduction en trop du Module 1).
// Idempotent : safe à relancer, ne recrée pas les leçons déjà présentes
// par slug.
// ============================================================================

type ChangeLog = {
  op: "rename" | "delete" | "insert" | "shift-order" | "skip";
  lessonId?: string;
  slug: string;
  detail: string;
};

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const log: ChangeLog[] = [];
    const modules = await ctx.db.query("modules").collect();
    const byOrder = new Map(modules.map((m) => [m.order, m]));

    const m1 = byOrder.get(1); // Positionnement
    const m4 = byOrder.get(4); // Mindset
    const m5 = byOrder.get(5); // Communauté & suite

    if (!m1 || !m4 || !m5) throw new Error("Modules 1/4/5 introuvables");

    // ─── A. Renommages ────────────────────────────────────────────
    const renames: Array<{
      moduleId: typeof m1._id;
      matchSlug: string;
      newTitle: string;
      newSlug: string;
    }> = [
      // M1 Positionnement : "mon/mes" → "ton/tes", noms alignés Drive
      {
        moduleId: m1._id,
        matchSlug: "mon-positionnement",
        newTitle: "Ton positionnement",
        newSlug: "ton-positionnement",
      },
      {
        moduleId: m1._id,
        matchSlug: "comment-faire-sa-veille-concurrentielle",
        newTitle: "Veille concurrentielle",
        newSlug: "veille-concurrentielle",
      },
      {
        moduleId: m1._id,
        matchSlug: "mes-valeurs-et-ce-que-j-ai-envie-de-montrer",
        newTitle: "Tes valeurs",
        newSlug: "tes-valeurs",
      },
      {
        moduleId: m1._id,
        matchSlug: "mon-viewer-ideal-persona",
        newTitle: "Ton viewer idéal",
        newSlug: "ton-viewer-ideal",
      },
      {
        moduleId: m1._id,
        matchSlug: "en-quoi-je-suis-different",
        newTitle: "Ta différenciation",
        newSlug: "ta-differenciation",
      },
      // M4 Mindset : 2 titres faux
      {
        moduleId: m4._id,
        matchSlug: "ne-regarde-pas-les-vues",
        newTitle: "Engagement",
        newSlug: "engagement",
      },
      {
        moduleId: m4._id,
        matchSlug: "ne-saute-pas-les-etapes",
        newTitle: "Fondations",
        newSlug: "fondations",
      },
    ];

    for (const r of renames) {
      const lesson = await ctx.db
        .query("lessons")
        .withIndex("by_slug", (q) => q.eq("slug", r.matchSlug))
        .first();
      if (!lesson) {
        log.push({
          op: "skip",
          slug: r.matchSlug,
          detail: "déjà renommée ou absente",
        });
        continue;
      }
      await ctx.db.patch(lesson._id, {
        title: r.newTitle,
        slug: r.newSlug,
        updatedAt: Date.now(),
      });
      log.push({
        op: "rename",
        lessonId: lesson._id,
        slug: r.newSlug,
        detail: `${r.matchSlug} → ${r.newSlug} ("${r.newTitle}")`,
      });
    }

    // ─── C. Suppression Introduction du Module 1 ────────────────
    const intro = await ctx.db
      .query("lessons")
      .withIndex("by_slug", (q) => q.eq("slug", "introduction"))
      .filter((q) => q.eq(q.field("moduleId"), m1._id))
      .first();
    if (intro) {
      // Supprime les exos + progress liés d'abord
      const exos = await ctx.db
        .query("exercises")
        .withIndex("by_lesson", (q) => q.eq("lessonId", intro._id))
        .collect();
      for (const e of exos) await ctx.db.delete(e._id);
      const prog = await ctx.db
        .query("progress")
        .filter((q) => q.eq(q.field("lessonId"), intro._id))
        .collect();
      for (const p of prog) await ctx.db.delete(p._id);
      await ctx.db.delete(intro._id);
      log.push({
        op: "delete",
        lessonId: intro._id,
        slug: "introduction",
        detail: `supprimée (+ ${exos.length} exo, ${prog.length} progress)`,
      });

      // Décale les orders : toutes les leçons du M1 avec order > introOrder --
      const m1Lessons = await ctx.db
        .query("lessons")
        .withIndex("by_module", (q) => q.eq("moduleId", m1._id))
        .collect();
      for (const l of m1Lessons) {
        if (l.order > intro.order) {
          await ctx.db.patch(l._id, { order: l.order - 1, updatedAt: Date.now() });
          log.push({
            op: "shift-order",
            lessonId: l._id,
            slug: l.slug,
            detail: `M1 order ${l.order} → ${l.order - 1}`,
          });
        }
      }
    } else {
      log.push({
        op: "skip",
        slug: "introduction",
        detail: "déjà supprimée ou absente",
      });
    }

    // ─── B. Ajout des 2 leçons manquantes du Module 5 ───────────
    // Structure cible Drive :
    //   V01 30JOURS  ← à ajouter (order 0)
    //   V02 DISCORD  (actuellement order 0 en Convex → devient 1)
    //   V03 PARTAGE  (1 → 2)
    //   V04 AJUSTER  (2 → 3)
    //   V05 RESEAU   (3 → 4)
    //   V06 SUITE    ← à ajouter (order 5)

    const m5Lessons = await ctx.db
      .query("lessons")
      .withIndex("by_module", (q) => q.eq("moduleId", m5._id))
      .collect();

    const has30jours = m5Lessons.some((l) => l.slug === "30-jours");
    const hasSuite = m5Lessons.some((l) => l.slug === "suite");

    if (!has30jours) {
      // Décaler tous les order +1 sur M5
      const sorted = [...m5Lessons].sort((a, b) => b.order - a.order);
      for (const l of sorted) {
        await ctx.db.patch(l._id, { order: l.order + 1, updatedAt: Date.now() });
        log.push({
          op: "shift-order",
          lessonId: l._id,
          slug: l.slug,
          detail: `M5 order ${l.order} → ${l.order + 1}`,
        });
      }
      const newId = await ctx.db.insert("lessons", {
        moduleId: m5._id,
        title: "30 Jours",
        slug: "30-jours",
        description: "Ton plan d'action sur 30 jours.",
        order: 0,
        durationSeconds: 0,
        xpReward: 100,
        muxAssetId: "placeholder",
        muxPlaybackId: "placeholder",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      log.push({
        op: "insert",
        lessonId: newId,
        slug: "30-jours",
        detail: "M5 order 0 (30 Jours)",
      });
    } else {
      log.push({
        op: "skip",
        slug: "30-jours",
        detail: "déjà présente",
      });
    }

    if (!hasSuite) {
      // Recharge m5Lessons pour obtenir le max order après décalage
      const refreshed = await ctx.db
        .query("lessons")
        .withIndex("by_module", (q) => q.eq("moduleId", m5._id))
        .collect();
      const maxOrder = refreshed.reduce((a, b) => (b.order > a ? b.order : a), -1);
      const newId = await ctx.db.insert("lessons", {
        moduleId: m5._id,
        title: "Suite",
        slug: "suite",
        description: "Les prochaines étapes après la formation.",
        order: maxOrder + 1,
        durationSeconds: 0,
        xpReward: 100,
        muxAssetId: "placeholder",
        muxPlaybackId: "placeholder",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      log.push({
        op: "insert",
        lessonId: newId,
        slug: "suite",
        detail: `M5 order ${maxOrder + 1} (Suite)`,
      });
    } else {
      log.push({
        op: "skip",
        slug: "suite",
        detail: "déjà présente",
      });
    }

    return log;
  },
});
