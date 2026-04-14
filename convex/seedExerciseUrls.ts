import { internalMutation } from "./_generated/server";

const BASE = "https://amourstudios.fr/EXOS_LANDING";

// Mapping : slug de la leçon en prod → URL de l'exo interactif HTML
const MAPPINGS: Array<{ lessonSlug: string; url: string; title: string }> = [
  {
    lessonSlug: "vision-board",
    title: "Mon Vision Board",
    url: `${BASE}/MODULE01/VIDEO01/AMOUR_STUDIOS_M01_V01_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "mon-positionnement",
    title: "Mon Positionnement",
    url: `${BASE}/MODULE01/VIDEO02/AMOUR_STUDIOS_M01_V02_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "comment-faire-sa-veille-concurrentielle",
    title: "Ma Veille Concurrentielle",
    url: `${BASE}/MODULE01/VIDEO03/AMOUR_STUDIOS_M01_V03_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "mes-valeurs-et-ce-que-j-ai-envie-de-montrer",
    title: "Mes Valeurs",
    url: `${BASE}/MODULE01/VIDEO04/AMOUR_STUDIOS_M01_V04_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "mon-viewer-ideal-persona",
    title: "Mon Viewer Idéal",
    url: `${BASE}/MODULE01/VIDEO05/AMOUR_STUDIOS_M01_V05_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "en-quoi-je-suis-different",
    title: "Ma Différenciation",
    url: `${BASE}/MODULE01/VIDEO06/AMOUR_STUDIOS_M01_V06_EXERCICE_INTERACTIF.html`,
  },
  {
    lessonSlug: "google-agenda-organiser-son-temps",
    title: "Configuration Google Agenda",
    url: `${BASE}/MODULE02/VIDEO04/AMOUR_STUDIOS_M02_V04_GOOGLE_AGENDA%20%281%29.html`,
  },
  {
    lessonSlug: "comment-avoir-toujours-des-bonnes-idees",
    title: "Ma banque d'idées",
    url: `${BASE}/MODULE02/VIDEO05/AMOUR_STUDIOS_M02_V05_BANQUE_IDEES.html`,
  },
  {
    lessonSlug: "le-script-video",
    title: "Mon premier script",
    url: `${BASE}/MODULE02/VIDEO08/AMOUR_STUDIOS_M02_V08_EXERCICE_INTERACTIF%20%281%29.html`,
  },
  {
    lessonSlug: "les-croyances-limitantes",
    title: "Déconstruire mes croyances",
    url: `${BASE}/MODULE04/VIDEO01/AMOUR_STUDIOS_M04_V01_CROYANCES.html`,
  },
];

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const results: Array<{
      slug: string;
      status: "updated" | "created" | "missing-lesson";
      exerciseId?: string;
    }> = [];

    for (const { lessonSlug, url, title } of MAPPINGS) {
      const lesson = await ctx.db
        .query("lessons")
        .withIndex("by_slug", (q) => q.eq("slug", lessonSlug))
        .first();

      if (!lesson) {
        results.push({ slug: lessonSlug, status: "missing-lesson" });
        continue;
      }

      const existing = await ctx.db
        .query("exercises")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .collect();

      const now = Date.now();
      if (existing.length > 0) {
        // Update le premier exo avec l'URL (sans toucher aux autres champs)
        const first = existing[0];
        await ctx.db.patch(first._id, { exerciseUrl: url, updatedAt: now });
        results.push({ slug: lessonSlug, status: "updated", exerciseId: first._id });
      } else {
        // Crée un nouvel exo avec l'URL
        const exerciseId = await ctx.db.insert("exercises", {
          lessonId: lesson._id,
          title,
          contentMarkdown: "",
          type: "text",
          exerciseUrl: url,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ slug: lessonSlug, status: "created", exerciseId });
      }
    }

    return results;
  },
});
