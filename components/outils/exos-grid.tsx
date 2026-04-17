"use client";

import * as React from "react";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, ArrowRight, ExternalLink } from "lucide-react";

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

const MODULE_ACCENTS = [
  "#F5B820", "#FF6B1F", "#E63326", "#F2B8A2", "#2B7A6F", "#0D4D35",
];

export function ExosGrid({ exos }: { exos: Exo[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [moduleFilter, setModuleFilter] = React.useState<string | null>(null);

  const modulesUsed = Array.from(
    new Map(exos.map((e) => [e.moduleId as string, e])).values()
  )
    .sort((a, b) => a.moduleOrder - b.moduleOrder)
    .map((e) => ({ id: e.moduleId as string, title: e.moduleTitle, order: e.moduleOrder }));

  const filtered = exos.filter((e) => {
    if (moduleFilter && (e.moduleId as string) !== moduleFilter) return false;
    if (filter === "todo") return e.state === "available";
    if (filter === "done") return e.state === "completed";
    return true;
  });

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

  return (
    <>
      {/* Filtres */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {([
          { key: "all" as Filter, label: "Tous" },
          { key: "todo" as Filter, label: "À faire" },
          { key: "done" as Filter, label: "Complétés" },
        ]).map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
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
            <span className="mx-1 h-5 w-px bg-foreground/15" />
            {modulesUsed.map((m) => {
              const isActive = moduleFilter === m.id;
              const accent = MODULE_ACCENTS[m.order % MODULE_ACCENTS.length];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModuleFilter(isActive ? null : m.id)}
                  className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 bg-foreground/[0.03] text-foreground/70 hover:border-foreground/45"
                  }`}
                  style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                >
                  <span className="inline-block size-2 rounded-full" style={{ background: accent }} />
                  {String(m.order + 1).padStart(2, "0")}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Liste groupée par module */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border border-dashed border-foreground/15 bg-foreground/[0.02] py-16 text-center">
          <p
            className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Aucun exo dans cette sélection
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groupedByModule.map((group) => {
            const accent = MODULE_ACCENTS[group.order % MODULE_ACCENTS.length];
            const doneCount = group.items.filter((e) => e.state === "completed").length;
            const total = group.items.length;
            const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

            return (
              <section key={group.id}>
                {/* Module header — gros, clair, hiérarchique */}
                <div className="mb-1 flex items-baseline gap-3">
                  <span
                    className="font-mono text-[11px] font-bold tabular-nums"
                    style={{ fontFamily: "var(--font-body-legacy)", color: accent }}
                  >
                    {String(group.order + 1).padStart(2, "0")}
                  </span>
                  <h3
                    className="flex-1 text-xl italic leading-tight md:text-2xl"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {group.title}
                  </h3>
                  <span
                    className="font-mono text-[10px] tabular-nums text-foreground/50"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    {doneCount}/{total}
                  </span>
                </div>
                {/* Barre de progression module */}
                <div className="mb-4 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${pct}%`, background: accent }}
                  />
                </div>

                {/* Exo rows — compacts, pas de doublon leçon */}
                <div className="flex flex-col">
                  {group.items.map((exo, i) => (
                    <ExoRow key={exo._id as string} exo={exo} index={i} accent={accent} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ExoRow({ exo, index, accent }: { exo: Exo; index: number; accent: string }) {
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
    <div
      className={`group flex items-center gap-3 border-b border-foreground/8 py-3 last:border-b-0 ${
        state === "locked" ? "opacity-45" : ""
      }`}
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
          <Check size={14} />
        ) : state === "locked" ? (
          <Lock size={12} />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </div>

      {/* Titre uniquement — pas de doublon leçon */}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[15px] leading-snug ${
            state === "completed" ? "text-foreground/65" : "text-foreground"
          }`}
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {exo.title}
        </div>
      </div>

      {/* Actions */}
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
              className="flex size-7 items-center justify-center rounded-full border border-foreground/12 text-foreground/50 transition-all hover:border-foreground/35 hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={11} />
            </a>
          )}
          <Link
            href={href}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-all hover:pr-4"
            style={{
              background: state === "completed" ? "var(--state-done-bg)" : "#0D0B08",
              color: state === "completed" ? "var(--state-done-fg)" : "#F0E9DB",
              fontFamily: "var(--font-body-legacy)",
              minHeight: 0,
            }}
          >
            {state === "completed" ? "Revoir" : "Ouvrir"}
            <ArrowRight size={10} />
          </Link>
        </div>
      )}
    </div>
  );
}
