# Lesson Page Phase 2 — Implementation Plan

> **For agentic workers:** Use executing-plans. Steps use `- [ ]`.

**Goal:** Appliquer le DS à la page leçon avec layout immersive dark + dock vertical + panneaux glissants (Exos 65%, Notes/Coms/Module 420px).

**Tech:** Next.js 16, Tailwind v4, React 19. Réutilise `components/ds/` phase 1 + composants métier existants.

**Spec:** `docs/superpowers/specs/2026-04-13-lesson-page-immersive-design.md`

---

## Task 1 — Keyframes + classes panneau (globals.css)

**Files:** Modify `app/globals.css` (fin du fichier, avant la dernière `}`)

- [ ] Step 1. Ajouter après le bloc `@keyframes ds-pulse` :

```css
  @keyframes ds-panel-slide {
    from { transform: translateX(100%); opacity: 0.6; }
    to { transform: translateX(0); opacity: 1; }
  }
  .ds-panel {
    animation: ds-panel-slide 600ms cubic-bezier(.2, .9, .3, 1) both;
  }
```

- [ ] Step 2. `npm run build` → ok, `git add app/globals.css && git commit -m "feat(lesson): keyframes panneau glissant"`

## Task 2 — `LessonMetaBar`

**Files:** Create `components/ds/lesson/lesson-meta-bar.tsx`

- [ ] Step 1. Créer le fichier :

```tsx
"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function LessonMetaBar({
  moduleTitle,
  moduleAccent,
  lessonOrder,
  lessonTotal,
  xpReward,
}: {
  moduleTitle: string;
  moduleAccent?: string;
  lessonOrder: number;
  lessonTotal: number;
  xpReward: number;
}) {
  return (
    <div className="flex items-center justify-between border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[1.5px]">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-foreground/50 transition-colors hover:text-foreground"
      >
        <ChevronLeft size={12} />
        Dashboard
      </Link>
      <div className="flex items-center gap-3 text-foreground/60">
        <span
          className="italic text-[14px]"
          style={{ fontFamily: "var(--font-serif)", color: moduleAccent ?? "#FF6B1F" }}
        >
          {moduleTitle}
        </span>
        <span>·</span>
        <span>LEÇON {String(lessonOrder).padStart(2, "0")} / {String(lessonTotal).padStart(2, "0")}</span>
        <span>·</span>
        <span className="border border-[rgba(0,255,133,0.35)] bg-[rgba(0,255,133,0.15)] px-2 py-[2px] text-[#00FF85]">
          +{xpReward} XP
        </span>
      </div>
    </div>
  );
}
```

- [ ] Step 2. Build + commit :

```bash
npm run build && git add components/ds/lesson/ && git commit -m "feat(lesson): composant LessonMetaBar"
```

## Task 3 — `LessonDock` + `LessonPanel`

**Files:** Create `components/ds/lesson/lesson-dock.tsx`, Create `components/ds/lesson/lesson-panel.tsx`

- [ ] Step 1. Créer `components/ds/lesson/lesson-panel.tsx` :

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type PanelWidth = "narrow" | "wide";

export function LessonPanel({
  open,
  onClose,
  title,
  italicWord,
  width = "narrow",
  headerRight,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  italicWord?: string;
  width?: PanelWidth;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [b, a] = title.split(italicWord);
    titleNode = (
      <>
        {b}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {a}
      </>
    );
  }

  return (
    <aside
      className={cn(
        "ds-panel fixed right-0 top-0 z-40 flex h-screen flex-col overflow-y-auto border-l border-foreground/15 bg-background",
        width === "wide"
          ? "w-full md:w-[65vw]"
          : "w-full md:w-[420px]"
      )}
    >
      <div className="sticky top-0 z-10 flex items-baseline justify-between border-b border-foreground/15 bg-background/90 px-6 py-4 backdrop-blur-md">
        <h2
          className="text-3xl font-normal leading-none"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {titleNode}
        </h2>
        <div className="flex items-center gap-2">
          {headerRight}
          <button
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="flex h-8 items-center justify-center gap-1 border border-foreground/20 bg-foreground/[0.04] px-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:bg-foreground/[0.08]"
            style={{ minHeight: 0 }}
          >
            <X size={12} />
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>
      </div>
      <div className="flex-1 px-6 py-6">{children}</div>
    </aside>
  );
}
```

- [ ] Step 2. Créer `components/ds/lesson/lesson-dock.tsx` :

```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type DockKey = "exos" | "notes" | "comments" | "module";

