"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState, use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fireConfetti } from "@/components/gamification/confetti";
import { CommentSection } from "@/components/comments/comment-section";
import { ExerciseRenderer } from "@/components/exercises/exercise-renderer";
import { ExerciseIframe } from "@/components/exercises/exercise-iframe";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { ModuleProgress, ModuleProgressCompact } from "@/components/lesson/module-progress";
import { TimestampedNotes } from "@/components/lesson/timestamped-notes";
import { Play, Check, Circle, ChevronLeft, ChevronRight, Zap, Lock } from "lucide-react";

export default function LessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = use(params);

  // Validate ID format (Convex IDs are alphanumeric strings)
  if (!lessonId || typeof lessonId !== "string" || lessonId.length < 10) {
    // Will be caught by the !lesson check below
  }

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

  const lessonProgress = lesson && progress ? progress[lesson._id] : undefined;
  const videoWatched = !!lessonProgress?.videoWatchedAt;
  const exerciseCompleted = !!lessonProgress?.exerciseCompletedAt;
  const lessonCompleted = !!lessonProgress?.lessonCompletedAt;
  const hasExercises = (exercises ?? []).length > 0;

  // Confetti on completion
  useEffect(() => {
    if (lessonCompleted && !prevCompleted.current) {
      fireConfetti();
      if (lesson?.moduleId) checkBadge({ moduleId: lesson.moduleId }).catch(() => {});
    }
    prevCompleted.current = lessonCompleted;
  }, [lessonCompleted]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && nav?.prev) router.push(`/lesson/${nav.prev._id}`);
      if (e.key === "ArrowRight" && nav?.next) router.push(`/lesson/${nav.next._id}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nav, router]);

  // Loading
  if (lesson === undefined || exercises === undefined || progress === undefined || module === undefined) {
    return (
      <div className="min-h-screen lesson-bg">
        <Sidebar /><Header />
        <div className={`${collapsed ? "md:ml-16" : "md:ml-60"} px-6 py-8 flex items-center justify-center min-h-screen relative z-10`}>
          <div className="w-full max-w-3xl">
            <div className="skeleton h-4 w-32 mb-6" />
            <div className="skeleton h-10 w-3/4 mb-4" />
            <div className="skeleton aspect-video w-full rounded-2xl mb-8" />
            <div className="skeleton h-32 w-full rounded-2xl" />
          </div>
        </div>
        <MobileNav />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen lesson-bg">
        <Sidebar /><Header />
        <div className={`${collapsed ? "md:ml-16" : "md:ml-60"} flex items-center justify-center min-h-screen relative z-10`}>
          <p className="text-sm text-muted-foreground">Le&#231;on introuvable</p>
        </div>
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen lesson-bg text-[#F0E9DB]">
      <Sidebar />
      <Header />

      <div className={`${collapsed ? "md:ml-16" : "md:ml-60"} relative z-10 pb-24 md:pb-8`}>
        {/* 3-column grid: content + sidebar */}
        <div className="flex gap-8 px-6 py-8 max-w-[1200px] mx-auto">
          {/* Main content */}
          <div className="flex-1 min-w-0 max-w-[820px]">
            {/* Compact progress bar (mobile + tablet) */}
            <ModuleProgressCompact moduleId={lesson.moduleId} currentLessonId={lesson._id} />

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
              <Link href="/dashboard" className="hover:text-[#F0E9DB] transition-colors flex items-center gap-1">
                <ChevronLeft size={12} />Dashboard
              </Link>
              <span>/</span>
              <span>{module?.badgeLabel}</span>
              <span>/</span>
              <span className="text-[#F0E9DB]">Le&#231;on {lesson.order + 1}</span>
            </div>

            {/* Lesson header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                  Le&#231;on {lesson.order + 1}
                </Badge>
                <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 gap-1">
                  <Zap size={10} /> {lesson.xpReward} XP
                </Badge>
                {lessonCompleted && (
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary gap-1">
                    <Check size={10} /> Compl&#233;t&#233;e
                  </Badge>
                )}
              </div>
              <h1 className="text-[clamp(28px,4vw,48px)] leading-[1] tracking-tight mb-2">
                {lesson.title}
              </h1>
              <p className="text-sm text-muted-foreground">{lesson.description}</p>
            </div>

            {/* Video player */}
            <div className="mb-8">
              <div className="aspect-video rounded-2xl bg-[#111214] border border-white/6 flex flex-col items-center justify-center gap-4 relative overflow-hidden video-glow">
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/3 pointer-events-none" />

                {lesson.muxPlaybackId === "placeholder" ? (
                  <>
                    <div className={`size-20 rounded-full bg-primary/10 flex items-center justify-center relative z-10 ${!videoWatched ? "play-pulse" : ""}`}>
                      <Play size={32} className="text-primary ml-1" />
                    </div>
                    <p className="text-sm text-muted-foreground relative z-10">Vid&#233;o bient&#244;t disponible</p>
                    {!videoWatched && (
                      <Button size="sm" variant="outline" className="rounded-full relative z-10 border-white/10 hover:bg-white/5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.2)' }} onClick={async () => {
                        await markVideoWatched({ lessonId: lesson._id });
                        toast.success("Vid\u00e9o marqu\u00e9e comme vue");
                      }}>
                        Marquer comme vue
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground relative z-10">Mux player</p>
                )}
              </div>

              {/* Video status + next lesson */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <div className={`size-5 rounded-full flex items-center justify-center text-xs ${videoWatched ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}>
                    {videoWatched ? <Check size={12} /> : <Circle size={12} />}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {videoWatched ? "Vid\u00e9o vue" : "Regarde la vid\u00e9o pour d\u00e9bloquer la suite"}
                  </span>
                </div>
                {videoWatched && nav?.next && (
                  <Link
                    href={`/lesson/${nav.next._id}`}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all group active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    Suivante
                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
              </div>
            </div>

            {/* Exercises */}
            {hasExercises && (
              <div className={`mb-8 ${!videoWatched ? "opacity-40 pointer-events-none" : ""}`}>
                {exercises!.map((ex) => (
                  <div key={ex._id} className="mb-6">
                    {ex.exerciseUrl ? (
                      /* Exercice externe en iframe */
                      <ExerciseIframe
                        url={ex.exerciseUrl}
                        title={ex.title}
                        completed={exerciseCompleted}
                        onComplete={async () => {
                          await completeExercise({ lessonId: lesson._id });
                          fireConfetti();
                          toast.success("Exercice complété ! +XP");
                        }}
                      />
                    ) : ex.config ? (
                      /* Exercice natif avec config JSON */
                      <div>
                        <ExerciseRenderer
                          exerciseId={ex._id}
                          config={ex.config}
                          title={ex.title}
                        />
                        {videoWatched && !exerciseCompleted && (
                          <div className="mt-3 flex justify-end">
                            <Button
                              size="sm"
                              className="rounded-full gap-1.5 active:scale-[0.98]"
                              onClick={async () => {
                                await completeExercise({ lessonId: lesson._id });
                                fireConfetti();
                                toast.success("Exercice complété ! +XP");
                              }}
                            >
                              <Check size={14} /> Marquer comme complété
                            </Button>
                          </div>
                        )}
                        {exerciseCompleted && (
                          <p className="text-xs text-primary flex items-center gap-1 mt-2"><Check size={12} /> Exercice complété</p>
                        )}
                      </div>
                    ) : (
                      /* Fallback simple */
                      <div className="glass-card rounded-xl p-5">
                        <h3 className="text-sm font-semibold mb-3 section-accent">{ex.title}</h3>
                        {ex.contentMarkdown && (
                          <p className="text-sm text-muted-foreground mb-4 whitespace-pre-line leading-relaxed">{ex.contentMarkdown}</p>
                        )}
                        {exerciseCompleted ? (
                          <p className="text-xs text-primary flex items-center gap-1"><Check size={12} /> Exercice complété</p>
                        ) : (
                          <Button
                            size="sm"
                            className="rounded-full active:scale-[0.98]"
                            disabled={!videoWatched}
                            onClick={async () => {
                              await completeExercise({ lessonId: lesson._id });
                              fireConfetti();
                              toast.success("Exercice complété !");
                            }}
                          >
                            Valider l&apos;exercice
                          </Button>
                        )}
                      </div>
                    )}
                    {ex.config && exerciseCompleted && (
                      <p className="text-xs text-primary flex items-center gap-1 mt-2"><Check size={12} /> Exercice complété</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Completion */}
            {lessonCompleted ? (
              <div className="rounded-2xl p-8 text-center mb-8 relative overflow-hidden bg-gradient-to-br from-primary/10 via-[#111214] to-amber-500/5 border border-primary/20 shadow-float">
                <div className="absolute inset-0 shimmer-active pointer-events-none" />
                <p className="font-display text-3xl text-primary relative z-10 mb-2">Bravo !</p>
                <p className="text-sm text-primary/70 font-medium relative z-10">+{lesson.xpReward} XP gagn&#233;s</p>
                <Link href="/dashboard" className="relative z-10 inline-block mt-4">
                  <Button size="sm" variant="outline" className="rounded-full border-white/10 hover:bg-white/5 active:scale-[0.98]">
                    Dashboard
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="glass-card rounded-xl p-6 text-center mb-8">
                <p className="text-sm text-muted-foreground">
                  {!videoWatched ? "Regarde la vid\u00e9o pour continuer" :
                    hasExercises && !exerciseCompleted ? "Compl\u00e8te l\u2019exercice" : ""}
                </p>
                {videoWatched && !hasExercises && !lessonCompleted && (
                  <Button size="sm" className="rounded-full mt-3 active:scale-[0.98]" onClick={async () => {
                    await completeExercise({ lessonId: lesson._id });
                    toast.success("Le\u00e7on compl\u00e9t\u00e9e !");
                  }}>
                    Valider la le&#231;on
                  </Button>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="mb-8">
              <TimestampedNotes lessonId={lesson._id} />
            </div>

            {/* Comments */}
            <div className="glass-card rounded-2xl p-5 mb-8">
              <CommentSection lessonId={lesson._id} />
            </div>

            {/* Discord community CTA */}
            {process.env.NEXT_PUBLIC_DISCORD_INVITE_URL && (
              <a
                href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl p-4 mb-8 border border-indigo-400/20 bg-indigo-400/5 hover:bg-indigo-400/10 transition-colors"
              >
                <p className="text-sm font-medium text-[#F0E9DB]">
                  Bloqué·e ? Demande à la communauté →
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Les autres artistes sont sur Discord — rejoins la conversation.
                </p>
              </a>
            )}

            {/* Prev/Next */}
            {nav && (nav.prev || nav.next) && (
              <div className="flex items-center justify-between gap-4">
                {nav.prev ? (
                  <Link href={`/lesson/${nav.prev._id}`} className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl transition-all group flex-1 hover:bg-white/5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30">
                    <ChevronLeft size={16} className="text-muted-foreground group-hover:-translate-x-1 transition-transform" />
                    <div className="text-left">
                      <p className="text-[10px] text-muted-foreground">Pr&#233;c&#233;dent</p>
                      <p className="text-sm font-medium truncate">{nav.prev.title}</p>
                    </div>
                  </Link>
                ) : <div />}
                {nav.next ? (
                  <Link href={`/lesson/${nav.next._id}`} className="glass-card flex items-center gap-2 px-4 py-3 rounded-xl transition-all group flex-1 justify-end text-right hover:bg-white/5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Suivant</p>
                      <p className="text-sm font-medium truncate">{nav.next.title}</p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : <div />}
              </div>
            )}
          </div>

          {/* Right sidebar -- Module progress (desktop only) */}
          <div className="hidden lg:block w-[280px] shrink-0">
            <ModuleProgress moduleId={lesson.moduleId} currentLessonId={lesson._id} />
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}

