# Design System v2 — Cohérence couleurs & typos

**Date** : 2026-04-15
**Scope** : App Next.js uniquement (dashboard, claim, lesson, profile, admin, login). Landing HTML externe et page paiement **hors scope**.
**Goal** : une couleur = un rôle, 2 typos max, hiérarchie visuelle lisible.

---

## Problème

L'app actuelle souffre de trois maux de cohérence :

1. **Orange `#FF6B1F` porte 5 rôles** : italique éditorial, bouton d'action, badge "en attente", icônes notifications, bordures bandeaux. Quand une couleur est partout, elle ne signale plus rien.
2. **4 familles typographiques coexistent** sans rôle strict : Anton (display), Instrument Serif (éditorial), DM Sans (body), JetBrains Mono (labels techniques). Les éléments fonctionnels cassent l'ambiance premium à chaque apparition.
3. **Pas de hiérarchie visuelle** sur le dashboard : tout a le même poids. Le bandeau "Débloquer" (seul enjeu business) ne capte pas l'œil prioritairement.

---

## Règles — Couleurs

### Un rôle = une couleur

| Rôle | Couleur | Usage unique |
|---|---|---|
| Brand / primary | `#0D4D35` sapin foncé | Logo, liens nav actifs, CTA secondaire |
| **Action principale** | `#FF6B1F` orange | UN SEUL bouton primaire par vue (ex: "Débloquer"). Zéro autre usage. |
| Destructive | `#E63326` rouge | Suppression, erreurs critiques uniquement |
| Success / done | `#0D4D35` sapin | États terminés, checkmarks |
| Neutres | `--foreground` / opacités | Italiques éditoriaux, icônes nav, bordures, badges info |
| Accents modules (6) | or / orange / rouge / pêche / sapin / forêt | **Cantonnés aux pastilles de module uniquement**. Jamais sur du chrome UI. |

### Interdictions explicites

- Orange **hors** bouton d'action principal → interdit
- Rouge hors destructive → interdit (les modules "Stratégie" gardent le rouge mais uniquement sur leur pastille module)
- Point vert fluo dans la nav (indicateur status) → supprimé
- `#00FF85` (vert fluo) → déjà supprimé, ne revient pas

### Changements concrets

| Élément | Avant | Après |
|---|---|---|
| `<em className="italic text-[#FF6B1F]">univers</em>` | orange | `text-foreground` (noir) |
| Icônes notifications (dashboard) | orange | `text-foreground/70` |
| Bordure gauche bandeau preview | orange | `border-foreground/20` |
| Badge "En attente" sidebar | orange | neutre (texte `foreground/60` + point `foreground`) |
| Dot "Amour Studios" logo nav | vert | supprimé (ou `foreground` si besoin d'un indicateur) |
| Bouton "Reprendre la formation" | orange | sapin `#0D4D35` (secondaire) |
| Bouton "Débloquer" bandeau preview | orange | **seul orange autorisé sur la page** |

---

## Règles — Typographie

### 2 familles uniquement

| Rôle | Famille | Usage |
|---|---|---|
| Éditorial / émotionnel | **Instrument Serif** (italique autorisé) | `h1`, `h2`, titres de modules, mots mis en `<em>`, citations |
| Fonctionnel | **DM Sans** | Body, labels UI, badges, boutons, nav, compteurs, stats, formulaires |

### Suppressions

- **Anton** (`--font-display`) → retiré de `layout.tsx`. Les `h1`/`h2` dans `globals.css` pointent désormais vers Instrument Serif. En pratique, tous les titres de pages utilisent déjà `var(--font-serif)` inline, donc la migration est transparente.
- **JetBrains Mono** (`--font-body`) → retiré de `layout.tsx`. Les labels type `MODE PREVIEW`, `PROGRESSION`, `NIV.01`, `PAR KÉVIN` passent en DM Sans uppercase tracking wide (`tracking-[2px]` à `tracking-[3px]`).

### Classes utilitaires à nettoyer

- `font-mono` (Tailwind → var(--font-body) = JetBrains Mono aujourd'hui) → remplacer par `font-sans` + classes uppercase/tracking
- Inline `style={{ fontFamily: "var(--font-body)" }}` → supprimer (hérite de body en DM Sans)
- Inline `style={{ fontFamily: "var(--font-serif)" }}` → conserver (titres éditoriaux)

---

## Règles — Hiérarchie visuelle dashboard

### Ordre de priorité (weight visuel)

1. **Bandeau preview + CTA "Débloquer"** — le seul enjeu business :
   - Plus grand (padding généreux, plus d'air)
   - Isolé (marge top/bottom renforcée)
   - Seul élément portant un bouton orange
   - Position : haut de page ou sous le héros, en tout cas avant la progression

2. **Héros "Ton univers se construit" + "Reprendre la formation"** :
   - Serif italique dominant
   - Bouton secondaire sapin (pas orange — réservé au bandeau preview)

3. **Progression + modules verrouillés** :
   - Opacité réduite
   - Zéro rouge/alerte sur les modules locked
   - `0/42 leçons` pour un nouveau arrivant → remplacé par `Prêt à commencer · Module 01 en premier` (formulation positive)

---

## Nettoyage notifications / announcements

Supprimer de la DB (table `announcements` via `/admin/content` ou mutation directe) :

- "test / regardez les vidéos" — résidu de développement
- "NOUVEAU TEST / La formation arrive bientôt" — résidu de développement

Règle : zéro announcement de test en prod.

Le bandeau "Mode preview 5%" n'est **pas** un announcement, c'est un gate `!hasPurchase` dans `dashboard/page.tsx`. Il reste tel quel.

---

## Hors scope

- Landing HTML externe (`~/Desktop/AMOURstudios_SITE/index.html`) — garde son identité éditoriale full.
- Page paiement (`~/Desktop/AMOURstudios_SITE/paiement/index.html`) — garde son identité.
- Admin dark mode — pas modifié.
- Module M03 (12 leçons) — pas touché, on respecte la structure du Drive.
- Emails transactionnels (`convex/emails.ts`) — dark mode, pas concernés.

---

## Fichiers impactés (estimation)

- `app/layout.tsx` — retirer Anton + JetBrains Mono de Google Fonts
- `app/globals.css` — pointer `--font-display` vers Instrument Serif (ou supprimer la var), nettoyer les `@apply font-mono`
- `app/page.tsx`, `app/login/page.tsx`, `app/claim/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/profile/page.tsx`, `app/lesson/[lessonId]/page.tsx` — remplacer `text-[#FF6B1F]` sur italiques/icônes/bordures par `text-foreground` ou `text-foreground/70`
- `components/layout/sidebar.tsx` + `mobile-nav.tsx` — retirer dot vert, passer badge "En attente" en neutre
- `components/layout/logo.tsx` — retirer `text-pine` sur le "s" si présent
- DB announcements — supprimer les 2 résidus de test

---

## Critères de succès

- Une personne qui arrive sur le dashboard identifie en moins de 2 secondes le CTA "Débloquer" comme action prioritaire.
- Zéro orange visible en dehors du bouton d'action principal d'une vue.
- Zéro `font-mono` dans le markup TSX.
- `layout.tsx` importe 2 familles Google Fonts, pas 4.
- Aucun announcement de test en prod.
