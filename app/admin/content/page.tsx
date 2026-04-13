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
  Loader2,
  ExternalLink,
  Pencil,
  X,
  Check as CheckIcon,
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
      className="border-l-2 border-foreground/15 bg-foreground/[0.03] transition-colors"
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
        <ChevronDown
          size={14}
          className={`shrink-0 text-foreground/50 transition-transform duration-500 [transition-timing-function:var(--ease-reveal)] ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div className={`ds-collapse-wrap ${expanded ? "open" : ""}`}>
        <div className="ds-collapse-inner">
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
        </div>
      </div>
    </div>
  );
}

// Champs réutilisables DS ───────────────────────────────

function DSInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F] ${className}`}
      style={{ minHeight: 0, fontFamily: "var(--font-body)", ...(rest.style ?? {}) }}
    />
  );
}

function DSTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F] resize-none ${className}`}
      style={{ fontFamily: "var(--font-body)", ...(rest.style ?? {}) }}
    />
  );
}

function DSLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
      style={{ fontFamily: "var(--font-body)" }}
    >
      ◦ {children}
    </span>
  );
}

function DSPrimaryBtn({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="bg-[#00FF85] px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08] transition-all hover:tracking-[3px] disabled:opacity-50"
      style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
    >
      {children}
    </button>
  );
}

function DSGhostBtn({
  children,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="border border-foreground/20 bg-foreground/[0.04] px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/70 transition-colors hover:bg-foreground/[0.08]"
      style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
    >
      {children}
    </button>
  );
}

// Lessons & exercises ───────────────────────────────

type LessonRow = {
  _id: Id<"lessons">;
  moduleId: Id<"modules">;
  title: string;
  description: string;
  order: number;
  muxPlaybackId: string;
  muxAssetId: string;
  durationSeconds: number;
  xpReward: number;
  previewAccess?: boolean;
};

function LessonsInModule({
  moduleId,
  accent,
}: {
  moduleId: Id<"modules">;
  accent: string;
}) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId });
  const [adding, setAdding] = useState(false);

  if (lessons === undefined) {
    return <DSLabel>…</DSLabel>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <DSLabel>Leçons · {lessons.length}</DSLabel>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 transition-colors hover:text-foreground"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            <Plus size={11} /> Nouvelle leçon
          </button>
        )}
      </div>

      <div className={`ds-collapse-wrap ${adding ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="mb-3">
            <LessonForm
              moduleId={moduleId}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {lessons.map((lesson) => (
          <LessonRowExpandable key={lesson._id} lesson={lesson} accent={accent} />
        ))}
      </div>
    </div>
  );
}

