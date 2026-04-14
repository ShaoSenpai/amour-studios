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
import { useViewMode } from "@/components/providers/view-mode-provider";
import { UpsellModal } from "@/components/ds/upsell-modal";
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
  const { collapsed, setCollapsed } = useSidebar();
  const router = useRouter();
  const wasCollapsedBeforeExosRef = useRef<boolean | null>(null);

  const me = useQuery(api.users.current);
  const myPurchase = useQuery(api.purchases.current);
  const { viewAsMember, viewAsPreview } = useViewMode();
  const lesson = useQuery(api.lessons.get, { lessonId: lessonId as Id<"lessons"> });
  const exercises = useQuery(api.exercises.listByLesson, lesson ? { lessonId: lesson._id } : "skip");
  const progress = useQuery(api.progress.myProgress);
  const markVideoWatched = useMutation(api.progress.markVideoWatched);
  const completeExercise = useMutation(api.progress.completeExercise);
  const checkBadge = useMutation(api.badges.checkAndAward);
  const prevCompleted = useRef(false);
  const lessonModule = useQuery(api.modules.get, lesson ? { moduleId: lesson.moduleId } : "skip");
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

  // Auto-collapse sidebar quand le panneau Exos (large) est ouvert,
  // pour libérer de la place pour la vidéo à gauche.
  useEffect(() => {
    if (activePanel === "exos") {
      if (wasCollapsedBeforeExosRef.current === null) {
        wasCollapsedBeforeExosRef.current = collapsed;
      }
      if (!collapsed) setCollapsed(true);
    } else if (wasCollapsedBeforeExosRef.current !== null) {
      setCollapsed(wasCollapsedBeforeExosRef.current);
      wasCollapsedBeforeExosRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

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

  // Détection accès :
  // - admin (et pas en vue membre) → accès total
  // - VIP (purchaseId) → accès total
  // - sinon (preview mode) → accès uniquement aux leçons previewAccess=true
  // - mode "vue preview" force le comportement preview même si admin/VIP
  const isAdmin = me?.role === "admin" && !viewAsMember;
  const isVip = !!myPurchase && !viewAsPreview;
  const lessonAllowed =
    (isAdmin || isVip || (lesson && lesson.previewAccess === true)) &&
    !(viewAsPreview && lesson && !lesson.previewAccess);

  if (lesson === undefined || exercises === undefined || progress === undefined || lessonModule === undefined || me === undefined || myPurchase === undefined) {
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

  if (!lessonAllowed) {
    return (
      <div className="ds-grid-bg min-h-screen bg-background text-foreground">
        <Sidebar />
        <Topbar />
        <div
          className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} flex min-h-screen items-center justify-center px-6`}
        >
          <div className="ds-reveal flex w-full max-w-md flex-col gap-4 text-center">
            <p
              className="font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
              style={{ fontFamily: "var(--font-body)" }}
            >
              — Cette leçon fait partie de la formation complète
            </p>
            <h1
              className="text-[clamp(40px,5vw,56px)] font-normal leading-[0.95] tracking-[-1.5px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Accès <em className="italic text-[#FF6B1F]">verrouillé</em>
            </h1>
            <p
              className="font-mono text-sm text-foreground/70"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Tu peux explorer la leçon en accès gratuit (Vision Board) ou débloquer toute la formation.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/dashboard"
                className="flex-1 border border-foreground/20 bg-foreground/[0.04] px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-foreground/80 hover:bg-foreground/[0.08]"
                style={{ fontFamily: "var(--font-body)" }}
              >
                ← RETOUR AU DASHBOARD
              </Link>
              <a
                href="https://www.amourstudios.fr/paiement"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center gap-2 bg-[#FF6B1F] px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px]"
                style={{ fontFamily: "var(--font-body)" }}
              >
                DÉBLOQUER 497 € →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const moduleAccent = lessonModule ? MODULE_ACCENTS[lessonModule.order % MODULE_ACCENTS.length] : "#FF6B1F";
  const lessonTotal = siblingLessons?.length ?? 0;

  const titleWords = lesson.title.split(" ");
  const italicWord = titleWords.length > 1 ? titleWords[titleWords.length - 1] : undefined;

  return (
    <div className="ds-grid-bg min-h-screen bg-background text-foreground">
      <Sidebar />
      <Topbar />

      <div
        className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} pb-28 md:pb-8 transition-[padding-right] duration-600 [transition-timing-function:var(--ease-reveal)]`}
        style={{
          paddingRight:
            activePanel === "exos"
              ? "min(55vw, 55vw)"
              : activePanel
              ? "min(420px, 100vw)"
              : 0,
        }}
      >
        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">

          <LessonMetaBar
            moduleTitle={lessonModule?.title ?? ""}
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
                {lesson.title.substring(0, lesson.title.lastIndexOf(italicWord))}
                <em className="italic text-[#FF6B1F]">{italicWord}</em>
              </>
            ) : (
              lesson.title
            )}
          </h1>
          <p
            className="mb-8 font-mono text-sm text-foreground/60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {lesson.description}
          </p>

          <div
            className="aspect-video overflow-hidden rounded-md border border-foreground/20 bg-[#0a0a0a]"
          >
            <div className="relative flex h-full flex-col items-center justify-center gap-4">
              {lesson.muxPlaybackId === "placeholder" ? (
                <>
                  <div className={`flex size-20 items-center justify-center rounded-full bg-[rgba(0,255,133,0.12)] ${!videoWatched ? "play-pulse" : ""}`}>
                    <Play size={32} className="ml-1 text-[#00FF85]" />
                  </div>
                  <p
                    className="font-mono text-xs text-foreground/60"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Vidéo bientôt disponible
                  </p>
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
                <p
                  className="font-mono text-xs text-foreground/60"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  Mux player
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-foreground/20 bg-foreground/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <div
                className="flex size-5 items-center justify-center rounded-full"
                style={{
                  background: videoWatched ? "var(--state-done-bg)" : "var(--fg-line)",
                  color: videoWatched ? "var(--state-done-fg)" : "var(--fg-soft)",
                }}
              >
                {videoWatched ? <Check size={12} /> : <Circle size={12} />}
              </div>
              <span
                className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/80"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {videoWatched ? "VIDÉO VUE" : "REGARDE LA VIDÉO POUR DÉBLOQUER LA SUITE"}
              </span>
              {lessonCompleted && (
                <span
                  className="ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]"
                  style={{
                    background: "var(--state-done-bg)",
                    color: "var(--state-done-fg)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <Zap size={10} /> +{lesson.xpReward} XP · BRAVO
                </span>
              )}
            </div>
            {!hasExercises && videoWatched && !lessonCompleted && (
              <Button
                size="sm"
                className="rounded-md"
                style={{ background: "var(--state-done-bg)", color: "var(--state-done-fg)" }}
                onClick={async () => {
                  await completeExercise({ lessonId: lesson._id });
                  toast.success("Leçon complétée !");
                }}
              >
                Valider la leçon →
              </Button>
            )}
          </div>

          {nav && (nav.prev || nav.next) && (
            <div className="mt-6 flex items-center justify-between gap-3">
              {nav.prev ? (
                <Link
                  href={`/lesson/${nav.prev._id}`}
                  className="group inline-flex items-center gap-2 rounded-full border border-foreground/25 bg-foreground/[0.04] px-4 py-2 font-mono text-[11px] uppercase tracking-[1.5px] text-foreground/75 transition-all hover:border-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground"
                  style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
                >
                  <ChevronLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
                  <span className="hidden sm:inline text-foreground/50">PRÉCÉDENT ·</span>
                  <span className="max-w-[28ch] truncate font-semibold">{nav.prev.title}</span>
                </Link>
              ) : (
                <div />
              )}
              {nav.next ? (
                <Link
                  href={`/lesson/${nav.next._id}`}
                  className="group ml-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[2px] transition-all hover:gap-3"
                  style={{
                    background: "var(--state-done-bg)",
                    color: "var(--state-done-fg)",
                    fontFamily: "var(--font-body)",
                    minHeight: 0,
                  }}
                >
                  <span className="hidden sm:inline opacity-70">SUIVANT ·</span>
                  <span className="max-w-[28ch] truncate">{nav.next.title}</span>
                  <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
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
