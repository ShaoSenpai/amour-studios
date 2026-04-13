"use client";

import { Id } from "@/convex/_generated/dataModel";
import { CommentSection } from "@/components/comments/comment-section";
import { LessonPanel } from "./lesson-panel";

export function CommentsPanel({
  open,
  onClose,
  lessonId,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: Id<"lessons">;
}) {
  return (
    <LessonPanel
      open={open}
      onClose={onClose}
      title="Commentaires"
      italicWord="Commentaires"
    >
      <CommentSection lessonId={lessonId} />
    </LessonPanel>
  );
}
