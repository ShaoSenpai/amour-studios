"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Pill } from "@/components/ds/pill";

const MODULE_ACCENTS = [
  "#F5B820",
  "#FF6B1F",
  "#E63326",
  "#F2B8A2",
  "#2B7A6F",
  "#0D4D35",
];

type Tab = "modules" | "lessons" | "exercises";

export default function AdminContentPage() {
  const user = useQuery(api.users.current);
  const content = useQuery(api.admin.allContent);
  const [tab, setTab] = useState<Tab>("modules");

  if (user === undefined || content === undefined) {
    return (
      <main className="ds-grid-bg flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-foreground/50" />
      </main>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[2px] text-foreground/60">
          ◦ Accès refusé
        </p>
      </main>
    );
  }

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        {/* Hero */}
        <div className="ds-reveal mb-8">
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
            style={{ fontFamily: "var(--font-body)" }}
          >
            — Admin · {content.counts.modules} modules ·{" "}
            {content.counts.lessons} leçons · {content.counts.exercises}{" "}
            exercices
          </p>
          <h1
            className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Gérer le <em className="italic text-[#FF6B1F]">contenu</em>
          </h1>
        </div>

        {/* Tabs */}
        <div
          className="mb-6 flex flex-wrap gap-6 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px]"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {(
            [
              { key: "modules", label: "Modules", count: content.counts.modules },
              { key: "lessons", label: "Leçons", count: content.counts.lessons },
              {
                key: "exercises",
                label: "Exercices",
                count: content.counts.exercises,
              },
            ] as const
          ).map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`pb-1 transition-colors ${
                  isActive
                    ? "border-b-2 border-[#FF6B1F] text-foreground"
                    : "text-foreground/40 hover:text-foreground"
                }`}
                style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
              >
                ◦ {t.label} ({t.count})
              </button>
            );
          })}
        </div>

        {tab === "modules" && <ModulesView modules={content.modules} />}
        {tab === "lessons" && <LessonsView lessons={content.lessons} />}
        {tab === "exercises" && (
          <ExercisesView exercises={content.exercises} />
        )}
      </div>
    </main>
  );
}

// ─── Modules ──────────────────────────────────────────

function ModulesView({
  modules,
}: {
  modules: {
    _id: Id<"modules">;
    title: string;
    description: string;
    order: number;
    badgeLabel: string;
  }[];
}) {
  return (
    <>
      <AddModuleForm />
      <div className="flex flex-col gap-3">
        {modules.map((mod) => (
          <ModuleRow key={mod._id} module={mod} />
        ))}
      </div>
    </>
  );
}

