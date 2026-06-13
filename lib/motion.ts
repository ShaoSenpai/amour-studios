import type { Transition } from "framer-motion";

/** Spring standard Apple-like — remplace les 5 réglages ad hoc du studio. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.9,
};

/** Variante plus vive pour les apparitions de modals/popovers. */
export const SPRING_SNAPPY: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 34,
  mass: 0.8,
};

export const NO_MOTION: Transition = { duration: 0 };
