"use client";

import { useAutoResize } from "../hooks/use-auto-resize";

export function ExerciseInput({
  value,
  onChange,
  placeholder,
  label,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      {label && (
        <label className="text-[10px] uppercase tracking-[2px] text-muted-foreground/60 mb-1.5 block font-medium">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 border-b border-white/10 pb-2 text-base font-display tracking-wide outline-none focus:border-primary transition-colors placeholder:text-white/20 placeholder:italic placeholder:text-xs placeholder:font-sans placeholder:tracking-normal"
      />
    </div>
  );
}

export function ExerciseTextarea({
  value,
  onChange,
  placeholder,
  label,
  minHeight = 90,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  minHeight?: number;
}) {
  const handleResize = useAutoResize();

  return (
    <div>
      {label && (
        <label className="text-[10px] uppercase tracking-[2px] text-muted-foreground/60 mb-1.5 block font-medium">
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          handleResize(e);
        }}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 outline-none text-sm leading-relaxed resize-none overflow-hidden placeholder:text-white/15 placeholder:italic placeholder:text-xs"
        style={{ minHeight }}
      />
    </div>
  );
}
