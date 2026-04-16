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
      50%  { box-shadow: 0 0 0 14px rgba(30,165,116,0); }
      100% { box-shadow: 0 0 0 0 rgba(30,165,116,0); }
    }
    @keyframes exo-lock-break {
      0%   { transform: scale(1) rotate(0); }
      20%  { transform: scale(1.1) rotate(-8deg); }
      40%  { transform: scale(0.8) rotate(12deg); opacity: 0.6; }
      100% { transform: scale(0) rotate(60deg); opacity: 0; }
    }
    .exo-card-new { animation: exo-unlock-pulse 1400ms ease-out; }
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

  // Détection des exos nouvellement disponibles (pour anim unlock)
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
    // Update storage avec l'état actuel
    writeSeen([...currentAvailable]);
    // Clear l'anim après 2s
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

      {/* Grid */}
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((exo) => (
            <ExoCard key={exo._id as string} exo={exo} isNewlyAvailable={newlyAvailable.has(exo._id as string)} />
          ))}
        </div>
      )}
    </>
  );
}

function ExoCard({ exo, isNewlyAvailable }: { exo: Exo; isNewlyAvailable: boolean }) {
  const accent = MODULE_ACCENTS[exo.moduleOrder % MODULE_ACCENTS.length];
  const state = exo.state;

  const [lockBreaking, setLockBreaking] = React.useState(false);
  React.useEffect(() => {
    if (isNewlyAvailable) {
      setLockBreaking(true);
      const t = setTimeout(() => setLockBreaking(false), 750);
      return () => clearTimeout(t);
    }
  }, [isNewlyAvailable]);

  // URL vers la leçon de l'exo (pour y accéder via le panneau Exos)
  const href = `/lesson/${exo.lessonId}`;
  // Ou ouverture directe dans grande fenêtre si exerciseUrl existe
  const directUrl = exo.exerciseUrl
    ? (() => {
        try {
          const u = new URL(exo.exerciseUrl, window.location.origin);
          if (u.origin === window.location.origin) {
            u.searchParams.set("return", "/dashboard/outils");
          }
          return u.pathname + u.search;
        } catch {
          return exo.exerciseUrl;
        }
      })()
    : null;

  const stateLabel =
    state === "completed"
      ? "✓ Validé"
      : state === "available"
      ? "◦ À faire"
      : "◉ Verrouillé";

  const stateColor =
    state === "completed"
      ? "var(--state-done)"
      : state === "available"
      ? accent
      : "rgba(255,255,255,0.3)";

  return (
    <div
      className={`group relative flex flex-col border bg-foreground/[0.02] p-5 transition-all ${
        state === "locked"
          ? "border-foreground/10 opacity-60"
          : "border-foreground/15 hover:border-foreground/35 hover:bg-foreground/[0.05]"
      } ${isNewlyAvailable ? "exo-card-new" : ""}`}
    >
      {/* Header : module + status */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[2px]"
          style={{ fontFamily: "var(--font-body-legacy)", color: accent }}
        >
          <span className="inline-block size-2 rounded-full" style={{ background: accent }} />
          {exo.moduleBadgeLabel ?? `Module ${String(exo.moduleOrder + 1).padStart(2, "0")}`}
        </div>
        <div
          className="font-mono text-[9px] uppercase tracking-[1.5px]"
          style={{ fontFamily: "var(--font-body-legacy)", color: stateColor }}
        >
          {stateLabel}
        </div>
      </div>

      {/* Title */}
      <h3
        className="mb-1 text-xl italic leading-tight"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {exo.title}
      </h3>
      <p
        className="mb-4 font-mono text-[11px] text-foreground/55"
        style={{ fontFamily: "var(--font-body-legacy)" }}
      >
        Leçon {String(exo.lessonOrder + 1).padStart(2, "0")} · {exo.lessonTitle}
      </p>

      {/* Icône d'état + CTA */}
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="flex size-9 items-center justify-center rounded-full" style={{
          background:
            state === "completed"
              ? "var(--state-done-bg)"
              : state === "available"
              ? "rgba(255,255,255,0.06)"
              : "rgba(255,255,255,0.04)",
          color:
            state === "completed"
              ? "var(--state-done-fg)"
              : "var(--foreground)",
        }}>
          {state === "completed" ? (
            <Check size={16} />
          ) : state === "available" ? (
            <Play size={14} className="ml-0.5" />
          ) : (
            <Lock
              size={14}
              className={lockBreaking ? "exo-lock-breaking" : ""}
            />
          )}
        </div>

        {state === "locked" ? (
          <span
            className="font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Termine la leçon
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {directUrl && (
              <a
                href={directUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full border border-foreground/20 bg-foreground/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/80 transition-colors hover:border-foreground/45 hover:text-foreground"
                style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} /> Fenêtre
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
              <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