function AddModuleForm() {
  const createModule = useMutation(api.modules.create);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      await createModule({
        title: title.trim(),
        slug,
        description: description.trim(),
        badgeLabel: badgeLabel.trim() || title.trim(),
      });
      toast.success("Module créé");
      setTitle("");
      setDescription("");
      setBadgeLabel("");
      setOpen(false);
    } catch {
      toast.error("Erreur");
    } finally {
      setCreating(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 flex items-center gap-2 border border-dashed border-foreground/20 bg-foreground/[0.02] px-4 py-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
      >
        <Plus size={12} /> Ajouter un module
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-col gap-2 border border-foreground/15 bg-foreground/[0.04] p-4"
    >
      <input
        type="text"
        placeholder="Titre du module"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F]"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        autoFocus
      />
      <input
        type="text"
        placeholder="Description courte"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F]"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
      />
      <input
        type="text"
        placeholder="Label du badge (ex: Fondations)"
        value={badgeLabel}
        onChange={(e) => setBadgeLabel(e.target.value)}
        className="border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F]"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={creating}
          className="bg-[#00FF85] px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08]"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        >
          {creating ? "…" : "Créer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="border border-foreground/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function ModuleRow({
  module: mod,
}: {
  module: {
    _id: Id<"modules">;
    title: string;
    description: string;
    order: number;
    badgeLabel: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const removeModule = useMutation(api.modules.remove);
  const accent = MODULE_ACCENTS[mod.order % MODULE_ACCENTS.length];

  return (
    <div
      className="border-l-2 border-foreground/15 bg-foreground/[0.03]"
      style={expanded ? { borderLeftColor: accent } : {}}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-foreground/[0.06]"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
      >
        <span
          className="font-mono text-[10px] uppercase tracking-[2px]"
          style={{ color: accent }}
        >
          {String(mod.order + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-lg italic"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {mod.title}
          </div>
          <div
            className="truncate font-mono text-[11px] text-foreground/60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {mod.description || "—"}
          </div>
        </div>
        <Pill variant="neutral">{mod.badgeLabel}</Pill>
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-foreground/50" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-foreground/50" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-foreground/10 p-4">
          <LessonsInModule moduleId={mod._id} accent={accent} />
          <div className="mt-4 border-t border-foreground/10 pt-3">
            <button
              onClick={async () => {
                if (!confirm("Supprimer ce module ?")) return;
                await removeModule({ moduleId: mod._id });
                toast.success("Module supprimé");
              }}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-[#E63326]/70 transition-colors hover:text-[#E63326]"
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              <Trash2 size={11} /> Supprimer le module
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LessonsInModule({
  moduleId,
  accent,
}: {
  moduleId: Id<"modules">;
  accent: string;
}) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId });
  const createLesson = useMutation(api.lessons.create);
  const removeLesson = useMutation(api.lessons.remove);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  if (lessons === undefined) {
    return (
      <p
        className="font-mono text-xs text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ …
      </p>
    );
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      await createLesson({
        moduleId,
        title: title.trim(),
        slug,
        description: description.trim(),
      });
      toast.success("Leçon créée");
      setTitle("");
      setDescription("");
      setAdding(false);
    } catch {
      toast.error("Erreur");
    }
  };

  return (
    <div>
      <p
        className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ Leçons · {lessons.length}
      </p>
      <div className="flex flex-col gap-1">
        {lessons.map((lesson) => (
          <div
            key={lesson._id}
            className="flex items-center gap-3 border-l-2 border-foreground/15 bg-background px-3 py-2"
            style={{ borderLeftColor: accent }}
          >
            <span
              className="font-mono text-[10px] text-foreground/50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {String(lesson.order + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 truncate text-sm">{lesson.title}</span>
            <span
              className="hidden font-mono text-[10px] text-foreground/50 sm:inline"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {lesson.durationSeconds > 0
                ? `${Math.floor(lesson.durationSeconds / 60)}m`
                : "—"}
            </span>
            <span
              className="hidden font-mono text-[10px] text-foreground/50 sm:inline"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {lesson.xpReward}XP
            </span>
            <a
              href={`/lesson/${lesson._id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/40 transition-colors hover:text-foreground"
              aria-label="Preview"
              style={{ minHeight: 0 }}
            >
              <ExternalLink size={11} />
            </a>
            <button
              onClick={async () => {
                if (!confirm("Supprimer cette leçon ?")) return;
                await removeLesson({ lessonId: lesson._id });
                toast.success("Leçon supprimée");
              }}
              className="text-foreground/40 transition-colors hover:text-[#E63326]"
              aria-label="Supprimer"
              style={{ minHeight: 0 }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 border border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 transition-colors hover:bg-foreground/[0.05]"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        >
          <Plus size={11} /> Ajouter une leçon
        </button>
      ) : (
        <form onSubmit={handleAdd} className="mt-2 flex flex-col gap-2">
          <input
            type="text"
            placeholder="Titre de la leçon"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border border-foreground/15 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-[#FF6B1F]"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            autoFocus
          />
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border border-foreground/15 bg-background px-3 py-1.5 font-mono text-xs outline-none focus:border-[#FF6B1F]"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-[#00FF85] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08]"
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="border border-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              ×
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Lessons flat view ─────────────────────────────────

function LessonsView({
  lessons,
}: {
  lessons: {
    _id: Id<"lessons">;
    title: string;
    order: number;
    moduleTitle: string;
    moduleOrder: number;
    moduleId: Id<"modules">;
    durationSeconds: number;
    xpReward: number;
    muxPlaybackId: string;
  }[];
}) {
  const removeLesson = useMutation(api.lessons.remove);
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? lessons.filter(
        (l) =>
          l.title.toLowerCase().includes(query.toLowerCase()) ||
          l.moduleTitle.toLowerCase().includes(query.toLowerCase())
      )
    : lessons;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 border border-foreground/15 bg-foreground/[0.03] px-3 py-2">
        <span
          className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          ◦ Filtre
        </span>
        <input
          type="text"
          placeholder="Chercher par titre ou module…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent font-mono text-xs outline-none"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr
              className="border-b border-foreground/15 text-left font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Module</th>
              <th className="py-2 pr-3">Titre</th>
              <th className="py-2 pr-3">Durée</th>
              <th className="py-2 pr-3">XP</th>
              <th className="py-2 pr-3">Statut</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const accent =
                MODULE_ACCENTS[l.moduleOrder % MODULE_ACCENTS.length];
              const placeholder = l.muxPlaybackId === "placeholder";
              return (
                <tr
                  key={l._id}
                  className="border-b border-foreground/10 transition-colors hover:bg-foreground/[0.04]"
                >
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-foreground/50" style={{ fontFamily: "var(--font-body)" }}>
                    {String(l.moduleOrder + 1).padStart(2, "0")}.
                    {String(l.order + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className="font-mono text-[10px] uppercase tracking-[1.5px]"
                      style={{ color: accent, fontFamily: "var(--font-body)" }}
                    >
                      {l.moduleTitle}
                    </span>
                  </td>
                  <td
                    className="py-2.5 pr-3 italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {l.title}
                  </td>
                  <td
                    className="py-2.5 pr-3 font-mono text-xs text-foreground/60"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {l.durationSeconds > 0
                      ? `${Math.floor(l.durationSeconds / 60)}m`
                      : "—"}
                  </td>
                  <td
                    className="py-2.5 pr-3 font-mono text-xs text-foreground/60"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {l.xpReward}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Pill variant={placeholder ? "locked" : "success"}>
                      {placeholder ? "◉ SANS VIDÉO" : "✓ PRÊTE"}
                    </Pill>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/lesson/${l._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground/40 transition-colors hover:text-foreground"
                        aria-label="Preview"
                        style={{ minHeight: 0 }}
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        onClick={async () => {
                          if (!confirm(`Supprimer "${l.title}" ?`)) return;
                          await removeLesson({ lessonId: l._id });
                          toast.success("Leçon supprimée");
                        }}
                        className="text-foreground/40 transition-colors hover:text-[#E63326]"
                        aria-label="Supprimer"
                        style={{ minHeight: 0 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center font-mono text-xs text-foreground/50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  ◦ Aucune leçon ne correspond
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Exercises flat view ───────────────────────────────

function ExercisesView({
  exercises,
}: {
  exercises: {
    _id: Id<"exercises">;
    title: string;
    type: "checkbox" | "qcm" | "text";
    exerciseUrl?: string;
    lessonTitle: string;
    moduleTitle: string;
    moduleOrder: number;
    lessonOrder: number;
  }[];
}) {
  const removeExercise = useMutation(api.exercises.remove);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "checkbox" | "qcm" | "text" | "external">("all");

  const filtered = exercises.filter((e) => {
    if (query.trim()) {
      const q = query.toLowerCase();
      if (
        !e.title.toLowerCase().includes(q) &&
        !e.lessonTitle.toLowerCase().includes(q) &&
        !e.moduleTitle.toLowerCase().includes(q)
      )
        return false;
    }
    if (typeFilter === "external" && !e.exerciseUrl) return false;
    if (typeFilter !== "all" && typeFilter !== "external" && e.type !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex flex-1 items-center gap-3 border border-foreground/15 bg-foreground/[0.03] px-3 py-2 min-w-[200px]">
          <span
            className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Filtre
          </span>
          <input
            type="text"
            placeholder="Chercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent font-mono text-xs outline-none"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "checkbox", "qcm", "text", "external"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[1.5px] ${
                typeFilter === t
                  ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                  : "border-foreground/15 bg-foreground/[0.04] text-foreground/60"
              }`}
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              {t === "all"
                ? "Tous"
                : t === "external"
                ? "URL externe"
                : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr
              className="border-b border-foreground/15 text-left font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Module / Leçon</th>
              <th className="py-2 pr-3">Titre</th>
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">URL</th>
              <th className="py-2 pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const accent =
                MODULE_ACCENTS[e.moduleOrder % MODULE_ACCENTS.length];
              return (
                <tr
                  key={e._id}
                  className="border-b border-foreground/10 transition-colors hover:bg-foreground/[0.04]"
                >
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-foreground/50" style={{ fontFamily: "var(--font-body)" }}>
                    {String(e.moduleOrder + 1).padStart(2, "0")}.
                    {String(e.lessonOrder + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2.5 pr-3 min-w-[180px]">
                    <div
                      className="font-mono text-[10px] uppercase tracking-[1.5px]"
                      style={{ color: accent, fontFamily: "var(--font-body)" }}
                    >
                      {e.moduleTitle}
                    </div>
                    <div
                      className="text-xs italic text-foreground/70"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {e.lessonTitle}
                    </div>
                  </td>
                  <td
                    className="py-2.5 pr-3 italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {e.title}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Pill variant="neutral">{e.type.toUpperCase()}</Pill>
                  </td>
                  <td className="py-2.5 pr-3">
                    {e.exerciseUrl ? (
                      <a
                        href={e.exerciseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] text-[#00FF85] hover:underline"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        EXTERNE <ExternalLink size={10} />
                      </a>
                    ) : (
                      <span
                        className="font-mono text-[10px] text-foreground/40"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <button
                      onClick={async () => {
                        if (!confirm(`Supprimer "${e.title}" ?`)) return;
                        await removeExercise({ exerciseId: e._id });
                        toast.success("Exercice supprimé");
                      }}
                      className="text-foreground/40 transition-colors hover:text-[#E63326]"
                      aria-label="Supprimer"
                      style={{ minHeight: 0 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center font-mono text-xs text-foreground/50"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  ◦ Aucun exercice ne correspond
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
