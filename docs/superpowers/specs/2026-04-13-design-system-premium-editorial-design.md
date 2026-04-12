# Design System — Bold Editorial × Premium High-Tech

**Date :** 2026-04-13
**Statut :** Phase 1 — Fondation + écran de référence (Dashboard)
**Auteur :** Kévin BOUAPHANH

---

## 1. Contexte

L'app Amour Studios est fonctionnelle (Next.js 16 + Convex + Discord OAuth) mais son UI est jugée "trop statique, trop basique". L'objectif est de transformer toute l'app en une expérience **dynamique, interactive, intuitive et logique**, en gardant le backend et la logique métier intacts.

Vu l'ampleur (7 zones d'interface : landing, login, dashboard, profil, leçon, admin, transitions), on procède en 2 temps :

- **Phase 1 (ce spec)** : Poser la fondation visuelle et la tester sur UN écran de référence (le dashboard, le plus vu après login).
- **Phase 2 (specs ultérieurs)** : Appliquer la fondation aux autres écrans (profil, leçon, admin…) en specs séparés.

Chaque phase a son propre cycle spec → plan → implémentation.

---

## 2. Décisions de direction validées

Au terme d'un brainstorming visuel (4 itérations dans le navigateur), le client a validé :

| Axe | Choix validé |
|---|---|
| **Mood global** | Bold Editorial — style magazine moderne, typographies massives, contrastes francs, mises en page asymétriques |
| **Ton secondaire** | Premium High-Tech — dashboard pro type Linear/Vercel/Arc : blocs pleins, dark mode, grille de fond, topbar dense |
| **Palette** | Multi-accents (une couleur par module) : or #F5B820, orange #FF6B1F, rouge #E63326, pêche #F2B8A2, vert sapin #2B7A6F, vert forêt #0D4D35 + accent vert électrique #00FF85 pour les "live/success" |
| **Typographie** | Instrument Serif (titres, italique) + JetBrains Mono (texte, meta, labels) |
| **Motion** | Editorial Reveal — transitions lentes (700–900ms), courbe `cubic-bezier(.2,.9,.3,1)`, entrées en cascade, letter-spacing qui s'ouvre au hover |

---

## 3. Design system — tokens

### 3.1 Couleurs

Mode par défaut : **dark** (le mode clair reste disponible mais la référence premium high-tech est dark).

```css
/* Base */
--bg: #0D0B08;           /* noir profond */
--fg: #F0E9DB;           /* beige crème */
--fg-muted: rgba(240,233,219,0.65);
--fg-dim: rgba(240,233,219,0.4);
--border: rgba(240,233,219,0.15);
--surface: rgba(240,233,219,0.04);
--surface-hover: rgba(240,233,219,0.08);

/* Accents modules (indexés par module.order) */
--accent-00: #F5B820;    /* Or — Fondations */
--accent-01: #FF6B1F;    /* Orange — Création */
--accent-02: #E63326;    /* Rouge — Stratégie */
--accent-03: #F2B8A2;    /* Pêche — Communauté */
--accent-04: #2B7A6F;    /* Vert sapin — Monétisation */
--accent-05: #0D4D35;    /* Vert forêt — Expansion */

/* Accents système */
--success: #00FF85;      /* LIVE, validations, progression */
--alert: #FF6B1F;        /* CTA chaud, notifications */

/* Grille de fond subtile */
--grid-line: rgba(240,233,219,0.03);
```

Le mode light conserve les couleurs actuelles (`#F0E9DB` bg, `#0D0B08` fg) et inverse les surfaces. On ne retravaille pas le light mode en phase 1 ; il reste fonctionnel mais non-premium.

### 3.2 Typographie

```css
--font-display: 'Instrument Serif', Georgia, serif;
--font-body: 'JetBrains Mono', 'SF Mono', Menlo, monospace;

/* Scales */
--text-display: clamp(42px, 5.5vw, 72px);  /* hero */
--text-h2: 34px;                            /* section heads */
--text-h3: 24–32px;                         /* card titles */
--text-body: 13px;
--text-small: 11px;
--text-meta: 10px;                          /* uppercase labels */

/* Letter-spacing */
--tracking-display: -2px;
--tracking-h2: -0.5px;
--tracking-meta: 2–3px; /* wide pour les labels uppercase */
```

**Règles d'usage :**
- Serif italique = émotions, accents, noms propres (`ton *univers*`, `Ton *profil*`).
- Mono = toute métadonnée, label, chiffre, status (`NIV. 03`, `2,340 XP`, `⌘K`, tags `EN COURS`).
- Jamais de bold sur Instrument Serif — on utilise l'italique comme emphase.

### 3.3 Espacement & layout

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;

