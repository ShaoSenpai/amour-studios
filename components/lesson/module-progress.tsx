"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, Play } from "lucide-react";
import Link from "next/link";

export function ModuleProgress({
  moduleId,
  currentLessonId,
}: {
  moduleId: Id<"modules">;
  currentLessonId: Id<"lessons">;
}) {
  const mod = useQuery(api.modules.get, { moduleId });
  const lessons = useQuery(api.lessons.listByModule, { moduleId });
  const progress = useQuery(api.progress.myProgress);

  if (!mod || !lessons || !progress) return null;

  const completedCount = lessons.filter((l) => progress[l._id]?.lessonCompletedAt).length;
  const percent = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  return (
    <div className="sticky top-8">
      {/* Module header */}
      <div className="mb-4">
        <p className="label-caps mb-1">{mod.badgeLabel}</p>
        <h3 className="text-sm font-semibold mb-2">{mod.title}</h3>
        <div className="progress-track-glow mb-1">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground">{completedCount}/{lessons.length} le&#231;ons &middot; {percent}%</p>
      </div>

      {/* Lesson list */}
      <div className="flex flex-col gap-0.5">
        {lessons.map((lesson, i) => {
          const isCompleted = !!progress[lesson._id]?.lessonCompletedAt;
          const isCurrent = lesson._id === currentLessonId;
          const isUnlocked = i === 0 || !!progress[lessons[i - 1]._id]?.lessonCompletedAt;

          return (
            <Link
              key={lesson._id}
              href={isUnlocked ? `/lesson/${lesson._id}` : "#"}
              onClick={(e) => { if (!isUnlocked) e.preventDefault(); }}
              className={`lesson-sidebar-item ${isCurrent ? "active" : ""} ${isCompleted ? "completed" : ""} ${!isUnlocked ? "opacity-30 cursor-not-allowed" : ""}`}
            >
              <div className={`size-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                isCompleted ? "bg-primary/20 text-primary" :
                isCurrent ? "bg-primary text-primary-foreground" :
                isUnlocked ? "bg-muted/50 text-muted-foreground" :
                "bg-muted/20 text-muted-foreground"
              }`}>
                {isCompleted ? <Check size={12} /> :
                 isCurrent ? <Play size={10} /> :
                 isUnlocked ? i + 1 :
                 <Lock size={10} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {lesson.title}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
