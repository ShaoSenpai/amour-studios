# Phase 2 — Page Leçon Immersive

**Date :** 2026-04-13
**Statut :** Phase 2 — application du DS sur l'écran leçon

## Direction

Layout "Immersive dark + dock + panneaux" validé en brainstorming :

- Topbar DS (déjà en place depuis phase 1)
- Meta bar sous la topbar (← Dashboard, module, leçon N/M, XP)
- Titre serif italique massif
- Vidéo player XL (aspect-ratio 16/9) avec glow vert subtil
- Barre sous vidéo : progression + CTA "Marquer comme vue"
- Navigation prev/next en cartes serif (2 colonnes)
- **Dock vertical sticky** sur la droite (4 boutons : Exos, Notes, Commentaires, Module)
- **Panneaux glissants** depuis la droite au clic sur un bouton du dock :
  - Exos = panneau large (~65% viewport) — la vidéo est compressée à gauche
  - Notes / Commentaires / Module = panneau étroit (420px)
- Un seul panneau ouvert à la fois
- Dans le panneau Exos : bouton "Ouvrir dans une nouvelle fenêtre ↗" visible si l'exo a une URL externe
- Types d'exos existants conservés : `ExerciseIframe` (URL externe), `ExerciseRenderer` (config JSON checkbox/qcm/text), fallback markdown

## Fichiers

**Nouveaux composants** (`components/ds/lesson/`) :
- `lesson-meta-bar.tsx` — meta bar sous topbar
- `lesson-dock.tsx` — dock vertical + boutons
- `lesson-panel.tsx` — base du panneau glissant (gère open/close, anim, width variant)
- `exercises-panel.tsx` — wrap des exos existants dans le panneau large
- `notes-panel.tsx` — wrap de `TimestampedNotes`
- `comments-panel.tsx` — wrap de `CommentSection`
- `module-panel.tsx` — liste des leçons du module (inspiré de `ModuleProgress`)

**Modifiés :**
- `app/lesson/[lessonId]/page.tsx` — réécriture complète avec dock + panneaux
- `app/globals.css` — ajout keyframes + classes pour les panneaux

**Inchangé :**
- Composants métier existants : `ExerciseRenderer`, `ExerciseIframe`, `CommentSection`, `TimestampedNotes`, `ModuleProgressCompact` — on les réutilise tels quels dans les panneaux.
- Backend Convex (aucune modif)

## Interactions

- **Clic bouton dock** → panneau associé slide in depuis la droite (600ms, ease-reveal). Si un autre panneau est ouvert, il se ferme d'abord.
- **Clic "×" dans le panneau** → le panneau se ferme, la vidéo se re-étale.
- **ESC** ferme le panneau actif.
- **Cmd/Ctrl+1..4** ouvre respectivement Exos / Notes / Commentaires / Module.
- **Mobile** : le dock passe en barre horizontale en bas de l'écran (safe-area-bottom). Les panneaux prennent 100% de la largeur. `MobileNav` existant est masqué sur la page leçon.

## Hors scope

- Pas de redesign du `ExerciseRenderer` / `ExerciseIframe` / `CommentSection` / `TimestampedNotes` eux-mêmes.
- Pas de changement backend.
- Pas de drag-to-resize du panneau (si demandé plus tard).
