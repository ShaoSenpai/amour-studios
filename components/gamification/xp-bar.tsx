"use client";

import { useEffect, useRef, useState } from "react";
import { useAnimatedNumber } from "@/lib/use-animated-number";

// ============================================================================
// Amour Studios — XP Progress Bar
// ----------------------------------------------------------------------------
// Levels : chaque level = 500 XP.
// Tween progressif (numéros + largeur) quand la valeur xp change.
// Pulse glow quand l'event "xp-gained" arrive (fin du flyover).
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
      50%  { box-shadow: 0 0 22px var(--brand-glow), 0 0 6px var(--brand-glow); filter: brightness(1.5); }
      100% { box-shadow: 0 0 8px var(--brand-glow); filter: brightness(1); }
    }
    @keyframes xp-level-bump-kf {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.35); }
      100% { transform: scale(1); }
    }
    .xp-bar-glow { animation: xp-bar-glow-kf 900ms ease-out; }
    .xp-level-bump { display: inline-block; animation: xp-level-bump-kf 600ms cubic-bezier(.34,1.56,.64,1); }
  `;
  document.head.appendChild(style);
}

export function XpBar({ xp }: { xp: number }) {
  const animated = useAnimatedNumber(xp, { duration: 1400 });
  const level = Math.floor(animated / XP_PER_LEVEL) + 1;
  const xpInLevel = animated % XP_PER_LEVEL;
  const progressPct = (xpInLevel / XP_PER_LEVEL) * 100;

  const [pulse, setPulse] = useState(false);
  const [bumpKey, setBumpKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRawXpRef = useRef(xp);

  // Level bump : détecté à partir de la vraie valeur xp (pas l'animée) pour
  // ne bumper qu'une fois par changement de prop.
  useEffect(() => {
    const prevLevel = Math.floor(prevRawXpRef.current / XP_PER_LEVEL) + 1;
    const newLevel = Math.floor(xp / XP_PER_LEVEL) + 1;
    prevRawXpRef.current = xp;
    if (newLevel > prevLevel) {
      const raf = requestAnimationFrame(() => setBumpKey((k) => k + 1));
      return () => cancelAnimationFrame(raf);
    }
  }, [xp]);

  useEffect(() => {
    injectStyles();
    const handler = () => {
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
      <span
        key={bumpKey}
        className={`text-xs font-medium text-accent ${bumpKey > 0 ? "xp-level-bump" : ""}`}
      >
        Nv.{level}
      </span>
      <div className="relative w-28 h-2 rounded-full bg-muted overflow-hidden">
        <div
          key={level}
          className={`h-full rounded-full bg-accent shadow-[0_0_8px_var(--brand-glow)] ${
            pulse ? "xp-bar-glow" : ""
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className="tabular-nums text-[10px] text-muted-foreground">
        {Math.floor(xpInLevel)}/{XP_PER_LEVEL}
      </span>
    </div>
  );
}
