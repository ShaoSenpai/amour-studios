"use client";

import { useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import { NO_MOTION, SPRING } from "./motion";

/** Spring qui respecte prefers-reduced-motion. À utiliser dans tout composant client. */
export function useAppSpring(spring: Transition = SPRING): Transition {
  const reduced = useReducedMotion();
  return reduced ? NO_MOTION : spring;
}
