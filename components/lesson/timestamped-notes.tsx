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
    <div className="glass-card rounded-2xl p-5">
      <h3 className="text-sm font-semibold mb-4 section-accent">Mes notes</h3>

      {/* Add note */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Ajouter une note..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="flex-1 h-9 rounded-lg bg-white/5 border border-white/8 px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!content.trim() || saving}
          className="rounded-lg h-9 px-3"
        >
          <Plus size={14} />
        </Button>
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
