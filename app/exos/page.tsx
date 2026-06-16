"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useMemo, useEffect } from "react";
import { Loader2, Lock, Check } from "lucide-react";
import type { FunctionReturnType } from "convex/server";

type ExoItem = FunctionReturnType<typeof api.exercises.listAllWithState>[number];
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
} from "../studio/_components/glass";
import { Kicker, BigTitle, EditorialBlock } from "@/app/_components/editorial";

// ============================================================================
// /exos — catalogue par module pour l'élève coaching.
//
// Pour chaque module on affiche soit la liste de ses exos (états À faire /
// Terminé) soit un écran « Verrouillé » avec la raison (engagement 3 mois,
// termine le module précédent…). L'admin voit tout sans gate.
// ============================================================================

type Status = "available" | "completed" | "locked" | "locked_module";

export default function ExosCatalogPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const summary = useQuery(api.exercises.accessSummary);
  const items = useQuery(api.exercises.listAllWithState);
  const complete = useMutation(api.exerciseResponses.complete);

  // Complétion auto : l'exo s'ouvre en nouvel onglet et, quand l'élève génère son
  // PDF, le bridge diffuse "amour:exercise-complete" (BroadcastChannel "amour-exo"
  // + postMessage). Le catalogue (resté ouvert = opener) le capte et marque l'exo
  // fait → remonte au dashboard coach. href du bridge = pathname de l'exo (sans ?v=).
  useEffect(() => {
    if (!items) return;
    const byPath = new Map(
      items.filter((i) => i.exerciseUrl).map((i) => [i.exerciseUrl!.split("?")[0], i._id])
    );
    const onComplete = (href?: string) => {
      if (!href) return;
      const id = byPath.get(href.split("?")[0]);
      if (id) void complete({ exerciseId: id }).catch(() => {});
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "amour:exercise-complete") onComplete(e.data.href);
    };
    window.addEventListener("message", onMsg);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("amour-exo");
      ch.addEventListener("message", (e) => {
        if (e.data?.type === "amour:exercise-complete") onComplete(e.data.href);
      });
    } catch {
      // BroadcastChannel indispo → on garde le fallback postMessage (opener).
    }
    return () => {
      window.removeEventListener("message", onMsg);
      ch?.close();
    };
  }, [items, complete]);

  // Regroupement par module trié.
  type Group = {
    moduleId: string;
    moduleTitle: string;
    moduleOrder: number;
    moduleBadgeLabel: string;
    exos: ExoItem[];
  };
  const grouped = useMemo<Group[]>(() => {
    if (!items) return [];
    const map = new Map<string, Group>();
    for (const e of items) {
      const key = e.moduleId as unknown as string;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          moduleId: key,
          moduleTitle: e.moduleTitle,
          moduleOrder: e.moduleOrder,
          moduleBadgeLabel: e.moduleBadgeLabel,
          exos: [],
        };
        map.set(key, entry);
      }
      entry.exos.push(e);
    }
    return [...map.values()].sort((a, b) => a.moduleOrder - b.moduleOrder);
  }, [items]);

  if (summary === undefined || items === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  const isAdmin = summary.isAdmin;
  const duree = summary.duree;

  const totalCompleted = items.filter((i) => i.state === "completed").length;

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Hero éditorial */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <Kicker>Mes exercices</Kicker>
            <BigTitle w1="Mes" w2="Exos" />
            <div style={{ fontSize: 14.5, color: c.muted, marginTop: 8 }}>
              <span style={{ color: c.text, fontWeight: 500 }}>{totalCompleted}/{items.length}</span> terminés
              {!isAdmin && duree && (
                <> · engagement <span style={{ color: c.text }}>{duree === "3mois" ? "3 mois" : "1 mois"}</span></>
              )}
            </div>
          </div>
        </div>

        {/* Modules */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {grouped.map((g) => {
            const moduleAccessible = isAdmin || summary.accessibleModules.includes(g.moduleOrder);
            return (
              <EditorialBlock key={g.moduleId} c={c} style={{ padding: 0 }}>
                <div style={{ padding: "20px 24px", borderBottom: `1px solid ${c.line}`, display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ ...mono, color: c.muted, fontSize: 9.5, letterSpacing: "0.06em" }}>
                      MODULE {g.moduleOrder}{g.moduleBadgeLabel ? ` · ${g.moduleBadgeLabel.toUpperCase()}` : ""}
                    </div>
                    <div style={{ fontFamily: "var(--font-grotesk), 'Schibsted Grotesk', sans-serif", fontWeight: 700, fontSize: 22, marginTop: 6, letterSpacing: "-0.01em" }}>{g.moduleTitle}</div>
                  </div>
                  {!moduleAccessible && (
                    <span style={{ ...mono, fontSize: 10, padding: "6px 12px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}`, color: c.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Lock size={12} /> Verrouillé
                    </span>
                  )}
                </div>
                {moduleAccessible ? (
                  <ExosList c={c} exos={g.exos} />
                ) : (
                  <LockedReason c={c} duree={duree} moduleOrder={g.moduleOrder} />
                )}
              </EditorialBlock>
            );
          })}
          {grouped.length === 0 && (
            <EditorialBlock c={c}>
              <div style={{ ...mono, color: c.faint, padding: "20px 4px" }}>
                Aucun exercice disponible pour le moment.
              </div>
            </EditorialBlock>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────────

type C = ReturnType<typeof palette>;

function ExosList({
  c,
  exos,
}: {
  c: C;
  exos: ExoItem[];
}) {
  // Tri : disponibles en premier, puis completed, puis locked.
  const sorted = useMemo(() => {
    const order: Record<Status, number> = {
      available: 0,
      completed: 1,
      locked: 2,
      locked_module: 3,
    };
    return [...exos].sort((a, b) => {
      const so = order[a.state as Status] - order[b.state as Status];
      if (so !== 0) return so;
      return a.lessonOrder - b.lessonOrder;
    });
  }, [exos]);

  return (
    <div style={{ padding: "8px 0" }}>
      {sorted.map((ex, i) => (
        <ExoRow key={ex._id as unknown as string} c={c} ex={ex} last={i === sorted.length - 1} />
      ))}
    </div>
  );
}

function ExoRow({
  c,
  ex,
  last,
}: {
  c: C;
  ex: ExoItem;
  last: boolean;
}) {
  const isLocked = ex.state === "locked" || ex.state === "locked_module";
  const isCompleted = ex.state === "completed";
  const dotColor = isCompleted ? "#1FA463" : isLocked ? c.faint : ACCENT;
  const subLabel =
    ex.state === "completed"
      ? "Terminé"
      : ex.state === "locked"
      ? "Verrouillé · termine l'exo précédent"
      : ex.state === "locked_module"
      ? "Module verrouillé"
      : ex.progressPercent && ex.progressPercent > 0
      ? `En cours · ${Math.round(ex.progressPercent)} %`
      : "À commencer";

  const content = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        padding: "14px 24px",
        borderBottom: last ? "none" : `1px solid ${c.hairline}`,
        alignItems: "center",
        cursor: isLocked ? "default" : "pointer",
        opacity: isLocked ? 0.55 : 1,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: isCompleted ? "rgba(31,164,99,0.18)" : isLocked ? c.chip : `${ACCENT}1F`,
          border: `1px solid ${isCompleted ? "rgba(31,164,99,0.5)" : isLocked ? c.line : `${ACCENT}66`}`,
          color: dotColor,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {isCompleted ? <Check size={14} /> : isLocked ? <Lock size={13} /> : ex.lessonOrder}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
        <div style={{ ...mono, color: c.muted, marginTop: 3, fontSize: 9.5 }}>
          {ex.lessonTitle} · {subLabel}
        </div>
      </div>
      <span style={{ color: c.muted, fontSize: 18 }}>{isLocked ? "" : "›"}</span>
    </div>
  );

  if (isLocked) return content;

  // Exo interactif (a une URL) → ouvre DIRECTEMENT en plein écran (nouvel onglet),
  // plus de page détail intermédiaire. La complétion remonte via le bridge.
  if (ex.exerciseUrl) {
    return (
      <a
        href={ex.exerciseUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {content}
      </a>
    );
  }

  // Exo interne (config, sans URL) → page détail (renderer interne).
  return (
    <Link
      href={`/exos/${ex._id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = c.chip)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {content}
    </Link>
  );
}

function LockedReason({
  c,
  duree,
  moduleOrder,
}: {
  c: C;
  duree: "1mois" | "3mois" | null;
  moduleOrder: number;
}) {
  const reason =
    duree === "1mois"
      ? "Ce module est inclus dans l'engagement 3 mois."
      : `Termine le module ${moduleOrder - 1} pour débloquer celui-ci — ou demande à Walid de le débloquer manuellement.`;
  return (
    <div style={{ padding: "24px", display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          background: c.chip,
          border: `1px solid ${c.line}`,
          color: c.muted,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Lock size={16} />
      </div>
      <div style={{ ...mono, fontSize: 12, color: c.muted, lineHeight: 1.5 }}>{reason}</div>
    </div>
  );
}
