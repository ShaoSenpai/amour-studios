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
import { fireXpFlyover } from "@/components/gamification/xp-flyover";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/ds/topbar";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { LessonMetaBar } from "@/components/ds/lesson/lesson-meta-bar";
import { useViewMode } from "@/components/providers/view-mode-provider";
import { UpsellModal } from "@/components/ds/upsell-modal";
import type { DockKey } from "@/components/ds/lesson/lesson-dock";
import { Pencil, FileText, MessageCircle, List } from "lucide-react";
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
  const canAccess = useQuery(
    api.progress.canAccessLesson,
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

  // Raccourcis ⌘/Ctrl+1-4 pour ouvrir les panneaux (anciennement dans LessonDock)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") { e.preventDefault(); setActivePanel((p) => (p === "exos" ? null : "exos")); }
      if (e.key === "2") { e.preventDefault(); setActivePanel((p) => (p === "notes" ? null : "notes")); }
      if (e.key === "3") { e.preventDefault(); setActivePanel((p) => (p === "comments" ? null : "comments")); }
      if (e.key === "4") { e.preventDefault(); setActivePanel((p) => (p === "module" ? null : "module")); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Global listener — écoute la complétion d'exo depuis iframe (postMessage)
  // OU nouvel onglet (BroadcastChannel). Vit indépendamment du panneau Exos :
  // si l'utilisateur ferme le panneau pendant qu'il bosse dans une autre fenêtre,
  // la complétion reste capturée.
  const lessonIdForListener = lesson?._id;
  const xpRewardForListener = lesson?.xpReward;
  useEffect(() => {
    if (!lessonIdForListener || !xpRewardForListener) return;
    if (exerciseCompleted) return;

    const fireComplete = async () => {
      const exosBtn = document.querySelector<HTMLElement>('[data-exos-btn]');
      const rect =
        exosBtn?.getBoundingClientRect() ??
        new DOMRect(window.innerWidth / 2 - 40, window.innerHeight / 2 - 20, 80, 40);
      fireXpFlyover(rect, xpRewardForListener);
      await completeExercise({ lessonId: lessonIdForListener });
      fireConfetti();
      toast.success("Exercice complété ! +XP");
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "amour:exercise-complete") return;
      fireComplete();
    };
    window.addEventListener("message", onMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("amour-exo");
      channel.addEventListener("message", (e) => {
        if (e.data?.type !== "amour:exercise-complete") return;
        fireComplete();
      });
    } catch {}

    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [lessonIdForListener, xpRewardForListener, exerciseCompleted, completeExercise]);

  // Détection accès :
  // - admin (et pas en vue membre) → accès total
  // - VIP (purchaseId) → accès total
  // - sinon (preview mode) → accès uniquement aux leçons previewAccess=true
  // - mode "vue preview" force le comportement preview même si admin/VIP
  const isAdmin = me?.role === "admin" && !viewAsMember;
  const isVip = !!myPurchase && !viewAsPreview;
  // Accès :
  //   admin (pas en vue membre) → toujours
  //   preview mode (viewAsPreview ou non-VIP) → uniquement leçons previewAccess=true
  //   VIP → dépend de la progression séquentielle (canAccessLesson côté serveur)
  const lessonAllowed = isAdmin
    ? true
    : viewAsPreview || !myPurchase
    ? !!(lesson && lesson.previewAccess === true)
    : canAccess === true;

  if (lesson === undefined || exercises === undefined || progress === undefined || lessonModule === undefined || me === undefined || myPurchase === undefined || canAccess === undefined) {
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
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              — Cette leçon fait partie de la formation complète
            </p>
            <h1
              className="text-[clamp(40px,5vw,56px)] font-normal leading-[0.95] tracking-[-1.5px]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Accès <em className="italic text-foreground">verrouillé</em>
            </h1>
            <p
              className="font-mono text-sm text-foreground/70"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              Tu peux explorer la leçon en accès gratuit (Vision Board) ou débloquer toute la formation.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/dashboard"
                className="flex-1 border border-foreground/20 bg-foreground/[0.04] px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-foreground/80 hover:bg-foreground/[0.08]"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ← RETOUR AU DASHBOARD
              </Link>
              <a
                href="https://www.amourstudios.fr/paiement"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center gap-2 bg-[#FF6B1F] px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px]"
                style={{ fontFamily: "var(--font-body-legacy)" }}
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
                <em className="italic text-foreground">{italicWord}</em>
              </>
            ) : (
              lesson.title
            )}
          </h1>
          <p
            className="mb-8 font-mono text-sm text-foreground/60"
            style={{ fontFamily: "var(--font-body-legacy)" }}
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
                    <Play size={32} className="ml-1 text-[#2B7A6F]" />
                  </div>
                  <p
                    className="font-mono text-xs text-foreground/60"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
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
                  style={{ fontFamily: "var(--font-body-legacy)" }}
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
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                {videoWatched ? "VIDÉO VUE" : "REGARDE LA VIDÉO POUR DÉBLOQUER LA SUITE"}
              </span>
              {lessonCompleted && (
                <span
                  className="ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]"
                  style={{
                    background: "var(--state-done-bg)",
                    color: "var(--state-done-fg)",
                    fontFamily: "var(--font-body-legacy)",
                  }}
                >
                  <Zap size={10} /> +{lesson.xpReward} XP · BRAVO
                </span>
              )}
            </div>
            {!hasExercises && videoWatched && !lessonCompleted && (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full px-4 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-opacity hover:opacity-90"
                style={{
                  background: "var(--state-done-bg)",
                  color: "var(--state-done-fg)",
                  fontFamily: "var(--font-body-legacy)",
                  minHeight: 0,
                }}
                onClick={async (e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  fireXpFlyover(rect, lesson.xpReward);
                  await completeExercise({ lessonId: lesson._id });
                  toast.success("Leçon complétée !");
                }}
              >
                Valider la leçon <ChevronRight size={13} />
              </button>
            )}
            {hasExercises && videoWatched && !exerciseCompleted && (
              <button
                type="button"
                onClick={() => setActivePanel("exos")}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-foreground/30 bg-foreground/[0.08] px-4 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-foreground transition-all hover:border-foreground/50 hover:bg-foreground/[0.14]"
                style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
              >
                <Pencil size={12} /> Fais l&apos;exercice pour valider <ChevronRight size={13} />
              </button>
            )}
            {hasExercises && !videoWatched && exerciseCompleted && (
              <span
                className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ Regarde la vidéo pour valider
              </span>
            )}
          </div>

          {/* Barre d'actions inline : Exos / Notes / Com. / Module */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {([
              { key: "exos" as DockKey, label: "Exos", icon: Pencil, count: exercises.length },
              { key: "notes" as DockKey, label: "Notes", icon: FileText, count: notesCount ?? undefined },
              { key: "comments" as DockKey, label: "Commentaires", icon: MessageCircle, count: commentsCount ?? undefined },
              { key: "module" as DockKey, label: "Plan", icon: List, count: undefined },
            ]).map(({ key, label, icon: Icon, count }) => {
              const isActive = activePanel === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-exos-btn={key === "exos" ? "true" : undefined}
                  onClick={() => setActivePanel(isActive ? null : key)}
                  className={`group relative inline-flex h-10 items-center gap-2 rounded-full border px-4 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-all ${
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/25 bg-foreground/[0.04] text-foreground/80 hover:border-foreground/45 hover:bg-foreground/[0.08] hover:text-foreground"
                  }`}
                  style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                  {typeof count === "number" && count > 0 && (
                    <span
                      className={`flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[9px] font-bold ${
                        isActive ? "bg-[#0D0B08] text-background" : "bg-foreground text-background"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {nav && (nav.prev || nav.next) && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {nav.prev ? (
                <Link
                  href={`/lesson/${nav.prev._id}`}
                  className="group flex h-11 min-w-0 items-center gap-2 justify-self-start rounded-full border border-foreground/25 bg-foreground/[0.04] pl-3 pr-5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-foreground/80 transition-all hover:border-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground"
                  style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0, maxWidth: "100%" }}
                >
                  <ChevronLeft size={14} className="shrink-0 transition-transform group-hover:-translate-x-0.5" />
                  <span className="hidden whitespace-nowrap opacity-60 sm:inline">PRÉCÉDENT</span>
                  <span className="hidden opacity-30 sm:inline">·</span>
                  <span className="truncate">{nav.prev.title}</span>
                </Link>
              ) : (
                <div />
              )}
              {nav.next ? (
                <Link
                  href={`/lesson/${nav.next._id}`}
                  className="group flex h-11 min-w-0 items-center gap-2 justify-self-end rounded-full pl-5 pr-3 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-all"
                  style={{
                    background: "var(--state-done-bg)",
                    color: "var(--state-done-fg)",
                    fontFamily: "var(--font-body-legacy)",
                    minHeight: 0,
                    maxWidth: "100%",
                  }}
                >
                  <span className="hidden whitespace-nowrap opacity-70 sm:inline">SUIVANT</span>
                  <span className="hidden opacity-40 sm:inline">·</span>
                  <span className="truncate">{nav.next.title}</span>
                  <ChevronRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          )}
        </div>
      </div>

      <ExercisesPanel
        open={activePanel === "exos"}
        onClose={() => setActivePanel(null)}
        lessonId={lesson._id}
        videoWatched={videoWatched}
        exerciseCompleted={exerciseCompleted}
        xpReward={lesson.xpReward}
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
