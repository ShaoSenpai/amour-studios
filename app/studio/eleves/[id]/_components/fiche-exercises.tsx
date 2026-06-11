"use client";

import { Id } from "@/convex/_generated/dataModel";
import {
  ACCENT,
  mono,
  fmtDateShort,
  type C,
} from "../../../_components/glass";

// Bloc « Exercices » — liste lecture seule des exos de l'élève + état + date.
type FicheExerciseItem = {
  _id: Id<"exercises"> | string;
  title: string;
  state: "available" | "locked" | "locked_module" | "completed";
  moduleOrder: number;
  moduleTitle: string;
  lessonTitle: string;
  completedAt?: number;
  responseUpdatedAt?: number;
  progressPercent?: number;
};
export function ExercisesBlock({
  c,
  exercises,
}: {
  c: C;
  exercises: FicheExerciseItem[];
}) {
  if (exercises.length === 0) {
    return <div style={{ ...mono, color: c.faint }}>Aucun exercice pour cet élève.</div>;
  }
  const sorted = [...exercises].sort((a, b) => {
    if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
    return (a.title || "").localeCompare(b.title || "");
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((ex, i) => {
        const isCompleted = ex.state === "completed";
        const isLocked = ex.state === "locked" || ex.state === "locked_module";
        const tone = isCompleted ? "#1FA463" : isLocked ? c.muted : ACCENT;
        const subLabel =
          ex.state === "completed"
            ? ex.completedAt
              ? `Terminé · ${fmtDateShort(ex.completedAt)}`
              : "Terminé"
            : ex.state === "locked_module"
            ? "Module verrouillé"
            : ex.state === "locked"
            ? "À débloquer (séquence)"
            : ex.responseUpdatedAt
            ? `En cours · ${Math.round(ex.progressPercent ?? 0)} %`
            : "À commencer";
        return (
          <a
            key={(ex._id as unknown as string) + i}
            href={`/exos/${ex._id as unknown as string}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: c.chip,
              border: `1px solid ${c.hairline}`,
              textDecoration: "none",
              color: c.text,
              fontFamily: "inherit",
              alignItems: "center",
              opacity: isLocked ? 0.65 : 1,
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: 9,
                padding: "3px 7px",
                borderRadius: 999,
                background: `${tone}1F`,
                border: `1px solid ${tone}66`,
                color: tone,
                whiteSpace: "nowrap",
              }}
            >
              M{ex.moduleOrder}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.title}</div>
              <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>{subLabel}</div>
            </div>
            <span style={{ color: c.muted, fontSize: 14 }}>↗</span>
          </a>
        );
      })}
    </div>
  );
}