--container-max: 1200px;
--grid-base: 24px;       /* pour la grille de fond + alignements */
```

### 3.4 Motion

```css
--ease-reveal: cubic-bezier(.2, .9, .3, 1);
--dur-fast: 300ms;
--dur-med: 700ms;
--dur-slow: 900ms;
--dur-cascade: 70ms;     /* delta entre éléments en cascade */
```

**Règles d'usage :**
- Hover → `700ms var(--ease-reveal)` sur `letter-spacing`, `transform`, `background`, `border-color`.
- Entrée d'écran → `fadeUp` 800–900ms avec cascade (60–80ms de delay entre enfants).
- Barres de progression → `drawProgress` 1400ms, démarrage à 200–300ms.
- CTAs primaires → letter-spacing qui s'ouvre (+1–2px) au hover.
- Pas d'animations "spring/bounce" (ce choix a été écarté au brainstorm).

### 3.5 Formes

- **Angles droits** sur les blocs majeurs (hero, cards modules, topbar). Pas de `border-radius` > 4px sur les surfaces principales.
- **Pills arrondies uniquement** pour les badges/tags dynamiques (status, counts).
- **1px solide** pour les borders (jamais de double, jamais de dashed sauf `locked`).

---

## 4. Patterns de layout

### 4.1 Topbar globale

Barre horizontale en haut de chaque écran authentifié. Remplace `TopControls` + parties du `Header` actuel.

```
[ Logo serif · dot live ]  [  search  ⌘K  ]  [ VIP pill · NIV.03 · avatar ]
```

- Bordure 1px + background très subtil (`--surface`).
- Search au centre, toujours visible, toujours le même emplacement → mémoire spatiale.
- Pill `VIP ACTIF` à gauche de l'avatar (couleur `--success`, bordure 1px) ; si pas VIP, pill `EN ATTENTE` (couleur `--alert`).

### 4.2 Hero split (dashboard)

Grille 2fr / 1fr.

**Gauche (`hero-main`)** : fond beige inversé (sortie du dark → visual pop), titre serif italique massif, CTA principal noir ("Reprendre la leçon 02.03"), decoration `·` géante en arrière-plan.

**Droite (`hero-side`)** : 2 stat-blocks empilés (Progression %, Streak jours) — chacun a son accent color et réagit au hover.

### 4.3 Progress strip

Bandeau plein-écran sous le hero avec la progression globale (track 3px, fill en dégradé `success → alert`, chiffres en serif italique).

### 4.4 Bento modules

Grille 6 colonnes. Chaque module occupe 2–4 colonnes selon son importance :

- Module "en cours" → 4 colonnes (le plus visible)
- Modules disponibles → 2 colonnes
- Modules locked → 2 colonnes avec traitement `border dashed` + opacity 0.4

Chaque card :
- Fond = couleur du module (plein)
- Texte = `--bg` (noir) → contraste fort
- Numéro de module en serif italique, gros
- Titre en serif, "mot-clé" en italique (`Créer du *contenu*`)
- Description en mono, max 240px
- Meta row en bas : pill status, count `02 / 05`, mini progress bar, pourcentage
- Flèche `→` serif italique en bottom-right, translate au hover

### 4.5 Activity strip

3 colonnes en bas. Dernières notifications/events :
- Nouveau contenu (dot `--success` pulsant)
- Badge débloqué
- Communauté (online count, lien Discord)

Chaque card a un label meta (`◦ NOUVEAU · IL Y A 2H`), un titre serif avec italique accentué, un body mono court.

### 4.6 Grille de fond

Sur toute l'app (mode dark), background image = double linear-gradient 24px × 24px avec opacity 0.03. Donne une texture "pro tool" sans distraire.

---

## 5. Composants à créer / refactorer

### 5.1 Nouveaux composants (`components/ds/`)

- `Topbar.tsx` — remplace `TopControls` + étend le `Header`.
- `Hero.tsx` — composable (props: title, italicWord, caption, ctaLabel, ctaHref, stats).
- `StatBlock.tsx` — label, value, sub, accent color.
- `ProgressStrip.tsx` — percent, fraction, label.
- `BentoGrid.tsx` + `BentoCard.tsx` — grille responsive avec spans configurables.
- `ModuleCard.tsx` — variante spécialisée de BentoCard pour les modules.
- `ActivityCard.tsx` — pour la strip d'activité.
- `Pill.tsx` — status uniformisé (`VIP ACTIF`, `EN COURS`, `COMPLÉTÉ`, `LOCKED`, etc.).

### 5.2 Refactor des composants existants

- `components/layout/top-controls.tsx` → supprimé, remplacé par `Topbar`.
- `components/layout/header.tsx` → devient un wrapper mobile de `Topbar`.
- `components/layout/sidebar.tsx` → garde la logique mais refresh des tokens (typo/colors/motion).
- `app/dashboard/page.tsx` → réécrit avec Hero + ProgressStrip + BentoGrid + ActivityStrip.
- `app/globals.css` → ajoute les nouveaux tokens (couleurs accent-*, fonts Google, motion, grille de fond).

### 5.3 Composants inchangés en phase 1

- `app/lesson/[lessonId]/page.tsx` (on le retravaille en phase 2)
- `app/dashboard/profile/page.tsx` (phase 2)
- `app/page.tsx` (phase 2)
- Composants métier (`ExerciseRenderer`, `CommentSection`, `TimestampedNotes`, `ModuleProgress`, etc.) — inchangés côté logique, juste classes CSS ré-appliquées si nécessaire.

Important : le **refresh visuel global** (fonts, colors, tokens) se fait via `globals.css`. Ça touche TOUTES les pages automatiquement. Les pages non retravaillées en phase 1 auront donc déjà un look différent (nouvelle typo, nouvelles couleurs) même sans refactor du layout.

---

## 6. Responsive

- Desktop ≥ 1024px : Bento 6 colonnes, Hero 2fr/1fr, Activity 3 colonnes.
- Tablet 768–1023px : Bento 4 colonnes (modules wide = 4, autres = 2), Hero stacké (hero-main sur hero-side), Activity 2 colonnes.
- Mobile < 768px : Bento 2 colonnes (tous les modules = 2), Hero 1 colonne complète, Activity 1 colonne, stat-blocks en row horizontal.

La topbar passe en mode compact mobile (logo + search icon + avatar ; search ouvre un overlay full-screen au tap).

---

## 7. Accessibilité

- Contrastes WCAG AA minimum. Sur les cards modules (fond coloré saturé, texte noir), on vise AAA.
- Tous les éléments interactifs ont un `focus-visible` avec un ring de 2px couleur `--success`.
- Les animations respectent `prefers-reduced-motion` : durées réduites à 0.01ms, pas de cascade.
- Les pills de status ont texte + icône + couleur (jamais uniquement couleur pour signifier "complété" vs "locked").

---

## 8. Hors scope (pour éviter de dériver)

Ce qui NE change PAS en phase 1 :

- **Backend** : aucune modif Convex.
- **Auth / flows de login / paiement / Discord role** : déjà traité dans le spec précédent, zéro modif.
- **Contenu** : aucun changement de copy/texte/structure éditoriale (on garde les mêmes titres, descriptions, etc.).
- **Autres écrans** : login, profil, leçon, admin, landing `/` — spec séparés en phase 2. Ils bénéficient du refresh global des tokens CSS mais pas de refonte layout.
- **Dark/light toggle** : la logique existe déjà et reste. Le mode clair ne reçoit qu'un rafraîchissement minimal des accents.
- **Responsive design approfondi** au-delà de ce qui est listé en §6 (détails mobile fins reviendront en phase 2).
- **Nouveaux comportements produit** (ex : tabs fonctionnelles du dashboard qui filtrent en live) — les tabs sont présentes visuellement mais seules "Tous" est active en phase 1, les autres sont cosmétiques.
- **Animations de page-à-page** (transitions Next.js) — reste en v1 standard, sera revu en phase 2.

---

## 9. Critères de succès (phase 1)

1. **Dashboard /dashboard** rendu en dark mode Bold Editorial, avec Hero split, BentoGrid modules colorés, ProgressStrip et ActivityStrip.
2. **Topbar** unifiée, remplace `TopControls`, présente sur toutes les pages authentifiées.
3. **Tokens CSS** (`globals.css`) mis à jour — nouvelles couleurs accent-*, fonts Google chargées, motion variables, grille de fond.
4. **Fonts Google** (`Instrument Serif`, `JetBrains Mono`) chargées via `next/font` (perf).
5. Le reste de l'app reste fonctionnel — pas de régression sur `/lesson/[id]`, `/dashboard/profile`, `/admin/*`. Ils auront un nouveau look via les tokens globaux, même sans refactor layout.
6. `npm run build` et `npm run lint` passent sans nouvelle erreur.
7. Test manuel : hover sur un module card → transform +4px vers le haut, flèche `→` qui glisse, transition 700ms. Entrée sur /dashboard → cascade reveal des blocs (Hero → ProgressStrip → Section head → Cards).

---

## 10. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Le refresh global des tokens casse des écrans non retravaillés (profil, leçon) | Tester visuellement chaque route clé avant merge ; la logique est inchangée donc ça reste fonctionnel même si c'est esthétiquement incohérent temporairement |
| Les fonts Google ralentissent le LCP | Utiliser `next/font` avec `display: "swap"` ; charger uniquement les poids utilisés (Instrument Serif 400+italic, JetBrains Mono 400+500+700) |
| Le dark mode uniquement sur le premium high-tech casse l'expérience light-mode | Garder le light mode fonctionnel avec les mêmes tokens mappés sur les couleurs actuelles ; le dark est le mode "référence" mais pas exclusif |
| Les tabs du dashboard (`EN COURS`, `COMPLÉTÉS`, …) sont présentes mais non-fonctionnelles → UX confuse | Seule "Tous" est cliquable/active, les autres ont `opacity: 0.4` et `cursor: not-allowed` avec tooltip "Bientôt" |

---

## 11. Suite

Après validation de ce spec → passage à `superpowers:writing-plans` pour décomposer en tâches d'implémentation.

Phase 2 (specs ultérieurs, un par écran, dans cet ordre recommandé) :
1. Page leçon (/lesson/[id]) — l'écran où l'utilisateur passe le plus de temps
2. Profil (/dashboard/profile)
3. Login + Landing (/login, /)
4. Admin (/admin/*)
