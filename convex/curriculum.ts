import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

// Tracklist officielle AMOUR STUDIOS (3 modules × 5 leçons).
// Titres de modules alignés sur les étapes du parcours coaching.
const DEFAULT_CURRICULUM = [
  { moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 1, lessonTitle: "Comprendre l'artiste" },
  { moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 2, lessonTitle: "Vision board" },
  { moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 3, lessonTitle: "Positionnement" },
  { moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 4, lessonTitle: "Veille concurrentielle" },
  { moduleNo: 1, moduleTitle: "Positionnement", lessonNo: 5, lessonTitle: "Différenciation & valeurs" },
  { moduleNo: 2, moduleTitle: "Contenu", lessonNo: 1, lessonTitle: "Les hooks" },
  { moduleNo: 2, moduleTitle: "Contenu", lessonNo: 2, lessonTitle: "Trends & contenus viraux" },
  { moduleNo: 2, moduleTitle: "Contenu", lessonNo: 3, lessonTitle: "Structurer son feed" },
  { moduleNo: 2, moduleTitle: "Contenu", lessonNo: 4, lessonTitle: "Planning éditorial" },
  { moduleNo: 2, moduleTitle: "Contenu", lessonNo: 5, lessonTitle: "Le script" },
  { moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 1, lessonTitle: "Le montage" },
  { moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 2, lessonTitle: "Analyser son contenu" },
  { moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 3, lessonTitle: "Collaboration & monétisation" },
  { moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 4, lessonTitle: "Les tendances" },
  { moduleNo: 3, moduleTitle: "Feedback & Analyse", lessonNo: 5, lessonTitle: "Bilan & clôture" },
];

// ============================================================================
// Curriculum coaching — tracklist modules → leçons (dédiée, séparée de la
// plateforme vidéo). Sert à taguer chaque RDV avec « Module X · Leçon Y ».
// ============================================================================

/** Liste le curriculum trié (l'UI groupe par moduleNo). */
export const listCurriculum = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const items = await ctx.db.query("curriculum").withIndex("by_order").collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

/**
 * Remplace tout le curriculum par la liste fournie (seed depuis la tracklist).
 * Recalcule `order` par (moduleNo, lessonNo).
 */
export const replaceCurriculum = mutation({
  args: {
    items: v.array(
      v.object({
        moduleNo: v.number(),
        moduleTitle: v.string(),
        lessonNo: v.number(),
        lessonTitle: v.string(),
      })
    ),
  },
  handler: async (ctx, { items }) => {
    await requireAdmin(ctx);
    // Vider l'existant.
    const existing = await ctx.db.query("curriculum").collect();
    for (const it of existing) await ctx.db.delete(it._id);
    // Réinsérer trié par (moduleNo, lessonNo).
    const sorted = [...items].sort(
      (a, b) => a.moduleNo - b.moduleNo || a.lessonNo - b.lessonNo
    );
    let order = 0;
    for (const it of sorted) {
      await ctx.db.insert("curriculum", { ...it, order: order++ });
    }
    return { count: sorted.length };
  },
});

/** Seed la tracklist par défaut (lancé via `npx convex run`). Idempotent : vide
 * puis réinsère. */
export const seedDefault = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("curriculum").collect();
    for (const it of existing) await ctx.db.delete(it._id);
    let order = 0;
    for (const it of DEFAULT_CURRICULUM) {
      await ctx.db.insert("curriculum", { ...it, order: order++ });
    }
    return { count: DEFAULT_CURRICULUM.length };
  },
});
