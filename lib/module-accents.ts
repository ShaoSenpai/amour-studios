export const MODULE_ACCENTS = [
  "#F5B820", // mustard
  "#FF6B1F", // orange
  "#E63326", // red
  "#F2B8A2", // blush
  "#2B7A6F", // lagoon
  "#0D4D35", // pine
] as const;

export function moduleAccent(order: number): string {
  return MODULE_ACCENTS[order % MODULE_ACCENTS.length];
}
