export const MODULE_ACCENTS = [
  "#F5B820", // 0 mustard
  "#FF6B1F", // 1 orange
  "#E63326", // 2 red
  "#F2B8A2", // 3 blush
  "#2B7A6F", // 4 lagoon
  "#0D4D35", // 5 pine
] as const;

// Couleur de texte lisible sur chaque accent (WCAG AA).
// Les accents clairs (mustard, blush) prennent du texte ink ; les foncés → paper.
const MODULE_ACCENT_FG = [
  "#0D0B08", // 0 mustard → ink
  "#F0E9DB", // 1 orange → paper
  "#F0E9DB", // 2 red → paper
  "#0D0B08", // 3 blush → ink
  "#F0E9DB", // 4 lagoon → paper
  "#F0E9DB", // 5 pine → paper
] as const;

export function moduleAccent(order: number): string {
  return MODULE_ACCENTS[order % MODULE_ACCENTS.length];
}

export function moduleAccentFg(order: number): string {
  return MODULE_ACCENT_FG[order % MODULE_ACCENT_FG.length];
}