function LessonRowExpandable({
  lesson,
  accent,
}: {
  lesson: LessonRow;
  accent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const removeLesson = useMutation(api.lessons.remove);

  return (
    <div className="border-l-2 bg-background" style={{ borderLeftColor: accent }}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="font-mono text-[10px] text-foreground/50 hover:text-foreground"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          aria-label={expanded ? "Replier" : "Déplier"}
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-500 [transition-timing-function:var(--ease-reveal)] ${expanded ? "rotate-180" : "-rotate-90"}`}
          />
        </button>
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
        <Pill variant={lesson.muxPlaybackId === "placeholder" ? "locked" : "success"}>
          {lesson.muxPlaybackId === "placeholder" ? "◉ SANS VIDÉO" : "✓ VIDÉO"}
        </Pill>
        <button
          onClick={() => setEditing(!editing)}
          className="text-foreground/40 transition-colors hover:text-foreground"
          aria-label="Éditer"
          style={{ minHeight: 0 }}
        >
          <Pencil size={11} />
        </button>
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

      {/* Edit form */}
      <div className={`ds-collapse-wrap ${editing ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="border-t border-foreground/10 p-4">
            <LessonForm
              moduleId={lesson.moduleId}
              lesson={lesson}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      </div>

      {/* Exercises list */}
      <div className={`ds-collapse-wrap ${expanded ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="border-t border-foreground/10 p-4">
            <ExercisesInLesson lessonId={lesson._id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonForm({
  moduleId,
  lesson,
  onDone,
  onCancel,
}: {
  moduleId: Id<"modules">;
  lesson?: LessonRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createLesson = useMutation(api.lessons.create);
  const updateLesson = useMutation(api.lessons.update);
  const isEdit = !!lesson;

  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [muxPlaybackId, setMuxPlaybackId] = useState(
    lesson?.muxPlaybackId === "placeholder" ? "" : lesson?.muxPlaybackId ?? ""
  );
  const [muxAssetId, setMuxAssetId] = useState(
    lesson?.muxAssetId === "placeholder" ? "" : lesson?.muxAssetId ?? ""
  );
  const [durationMin, setDurationMin] = useState(
    lesson ? String(Math.round(lesson.durationSeconds / 60)) : ""
  );
  const [xpReward, setXpReward] = useState(String(lesson?.xpReward ?? 100));
  const [previewAccess, setPreviewAccess] = useState(!!lesson?.previewAccess);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const durationSeconds = Math.max(0, parseInt(durationMin || "0", 10) * 60);
      const xp = Math.max(0, parseInt(xpReward || "0", 10));

      if (isEdit && lesson) {
        await updateLesson({
          lessonId: lesson._id,
          title: title.trim(),
          description: description.trim(),
          muxPlaybackId: muxPlaybackId.trim() || "placeholder",
          muxAssetId: muxAssetId.trim() || "placeholder",
          durationSeconds,
          xpReward: xp,
          previewAccess,
        });
        toast.success("Leçon mise à jour");
      } else {
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        await createLesson({
          moduleId,
          title: title.trim(),
          slug,
          description: description.trim(),
          muxPlaybackId: muxPlaybackId.trim() || undefined,
          muxAssetId: muxAssetId.trim() || undefined,
          durationSeconds: durationSeconds || undefined,
          xpReward: xp || undefined,
          previewAccess: previewAccess || undefined,
        });
        toast.success("Leçon créée");
      }
      onDone();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border border-foreground/15 bg-foreground/[0.03] p-4"
    >
      <div className="mb-1 flex items-center justify-between">
        <DSLabel>{isEdit ? "Éditer la leçon" : "Nouvelle leçon"}</DSLabel>
        <button
          type="button"
          onClick={onCancel}
          className="text-foreground/40 hover:text-foreground"
          aria-label="Fermer"
          style={{ minHeight: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <DSLabel>Titre *</DSLabel>
          <DSInput
            placeholder="Ex: Structurer un carousel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <DSLabel>XP Reward</DSLabel>
          <DSInput
            type="number"
            min={0}
            placeholder="100"
            value={xpReward}
            onChange={(e) => setXpReward(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <DSLabel>Description</DSLabel>
        <DSTextarea
          placeholder="Sous-titre court, ~1 phrase"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-[2fr_2fr_1fr]">
        <div className="flex flex-col gap-1">
          <DSLabel>Mux Playback ID</DSLabel>
          <DSInput
            placeholder="ex: abcd1234XYZ (ou vide)"
            value={muxPlaybackId}
            onChange={(e) => setMuxPlaybackId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <DSLabel>Mux Asset ID</DSLabel>
          <DSInput
            placeholder="ex: asset_XYZ (ou vide)"
            value={muxAssetId}
            onChange={(e) => setMuxAssetId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <DSLabel>Durée (min)</DSLabel>
          <DSInput
            type="number"
            min={0}
            placeholder="10"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
          />
        </div>
      </div>

      {/* Preview free toggle */}
      <label className="flex items-center gap-3 border border-foreground/15 bg-foreground/[0.03] p-3 cursor-pointer hover:bg-foreground/[0.05]">
        <input
          type="checkbox"
          checked={previewAccess}
          onChange={(e) => setPreviewAccess(e.target.checked)}
          className="size-4 accent-[#00FF85]"
          style={{ minHeight: 0 }}
        />
        <div className="flex-1">
          <div
            className="font-mono text-[11px] uppercase tracking-[1.5px] text-foreground"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ ACCÈS GRATUIT (PREVIEW)
          </div>
          <div
            className="mt-0.5 font-mono text-[10px] text-foreground/55"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Accessible aux users non-payants — sert d&apos;upsell. Recommandé pour 1 leçon (ex: Vision Board).
          </div>
        </div>
      </label>

      <div className="flex gap-2">
        <DSPrimaryBtn type="submit" disabled={saving || !title.trim()}>
          {saving ? "…" : isEdit ? "ENREGISTRER" : "CRÉER"}
        </DSPrimaryBtn>
        <DSGhostBtn onClick={onCancel}>ANNULER</DSGhostBtn>
      </div>
    </form>
  );
}

// ─── Exercises ───────────────────────────────

type ExerciseRow = {
  _id: Id<"exercises">;
  title: string;
  type: "checkbox" | "qcm" | "text";
  contentMarkdown: string;
  exerciseUrl?: string;
  config?: string;
};

function ExercisesInLesson({ lessonId }: { lessonId: Id<"lessons"> }) {
  const exercises = useQuery(api.exercises.listByLesson, { lessonId });
  const [adding, setAdding] = useState(false);

  if (exercises === undefined) return <DSLabel>…</DSLabel>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <DSLabel>Exercices · {exercises.length}</DSLabel>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 transition-colors hover:text-foreground"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            <Plus size={11} /> Nouvel exercice
          </button>
        )}
      </div>

      <div className={`ds-collapse-wrap ${adding ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="mb-3">
            <ExerciseForm
              lessonId={lessonId}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {exercises.map((ex) => (
          <ExerciseRowExpandable key={ex._id} exercise={ex as ExerciseRow} lessonId={lessonId} />
        ))}
      </div>
    </div>
  );
}

function ExerciseRowExpandable({
  exercise,
  lessonId,
}: {
  exercise: ExerciseRow;
  lessonId: Id<"lessons">;
}) {
  const [editing, setEditing] = useState(false);
  const removeExercise = useMutation(api.exercises.remove);
  const isExternal = !!exercise.exerciseUrl;

  return (
    <div className="border border-foreground/10 bg-foreground/[0.02]">
      <div className="flex items-center gap-3 px-3 py-2">
        <Pill variant={isExternal ? "success" : "neutral"}>
          {isExternal ? "URL" : exercise.type.toUpperCase()}
        </Pill>
        <span className="flex-1 truncate text-sm">{exercise.title}</span>
        {isExternal && (
          <a
            href={exercise.exerciseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00FF85] transition-colors hover:text-[#00FF85]/80"
            aria-label="Ouvrir l'exo externe"
            style={{ minHeight: 0 }}
          >
            <ExternalLink size={11} />
          </a>
        )}
        <button
          onClick={() => setEditing(!editing)}
          className="text-foreground/40 transition-colors hover:text-foreground"
          aria-label="Éditer"
          style={{ minHeight: 0 }}
        >
          {editing ? <CheckIcon size={11} /> : <Pencil size={11} />}
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Supprimer "${exercise.title}" ?`)) return;
            await removeExercise({ exerciseId: exercise._id });
            toast.success("Exercice supprimé");
          }}
          className="text-foreground/40 transition-colors hover:text-[#E63326]"
          aria-label="Supprimer"
          style={{ minHeight: 0 }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      <div className={`ds-collapse-wrap ${editing ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="border-t border-foreground/10 p-4">
            <ExerciseForm
              lessonId={lessonId}
              exercise={exercise}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExerciseForm({
  lessonId,
  exercise,
  onDone,
  onCancel,
}: {
  lessonId: Id<"lessons">;
  exercise?: ExerciseRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createExercise = useMutation(api.exercises.create);
  const updateExercise = useMutation(api.exercises.update);
  const isEdit = !!exercise;

  const [title, setTitle] = useState(exercise?.title ?? "");
  const [type, setType] = useState<"checkbox" | "qcm" | "text">(
    exercise?.type ?? "text"
  );
  const [contentMarkdown, setContentMarkdown] = useState(
    exercise?.contentMarkdown ?? ""
  );
  const [exerciseUrl, setExerciseUrl] = useState(exercise?.exerciseUrl ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (isEdit && exercise) {
        await updateExercise({
          exerciseId: exercise._id,
          title: title.trim(),
          type,
          contentMarkdown: contentMarkdown.trim(),
          exerciseUrl: exerciseUrl.trim() || undefined,
        });
        toast.success("Exercice mis à jour");
      } else {
        await createExercise({
          lessonId,
          title: title.trim(),
          type,
          contentMarkdown: contentMarkdown.trim(),
          exerciseUrl: exerciseUrl.trim() || undefined,
        });
        toast.success("Exercice créé");
      }
      onDone();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border border-foreground/15 bg-foreground/[0.03] p-4"
    >
      <div className="mb-1 flex items-center justify-between">
        <DSLabel>{isEdit ? "Éditer l'exercice" : "Nouvel exercice"}</DSLabel>
        <button
          type="button"
          onClick={onCancel}
          className="text-foreground/40 hover:text-foreground"
          aria-label="Fermer"
          style={{ minHeight: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1">
          <DSLabel>Titre *</DSLabel>
          <DSInput
            placeholder="Ex: Écris ton premier hook"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <DSLabel>Type</DSLabel>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F]"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            <option value="text">Text</option>
            <option value="checkbox">Checkbox</option>
            <option value="qcm">QCM</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <DSLabel>Consigne / contenu</DSLabel>
        <DSTextarea
          placeholder="Instructions pour l'élève, markdown supporté"
          value={contentMarkdown}
          onChange={(e) => setContentMarkdown(e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-1">
        <DSLabel>URL externe (iframe Notion/Tally/Figma) — optionnel</DSLabel>
        <DSInput
          type="url"
          placeholder="https://tally.so/r/... ou https://notion.so/..."
          value={exerciseUrl}
          onChange={(e) => setExerciseUrl(e.target.value)}
        />
        <p
          className="mt-1 font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40"
          style={{ fontFamily: "var(--font-body)" }}
        >
          ◦ Si rempli, l&apos;exo sera affiché en iframe dans le panneau de la leçon
        </p>
      </div>

      <div className="flex gap-2">
        <DSPrimaryBtn type="submit" disabled={saving || !title.trim()}>
          {saving ? "…" : isEdit ? "ENREGISTRER" : "CRÉER"}
        </DSPrimaryBtn>
        <DSGhostBtn onClick={onCancel}>ANNULER</DSGhostBtn>
      </div>
    </form>
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
