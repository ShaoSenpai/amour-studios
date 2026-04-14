# Formation Page Readability — Design Spec

**Date:** 2026-04-14
**Scope:** `/dashboard` — module list + lesson rows
**Goal:** Optimiser la lisibilité de la page formation en mixant la clarté de l'ancienne version (carte simple + liste aérée) avec la DS actuelle (serif italic, mono, accent latéral, badges sémantiques).

---

## Problème

La version actuelle du dashboard (ModuleRow + LessonLine) est dense et surchargée : trop de petits détails simultanés (stripe + wash + numéro serif XXL + pill statut + barre progression subtile + XP + chevron). L'œil ne sait pas où se poser. L'ancienne version était plus aérée — une carte par module, une ligne par leçon, statuts clairs.

## Direction retenue — Option B (Hybride)

Garder l'identité DS (stripe accent à gauche, numéro serif italic, typo mono, badges pleins) mais simplifier la structure interne de chaque module pour gagner en respiration.

## Architecture visuelle

### Carte module (collapsed)
```
┌──┬──────────────────────────────────────────┬──────────┐
│▐ │ 01  Module — Titre serif italic          │ 4/6 ✓    │
│▐ │      Sous-titre / description courte     │ →        │
└──┴──────────────────────────────────────────┴──────────┘
```
- **Stripe gauche** (4px) — accent couleur module, reste l'identité DS
- **Numéro** — serif italic 32-36px, aligné à la baseline du titre (pas XXL surdimensionné)
- **Titre** — serif italic 20px
- **Sous-titre** — mono 11px, uppercase tracking 1.5px, opacity 60
- **Compteur leçons** — `4/6` mono + icône check vert si complet, à droite
- **Chevron** — discret, rotation 90° quand ouvert
- **Pas de wash de fond**, pas de barre de progression en bas. Juste la bordure + stripe.

### Liste leçons (expanded)
```
  ○  01  Titre leçon                     12 min · 50 XP    ✓ FAIT
  ◐  02  Titre leçon                     15 min · 75 XP    ● ACTIF
  ○  03  Titre leçon                     10 min · 50 XP    🔒 BLOQUÉ
```
- **Pastille gauche** (cercle 24px) — numéro à l'intérieur, couleur sémantique :
  - vert plein si FAIT
  - orange plein si ACTIF
  - gris outline si À VENIR
  - gris + cadenas si BLOQUÉ (preview mode)
- **Titre** — serif italic 16px
- **Métadonnées** — mono 11px : `durée · XP`. XP en vert quand gagné.
- **StatusBadge à droite** — pill plein, semantic :
  - `✓ FAIT` vert
  - `● ACTIF` orange pulse
  - `🔒` cadenas gris (preview)
  - rien si simplement à venir
- **Hover** — légère élévation background opacity 0.03, pas de scale
- **Espacement** — padding vertical 12px par ligne, séparateur 1px entre leçons

### Preview mode (freemium)
- Les leçons non-preview : cadenas + opacity 0.5 + cursor not-allowed
- Vision Board (seule leçon preview) : accessible normalement

## Composants touchés

- `app/dashboard/page.tsx` — ModuleRow simplifié, LessonLine restructuré
- `components/ds/status-badge.tsx` — réutilisé (déjà existant)
- Pas de nouveau composant à créer.

## Ce qu'on RETIRE

- Wash de fond coloré sur carte module
- Barre de progression subtile en bas de carte module
- Numéro serif XXL surdimensionné
- Pill de statut dupliquée dans le header module

## Ce qu'on GARDE

- Stripe accent latéral 4px (identité DS)
- Serif italic pour titres et numéros
- JetBrains Mono pour méta + statuts
- Animation collapse/expand grid-template-rows
- StatusBadge semantic (plein)
- XP en vert quand gagné
- Cadenas preview mode

## Success criteria

- Lisibilité : un utilisateur scan la page et identifie en < 2s quelle leçon est active
- Densité : espacement aéré, pas plus de 3 infos visuelles par ligne
- Cohérence : identité DS préservée (serif italic + mono + stripe)
- Preview mode : cadenas évident sur leçons verrouillées
