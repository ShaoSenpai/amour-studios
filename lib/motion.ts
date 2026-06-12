"use client";

import { useReducedMotion } from "framer-motion";

/** Spring standard Apple-like — remplace les 5 réglages ad hoc du studio. */
export const SPRING = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.9,
};

/** Variante plus vive pour les apparitions de modals/popovers. */
export const SPRING_SNAPPY = {
  type: "spring" as const,
  stiffness: 480,
  damping: 34,
  mass: 0.8,
};

export const NO_MOTION = { duration: 0 };

/** Spring qui respecte prefers-reduced-motion. À utiliser dans tout composant client. */
export function useAppSpring(spring: typeof SPRING = SPRING) {
  const reduced = useReducedMotion();
  return reduced ? NO_MOTION : spring;
}
