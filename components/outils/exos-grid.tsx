"use client";

import * as React from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, ChevronDown, ExternalLink } from "lucide-react";
import { MODULE_ACCENTS } from "@/lib/module-accents";

type Exo = {
  _id: Id<"exercises">;
  title: string;
  exerciseUrl?: string;
  config?: string;
  lessonId: Id<"lessons">;
  lessonTitle: string;
  lessonOrder: number;
  moduleId: Id<"modules">;
  moduleTitle: string;
  moduleOrder: number;
  moduleBadgeLabel: string;
  state: "locked" | "available" | "completed";
  completedAt?: number;
};

type Filter = "all" | "todo" | "done";

const STATE = {
  done: "var(--state-done)",
  doneBg: "var(--state-done-bg)",
  doneFg: "var(--state-done-fg)",
  activeBg: "var(--state-active-bg)",
  activeFg: "var(--state-active-fg)",
  locked: "var(--state-locked)",
  lockedBorder: "var(--state-locked-border)",
} as const;

export function ExosGrid({
  exos,
  firstAvailableId,
}: {
  exos: Exo[];
  firstAvailableId: string | null;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [moduleFilter, setModuleFilter] = React.useState<string | null>(null);

  const modulesUsed = React.useMemo(
    () =>
      Array.from(new Map(exos.map((e) => [e.moduleId as string, e])).values())
        .sort((a, b) => a.moduleOrder - b.moduleOrder)
        .map((e) => ({
          id: e.moduleId as string,
          title: e.moduleTitle,
          order: e.moduleOrder,
        })),
    [exos]
  );

  const filtered = React.useMemo(
    () =>
      exos.filter((e) => {
        if (moduleFilter && (e.moduleId as string) !== moduleFilter) return false;
        if (filter === "todo") return e.state === "available";
        if (filter === "done") return e.state === "completed";
        return true;
      }),
    [exos, filter, moduleFilter]
  );

  const groupedByModule = React.useMemo(() => {
    const map = new Map<string, { title: string; order: number; items: Exo[] }>();
    for (const exo of filtered) {
      const key = exo.moduleId as string;
      if (!map.has(key)) {
        map.set(key, { title: exo.moduleTitle, order: exo.moduleOrder, items: [] });
      }
      map.get(key)!.items.push(exo);
    }
    return Array.from(map.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.order - b.order);
  }, [filtered]);

  const resetFilters = () => {
    setFilter("all");
    setModuleFilter(null);
  };
  const hasActiveFilter = filter !== "all" || moduleFilter !== null;

  return (
    <>
      {/* Filtres — sticky sous la topbar, scroll horizontal en mobile */}
      <div
        className="sticky z-20 -mx-4 mb-6 border-b border-foreground/8 bg-background/95 backdrop-blur-sm md:-mx-6"
        style={{ top: "var(--topbar-h, 56px)" }}
      >
        <div
          className="flex flex-nowrap items-center gap-2 overflow-x-auto px-4 py-3 md:flex-wrap md:overflow-visible md:px-6"
          style={{ scrollbarWidth: "none" }}
        >
          {(
            [
              { key: "all" as Filter, label: "Tous" },
              { key: "todo" as Filter, label: "À faire" },
              { key: "done" as Filter, label: "Complétés" },
            ]
          ).map(({ key, label }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={isActive}
                className={`shrink-0 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/20 bg-foreground/[0.03] text-foreground/70 hover:border-foreground/45 hover:text-foreground"
                }`}
                style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
              >
                {label}
              </button>
            );
          })}
          {modulesUsed.length > 1 && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-foreground/15" />
              {modulesUsed.map((m) => {
                const isActive = moduleFilter === m.id;
                const accent = MODULE_ACCENTS[m.order % MODULE_ACCENTS.length];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModuleFilter(isActive ? null : m.id)}
                    aria-pressed={isActive}
                    aria-label={`Module ${String(m.order + 1).padStart(2, "0")} — ${m.title}`}
                    className={`flex shrink-0 items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                      isActive
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/20 bg-foreground/[0.03] text-foreground/70 hover:border-foreground/45"
                    }`}
                    style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                  >
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: accent }}
                      aria-hidden="true"
                    />
                    {String(m.order + 1).padStart(2, "0")}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Liste — cartes modules (style /dashboard) */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-dashed border-foreground/15 bg-foreground/[0.02] py-16 text-center">
          <p
            className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Aucun exo dans cette sélection
          </p>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="border border-foreground/20 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:border-foreground/45 hover:text-foreground"
              style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="ds-cascade flex flex-col gap-3">
          {groupedByModule.map((group) => (
            <ModuleCard
              key={group.id}
              group={group}
              firstAvailableId={firstAvailableId}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Carte module (style dashboard) ────────────────────────────────────────

function italicizeLastWord(title: string): React.ReactNode {
  const words = title.split(" ");
  if (words.length < 2) return title;
  const last = words[words.length - 1];
  const before = title.slice(0, title.lastIndexOf(last));
  return (
    <>
      {before}
      <em className="italic">{last}</em>
    </>
  );
}

function ModuleCard({
  group,
  firstAvailableId,
}: {
  group: { id: string; title: string; order: number; items: Exo[] };
  firstAvailableId: string | null;
}) {
  const accent = MODULE_ACCENTS[group.order % MODULE_ACCENTS.length];
  const doneCount = group.items.filter((e) => e.state === "completed").length;
  const total = group.items.length;
  const allDone = doneCount === total && total > 0;
  const hasAvailable = group.items.some((e) => e.state === "available");

  // Ouvert par défaut si pas terminé, ou s'il contient l'exo global "à reprendre"
  const containsFirstAvailable = firstAvailableId
    ? group.items.some((e) => (e._id as string) === firstAvailableId)
    : false;
  const [open, setOpen] = React.useState(!allDone || containsFirstAvailable);

  return (
    <div
      className="group/module relative overflow-hidden rounded-md border border-foreground/20 bg-[color:var(--paper-2,var(--card))] transition-[border-color] duration-300 hover:border-foreground/40"
      style={{ boxShadow: `inset 4px 0 0 0 ${allDone ? "var(--state-done)" : accent}` }}
    >
      {/* Hover fill bottom-up */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-0 origin-bottom transition-[height] duration-400 ease-[cubic-bezier(.22,1,.36,1)] group-hover/module:h-full"
        style={{ background: `${accent}28` }}
      />

      {/* Header click → toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative z-10 grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-5 px-5 py-5 pl-7 text-left md:px-8 md:pl-10"
        style={{ minHeight: 0 }}
        aria-expanded={open}
      >
        <div
          className="text-[28px] italic leading-none tracking-tight md:text-[34px]"
          style={{ fontFamily: "var(--font-serif)", color: accent }}
        >
          {String(group.order + 1).padStart(2, "0")}
        </div>

        <div className="min-w-0">
          <h3
            className="text-[clamp(20px,2.8vw,28px)] font-normal leading-[1.1] tracking-[-0.5px] text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {italicizeLastWord(group.title)}
          </h3>
          <p
            className="mt-2 font-mono text-[11px] uppercase tracking-[1.5px] text-foreground/45 md:text-[12px]"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {total} {total > 1 ? "exos" : "exo"}
            {hasAvailable && !allDone && (
              <>
                {" "}
                ·{" "}
                <span style={{ color: "var(--state-active)" }}>
                  {group.items.filter((e) => e.state === "available").length} à faire
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div
            className="hidden items-center gap-2 font-mono text-[11px] tracking-[1px] md:flex"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            <span
              style={{ color: allDone ? STATE.done : "var(--foreground)" }}
              className="tabular-nums"
            >
              {String(doneCount).padStart(2, "0")}
            </span>
            <span className="opacity-40">/</span>
            <span className="opacity-60 tabular-nums">{String(total).padStart(2, "0")}</span>
            {allDone && <Check size={14} style={{ color: STATE.done }} aria-hidden="true" />}
          </div>

          <div
            className="flex size-8 items-center justify-center border transition-transform duration-300"
            style={{
              borderColor: "var(--state-locked-border)",
              color: "var(--foreground)",
              transform: open ? "rotate(180deg)" : "rotate(0)",
            }}
            aria-hidden="true"
          >
            <ChevronDown size={14} />
          </div>
        </div>
      </button>

      {/* Expandable — liste d'exos (LessonLine style) */}
      <div className={`ds-collapse-wrap ${open ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          <div className="relative z-10 border-t border-foreground/10 px-6 py-2 md:px-10 md:pl-12">
            <ul role="list" className="flex flex-col divide-y divide-foreground/10">
              {group.items.map((exo, i) => (
                <ExoLine
                  key={exo._id as string}
                  exo={exo}
                  index={i}
                  accent={accent}
                  isNext={(exo._id as string) === firstAvailableId}
                />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ligne d'exo (style LessonLine) ────────────────────────────────────────

function ExoLine({
  exo,
  index,
  accent,
  isNext,
}: {
  exo: Exo;
  index: number;
  accent: string;
  isNext: boolean;
}) {
  const state = exo.state;
  const unlocked = state !== "locked";
  const completed = state === "completed";
  const href = `/lesson/${exo.lessonId}`;

  const directUrl = React.useMemo(() => {
    if (!exo.exerciseUrl || typeof window === "undefined") return null;
    try {
      const u = new URL(exo.exerciseUrl, window.location.origin);
      if (u.origin === window.location.origin) {
        u.searchParams.set("return", "/dashboard/outils");
      }
      return u.pathname + u.search;
    } catch {
      return exo.exerciseUrl;
    }
  }, [exo.exerciseUrl]);

  // Pastille sémantique (mêmes règles que LessonLine du dashboard)
  const pillBg = completed
    ? STATE.doneBg
    : isNext && unlocked
    ? STATE.activeBg
    : "transparent";
  const pillBorder =
    completed || (isNext && unlocked)
      ? "transparent"
      : unlocked
      ? "var(--fg-faint)"
      : "var(--fg-line)";
  const pillColor = completed
    ? STATE.doneFg
    : isNext && unlocked
    ? STATE.activeFg
    : unlocked
    ? "var(--foreground)"
    : STATE.locked;

  const rowContent = (
    <div
      className={`group/exo relative flex items-center gap-4 overflow-hidden px-2 py-3 ${
        unlocked ? "" : "cursor-not-allowed"
      }`}
    >
      {unlocked && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-0 origin-bottom transition-[height] duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover/exo:h-full"
          style={{ background: `${accent}40` }}
        />
      )}
      <div className="relative z-10 flex flex-1 items-center gap-4">
        {/* Pastille état */}
        <div
          className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold"
          style={{
            background: pillBg,
            borderColor: pillBorder,
            color: pillColor,
            fontFamily: "var(--font-body-legacy)",
          }}
        >
          {completed ? (
            <Check size={11} aria-hidden="true" />
          ) : !unlocked ? (
            <Lock size={10} aria-hidden="true" />
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </div>

        {/* Titre + sous-titre leçon */}
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-normal leading-snug"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "16px",
              color: completed
                ? "var(--fg-soft)"
                : unlocked
                ? "var(--foreground)"
                : "var(--state-locked)",
            }}
          >
            {exo.title}
          </div>
          <div
            className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Leçon {String(exo.lessonOrder + 1).padStart(2, "0")} · {exo.lessonTitle}
            <span className="sr-only">
              {completed
                ? " — Complété"
                : !unlocked
                ? " — Verrouillé"
                : isNext
                ? " — À reprendre"
                : " — À faire"}
            </span>
          </div>
        </div>

        {/* Actions droite : external link (secondaire) + badge état */}
        <div className="flex shrink-0 items-center gap-2">
          {directUrl && unlocked && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ouvrir l'exo en nouvel onglet"
              aria-label={`Ouvrir ${exo.title} dans un nouvel onglet`}
              className="flex size-7 items-center justify-center rounded-full border border-foreground/12 text-foreground/50 transition-all hover:border-foreground/35 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}

          {completed ? (
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
              style={{
                background: STATE.doneBg,
                color: STATE.doneFg,
                fontFamily: "var(--font-body-legacy)",
              }}
            >
              ✓ FAIT
            </span>
          ) : isNext && unlocked ? (
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
              style={{
                background: STATE.activeBg,
                color: STATE.activeFg,
                fontFamily: "var(--font-body-legacy)",
              }}
            >
              ● CONTINUER
            </span>
          ) : !unlocked ? (
            <span
              className="flex items-center gap-1 border border-dashed px-2 py-1 font-mono text-[10px] uppercase tracking-[1.5px]"
              style={{
                color: STATE.locked,
                borderColor: STATE.lockedBorder,
                fontFamily: "var(--font-body-legacy)",
              }}
            >
              <Lock size={10} aria-hidden="true" />
              BLOQUÉ
            </span>
          ) : (
            <span
              className="text-lg italic text-foreground/30 transition-colors group-hover/exo:text-foreground/70"
              style={{ fontFamily: "var(--font-serif)" }}
              aria-hidden="true"
            >
              →
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (unlocked) {
    return (
      <li>
        <a href={href} className="block">
          {rowContent}
        </a>
      </li>
    );
  }
  return <li>{rowContent}</li>;
}
