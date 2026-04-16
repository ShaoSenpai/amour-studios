"use client";

import { useEffect, useRef, useState } from "react";

// ============================================================================
// useAnimatedNumber — tween une valeur numérique quand elle change
// ----------------------------------------------------------------------------
// - Passe instantanément à la cible si la différence est nulle.
// - Utilise requestAnimationFrame avec easeOutCubic par défaut.
// - `initial` permet de démarrer depuis une valeur "dernière vue" persistée
//   (ex: localStorage pour animer le retour sur le dashboard).
// ============================================================================

export type Easing = (t: number) => number;

export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuart: Easing = (t) => 1 - Math.pow(1 - t, 4);

export function useAnimatedNumber(
  target: number,
  options: { duration?: number; initial?: number; easing?: Easing } = {}
) {
  const { duration = 1200, initial, easing = easeOutCubic } = options;
  const start = initial ?? target;
  const [value, setValue] = useState(start);
  const prevTargetRef = useRef(start);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevTargetRef.current;
    const to = target;
    if (from === to) return;
    const startTs = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      const eased = easing(t);
      setValue(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevTargetRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      prevTargetRef.current = to;
    };
  }, [target, duration, easing]);

  return value;
}
