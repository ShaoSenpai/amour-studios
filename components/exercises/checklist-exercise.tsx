"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect, useCallback, useRef } from "react";
import { Check, Loader2, Circle } from "lucide-react";

type CheckItem = { key: string; label: string; description?: string };
type ChecklistConfig = { type: "checklist"; items: CheckItem[] };

export function ChecklistExercise({
  exerciseId,
  config,
}: {
  exerciseId: Id<"exercises">;
  config: ChecklistConfig;
}) {
  const response = useQuery(api.exerciseResponses.get, { exerciseId });
  const saveResponse = useMutation(api.exerciseResponses.save);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (response?.data && !initialized.current) {
      try {
        setChecked(JSON.parse(response.data));
        initialized.current = true;
      } catch {}
    }
  }, [response]);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const progressPercent = config.items.length > 0 ? Math.round((checkedCount / config.items.length) * 100) : 0;

  const autoSave = useCallback(
    (newChecked: Record<string, boolean>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        setSaving(true);
        const count = Object.values(newChecked).filter(Boolean).length;
        const pct = config.items.length > 0 ? Math.round((count / config.items.length) * 100) : 0;
        await saveResponse({
          exerciseId,
          data: JSON.stringify(newChecked),
          progressPercent: pct,
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 300);
    },
    [exerciseId, saveResponse, config.items.length]
  );

  const toggle = (key: string) => {
    const newChecked = { ...checked, [key]: !checked[key] };
    setChecked(newChecked);
    autoSave(newChecked);
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="progress-track-glow flex-1">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {checkedCount}/{config.items.length}
        </span>
        {saving && <Loader2 size={14} className="animate-spin text-primary" />}
        {saved && <Check size={14} className="text-primary" />}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {config.items.map((item) => {
          const isChecked = !!checked[item.key];
          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              className={`glass-card rounded-xl p-4 w-full text-left flex items-start gap-3 transition-all duration-200 hover:bg-white/5 ${
                isChecked ? "ring-1 ring-primary/20 bg-primary/5" : ""
              }`}
            >
              <div
                className={`size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                  isChecked
                    ? "bg-primary text-primary-foreground"
                    : "bg-white/5 border border-white/10 text-muted-foreground"
                }`}
              >
                {isChecked ? <Check size={14} /> : <Circle size={12} />}
              </div>
              <div>
                <p className={`text-sm font-medium ${isChecked ? "text-primary" : ""}`}>
                  {item.label}
                </p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