export function LessonDock({
  active,
  onSelect,
  counts,
}: {
  active: DockKey | null;
  onSelect: (k: DockKey | null) => void;
  counts: Partial<Record<DockKey, number>>;
}) {
  const items: { key: DockKey; icon: string; label: string }[] = [
    { key: "exos", icon: "✎", label: "Exos" },
    { key: "notes", icon: "¶", label: "Notes" },
    { key: "comments", icon: "◌", label: "Com." },
    { key: "module", icon: "≡", label: "Module" },
  ];

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") { e.preventDefault(); onSelect("exos"); }
      if (e.key === "2") { e.preventDefault(); onSelect("notes"); }
      if (e.key === "3") { e.preventDefault(); onSelect("comments"); }
      if (e.key === "4") { e.preventDefault(); onSelect("module"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onSelect]);

  return (
    <div
      className={cn(
        "fixed z-30",
        "bottom-2 left-1/2 -translate-x-1/2 flex-row gap-2 md:bottom-auto md:left-auto md:right-4 md:top-1/2 md:-translate-x-0 md:-translate-y-1/2 md:flex-col",
        "flex safe-area-bottom"
      )}
    >
      {items.map((it) => {
        const isActive = active === it.key;
        const count = counts[it.key];
        return (
          <button
            key={it.key}
            onClick={() => onSelect(isActive ? null : it.key)}
            className={cn(
              "relative flex h-16 w-16 flex-col items-center justify-center gap-1 border font-mono text-[8px] uppercase tracking-[1.5px] transition-all duration-500 [transition-timing-function:var(--ease-reveal)]",
              isActive
                ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                : "border-foreground/15 bg-background/85 text-foreground backdrop-blur-md hover:-translate-y-0.5 hover:bg-foreground/10 md:bg-foreground/[0.04]"
            )}
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            aria-label={it.label}
          >
            <span
              className="text-2xl leading-none italic"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {it.icon}
            </span>
            <span>{it.label}</span>
            {typeof count === "number" && count > 0 && (
              <span
                className={cn(
                  "absolute -right-1 -top-1 px-[5px] py-0 font-mono text-[8px] font-bold",
                  isActive ? "bg-[#0D0B08] text-[#FF6B1F]" : "bg-[#FF6B1F] text-[#0D0B08]"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] Step 3. Build + commit :

```bash
npm run build && git add components/ds/lesson/ && git commit -m "feat(lesson): LessonDock + LessonPanel (base glissante)"
```

## Task 4 — Panneaux spécialisés

**Files:** Create 4 files sous `components/ds/lesson/`

- [ ] Step 1. `exercises-panel.tsx` :

```tsx
"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { fireConfetti } from "@/components/gamification/confetti";
import { ExerciseRenderer } from "@/components/exercises/exercise-renderer";
import { ExerciseIframe } from "@/components/exercises/exercise-iframe";
import { Button } from "@/components/ui/button";
import { LessonPanel } from "./lesson-panel";
import { ExternalLink, Check } from "lucide-react";

export function ExercisesPanel({
  open,
  onClose,
  lessonId,
  videoWatched,
  exerciseCompleted,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: Id<"lessons">;
  videoWatched: boolean;
  exerciseCompleted: boolean;
}) {
  const exercises = useQuery(api.exercises.listByLesson, { lessonId });
  const completeExercise = useMutation(api.progress.completeExercise);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const active = exercises?.[activeIdx];
  const externalUrl = active?.exerciseUrl;

  return (
    <LessonPanel
      open={open}
      onClose={onClose}
      title="Exercices"
      italicWord="Exercices"
      width="wide"
      headerRight={
        externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 items-center gap-1.5 border border-foreground/20 bg-foreground/[0.04] px-3 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/80 transition-colors hover:bg-foreground/[0.08]"
            style={{ minHeight: 0 }}
          >
            Nouvelle fenêtre
            <ExternalLink size={11} />
          </a>
        ) : null
      }
    >
      {exercises === undefined ? (
        <div className="skeleton h-60 w-full rounded-none" />
      ) : exercises.length === 0 ? (
        <p className="font-mono text-xs text-foreground/60">
          Aucun exercice pour cette leçon.
        </p>
      ) : (
        <>
          {exercises.length > 1 && (
            <div className="mb-4 flex gap-2">
              {exercises.map((ex, i) => (
                <button
                  key={ex._id}
                  onClick={() => setActiveIdx(i)}
                  className={`border px-3 py-1 font-mono text-[9px] uppercase tracking-[1.5px] ${
                    i === activeIdx
                      ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                      : "border-foreground/20 bg-foreground/[0.04] text-foreground/60"
                  }`}
                  style={{ minHeight: 0 }}
                >
                  EXO {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          )}

          {active && (
            <div>
              {active.exerciseUrl ? (
                <ExerciseIframe
                  url={active.exerciseUrl}
                  title={active.title}
                  completed={exerciseCompleted}
                  onComplete={async () => {
                    await completeExercise({ lessonId });
                    fireConfetti();
                    toast.success("Exercice complété ! +XP");
                  }}
                />
              ) : active.config ? (
                <>
                  <ExerciseRenderer
                    exerciseId={active._id}
                    config={active.config}
                    title={active.title}
                  />
                  {videoWatched && !exerciseCompleted && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        className="rounded-full gap-1.5"
                        onClick={async () => {
                          await completeExercise({ lessonId });
                          fireConfetti();
                          toast.success("Exercice complété ! +XP");
                        }}
                      >
                        <Check size={14} /> Marquer comme complété
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="border border-foreground/15 bg-foreground/[0.04] p-5">
                  <h3
                    className="mb-3 text-xl italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {active.title}
                  </h3>
                  {active.contentMarkdown && (
                    <p className="mb-4 whitespace-pre-line text-sm text-foreground/70">
                      {active.contentMarkdown}
                    </p>
                  )}
                  {!exerciseCompleted && (
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={!videoWatched}
                      onClick={async () => {
                        await completeExercise({ lessonId });
                        fireConfetti();
                        toast.success("Exercice complété !");
                      }}
                    >
                      Valider l&apos;exercice
                    </Button>
                  )}
                </div>
              )}

              {exerciseCompleted && (
                <p className="mt-3 flex items-center gap-1 font-mono text-xs text-[#00FF85]">
                  <Check size={12} /> Exercice complété
                </p>
              )}
            </div>
          )}
        </>
      )}
    </LessonPanel>
  );
}
```

- [ ] Step 2. `notes-panel.tsx` :

```tsx
"use client";

import { Id } from "@/convex/_generated/dataModel";
import { TimestampedNotes } from "@/components/lesson/timestamped-notes";
import { LessonPanel } from "./lesson-panel";

export function NotesPanel({
  open,
  onClose,
  lessonId,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: Id<"lessons">;
}) {
  return (
    <LessonPanel open={open} onClose={onClose} title="Notes" italicWord="Notes">
      <TimestampedNotes lessonId={lessonId} />
    </LessonPanel>
  );
}
```

- [ ] Step 3. `comments-panel.tsx` :

```tsx
"use client";

import { Id } from "@/convex/_generated/dataModel";
import { CommentSection } from "@/components/comments/comment-section";
import { LessonPanel } from "./lesson-panel";

export function CommentsPanel({
  open,
  onClose,
  lessonId,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: Id<"lessons">;
}) {
  return (
    <LessonPanel
      open={open}
      onClose={onClose}
      title="Commentaires"
      italicWord="Commentaires"
    >
      <CommentSection lessonId={lessonId} />
    </LessonPanel>
  );
}
```

- [ ] Step 4. `module-panel.tsx` :

```tsx
"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { LessonPanel } from "./lesson-panel";
import { Check, Lock } from "lucide-react";

export function ModulePanel({
  open,
  onClose,
  moduleId,
  currentLessonId,
}: {
  open: boolean;
  onClose: () => void;
  moduleId: Id<"modules">;
  currentLessonId: Id<"lessons">;
}) {
  const mod = useQuery(api.modules.get, { moduleId });
  const lessons = useQuery(api.lessons.listByModule, { moduleId });
  const progress = useQuery(api.progress.myProgress);

  return (
    <LessonPanel
      open={open}
      onClose={onClose}
      title={mod?.title ?? "Module"}
      italicWord={mod?.title?.split(" ").slice(-1)[0]}
    >
      {!mod || !lessons || !progress ? (
        <div className="skeleton h-60 w-full rounded-none" />
      ) : (
        <>
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50">
            ◦ {mod.badgeLabel} · {lessons.length} LEÇONS
          </p>
          <div className="flex flex-col gap-1">
            {lessons.map((lesson, i) => {
              const isCompleted = !!progress[lesson._id]?.lessonCompletedAt;
              const isCurrent = lesson._id === currentLessonId;
              const isUnlocked =
                i === 0 || !!progress[lessons[i - 1]._id]?.lessonCompletedAt;
              const content = (
                <div
                  className={`flex items-center gap-3 border-l-2 px-3 py-3 transition-colors ${
                    isCurrent
                      ? "border-[#FF6B1F] bg-[rgba(255,107,31,0.08)]"
                      : "border-transparent hover:bg-foreground/[0.04]"
                  } ${!isUnlocked ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center font-mono text-[10px] ${
                      isCompleted
                        ? "bg-[#00FF85] text-[#0D0B08]"
                        : isCurrent
                        ? "bg-[#FF6B1F] text-[#0D0B08]"
                        : isUnlocked
                        ? "bg-foreground/10 text-foreground/70"
                        : "bg-foreground/5 text-foreground/40"
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={12} />
                    ) : !isUnlocked ? (
                      <Lock size={10} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-mono text-[9px] uppercase tracking-[1.5px] ${
                        isCurrent ? "text-[#FF6B1F]" : "text-foreground/50"
                      }`}
                    >
                      {isCurrent
                        ? "◦ EN COURS"
                        : isCompleted
                        ? "✓ COMPLÉTÉE"
                        : !isUnlocked
                        ? "◉ VERROUILLÉE"
                        : `LEÇON ${String(i + 1).padStart(2, "0")}`}
                    </div>
                    <div
                      className="text-lg font-normal"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {lesson.title}
                    </div>
                  </div>
                </div>
              );
              return isUnlocked ? (
                <Link
                  key={lesson._id}
                  href={`/lesson/${lesson._id}`}
                  onClick={onClose}
                >
                  {content}
                </Link>
              ) : (
                <div key={lesson._id}>{content}</div>
              );
            })}
          </div>
        </>
      )}
    </LessonPanel>
  );
}
```

- [ ] Step 5. Build + commit :

```bash
npm run build && git add components/ds/lesson/ && git commit -m "feat(lesson): 4 panneaux spécialisés (Exos/Notes/Coms/Module)"
```

## Task 5 — Réécriture `app/lesson/[lessonId]/page.tsx`

**Files:** Modify `app/lesson/[lessonId]/page.tsx` (réécriture complète)

- [ ] Step 1. Écraser avec :

```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState, use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fireConfetti } from "@/components/gamification/confetti";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/ds/topbar";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { LessonMetaBar } from "@/components/ds/lesson/lesson-meta-bar";
import { LessonDock, type DockKey } from "@/components/ds/lesson/lesson-dock";
import { ExercisesPanel } from "@/components/ds/lesson/exercises-panel";
import { NotesPanel } from "@/components/ds/lesson/notes-panel";
import { CommentsPanel } from "@/components/ds/lesson/comments-panel";
import { ModulePanel } from "@/components/ds/lesson/module-panel";
import { Play, Check, Circle, ChevronLeft, ChevronRight, Zap } from "lucide-react";

const MODULE_ACCENTS = [
  "#F5B820", "#FF6B1F", "#E63326", "#F2B8A2", "#2B7A6F", "#0D4D35",
];

export default function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = use(params);
  const { collapsed } = useSidebar();
  const router = useRouter();

  const lesson = useQuery(api.lessons.get, { lessonId: lessonId as Id<"lessons"> });
  const exercises = useQuery(api.exercises.listByLesson, lesson ? { lessonId: lesson._id } : "skip");
  const progress = useQuery(api.progress.myProgress);
  const markVideoWatched = useMutation(api.progress.markVideoWatched);
  const completeExercise = useMutation(api.progress.completeExercise);
  const checkBadge = useMutation(api.badges.checkAndAward);
  const prevCompleted = useRef(false);
  const module = useQuery(api.modules.get, lesson ? { moduleId: lesson.moduleId } : "skip");
  const nav = useQuery(api.lessons.getNavigation, lesson ? { lessonId: lesson._id } : "skip");
  const siblingLessons = useQuery(
    api.lessons.listByModule,
    lesson ? { moduleId: lesson.moduleId } : "skip"
  );
  const notesCount = useQuery(
    api.notes.countByLesson,
    lesson ? { lessonId: lesson._id } : "skip"
  );
  const commentsCount = useQuery(
    api.comments.countByLesson,
    lesson ? { lessonId: lesson._id } : "skip"
  );

  const [activePanel, setActivePanel] = useState<DockKey | null>(null);

  const lessonProgress = lesson && progress ? progress[lesson._id] : undefined;
  const videoWatched = !!lessonProgress?.videoWatchedAt;
  const exerciseCompleted = !!lessonProgress?.exerciseCompletedAt;
  const lessonCompleted = !!lessonProgress?.lessonCompletedAt;
  const hasExercises = (exercises ?? []).length > 0;

  useEffect(() => {
    if (lessonCompleted && !prevCompleted.current) {
      fireConfetti();
      if (lesson?.moduleId) checkBadge({ moduleId: lesson.moduleId }).catch(() => {});
    }
    prevCompleted.current = lessonCompleted;
  }, [lessonCompleted, checkBadge, lesson?.moduleId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && nav?.prev) router.push(`/lesson/${nav.prev._id}`);
      if (e.key === "ArrowRight" && nav?.next) router.push(`/lesson/${nav.next._id}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, router]);

  if (lesson === undefined || exercises === undefined || progress === undefined || module === undefined) {
    return (
      <div className="ds-grid-bg min-h-screen">
        <Sidebar /><Topbar />
        <div className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} px-6 py-8`}>
          <div className="mx-auto max-w-[1200px]">
            <div className="skeleton mb-6 h-10 w-full rounded-none" />
            <div className="skeleton mb-6 h-16 w-2/3 rounded-none" />
            <div className="skeleton aspect-video w-full rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="ds-grid-bg min-h-screen">
        <Sidebar /><Topbar />
        <div className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} flex min-h-screen items-center justify-center`}>
          <p className="text-sm text-muted-foreground">Leçon introuvable</p>
        </div>
      </div>
    );
  }

  const moduleAccent = module ? MODULE_ACCENTS[module.order % MODULE_ACCENTS.length] : "#FF6B1F";
  const lessonTotal = siblingLessons?.length ?? 0;

  const titleWords = lesson.title.split(" ");
  const italicWord = titleWords.length > 1 ? titleWords[titleWords.length - 1] : undefined;

  return (
    <div className="ds-grid-bg min-h-screen bg-background text-foreground">
      <Sidebar />
      <Topbar />

      <div className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} pb-24 md:pb-8`}>
        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">

          <LessonMetaBar
            moduleTitle={module?.title ?? ""}
            moduleAccent={moduleAccent}
            lessonOrder={lesson.order + 1}
            lessonTotal={lessonTotal}
            xpReward={lesson.xpReward}
          />

          <h1
            className="my-8 text-[clamp(36px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {italicWord ? (
              <>
                {lesson.title.replace(italicWord, "")}
                <em className="italic text-[#FF6B1F]">{italicWord}</em>
              </>
            ) : (
              lesson.title
            )}
          </h1>
          <p className="mb-8 font-mono text-sm text-foreground/60">{lesson.description}</p>

          <div
            className="aspect-video overflow-hidden border border-foreground/10 bg-[#0a0a0a]"
            style={{ boxShadow: "0 0 120px rgba(0,255,133,0.08)" }}
          >
            <div className="flex h-full flex-col items-center justify-center gap-4 relative">
              {lesson.muxPlaybackId === "placeholder" ? (
                <>
                  <div className={`flex size-20 items-center justify-center rounded-full bg-[rgba(0,255,133,0.1)] ${!videoWatched ? "play-pulse" : ""}`}>
                    <Play size={32} className="ml-1 text-[#00FF85]" />
                  </div>
                  <p className="font-mono text-xs text-foreground/60">Vidéo bientôt disponible</p>
                  {!videoWatched && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-foreground/15 hover:bg-foreground/10"
                      onClick={async () => {
                        await markVideoWatched({ lessonId: lesson._id });
                        toast.success("Vidéo marquée comme vue");
                      }}
                    >
                      Marquer comme vue
                    </Button>
                  )}
                </>
              ) : (
                <p className="font-mono text-xs text-foreground/60">Mux player</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border border-foreground/15 bg-foreground/[0.03] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className={`flex size-5 items-center justify-center rounded-full ${videoWatched ? "bg-[#00FF85] text-[#0D0B08]" : "bg-foreground/10 text-foreground/60"}`}>
                {videoWatched ? <Check size={12} /> : <Circle size={12} />}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70">
                {videoWatched ? "VIDÉO VUE" : "REGARDE LA VIDÉO POUR DÉBLOQUER LA SUITE"}
              </span>
            </div>
            {!hasExercises && videoWatched && !lessonCompleted && (
              <Button
                size="sm"
                className="rounded-none bg-[#00FF85] text-[#0D0B08] hover:bg-[#00cc6b]"
                onClick={async () => {
                  await completeExercise({ lessonId: lesson._id });
                  toast.success("Leçon complétée !");
                }}
              >
                Valider la leçon →
              </Button>
            )}
          </div>

          {lessonCompleted && (
            <div className="mt-6 border border-[rgba(0,255,133,0.3)] bg-[rgba(0,255,133,0.05)] p-6 text-center">
              <p
                className="mb-2 text-4xl italic text-[#00FF85]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Bravo !
              </p>
              <p className="font-mono text-xs text-[rgba(0,255,133,0.8)]">
                +{lesson.xpReward} XP gagnés <Zap size={10} className="inline" />
              </p>
            </div>
          )}

          {nav && (nav.prev || nav.next) && (
            <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
              {nav.prev ? (
                <Link
                  href={`/lesson/${nav.prev._id}`}
                  className="group border border-foreground/15 bg-foreground/[0.03] p-4 transition-colors hover:bg-foreground/[0.08]"
                >
                  <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50">
                    <ChevronLeft size={11} /> PRÉCÉDENT
                  </div>
                  <div
                    className="mt-1 text-xl italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {nav.prev.title}
                  </div>
                </Link>
              ) : (
                <div />
              )}
              {nav.next ? (
                <Link
                  href={`/lesson/${nav.next._id}`}
                  className="group border border-foreground/15 bg-foreground/[0.03] p-4 text-right transition-colors hover:bg-foreground/[0.08]"
                >
                  <div className="flex items-center justify-end gap-1 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50">
                    SUIVANT <ChevronRight size={11} />
                  </div>
                  <div
                    className="mt-1 text-xl italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {nav.next.title}
                  </div>
                </Link>
              ) : (
                <div />
              )}
            </div>
          )}
        </div>
      </div>

      <LessonDock
        active={activePanel}
        onSelect={setActivePanel}
        counts={{
          exos: exercises.length,
          notes: notesCount ?? undefined,
          comments: commentsCount ?? undefined,
        }}
      />

      <ExercisesPanel
        open={activePanel === "exos"}
        onClose={() => setActivePanel(null)}
        lessonId={lesson._id}
        videoWatched={videoWatched}
        exerciseCompleted={exerciseCompleted}
      />
      <NotesPanel
        open={activePanel === "notes"}
        onClose={() => setActivePanel(null)}
        lessonId={lesson._id}
      />
      <CommentsPanel
        open={activePanel === "comments"}
        onClose={() => setActivePanel(null)}
        lessonId={lesson._id}
      />
      <ModulePanel
        open={activePanel === "module"}
        onClose={() => setActivePanel(null)}
        moduleId={lesson.moduleId}
        currentLessonId={lesson._id}
      />
    </div>
  );
}
```

**Note :** Le code appelle `api.notes.countByLesson` et `api.comments.countByLesson`. Il faut les ajouter côté Convex (voir Task 6).

- [ ] Step 2. Build — l'erreur TypeScript viendra des deux queries manquantes. On ira à Task 6 pour les créer.

## Task 6 — Ajouter `countByLesson` dans notes + comments Convex

**Files:** Modify `convex/notes.ts`, Modify `convex/comments.ts`

- [ ] Step 1. Voir `convex/notes.ts` et ajouter en fin de fichier :

```ts
export const countByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", lessonId))
      .collect();
    return notes.length;
  },
});
```

(S'assurer que `query` et `getAuthUserId` sont importés en haut.)

- [ ] Step 2. Voir `convex/comments.ts` et ajouter :

```ts
export const countByLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
    return comments.length;
  },
});
```

- [ ] Step 3. Build :

```bash
npm run build
```

Expected : succeeds.

- [ ] Step 4. Commit :

```bash
git add convex/notes.ts convex/comments.ts app/lesson/\[lessonId\]/page.tsx components/ds/lesson/
git commit -m "feat(lesson): page immersive + countByLesson pour badges dock"
```

## Task 7 — Déploiement + QA

- [ ] Step 1. Lint :

```bash
npm run lint 2>&1 | grep "error" | wc -l
```

Expected : ≤ 9 (pas de NOUVELLE erreur au-delà des pré-existantes).

- [ ] Step 2. Build :

```bash
npm run build
```

Expected : succeeds.

- [ ] Step 3. Deploy :

```bash
vercel --prod --yes && npx convex deploy --yes
```

- [ ] Step 4. QA manuel sur `https://amour-studios.vercel.app/lesson/<id>` :
  - [ ] Topbar + Meta bar visibles
  - [ ] Titre serif italique massif
  - [ ] Vidéo XL avec glow vert
  - [ ] Dock 4 boutons à droite (desktop) / bas (mobile) avec badges
  - [ ] Clic sur "Exos" → panneau 65% slide depuis la droite, vidéo se compresse
  - [ ] Bouton "Nouvelle fenêtre ↗" s'affiche si l'exo a une URL externe
  - [ ] Clic sur "Notes" → panneau 420px avec TimestampedNotes
  - [ ] Clic sur "Commentaires" → panneau 420px avec CommentSection
  - [ ] Clic sur "Module" → liste des leçons du module, leçon actuelle highlight orange
  - [ ] ESC ferme le panneau
  - [ ] Cmd+1..4 ouvre les panneaux correspondants
