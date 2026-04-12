"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Column = { key: string; label: string; type: "text" | "textarea"; placeholder?: string };
type TableConfig = { type: "table"; columns: Column[]; conclusionField?: boolean };
type Row = Record<string, string>;

export function TableExercise({
  exerciseId,
  config,
}: {
  exerciseId: Id<"exercises">;
  config: TableConfig;
}) {
  const response = useQuery(api.exerciseResponses.get, { exerciseId });
  const saveResponse = useMutation(api.exerciseResponses.save);
  const [rows, setRows] = useState<Row[]>([createEmptyRow(config.columns)]);
  const [conclusion, setConclusion] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (response?.data && !initialized.current) {
      try {
        const parsed = JSON.parse(response.data);
        if (parsed.rows?.length) setRows(parsed.rows);
        if (parsed.conclusion) setConclusion(parsed.conclusion);
        initialized.current = true;
      } catch {}
    }
  }, [response]);

  const calcProgress = useCallback(
    (r: Row[], c: string) => {
      const filledRows = r.filter((row) =>
        config.columns.some((col) => (row[col.key] ?? "").trim().length > 0)
      ).length;
      const hasConclusion = config.conclusionField ? (c.trim().length > 0 ? 1 : 0) : 0;
      const total = r.length + (config.conclusionField ? 1 : 0);
      return total > 0 ? Math.round(((filledRows + hasConclusion) / total) * 100) : 0;
    },
    [config]
  );

  const autoSave = useCallback(
    (r: Row[], c: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        setSaving(true);
        await saveResponse({
          exerciseId,
          data: JSON.stringify({ rows: r, conclusion: c }),
          progressPercent: calcProgress(r, c),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 800);
    },
    [exerciseId, saveResponse, calcProgress]
  );

  const updateCell = (rowIndex: number, key: string, value: string) => {
    const newRows = [...rows];
    newRows[rowIndex] = { ...newRows[rowIndex], [key]: value };
    setRows(newRows);
    autoSave(newRows, conclusion);
  };

  const addRow = () => {
    const newRows = [...rows, createEmptyRow(config.columns)];
    setRows(newRows);
    autoSave(newRows, conclusion);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    autoSave(newRows, conclusion);
  };

  const progressPercent = calcProgress(rows, conclusion);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="progress-track-glow flex-1">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{progressPercent}%</span>
        <span className="text-xs text-muted-foreground">{rows.length} ligne{rows.length > 1 ? "s" : ""}</span>
        {saving && <Loader2 size={14} className="animate-spin text-primary" />}
        {saved && <Check size={14} className="text-primary" />}
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {rows.map((row, ri) => (
          <div key={ri} className="glass-card rounded-xl p-4 group relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-muted-foreground">
                {String(ri + 1).padStart(2, "0")}
              </span>
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(ri)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className={`grid gap-2 ${config.columns.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
              {config.columns.map((col) => (
                <div key={col.key}>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                    {col.label}
                  </label>
                  {col.type === "textarea" ? (
                    <textarea
                      value={row[col.key] ?? ""}
                      onChange={(e) => updateCell(ri, col.key, e.target.value)}
                      placeholder={col.placeholder}
                      rows={2}
                      className="w-full rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/40 transition-all"
                    />
                  ) : (
                    <input
                      type="text"
                      value={row[col.key] ?? ""}
                      onChange={(e) => updateCell(ri, col.key, e.target.value)}
                      placeholder={col.placeholder}
                      className="w-full h-9 rounded-lg bg-white/5 border border-white/8 px-3 text-sm focus:outline-none focus:border-primary/40 transition-all"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add row */}
      <Button variant="outline" size="sm" className="rounded-full border-white/10 hover:bg-white/5 gap-1" onClick={addRow}>
        <Plus size={14} /> Ajouter une ligne
      </Button>

      {/* Conclusion */}
      {config.conclusionField && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 section-accent">Ce que je retiens</h3>
          <textarea
            value={conclusion}
            onChange={(e) => {
              setConclusion(e.target.value);
              autoSave(rows, e.target.value);
            }}
            placeholder="Ta conclusion personnelle..."
            rows={3}
            className="note-editor"
          />
        </div>
      )}
    </div>
  );
}

function createEmptyRow(columns: Column[]): Row {
  const row: Row = {};
  for (const col of columns) row[col.key] = "";
  return row;
}
