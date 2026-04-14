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
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            <span className="hidden sm:inline">Nouvelle fenêtre</span>
            <ExternalLink size={11} />
          </a>
        ) : null
      }
    >
      {exercises === undefined ? (
        <div className="skeleton h-60 w-full rounded-none" />
      ) : exercises.length === 0 ? (
        <p className="font-mono text-xs text-foreground/60" style={{ fontFamily: "var(--font-body)" }}>
          Aucun exercice pour cette leçon.
        </p>
      ) : (
        <>
          {exercises.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {exercises.map((ex, i) => (
                <button
                  key={ex._id}
                  onClick={() => setActiveIdx(i)}
                  className={`border px-3 py-1 font-mono text-[9px] uppercase tracking-[1.5px] ${
                    i === activeIdx
                      ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                      : "border-foreground/20 bg-foreground/[0.04] text-foreground/60"
                  }`}
                  style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
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
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-md px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[2px] transition-opacity hover:opacity-90"
                        style={{
                          background: "var(--state-done-bg)",
                          color: "var(--state-done-fg)",
                          fontFamily: "var(--font-body)",
                          minHeight: 0,
                        }}
                        onClick={async () => {
                          await completeExercise({ lessonId });
                          fireConfetti();
                          toast.success("Exercice complété ! +XP");
                        }}
                      >
                        <Check size={14} /> Marquer comme complété
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-md border border-foreground/20 bg-foreground/[0.06] p-5">
                  <h3
                    className="mb-3 text-xl italic"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {active.title}
                  </h3>
                  {active.contentMarkdown && (
                    <p className="mb-4 whitespace-pre-line text-sm text-foreground/75">
                      {active.contentMarkdown}
                    </p>
                  )}
                  {!exerciseCompleted && (
                    <button
                      type="button"
                      className="rounded-md px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[2px] transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{
                        background: "var(--state-done-bg)",
                        color: "var(--state-done-fg)",
                        fontFamily: "var(--font-body)",
                        minHeight: 0,
                      }}
                      disabled={!videoWatched}
                      onClick={async () => {
                        await completeExercise({ lessonId });
                        fireConfetti();
                        toast.success("Exercice complété !");
                      }}
                    >
                      Valider l&apos;exercice
                    </button>
                  )}
                </div>
              )}

              {exerciseCompleted && (
                <p
                  className="mt-3 flex items-center gap-1 font-mono text-xs font-bold"
                  style={{ fontFamily: "var(--font-body)", color: "var(--state-done)" }}
                >
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
