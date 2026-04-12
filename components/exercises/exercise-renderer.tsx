"use client";

import { Id } from "@/convex/_generated/dataModel";
import { FormExercise } from "./form-exercise";
import { TableExercise } from "./table-exercise";
import { ChecklistExercise } from "./checklist-exercise";
import { VisionBoard } from "./vision-board";

export function ExerciseRenderer({
  exerciseId,
  config,
  title,
}: {
  exerciseId: Id<"exercises">;
  config: string;
  title: string;
}) {
  let parsed;
  try {
    parsed = JSON.parse(config);
  } catch {
    return (
      <p className="text-xs text-muted-foreground">Configuration d&apos;exercice invalide</p>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-4 section-accent">{title}</h3>
      {parsed.type === "form" && (
        <FormExercise exerciseId={exerciseId} config={parsed} />
      )}
      {parsed.type === "table" && (
        <TableExercise exerciseId={exerciseId} config={parsed} />
      )}
      {parsed.type === "checklist" && (
        <ChecklistExercise exerciseId={exerciseId} config={parsed} />
      )}
      {parsed.type === "vision-board" && (
        <VisionBoard exerciseId={exerciseId} />
      )}
    </div>
  );
}
