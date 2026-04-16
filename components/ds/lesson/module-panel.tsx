"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { LessonPanel } from "./lesson-panel";
import { Check, Lock, ChevronDown } from "lucide-react";
import { useViewMode } from "@/components/providers/view-mode-provider";

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
  const me = useQuery(api.users.current);
  const myPurchase = useQuery(api.purchases.current);
  const allModules = useQuery(api.modules.listWithLessons);
  const progress = useQuery(api.progress.myProgress);
  const { viewAsMember, viewAsPreview } = useViewMode();

  const isAdmin = me?.role === "admin" && !viewAsMember;
  const previewMode = (!myPurchase && !isAdmin) || viewAsPreview;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([moduleId]));
  const currentLessonRef = useRef<HTMLDivElement | null>(null);

  // Auto-expand le module courant quand la leçon change
  useEffect(() => {
    setExpanded((prev) => {
      if (prev.has(moduleId)) return prev;
      const next = new Set(prev);
      next.add(moduleId);
      return next;
    });
  }, [moduleId]);

  // Scroll vers la leçon courante à l'ouverture
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      currentLessonRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, currentLessonId]);

  const moduleStates = useMemo(() => {
    if (!allModules || !progress) return null;
    const states: Record<string, { unlocked: boolean; completed: number; total: number }> = {};
    for (let i = 0; i < allModules.length; i++) {
      const m = allModules[i];
      const total = m.lessons.length;
      const completed = m.lessons.filter(
        (l) => progress[l._id]?.lessonCompletedAt
      ).length;

      let unlocked: boolean;
      if (isAdmin || previewMode) {
        unlocked = true;
      } else if (i === 0) {
        unlocked = true;
      } else {
        const prev = allModules[i - 1];
        unlocked =
          prev.lessons.length === 0 ||
          prev.lessons.every((l) => progress[l._id]?.lessonCompletedAt);
      }
      states[m._id] = { unlocked, completed, total };
    }
    return states;
  }, [allModules, progress, isAdmin, previewMode]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <LessonPanel open={open} onClose={onClose} title="Plan du cours" italicWord="cours">
      {!allModules || !progress || !moduleStates ? (
        <div className="skeleton h-60 w-full rounded-none" />
      ) : (
        <>
          <p
            className="mb-4 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ {allModules.length} MODULES ·{" "}
            {allModules.reduce((a, m) => a + m.lessons.length, 0)} LEÇONS
          </p>
          <div className="flex flex-col">
            {allModules.map((mod, mi) => {
              const state = moduleStates[mod._id];
              const isOpen = expanded.has(mod._id);
              const isCurrentModule = mod._id === moduleId;
              const moduleFullyDone = state.total > 0 && state.completed === state.total;

              return (
                <div key={mod._id} className="border-b border-foreground/10 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(mod._id)}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors ${
                      isCurrentModule
                        ? "border-foreground bg-foreground/[0.06]"
                        : "border-transparent hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center font-mono text-[10px] ${
                        moduleFullyDone
                          ? "bg-[color:var(--state-done-bg)] text-[color:var(--state-done-fg)]"
                          : !state.unlocked
                          ? "bg-foreground/5 text-foreground/40"
                          : isCurrentModule
                          ? "bg-foreground text-background"
                          : "bg-foreground/10 text-foreground/70"
                      }`}
                      style={{ fontFamily: "var(--font-body-legacy)" }}
                    >
                      {moduleFullyDone ? (
                        <Check size={12} />
                      ) : !state.unlocked ? (
                        <Lock size={11} />
                      ) : (
                        String(mi + 1).padStart(2, "0")
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/50"
                        style={{ fontFamily: "var(--font-body-legacy)" }}
                      >
                        {mod.badgeLabel} · {state.completed}/{state.total}
                      </div>
                      <div
                        className="truncate text-lg font-normal leading-tight"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {mod.title}
                      </div>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-foreground/40 transition-transform duration-200 ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="ml-[46px] flex flex-col gap-px border-l border-foreground/10 pb-3">
                      {mod.lessons.length === 0 && (
                        <div
                          className="px-3 py-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/40"
                          style={{ fontFamily: "var(--font-body-legacy)" }}
                        >
                          — Aucune leçon
                        </div>
                      )}
                      {mod.lessons.map((lesson, li) => {
                        const isCompleted = !!progress[lesson._id]?.lessonCompletedAt;
                        const isCurrent = lesson._id === currentLessonId;

                        let isUnlocked: boolean;
                        if (isAdmin) {
                          isUnlocked = true;
                        } else if (previewMode) {
                          isUnlocked = !!lesson.previewAccess;
                        } else if (!state.unlocked) {
                          isUnlocked = false;
                        } else {
                          isUnlocked =
                            li === 0 ||
                            !!progress[mod.lessons[li - 1]._id]?.lessonCompletedAt;
                        }

                        const content = (
                          <div
                            ref={isCurrent ? currentLessonRef : undefined}
                            className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                              isCurrent
                                ? "bg-foreground/[0.08]"
                                : isUnlocked
                                ? "hover:bg-foreground/[0.04]"
                                : ""
                            } ${!isUnlocked ? "cursor-not-allowed opacity-45" : ""}`}
                          >
                            <div
                              className={`flex size-5 shrink-0 items-center justify-center font-mono text-[9px] ${
                                isCompleted
                                  ? "bg-[color:var(--state-done-bg)] text-[color:var(--state-done-fg)]"
                                  : isCurrent
                                  ? "bg-foreground text-background"
                                  : isUnlocked
                                  ? "bg-foreground/10 text-foreground/70"
                                  : "bg-foreground/5 text-foreground/40"
                              }`}
                              style={{ fontFamily: "var(--font-body-legacy)" }}
                            >
                              {isCompleted ? (
                                <Check size={10} />
                              ) : !isUnlocked ? (
                                <Lock size={9} />
                              ) : (
                                String(li + 1).padStart(2, "0")
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {isCurrent && (
                                <div
                                  className="font-mono text-[8px] uppercase tracking-[1.5px] text-foreground/60"
                                  style={{ fontFamily: "var(--font-body-legacy)" }}
                                >
                                  ◦ EN COURS
                                </div>
                              )}
                              <div
                                className={`truncate text-sm leading-tight ${
                                  isCurrent ? "text-foreground" : "text-foreground/85"
                                }`}
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
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </LessonPanel>
  );
}
