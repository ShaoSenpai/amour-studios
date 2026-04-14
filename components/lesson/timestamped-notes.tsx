"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function TimestampedNotes({ lessonId }: { lessonId: Id<"lessons"> }) {
  const notes = useQuery(api.notes.getForLesson, { lessonId });
  const saveNote = useMutation(api.notes.save);
  const removeNote = useMutation(api.notes.remove);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await saveNote({ lessonId, content: content.trim(), timestampSeconds: 0 });
      setContent("");
      toast.success("Note ajout\u00e9e");
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  const sortedNotes = [...(notes ?? [])].sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0));

  return (
    <div className="rounded-md border border-foreground/15 bg-foreground/[0.04] p-5">
      <h3
        className="mb-4 text-xl italic"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Mes notes
      </h3>

      {/* Add note */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Ajouter une note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="flex-1 h-10 rounded-md border border-foreground/25 bg-foreground/[0.04] px-3 text-sm font-mono outline-none transition-colors focus:border-foreground/50 focus:bg-foreground/[0.06]"
          style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        />
        <button
          onClick={handleAdd}
          disabled={!content.trim() || saving}
          className="flex h-10 items-center justify-center rounded-md px-3 transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: "var(--state-done-bg)",
            color: "var(--state-done-fg)",
            minHeight: 0,
          }}
          aria-label="Ajouter"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Notes list */}
      {sortedNotes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4 opacity-50">
          Prends des notes pour retenir l&apos;essentiel.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedNotes.map((note) => (
            <div key={note._id} className="flex items-start gap-2 group">
              {note.timestampSeconds !== undefined && (
                <span className="note-timestamp shrink-0 mt-0.5">
                  {formatTimestamp(note.timestampSeconds)}
                </span>
              )}
              <p className="text-sm flex-1 leading-relaxed">{note.content}</p>
              <button
                onClick={async () => {
                  await removeNote({ noteId: note._id });
                  toast.success("Note supprim\u00e9e");
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-0.5"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
