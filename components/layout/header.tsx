"use client";

// Le Header mobile historique est remplacé par Topbar (déjà responsive).
// Ce composant reste exporté pour éviter de casser les imports existants
// (notamment app/lesson/[lessonId]/page.tsx). Il rend null ; Topbar gère
// désormais la barre du haut sur tous les viewports.
export function Header() {
  return null;
}
