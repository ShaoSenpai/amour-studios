"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import Link from "next/link";

// ============================================================================
// Amour Studios — /admin/content
// ----------------------------------------------------------------------------
// Gestion des modules + lessons + exercises.
// Chaque module est expansible pour voir/ajouter ses lessons.
// ============================================================================

export default function AdminContentPage() {
  const user = useQuery(api.users.current);
  const modules = useQuery(api.modules.list);

  if (user === undefined || modules === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </main>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Accès refusé</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contenu</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {modules.length} module{modules.length > 1 ? "s" : ""}
          </p>
        </div>
        <Badge variant="outline" className="border-accent/30 text-accent">
          Admin
        </Badge>
      </div>

      {/* Add module form */}
      <AddModuleForm />

      {/* Modules list */}
      <div className="flex flex-col gap-4 mt-6">
        {modules.map((mod) => (
          <ModuleCard key={mod._id} module={mod} />
        ))}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────
// Add Module Form
// ────────────────────────────────────────────────────
function AddModuleForm() {
  const createModule = useMutation(api.modules.create);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

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
    } catch (error) {
      toast.error("Erreur lors de la création");
      console.error(error);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Ajouter un module
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
    >
      <input
        type="text"
        placeholder="Titre du module"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        autoFocus
      />
      <input
        type="text"
        placeholder="Description courte"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      />
      <input
        type="text"
        placeholder="Label du badge (ex: 'Module 1')"
        value={badgeLabel}
        onChange={(e) => setBadgeLabel(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Créer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────
// Module Card (expandable with lessons)
// ────────────────────────────────────────────────────
function ModuleCard({
  module: mod,
}: {
  module: { _id: Id<"modules">; title: string; description: string; order: number; badgeLabel: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const removeModule = useMutation(api.modules.remove);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Module header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs text-muted-foreground font-mono w-6">
          {mod.order + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{mod.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {mod.description}
          </p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {mod.badgeLabel}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {/* Expanded: lessons */}
      {expanded && (
        <div className="border-t border-border p-4">
          <LessonsList moduleId={mod._id} />
          <div className="mt-3 pt-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive text-xs"
              onClick={async () => {
                await removeModule({ moduleId: mod._id });
                toast.success("Module supprimé");
              }}
            >
              Supprimer ce module
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// Lessons list inside a module
// ────────────────────────────────────────────────────
function LessonsList({ moduleId }: { moduleId: Id<"modules"> }) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId });
  const createLesson = useMutation(api.lessons.create);
  const removeLesson = useMutation(api.lessons.remove);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expandedLesson, setExpandedLesson] = useState<Id<"lessons"> | null>(
    null
  );

  if (lessons === undefined) {
    return <p className="text-xs text-muted-foreground">Chargement...</p>;
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
    } catch (error) {
      toast.error("Erreur");
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        Leçons ({lessons.length})
      </p>

      {lessons.map((lesson) => (
        <div key={lesson._id} className="rounded-md border border-border/50">
          <div
            className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/20"
            onClick={() =>
              setExpandedLesson(
                expandedLesson === lesson._id ? null : lesson._id
              )
            }
          >
            <span className="text-xs text-muted-foreground font-mono w-5">
              {lesson.order + 1}.
            </span>
            <p className="text-sm flex-1 truncate">{lesson.title}</p>
            <span className="text-xs text-muted-foreground">
              {lesson.durationSeconds > 0
                ? `${Math.floor(lesson.durationSeconds / 60)}min`
                : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {lesson.xpReward}xp
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive text-xs h-6 px-2"
              onClick={async (e) => {
                e.stopPropagation();
                await removeLesson({ lessonId: lesson._id });
                toast.success("Leçon supprimée");
              }}
            >
              ×
            </Button>
          </div>

          {expandedLesson === lesson._id && (
            <div className="border-t border-border/50 p-3">
              <ExercisesList lessonId={lesson._id} />
            </div>
          )}
        </div>
      ))}

      {!adding ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs w-fit"
          onClick={() => setAdding(true)}
        >
          + Ajouter une leçon
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 mt-1">
          <input
            type="text"
            placeholder="Titre de la leçon"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-sm"
            autoFocus
          />
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="text-xs">
              Ajouter
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setAdding(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
// Exercises list inside a lesson
// ────────────────────────────────────────────────────
function ExercisesList({ lessonId }: { lessonId: Id<"lessons"> }) {
  const exercises = useQuery(api.exercises.listByLesson, { lessonId });
  const createExercise = useMutation(api.exercises.create);
  const removeExercise = useMutation(api.exercises.remove);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"checkbox" | "qcm" | "text">("checkbox");

  if (exercises === undefined) {
    return <p className="text-xs text-muted-foreground">...</p>;
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createExercise({
        lessonId,
        title: title.trim(),
        contentMarkdown: "",
        type,
      });
      toast.success("Exercice créé");
      setTitle("");
      setAdding(false);
    } catch (error) {
      toast.error("Erreur");
      console.error(error);
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Exercices ({exercises.length})
      </p>

      {exercises.map((ex) => (
        <div
          key={ex._id}
          className="flex items-center gap-2 py-1.5 text-sm"
        >
          <Badge variant="outline" className="text-[10px] shrink-0">
            {ex.type}
          </Badge>
          <span className="flex-1 truncate">{ex.title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive text-xs h-5 px-1"
            onClick={async () => {
              await removeExercise({ exerciseId: ex._id });
              toast.success("Exercice supprimé");
            }}
          >
            ×
          </Button>
        </div>
      ))}

      {!adding ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs w-fit mt-1"
          onClick={() => setAdding(true)}
        >
          + Exercice
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="flex items-center gap-2 mt-2">
          <input
            type="text"
            placeholder="Titre"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            autoFocus
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="checkbox">Checkbox</option>
            <option value="qcm">QCM</option>
            <option value="text">Texte</option>
          </select>
          <Button type="submit" size="sm" className="text-xs h-7">
            OK
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setAdding(false)}
          >
            ×
          </Button>
        </form>
      )}
    </div>
  );
}
