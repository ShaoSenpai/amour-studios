"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
  minRows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={minRows}
      className="w-full resize-none rounded-md border border-foreground/25 bg-foreground/[0.04] px-3 py-2 text-sm font-mono leading-relaxed outline-none transition-colors focus:border-foreground/50 focus:bg-foreground/[0.06]"
      style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
    />
  );
}

export function TimestampedNotes({ lessonId }: { lessonId: Id<"lessons"> }) {
  const notes = useQuery(api.notes.getForLesson, { lessonId });
  const saveNote = useMutation(api.notes.save);
  const updateNote = useMutation(api.notes.update);
  const removeNote = useMutation(api.notes.remove);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<Id<"notes"> | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleAdd = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await saveNote({ lessonId, content: content.trim(), timestampSeconds: 0 });
      setContent("");
      toast.success("Note ajoutée");
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (noteId: Id<"notes">) => {
    if (!editContent.trim()) return;
    try {
      await updateNote({ noteId, content: editContent.trim() });
      setEditingId(null);
      setEditContent("");
      toast.success("Note modifiée");
    } catch {
      toast.error("Erreur");
    }
  };

  const sortedNotes = [...(notes ?? [])].sort(
    (a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0)
  );

  return (
    <div className="rounded-md border border-foreground/15 bg-foreground/[0.04] p-5">
      <h3
        className="mb-4 text-xl italic"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Mes notes
      </h3>

      {/* Add note */}
      <div className="mb-5 flex items-start gap-2">
        <div className="flex-1">
          <AutoGrowTextarea
            value={content}
            onChange={setContent}
            onSubmit={handleAdd}
            placeholder="Ajouter une note… (⌘+Entrée pour envoyer)"
            minRows={2}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!content.trim() || saving}
          className="flex size-10 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{
            background: "#FF6B1F",
            color: "#0D0B08",
            minHeight: 0,
          }}
          aria-label="Ajouter"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Notes list */}
      {sortedNotes.length === 0 ? (
        <p
          className="py-6 text-center font-mono text-xs text-foreground/50"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          Prends des notes pour retenir l&apos;essentiel.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedNotes.map((note) => {
            const isEditing = editingId === note._id;
            return (
              <div
                key={note._id}
                className="group rounded-md border border-foreground/15 bg-foreground/[0.04] p-3 transition-colors hover:border-foreground/25"
              >
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <AutoGrowTextarea
                      value={editContent}
                      onChange={setEditContent}
                      onSubmit={() => handleSaveEdit(note._id)}
                      autoFocus
                      minRows={3}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditContent("");
                        }}
                        className="flex items-center gap-1 rounded-md border border-foreground/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/70 hover:bg-foreground/[0.05]"
                        style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
                      >
                        <X size={11} /> Annuler
                      </button>
                      <button
                        onClick={() => handleSaveEdit(note._id)}
                        disabled={!editContent.trim()}
                        className="flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] disabled:opacity-60"
                        style={{
                          background: "#FF6B1F",
                          color: "#0D0B08",
                          fontFamily: "var(--font-body-legacy)",
                          minHeight: 0,
                        }}
                      >
                        <Check size={11} /> Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {note.timestampSeconds !== undefined && note.timestampSeconds > 0 && (
                      <span
                        className="mt-0.5 shrink-0 rounded-sm bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-foreground/70"
                        style={{ fontFamily: "var(--font-body-legacy)" }}
                      >
                        {formatTimestamp(note.timestampSeconds)}
                      </span>
                    )}
                    <p
                      className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed"
                      style={{ fontFamily: "var(--font-body-legacy)" }}
                    >
                      {note.content}
                    </p>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(note._id);
                          setEditContent(note.content);
                        }}
                        className="rounded-md p-1.5 text-foreground/50 transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
                        aria-label="Modifier"
                        style={{ minHeight: 0 }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={async () => {
                          await removeNote({ noteId: note._id });
                          toast.success("Note supprimée");
                        }}
                        className="rounded-md p-1.5 text-foreground/50 transition-colors hover:bg-destructive/15 hover:text-destructive"
                        aria-label="Supprimer"
                        style={{ minHeight: 0 }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
