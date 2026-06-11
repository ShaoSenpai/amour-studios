"use client";

import { Id } from "@/convex/_generated/dataModel";
import {
  ACCENT,
  mono,
  num,
  curriculumLabel,
  type C,
} from "../../../_components/glass";

type CurItem = {
  _id: Id<"curriculum">;
  moduleNo: number;
  moduleTitle: string;
  lessonNo: number;
  lessonTitle: string;
  order: number;
};

export function CurriculumTimeline({
  c,
  curriculum,
  doneIds,
  currentId,
  unlockedLessonIds,
  duree,
  onToggleLesson,
}: {
  c: C;
  curriculum: CurItem[];
  doneIds: Set<string>;
  currentId: string | null;
  unlockedLessonIds: Set<string>;
  duree: "1mois" | "3mois" | null;
  onToggleLesson: (lessonId: string, on: boolean) => void;
}) {
  const items = [...curriculum].sort((a, b) => a.order - b.order);

  // Item « actuellement » + libellé d'en-tête.
  const currentItem =
    currentId != null
      ? items.find((it) => (it._id as unknown as string) === currentId) ?? null
      : null;
  const total = items.length;
  const doneCount = items.filter((it) => doneIds.has(it._id as unknown as string)).length;
  const allDone = total > 0 && doneCount === total;
  const notStarted = doneCount === 0 && currentItem == null;
  const headLabel = allDone
    ? "Parcours terminé"
    : notStarted
    ? "Parcours non démarré"
    : currentItem
    ? curriculumLabel(currentItem)
    : "—";

  // Regroupement par module (trié), pastilles par leçon (triées par lessonNo).
  const moduleOrder: number[] = [];
  const byModule = new Map<number, CurItem[]>();
  for (const it of items) {
    if (!byModule.has(it.moduleNo)) {
      byModule.set(it.moduleNo, []);
      moduleOrder.push(it.moduleNo);
    }
    byModule.get(it.moduleNo)!.push(it);
  }
  moduleOrder.sort((a, b) => a - b);

  // Helper : une leçon est-elle débloquée ? M1 toujours implicite.
  const isUnlocked = (item: CurItem) =>
    item.moduleNo === 1 || unlockedLessonIds.has(item._id as unknown as string);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              ...mono,
              fontSize: 9.5,
              padding: "4px 9px",
              borderRadius: 999,
              background: allDone ? ACCENT : notStarted ? c.chip : `${ACCENT}1A`,
              color: allDone ? "#0B0B0B" : notStarted ? c.muted : ACCENT,
              border: `1px solid ${allDone ? "transparent" : notStarted ? c.line : ACCENT}`,
              whiteSpace: "nowrap",
            }}
          >
            Actuellement •
          </span>
          <span style={{ ...num, fontSize: 17, fontWeight: 500 }}>{headLabel}</span>
        </div>
        <span style={{ ...mono, color: c.faint, fontSize: 9.5 }}>{doneCount}/{total}</span>
      </div>

      {/* Lignes par module */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {moduleOrder.map((mNo) => {
          const lessons = (byModule.get(mNo) ?? []).slice().sort((a, b) => a.lessonNo - b.lessonNo);
          const mTitle = lessons[0]?.moduleTitle ?? "";
          const mDone = lessons.filter((l) => doneIds.has(l._id as unknown as string)).length;
          // Engagement 1 mois : seul M1 est manipulable, M2/M3 sont verrouillés.
          const restrictedBy1Mois = duree === "1mois" && mNo !== 1;
          // Module entièrement verrouillé : aucune leçon débloquée (hors M1).
          const moduleAllLocked =
            mNo !== 1 && lessons.every((l) => !isUnlocked(l));
          const rowOpacity = restrictedBy1Mois || moduleAllLocked ? 0.5 : 1;
          return (
            <div
              key={mNo}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                opacity: rowOpacity,
                transition: "opacity 160ms ease",
              }}
              title={
                restrictedBy1Mois
                  ? "Engagement 3 mois requis"
                  : moduleAllLocked
                  ? "Module verrouillé · click sur un cercle pour débloquer une leçon"
                  : undefined
              }
            >
              <div style={{ minWidth: 150, flex: "1 1 150px" }}>
                <div style={{ ...num, fontSize: 14.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  M{mNo} · {mTitle}
                  {(moduleAllLocked || restrictedBy1Mois) && (
                    <span aria-label="verrouillé" style={{ fontSize: 12, opacity: 0.7 }}>🔒</span>
                  )}
                </div>
                <div style={{ ...mono, color: c.faint, fontSize: 9, marginTop: 2 }}>
                  {restrictedBy1Mois || moduleAllLocked
                    ? "Verrouillé"
                    : `${mDone}/${lessons.length}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {lessons.map((l, i) => {
                  const idStr = l._id as unknown as string;
                  const isCurrent = currentId != null && idStr === currentId;
                  const isDone = doneIds.has(idStr);
                  const unlocked = isUnlocked(l);
                  // Détermine l'état visuel + interactivité.
                  let state: "done" | "current" | "todo" | "locked";
                  if (isDone) state = "done";
                  else if (isCurrent) state = "current";
                  else if (unlocked) state = "todo";
                  else state = "locked";
                  // Click handler : on ne touche jamais aux leçons faites/en cours
                  // (sécurité pour pas perdre la progression). M1 est implicite
                  // pour tout coaching actif et n'est jamais stockée — le
                  // backend court-circuite silencieusement. On rend donc M1
                  // visuellement non-cliquable pour éviter une UX confuse
                  // (curseur pointer + zéro feedback au click).
                  const canClick =
                    !restrictedBy1Mois &&
                    l.moduleNo !== 1 &&
                    !isDone &&
                    !isCurrent &&
                    (state === "todo" || state === "locked");
                  const handleClick = () => {
                    if (!canClick) return;
                    onToggleLesson(idStr, state === "locked");
                  };
                  return (
                    <div key={idStr} style={{ display: "flex", alignItems: "center" }}>
                      <Dot
                        c={c}
                        state={state}
                        lessonNo={l.lessonNo}
                        canClick={canClick}
                        onClick={handleClick}
                      />
                      {i < lessons.length - 1 && (
                        <div style={{ width: 10, height: 2, background: c.line }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Légende */}
      <div style={{ ...mono, color: c.faint, fontSize: 9, marginTop: 16 }}>
        ✓ faite · ◉ en cours · ○ à venir · 🔒 verrouillée · click sur un cercle pour (dé)verrouiller
      </div>
    </>
  );
}

function Dot({
  c,
  state,
  lessonNo,
  canClick,
  onClick,
}: {
  c: C;
  state: "done" | "current" | "todo" | "locked";
  lessonNo: number;
  canClick?: boolean;
  onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...mono,
    fontSize: 10.5,
    fontWeight: 500,
    flexShrink: 0,
    cursor: canClick ? "pointer" : "default",
    transition: "transform 120ms ease, box-shadow 160ms ease, background 160ms ease",
  };
  if (state === "done") {
    return (
      <div
        title={`Leçon ${lessonNo} · faite`}
        style={{ ...base, background: ACCENT, color: "#0B0B0B", border: "1px solid transparent" }}
      >
        ✓
      </div>
    );
  }
  if (state === "current") {
    return (
      <div
        title={`Leçon ${lessonNo} · en cours`}
        style={{
          ...base,
          background: `${ACCENT}1A`,
          color: ACCENT,
          border: `2px solid ${ACCENT}`,
          boxShadow: `0 0 0 5px ${ACCENT}22`,
        }}
      >
        {lessonNo}
      </div>
    );
  }
  if (state === "locked") {
    return (
      <div
        role={canClick ? "button" : undefined}
        tabIndex={canClick ? 0 : -1}
        aria-label={`Déverrouiller la leçon ${lessonNo}`}
        title={
          canClick
            ? `Leçon ${lessonNo} · verrouillée · click pour débloquer`
            : `Leçon ${lessonNo} · verrouillée`
        }
        onClick={canClick ? onClick : undefined}
        onKeyDown={
          canClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        style={{
          ...base,
          background: c.chip,
          color: c.faint,
          border: `1px dashed ${c.line}`,
          opacity: 0.55,
        }}
        onMouseEnter={(e) => {
          if (canClick) e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          if (canClick) e.currentTarget.style.opacity = "0.55";
        }}
      >
        🔒
      </div>
    );
  }
  return (
    <div
      role={canClick ? "button" : undefined}
      tabIndex={canClick ? 0 : -1}
      aria-label={canClick ? `Verrouiller la leçon ${lessonNo}` : undefined}
      title={
        canClick
          ? `Leçon ${lessonNo} · à venir · click pour reverrouiller`
          : `Leçon ${lessonNo} · à venir`
      }
      onClick={canClick ? onClick : undefined}
      onKeyDown={
        canClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{ ...base, background: "transparent", color: c.muted, border: `1px solid ${c.line}` }}
      onMouseEnter={(e) => {
        if (canClick) e.currentTarget.style.background = c.chip;
      }}
      onMouseLeave={(e) => {
        if (canClick) e.currentTarget.style.background = "transparent";
      }}
    >
      {lessonNo}
    </div>
  );
}
