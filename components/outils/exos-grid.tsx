"use client";

import * as React from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Check, Lock, ChevronDown, ExternalLink, Hourglass } from "lucide-react";
import { MODULE_ACCENTS, moduleAccent, moduleAccentFg } from "@/lib/module-accents";

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
  // `locked_module` ajouté pour le gating coaching (nouveau /exos) — la page
  // legacy /dashboard/outils le traite comme un simple `locked`.
  state: "locked" | "locked_module" | "available" | "completed";
  completedAt?: number;
};

type Module = {
  _id: Id<"modules">;
  title: string;
  description: string;
  order: number;
  badgeLabel: string;
};

type Filter = "all" | "todo" | "done";

export function ExosGrid({
  exos,
  modules,
  firstAvailableId,
}: {
  exos: Exo[];
  modules: Module[];
  firstAvailableId: string | null;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [moduleFilter, setModuleFilter] = React.useState<string | null>(null);

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

  const exosByModule = React.useMemo(() => {
    const map = new Map<string, Exo[]>();
    for (const e of filtered) {
      const key = e.moduleId as string;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    // Sort exos inside each module by lessonOrder (puis par titre)
    for (const [k, list] of map) {
      list.sort((a, b) => a.lessonOrder - b.lessonOrder || a.title.localeCompare(b.title));
      map.set(k, list);
    }
    return map;
  }, [filtered]);

  // Quels modules montrer :
  //  - Filtre actif (tri ou module-specifique) → masquer les modules sans match
  //  - Sinon → tous les modules, les vides affichent "Bientôt"
  const hasActiveFilter = filter !== "all" || moduleFilter !== null;
  const visibleModules = React.useMemo(
    () =>
      [...modules]
        .sort((a, b) => a.order - b.order)
        .filter((m) => {
          if (moduleFilter && (m._id as string) !== moduleFilter) return false;
          if (!hasActiveFilter) return true;
          return (exosByModule.get(m._id as string) ?? []).length > 0;
        }),
    [modules, exosByModule, hasActiveFilter, moduleFilter]
  );

  const sortedModules = React.useMemo(
    () => [...modules].sort((a, b) => a.order - b.order),
    [modules]
  );

  // État d'ouverture par module (init : ouvert si non-terminé OU contient
  // l'exo à reprendre ; fermé sinon)
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const m of modules) {
      const items = exos.filter((e) => (e.moduleId as string) === (m._id as string));
      if (items.length === 0) {
        init[m._id as string] = false;
        continue;
      }
      const allDone = items.every((e) => e.state === "completed");
      const hasResume = firstAvailableId
        ? items.some((e) => (e._id as string) === firstAvailableId)
        : false;
      init[m._id as string] = hasResume || !allDone;
    }
    return init;
  });

  const toggleModule = (id: string) =>
    setOpenMap((o) => ({ ...o, [id]: !o[id] }));

  const openAll = () => {
    const all: Record<string, boolean> = {};
    sortedModules.forEach((m) => {
      all[m._id as string] = true;
    });
    setOpenMap(all);
  };
  const closeAll = () => {
    const all: Record<string, boolean> = {};
    sortedModules.forEach((m) => {
      all[m._id as string] = false;
    });
    setOpenMap(all);
  };

  const resetFilters = () => {
    setFilter("all");
    setModuleFilter(null);
  };

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

          {sortedModules.length > 1 && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-foreground/15" />
              {sortedModules.map((m) => {
                const isActive = moduleFilter === (m._id as string);
                const accent = MODULE_ACCENTS[m.order % MODULE_ACCENTS.length];
                return (
                  <button
                    key={m._id as string}
                    type="button"
                    onClick={() =>
                      setModuleFilter(isActive ? null : (m._id as string))
                    }
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

          {/* Spacer pousseur → boutons Tout ouvrir/Tout réduire à droite */}
          <span className="ml-auto hidden md:inline-block" aria-hidden="true" />
          <button
            type="button"
            onClick={openAll}
            className="shrink-0 border border-foreground/20 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:border-foreground/45 hover:text-foreground"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            Tout ouvrir
          </button>
          <button
            type="button"
            onClick={closeAll}
            className="shrink-0 border border-foreground/20 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:border-foreground/45 hover:text-foreground"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            Tout réduire
          </button>
        </div>
      </div>

      {/* Modules */}
      {visibleModules.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-dashed border-foreground/15 bg-foreground/[0.02] py-16 text-center">
          <p
            className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Aucun exo dans cette sélection
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="border border-foreground/20 bg-foreground/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:border-foreground/45 hover:text-foreground"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <div className="ds-cascade flex flex-col gap-3">
          {visibleModules.map((mod) => {
            const items = exosByModule.get(mod._id as string) ?? [];
            return (
              <ModuleSection
                key={mod._id as string}
                mod={mod}
                items={items}
                firstAvailableId={firstAvailableId}
                open={openMap[mod._id as string] ?? false}
                onToggle={() => toggleModule(mod._id as string)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Module section (bandeau coloré magazine + grille exos) ────────────────

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

function ModuleSection({
  mod,
  items,
  firstAvailableId,
  open,
  onToggle,
}: {
  mod: Module;
  items: Exo[];
  firstAvailableId: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const accent = moduleAccent(mod.order);
  const fg = moduleAccentFg(mod.order);
  const isEmpty = items.length === 0;
  const doneCount = items.filter((e) => e.state === "completed").length;

  return (
    <section
      className="overflow-hidden border border-foreground/15"
      aria-label={`Module ${mod.order + 1} — ${mod.title}`}
    >
      {/* Bandeau coloré — header cliquable */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-5 text-left transition-opacity hover:opacity-95 md:gap-6 md:px-8 md:py-6"
        style={{ background: accent, color: fg, minHeight: 0 }}
      >
        {/* N°XX serif italique */}
        <div
          className="shrink-0 text-[28px] italic leading-none tracking-tight md:text-[44px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          N°{String(mod.order + 1).padStart(2, "0")}
        </div>

        {/* Titre + description */}
        <div className="min-w-0 flex-1">
          <h3
            className="text-[22px] italic leading-[1.05] tracking-[-0.5px] md:text-[32px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {italicizeLastWord(mod.title)}
          </h3>
          {mod.description && (
            <p
              className="mt-1.5 font-mono text-[10px] uppercase leading-relaxed tracking-[1.5px] opacity-80 md:text-[11px]"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              {mod.description}
            </p>
          )}
        </div>

        {/* Right : badge count + chevron */}
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <span
            className="whitespace-nowrap border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.5px] md:px-3 md:text-[11px]"
            style={{
              fontFamily: "var(--font-body-legacy)",
              borderColor: `${fg}55`,
            }}
          >
            {isEmpty
              ? "Bientôt"
              : items.length === 1
              ? "1 exo"
              : `${items.length} exos`}
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`transition-transform duration-300 ${
              open ? "rotate-180" : "rotate-0"
            }`}
          />
        </div>
      </button>

      {/* Contenu déployable */}
      <div className={`ds-collapse-wrap ${open ? "open" : ""}`}>
        <div className="ds-collapse-inner">
          {isEmpty ? (
            <BientotState moduleOrder={mod.order} />
          ) : (
            <div className="grid grid-cols-1 gap-3 bg-foreground/[0.02] p-4 sm:grid-cols-2 md:p-5 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((exo) => (
                <ExoCard
                  key={exo._id as string}
                  exo={exo}
                  accent={accent}
                  accentFg={fg}
                  isNext={(exo._id as string) === firstAvailableId}
                />
              ))}
            </div>
          )}
          {/* Mini-footer progression si items > 0 et tous faits */}
          {!isEmpty && doneCount === items.length && (
            <div
              className="flex items-center gap-2 border-t border-foreground/10 bg-foreground/[0.02] px-5 py-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60 md:px-6"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              <Check size={12} aria-hidden="true" style={{ color: "var(--state-done)" }} />
              Module complété
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BientotState({ moduleOrder }: { moduleOrder: number }) {
  return (
    <div className="flex items-start gap-3 bg-foreground/[0.02] px-5 py-6 md:px-8 md:py-8">
      <Hourglass
        size={18}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-foreground/50"
      />
      <div className="min-w-0">
        <div
          className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          En production
        </div>
        <p
          className="mt-1.5 max-w-prose font-mono text-[12px] leading-[1.55] text-foreground/65"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          Les exercices du module{" "}
          {String(moduleOrder + 1).padStart(2, "0")} arrivent très bientôt.
          On prépare le stack complet — patience, ça vient.
        </p>
      </div>
    </div>
  );
}

// ── Carte exo (style magazine) ────────────────────────────────────────────

function ExoCard({
  exo,
  accent,
  accentFg,
  isNext,
}: {
  exo: Exo;
  accent: string;
  accentFg: string;
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

  const cardInner = (
    <div
      className={`group/card relative flex h-full flex-col justify-between gap-4 border bg-background p-4 transition-all md:p-5 ${
        unlocked
          ? "border-foreground/15 hover:border-foreground/40"
          : "cursor-not-allowed border-foreground/10 opacity-55"
      }`}
      style={
        isNext
          ? {
              borderLeftWidth: "3px",
              borderLeftColor: accent,
              paddingLeft: "calc(1rem - 2px)",
            }
          : undefined
      }
    >
      {/* Top : label Vidéo + titre exo */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <div
            className="font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Vidéo {String(exo.lessonOrder + 1).padStart(2, "0")}
          </div>
          {directUrl && unlocked && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Ouvrir l'exo dans un nouvel onglet"
              aria-label={`Ouvrir ${exo.title} dans un nouvel onglet`}
              onClick={(e) => e.stopPropagation()}
              className="flex size-6 items-center justify-center rounded-full border border-foreground/15 text-foreground/50 transition-all hover:border-foreground/45 hover:text-foreground"
            >
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          )}
        </div>
        <h4
          className="mt-2 text-[18px] italic leading-tight text-foreground md:text-[20px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {exo.title}
        </h4>
        <p
          className="mt-1 truncate font-mono text-[10px] text-foreground/45"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {exo.lessonTitle}
        </p>
      </div>

      {/* Bottom : état (CTA / badge) */}
      <div className="flex items-center justify-between">
        {completed ? (
          <span
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px]"
            style={{
              color: "var(--state-done)",
              fontFamily: "var(--font-body-legacy)",
            }}
          >
            <Check size={11} aria-hidden="true" /> Fait · Revoir
          </span>
        ) : isNext ? (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{
              background: accent,
              color: accentFg,
              fontFamily: "var(--font-body-legacy)",
            }}
          >
            ● Continuer
          </span>
        ) : !unlocked ? (
          <span
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/40"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            <Lock size={10} aria-hidden="true" /> Verrouillé
          </span>
        ) : (
          <span
            className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 transition-colors group-hover/card:text-foreground"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Ouvrir l&apos;exercice{" "}
            <span className="transition-transform group-hover/card:translate-x-0.5">
              →
            </span>
          </span>
        )}
      </div>
    </div>
  );

  if (unlocked) {
    return (
      <a href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40">
        {cardInner}
      </a>
    );
  }
  return cardInner;
}
