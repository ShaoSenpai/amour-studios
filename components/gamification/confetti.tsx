"use client";

import confetti from "canvas-confetti";

const COLORS = ["#1EA574", "#0D4D35", "#FF6B1F", "#F5B820", "#E63326"];

export function fireConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: COLORS,
  });
}