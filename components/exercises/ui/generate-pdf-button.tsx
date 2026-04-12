"use client";

import { useState } from "react";
import { ProgressRing } from "./progress-ring";
import { FileDown } from "lucide-react";

export function GeneratePdfButton({
  onClick,
  percent,
}: {
  onClick: () => Promise<void>;
  percent: number;
}) {
  const [generating, setGenerating] = useState(false);

  const handleClick = async () => {
    setGenerating(true);
    try {
      await onClick();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={generating}
      className="fixed bottom-8 right-8 z-50 flex items-center gap-3 bg-primary text-primary-foreground px-6 py-4 font-display text-sm tracking-[3px] uppercase shadow-[0_8px_32px_rgba(16,185,129,0.25)] hover:shadow-[0_16px_48px_rgba(16,185,129,0.35)] hover:-translate-y-1 transition-all duration-300 overflow-hidden group"
    >
      <span className="relative z-10 flex items-center gap-3">
        {generating ? "Génération..." : "Générer mon PDF"}
        <ProgressRing percent={percent} size={36} />
      </span>
      <div className="absolute inset-0 bg-[#0D0B08] -translate-x-full group-hover:translate-x-0 transition-transform duration-450 ease-[cubic-bezier(.22,.68,0,1.2)]" />
    </button>
  );
}
