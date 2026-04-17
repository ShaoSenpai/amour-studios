"use client";

import * as React from "react";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, ArrowRight, ExternalLink, ChevronDown } from "lucide-react";
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

export function ExosGrid({ exos }: { exos: Exo[] }) {
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

      {/* Liste groupée par module */}
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
        <div className="flex flex-col gap-10">
          {groupedByModule.map((group) => (
            <ModuleSection key={group.id} group={group} />
          ))}
        </div>
      )}
    </>
  );
}

// ── Module section (collapsible) ─────────────────────────────────────────

function ModuleSection({
  group,
}: {
  group: { id: string; title: string; order: number; items: Exo[] };
}) {
  const accent = MODULE_ACCENTS[group.order % MODULE_ACCENTS.length];
  const doneCount = group.items.filter((e) => e.state === "completed").length;
  const total = group.items.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = doneCount === total && total > 0;

  // Modules 100% complétés fermés par défaut, les autres ouverts
  const [open, setOpen] = React.useState(!allDone);

  // Index du premier exo "available" dans ce module (pour le mettre en avant)
  const firstAvailableIdx = group.items.findIndex((e) => e.state === "available");

  return (
    <section role="region" aria-label={`Module ${group.order + 1} — ${group.title}`}>
      {/* Module header — clickable toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group/hdr flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span
          className="font-mono text-[13px] font-bold tabular-nums md:text-[15px]"
          style={{ fontFamily: "var(--font-body-legacy)", color: accent }}
        >
          {String(group.order + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="text-xl italic leading-tight md:text-2xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {group.title}
          </h3>
        </div>
        <span
          className="font-mono text-[10px] tabular-nums text-foreground/50"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {doneCount}/{total}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-foreground/40 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      {/* Barre de progression */}
      <div className="mt-2 mb-3 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>

      {/* Exo rows */}
      {open && (
        <ul role="list" className="flex flex-col">
          {group.items.map((exo, i) => (
            <ExoRow
              key={exo._id as string}
              exo={exo}
              index={i}
              accent={accent}
              isNext={i === firstAvailableIdx}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Exo row ──────────────────────────────────────────────────────────────

function ExoRow({
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

  return (
    <li
      className={`group flex items-center gap-3 border-b border-foreground/8 py-3 last:border-b-0 ${
        state === "locked" ? "opacity-50" : ""
      } ${isNext ? "relative -mx-3 rounded-md border-b-0 bg-foreground/[0.04] px-3 py-3.5" : ""}`}
      aria-current={isNext ? "step" : undefined}
      style={isNext ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      {/* Numéro / état */}
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
        style={{
          fontFamily: "var(--font-body-legacy)",
          background:
            state === "completed"
              ? "var(--state-done-bg)"
              : state === "available"
              ? `${accent}18`
              : "transparent",
          color:
            state === "completed"
              ? "var(--state-done-fg)"
              : state === "available"
              ? accent
              : "var(--foreground)",
          border:
            state === "locked" ? "1px dashed var(--fg-line, rgba(0,0,0,0.15))" : "none",
        }}
      >
        {state === "completed" ? (
          <Check size={14} aria-hidden="true" />
        ) : state === "locked" ? (
          <Lock size={12} aria-hidden="true" />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </div>

      {/* Titre + sous-titre leçon */}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[15px] leading-snug ${
            state === "completed"
              ? "text-foreground/60"
              : isNext
              ? "text-foreground font-medium"
              : "text-foreground"
          }`}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {exo.title}
        </div>
        <div
          className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          Leçon {String(exo.lessonOrder + 1).padStart(2, "0")} · {exo.lessonTitle}
          {/* Screen reader status */}
          <span className="sr-only">
            {state === "completed" ? " — Complété" : state === "locked" ? " — Verrouillé" : " — À faire"}
          </span>
        </div>
      </div>

      {/* Actions — touch targets 44px minimum sur mobile */}
      {state === "locked" ? (
        <span
          className="hidden font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/35 sm:inline"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          Verrouillé
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          {directUrl && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Nouvelle fenêtre"
              aria-label={`Ouvrir ${exo.title} dans un nouvel onglet`}
              className="flex size-9 items-center justify-center rounded-full border border-foreground/12 text-foreground/50 transition-all hover:border-foreground/35 hover:text-foreground md:size-7"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <Link
            href={href}
            className="flex min-h-[36px] items-center gap-1 rounded-full px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-all hover:pr-5 md:min-h-0 md:py-1.5"
            style={{
              background:
                isNext
                  ? accent
                  : state === "completed"
                  ? "var(--state-done-bg)"
                  : "var(--foreground)",
              color:
                isNext
                  ? "#0D0B08"
                  : state === "completed"
                  ? "var(--state-done-fg)"
                  : "var(--background)",
              fontFamily: "var(--font-body-legacy)",
            }}
          >
            {isNext ? "Continuer" : state === "completed" ? "Revoir" : "Ouvrir"}
            <ArrowRight size={10} aria-hidden="true" />
          </Link>
        </div>
      )}
    </li>
  );
}
