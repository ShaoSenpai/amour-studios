"use client";

import { Id } from "@/convex/_generated/dataModel";
import { TimestampedNotes } from "@/components/lesson/timestamped-notes";
import { LessonPanel } from "./lesson-panel";

export function NotesPanel({
  open,
  onClose,
  lessonId,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: Id<"lessons">;
}) {
  return (
    <LessonPanel open={open} onClose={onClose} title="Notes" italicWord="Notes">
      <TimestampedNotes lessonId={lessonId} />
    </LessonPanel>
  );
}
