# TODO — Finitions design

Petits ajustements à reprendre en fin de phase 2 (après que tous les écrans principaux soient migrés).

## Lesson page

- [ ] **Bouton "Générer mon PDF" de l'exo Vision Board** (flottant bottom-right) :
      le déplacer **en bas de l'exo**, non flottant, plus logique dans le flow.
      Fichier : `components/exercises/vision-board.tsx` (ou variante).

- [ ] **Bouton "Valider la leçon"** : placement plus logique — actuellement dans le bandeau
      sous la vidéo. Options à tester :
      - À la fin du flow (après exos terminés) en gros CTA plein largeur vert
      - Ou toujours sticky en bas de la page (comme "submit" d'un form)
      Discussion nécessaire avant implé.

## Dashboard

- [ ] Tabs "En cours / Complétés / À venir" actuellement cosmétiques → les rendre fonctionnelles
      (filtrer la BentoGrid par état du module).

## Global

- [ ] **Onboarding gate** désactivé temporairement (`app/dashboard/page.tsx` ~ligne 76). À ré-activer si on remet en place le système d'appel d'onboarding manuel par admin.
- [ ] Revoir les micro-animations sur les hover (le letter-spacing du CTA hero pourrait être plus subtil).
- [ ] **⚠ Passe check-up thème light** — beaucoup d'éléments non-visibles en mode clair (couleurs hardcodées #F0E9DB/#0D0B08 dans les composants DS qui ne s'inversent pas). À refaire en fin de phase 2 avec mapping propre sur `--foreground` / `--background` ou classes `dark:`.
- [ ] `top-controls.tsx` est désormais orphelin → supprimer dans une passe de cleanup.
