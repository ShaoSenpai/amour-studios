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

  const titleWords = mod?.title?.split(" ") ?? [];
  const italicWord = titleWords.length > 1 ? titleWords[titleWords.length - 1] : undefined;

  return (
    <LessonPanel
      open={open}
      onClose={onClose}
      title={mod?.title ?? "Module"}
      italicWord={italicWord}
    >
      {!mod || !lessons || !progress ? (
        <div className="skeleton h-60 w-full rounded-none" />
      ) : (
        <>
          <p
            className="mb-4 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
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
                        ? "bg-[color:var(--state-done-bg)] text-[color:var(--state-done-fg)]"
                        : isCurrent
                        ? "bg-[#FF6B1F] text-[#0D0B08]"
                        : isUnlocked
                        ? "bg-foreground/10 text-foreground/70"
                        : "bg-foreground/5 text-foreground/40"
                    }`}
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {isCompleted ? (
                      <Check size={12} />
                    ) : !isUnlocked ? (
                      <Lock size={10} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`font-mono text-[9px] uppercase tracking-[1.5px] ${
                        isCurrent ? "text-[#FF6B1F]" : "text-foreground/50"
                      }`}
                      style={{ fontFamily: "var(--font-body)" }}
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
