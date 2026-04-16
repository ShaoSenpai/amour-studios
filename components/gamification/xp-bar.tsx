"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================================
// Amour Studios — XP Progress Bar
// ----------------------------------------------------------------------------
// Levels : chaque level = 500 XP.
// Affiche le level actuel + barre de progression vers le prochain.
// Pulse glow quand l'event "xp-gained" arrive (fin de l'animation flyover).
// ============================================================================

const XP_PER_LEVEL = 500;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes xp-bar-glow-kf {
      0%   { box-shadow: 0 0 8px var(--brand-glow); filter: brightness(1); }
      50%  { box-shadow: 0 0 20px var(--brand-glow), 0 0 6px var(--brand-glow); filter: brightness(1.45); }
      100% { box-shadow: 0 0 8px var(--brand-glow); filter: brightness(1); }
    }
    @keyframes xp-level-bump-kf {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
    .xp-bar-glow { animation: xp-bar-glow-kf 900ms ease-out; }
    .xp-level-bump { display: inline-block; animation: xp-level-bump-kf 600ms cubic-bezier(.34,1.56,.64,1); }
  `;
  document.head.appendChild(style);
}

export function XpBar({ xp }: { xp: number }) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const progressPct = (xpInLevel / XP_PER_LEVEL) * 100;

  const [pulse, setPulse] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    injectStyles();
    const handler = () => {
      setPulse(false);
      requestAnimationFrame(() => setPulse(true));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPulse(false), 900);
    };
    window.addEventListener("xp-gained", handler);
    return () => {
      window.removeEventListener("xp-gained", handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2" data-xp-target>
      <span className={`text-xs font-medium text-accent ${pulse ? "xp-level-bump" : ""}`}>
        Nv.{level}
      </span>
      <div className="relative w-28 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-700 ease-out shadow-[0_0_8px_var(--brand-glow)] ${
            pulse ? "xp-bar-glow" : ""
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {xpInLevel}/{XP_PER_LEVEL}
      </span>
    </div>
  );
}
