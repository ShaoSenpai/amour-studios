"use client";

import * as React from "react";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, Play, ArrowRight, ExternalLink } from "lucide-react";

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

const STORAGE_KEY = "amour-exos-seen";

function readSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch {}
  return new Set();
}

function writeSeen(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes exo-unlock-pulse {
      0%   { box-shadow: 0 0 0 0 var(--brand-glow, rgba(30,165,116,0.6)); }
      50%  { box-shadow: 0 0 0 12px rgba(30,165,116,0); }
      100% { box-shadow: 0 0 0 0 rgba(30,165,116,0); }
    }
    @keyframes exo-lock-break {
      0%   { transform: scale(1) rotate(0); }
      20%  { transform: scale(1.1) rotate(-8deg); }
      40%  { transform: scale(0.8) rotate(12deg); opacity: 0.6; }
      100% { transform: scale(0) rotate(60deg); opacity: 0; }
    }
    .exo-row-new { animation: exo-unlock-pulse 1400ms ease-out; }
    .exo-lock-breaking { animation: exo-lock-break 700ms cubic-bezier(.5,0,.75,0) forwards; }
  `;
  document.head.appendChild(style);
}

export function ExosGrid({ exos }: { exos: Exo[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [moduleFilter, setModuleFilter] = React.useState<string | null>(null);

  React.useEffect(() => {
    injectStyles();
  }, []);

  const [newlyAvailable, setNewlyAvailable] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    const seen = readSeen();
    const currentAvailable = new Set(
      exos.filter((e) => e.state === "available").map((e) => e._id as string)
    );
    const diff = new Set<string>();
    for (const id of currentAvailable) {
      if (!seen.has(id)) diff.add(id);
    }
    if (diff.size > 0) setNewlyAvailable(diff);
    writeSeen([...currentAvailable]);
    const t = setTimeout(() => setNewlyAvailable(new Set()), 2200);
    return () => clearTimeout(t);
  }, [exos]);

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

  // Group by module for list view
  const groupedByModule = React.useMemo(() => {
    const map = new Map<string, { title: string; order: number; badgeLabel: string; items: Exo[] }>();
    for (const exo of filtered) {
      const key = exo.moduleId as string;
      if (!map.has(key)) {
        map.set(key, {
          title: exo.moduleTitle,
          order: exo.moduleOrder,
          badgeLabel: exo.moduleBadgeLabel,
          items: [],
        });
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
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
        {modulesUsed.length > 0 && (
          <>
            <span className="mx-2 h-5 w-px bg-foreground/15" />
            <button
              type="button"
              onClick={() => setModuleFilter(null)}
              className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                moduleFilter === null
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 bg-foreground/[0.03] text-foreground/70 hover:border-foreground/45"
              }`}
              style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
            >
              Tous modules
            </button>
            {modulesUsed.map((m) => {
              const isActive = moduleFilter === m.id;
              const accent = MODULE_ACCENTS[m.order % MODULE_ACCENTS.length];
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModuleFilter(isActive ? null : m.id)}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] transition-colors ${
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 bg-foreground/[0.03] text-foreground/70 hover:border-foreground/45"
                  }`}
                  style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: accent }}
                  />
                  M{String(m.order + 1).padStart(2, "0")}
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
        <div className="flex flex-col gap-6">
          {groupedByModule.map((group) => {
            const accent = MODULE_ACCENTS[group.order % MODULE_ACCENTS.length];
            const doneCount = group.items.filter((e) => e.state === "completed").length;
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-foreground/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: accent }}
                    />
                    <span
                      className="font-mono text-[10px] uppercase tracking-[2px]"
                      style={{ fontFamily: "var(--font-body-legacy)", color: accent }}
                    >
                      Module {String(group.order + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="text-base italic leading-none"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {group.title}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 tabular-nums"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    {doneCount}/{group.items.length}
                  </span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((exo) => (
                    <ExoRow
                      key={exo._id as string}
                      exo={exo}
                      accent={accent}
                      isNewlyAvailable={newlyAvailable.has(exo._id as string)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ExoRow({
  exo,
  accent,
  isNewlyAvailable,
}: {
  exo: Exo;
  accent: string;
  isNewlyAvailable: boolean;
}) {
  const state = exo.state;

  const [lockBreaking, setLockBreaking] = React.useState(false);
  React.useEffect(() => {
    if (isNewlyAvailable) {
      setLockBreaking(true);
      const t = setTimeout(() => setLockBreaking(false), 750);
      return () => clearTimeout(t);
    }
  }, [isNewlyAvailable]);

  const href = `/lesson/${exo.lessonId}`;
  const directUrl = React.useMemo(() => {
    if (!exo.exerciseUrl) return null;
    if (typeof window === "undefined") return exo.exerciseUrl;
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

  const stateColor =
    state === "completed"
      ? "var(--state-done)"
      : state === "available"
      ? accent
      : "rgba(255,255,255,0.25)";

  const stateIcon =
    state === "completed" ? (
      <Check size={13} />
    ) : state === "available" ? (
      <Play size={11} className="ml-0.5" />
    ) : (
      <Lock size={11} className={lockBreaking ? "exo-lock-breaking" : ""} />
    );

  return (
    <li
      className={`group relative flex items-center gap-3 border-b border-foreground/10 py-3 transition-colors last:border-b-0 ${
        state === "locked" ? "opacity-55" : "hover:bg-foreground/[0.03]"
      } ${isNewlyAvailable ? "exo-row-new" : ""}`}
    >
      {/* État icône */}
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background:
            state === "completed"
              ? "var(--state-done-bg)"
              : state === "available"
              ? "rgba(255,255,255,0.06)"
              : "rgba(255,255,255,0.04)",
          color:
            state === "completed" ? "var(--state-done-fg)" : "var(--foreground)",
        }}
      >
        {stateIcon}
      </div>

      {/* Lesson ref + title */}
      <div className="min-w-0 flex-1">
        <div
          className="font-mono text-[9px] uppercase tracking-[1.5px]"
          style={{ fontFamily: "var(--font-body-legacy)", color: stateColor }}
        >
          Leçon {String(exo.lessonOrder + 1).padStart(2, "0")} ·{" "}
          <span className="truncate text-foreground/50">{exo.lessonTitle}</span>
        </div>
        <div
          className="mt-0.5 truncate text-base leading-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {exo.title}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {state === "locked" ? (
          <span
            className="hidden font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40 md:inline"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Termine la leçon
          </span>
        ) : (
          <>
            {directUrl && (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir dans une nouvelle fenêtre"
                className="flex size-7 items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.03] text-foreground/60 transition-all hover:border-foreground/40 hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={11} />
              </a>
            )}
            <Link
              href={href}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-all hover:pr-4"
              style={{
                background:
                  state === "completed" ? "var(--state-done-bg)" : "#0D0B08",
                color:
                  state === "completed" ? "var(--state-done-fg)" : "#F0E9DB",
                fontFamily: "var(--font-body-legacy)",
                minHeight: 0,
              }}
            >
              {state === "completed" ? "Revoir" : "Ouvrir"}
              <ArrowRight size={10} />
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
