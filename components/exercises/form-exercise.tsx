"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect, useCallback, useRef } from "react";
import { Check, Loader2 } from "lucide-react";

type Field = { key: string; label: string; type: "text" | "textarea" | "number"; placeholder?: string };
type Section = { title: string; fields: Field[]; layout?: "grid-2" | "grid-3" | "single" };
type FormConfig = { type: "form"; sections: Section[] };

export function FormExercise({
  exerciseId,
  config,
}: {
  exerciseId: Id<"exercises">;
  config: FormConfig;
}) {
  const response = useQuery(api.exerciseResponses.get, { exerciseId });
  const saveResponse = useMutation(api.exerciseResponses.save);
  const [data, setData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Initialize from saved data
  useEffect(() => {
    if (response?.data && !initialized.current) {
      try {
        setData(JSON.parse(response.data));
        initialized.current = true;
      } catch {}
    }
  }, [response]);

  const totalFields = config.sections.reduce((sum, s) => sum + s.fields.length, 0);
  const filledFields = Object.values(data).filter((v) => v.trim().length > 0).length;
  const progressPercent = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

  const autoSave = useCallback(
    (newData: Record<string, string>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        setSaving(true);
        const filled = Object.values(newData).filter((v) => v.trim().length > 0).length;
        const pct = totalFields > 0 ? Math.round((filled / totalFields) * 100) : 0;
        await saveResponse({
          exerciseId,
          data: JSON.stringify(newData),
          progressPercent: pct,
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 800);
    },
    [exerciseId, saveResponse, totalFields]
  );

  const updateField = (key: string, value: string) => {
    const newData = { ...data, [key]: value };
    setData(newData);
    autoSave(newData);
  };

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="progress-track-glow flex-1">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{progressPercent}%</span>
        {saving && <Loader2 size={14} className="animate-spin text-primary" />}
        {saved && <Check size={14} className="text-primary" />}
      </div>

      {/* Sections */}
      {config.sections.map((section, si) => (
        <div key={si} className="glass-card rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 section-accent">{section.title}</h3>
          <div
            className={
              section.layout === "grid-2"
                ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                : section.layout === "grid-3"
                  ? "grid grid-cols-1 sm:grid-cols-3 gap-3"
                  : "space-y-3"
            }
          >
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    value={data[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full rounded-lg bg-white/5 border border-white/8 px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-primary/40 transition-all min-h-[80px]"
                  />
                ) : (
                  <input
                    type={field.type}
                    value={data[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-10 rounded-lg bg-white/5 border border-white/8 px-3 text-sm focus:outline-none focus:border-primary/40 transition-all"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
