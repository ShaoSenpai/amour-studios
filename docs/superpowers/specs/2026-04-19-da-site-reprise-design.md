# Reprise DA amourstudios.fr — typo + hiérarchie dans l'app

**Date :** 2026-04-19
**Scope :** POC /dashboard + composant Hero (partagé)
**Statut :** design validé, prêt pour writing-plans

## Contexte

L'app et le site marketing `amourstudios.fr` n'ont pas la même hiérarchie typographique. Le site utilise **Anton** (display condensé) pour tous les gros titres, brand, CTAs et numéros ; l'app utilise uniquement **Instrument Serif italique** pour les titres. Les deux autres fonts (Instrument Serif + DM Sans) sont déjà partagées.

L'utilisateur veut transposer la cohérence et la hiérarchie typo du site vers l'app, sans refondre ni palette ni animations.

## DA extraite du site (observation live via `$B`)

| Usage | Font | Size | Weight | LS |
|---|---|---|---|---|
| Hero H1 (marketing) | Anton | 153.6px | 400 | -2px |
| H2 section | Anton | 108.8px | 400 | -1.5px |
| H4 big ("6 MODULES") | Anton | 64px | 400 | -1px |
| H4 medium | Anton | 43.52px | 400 | -1px |
| Brand logo hero | Anton | 64px | 400 | -1px |
| CTAs | Anton | 18-30px | 400 | 0.6-1.5px |
| Gros nombres | Anton | 88px | 400 | -2px |
| Mots italiques accent | Instrument Serif italic | variable | 400 | variable |
| Labels meta | DM Sans uppercase | 9-11px | 400-700 | 2-2.5px |
| Body | DM Sans | 14px | 400 | normal |

Pattern récurrent : **Anton base + Instrument Serif italique pour un mot accent** (ex : "TOUT. VRAIMENT *tout.*").

## Scope

### Dans le POC
- Ajouter font **Anton** à l'app (Google Fonts, weight 400, display swap)
- Créer **3 classes utilitaires** : `.text-display-1`, `.text-display-2`, `.text-label-xs`
- Migrer **`components/ds/hero.tsx`** (composant partagé) : titre principal Instrument Serif → Anton, italic word reste Instrument Serif italic
- Migrer **`app/dashboard/page.tsx`** : sections h2 "Modules" et "Actu Amour Studios" en Anton, gros numéros modules (01/02/03) en Anton

### Hors scope (phase 2 si POC validé)
- `/dashboard/outils` corps (bandeaux modules N°XX, cartes exo) — reçoit juste le nouveau Hero via composant partagé
- `/lesson/[lessonId]`
- `/dashboard/profile`
- `/admin/*`
- `/login`, `/claim`
- Refonte palette
- Refonte animations
- Migration CTAs en Anton (décision séparée)

## Design détaillé

### Section 1 — Tokens

**`app/layout.tsx`** : importer Anton aux côtés de DM Sans et Instrument Serif.

```ts
import { Anton, DM_Sans, Instrument_Serif } from "next/font/google";

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

// dans <body> : ${anton.variable} ajouté aux classNames
```

**`app/globals.css` (@theme)** : exposer la variable Tailwind.

```css
@theme {
  /* existant */
  --font-sans: var(--font-body-legacy);
  --font-mono: var(--font-body-legacy);
  --font-heading: var(--font-serif);
  /* nouveau */
  --font-display: var(--font-anton);
}
```

**`app/globals.css` (@layer components)** : classes utilitaires.

```css
@layer components {
  .text-display-1 {
    font-family: var(--font-display);
    font-size: clamp(56px, 9vw, 136px);
    line-height: 0.9;
    letter-spacing: -1.5px;
    font-weight: 400;
  }
  .text-display-2 {
    font-family: var(--font-display);
    font-size: clamp(28px, 4vw, 56px);
    line-height: 0.95;
    letter-spacing: -0.8px;
    font-weight: 400;
  }
  .text-label-xs {
    font-family: var(--font-body-legacy);
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
}
```

Pas d'échelle complète — 3 classes suffisent pour couvrir les niveaux Hero / Section / Label. Extension au fil de l'eau si besoin.

### Section 2 — Hero (`components/ds/hero.tsx`)

Seul le `<h1>` change. Les autres éléments (caption, CTA, progress bar, stats) restent.

```tsx
// AVANT
<h1
  className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
  style={{ fontFamily: "var(--font-serif)" }}
>
  Ton <em className="italic">univers</em> se construit.
</h1>

// APRÈS
<h1 className="text-display-1">
  Ton <em className="italic" style={{ fontFamily: "var(--font-serif)" }}>univers</em> se construit.
</h1>
```

- Taille passe de clamp(40, 5.5vw, 64) → clamp(56, 9vw, 136) — proportionnel aux 153px du site
- Base Instrument Serif → Anton
- Mot italique accent : reste Instrument Serif italic (pattern site)

### Section 3 — /dashboard (`app/dashboard/page.tsx`)

Trois changements ciblés.

**3.a — Section h2 "Modules"**
```tsx
// AVANT
<h2 className="text-3xl italic" style={{ fontFamily: "var(--font-serif)" }}>Modules</h2>
// APRÈS
<h2 className="text-display-2">Modules</h2>
```

**3.b — Section h2 "Actu Amour Studios"**
```tsx
// AVANT
<h2 className="ds-section">Actu Amour Studios</h2>
// APRÈS
<h2 className="text-display-2">Actu Amour Studios</h2>
```

> ⚠️ **Changement de taille notable** : `.ds-section` = DM Sans bold 18px actuellement. `.text-display-2` = Anton 28-56px (clamp). L'intention est d'uniformiser les deux `<h2>` du dashboard ("Modules" et "Actu") au même niveau visuel (ils étaient déjà incohérents avant : "Modules" en `text-3xl` ~30px, "Actu" en 18px). Si tu préfères garder "Actu" plus discret, on le laisse en `.ds-section`.

**3.c — Gros numéros modules 01/02/03 dans `ModuleRowView`**
```tsx
// AVANT
<div
  className="text-[28px] italic leading-none tracking-tight md:text-[34px]"
  style={{ fontFamily: "var(--font-serif)", color: locked ? "var(--state-locked)" : accent }}
>
  {String(order + 1).padStart(2, "0")}
</div>
// APRÈS
<div
  className="text-[28px] leading-none tracking-tight md:text-[34px]"
  style={{ fontFamily: "var(--font-display)", color: locked ? "var(--state-locked)" : accent }}
>
  {String(order + 1).padStart(2, "0")}
</div>
```

(Retrait du `italic` — Anton n'est pas italique, le site non plus sur ses numéros.)

### Ce qui **ne bouge pas** délibérément
- Titres de modules dans les cards (`"Positionnement"`) — gardent Instrument Serif italique pour leur chaleur magazine qui contraste avec Anton du header section
- Labels mono uppercase du dashboard — déjà DM Sans, tracking déjà cohérent
- `ds-collapse-wrap`, `ds-cascade` animations — conservés

## Verification

Règle "prouve que ça marche" (CLAUDE.md) :

1. `npm run build` → passe
2. `npm run lint` → 0 erreur sur les fichiers modifiés (`app/layout.tsx`, `app/globals.css`, `components/ds/hero.tsx`, `app/dashboard/page.tsx`)
3. `npx tsc --noEmit` → 0 erreur
4. Deploy preview Vercel — validation visuelle par l'utilisateur sur `/dashboard` et `/dashboard/outils` (Hero)
5. **Critère de succès subjectif** : le user juge la cohérence avec `amourstudios.fr` suffisante pour propager au reste de l'app (phase 2)

## Fichiers modifiés

| Fichier | Type | Nature |
|---|---|---|
| `app/layout.tsx` | MODIF | Import + injection variable Anton |
| `app/globals.css` | MODIF | `@theme { --font-display }` + 3 classes `.text-display-1/2` + `.text-label-xs` |
| `components/ds/hero.tsx` | MODIF | `<h1>` en `.text-display-1`, italic word explicitement Instrument Serif |
| `app/dashboard/page.tsx` | MODIF | 3 changements ciblés (h2 Modules, h2 Actu, numéros ModuleRowView) |

## Phase 2 (si POC validé)

Propagation au reste de l'app, dans l'ordre :
1. `/dashboard/outils` — bandeaux modules (N°XX) + titres cards
2. `/lesson/[lessonId]` — titres leçons + module header
3. `/dashboard/profile`
4. `/login`, `/claim`, `/admin/*`

Décisions à trancher en phase 2 : CTAs (Anton ou DM Sans), italic accents sur titres intimes (module titles) Anton ou Instrument Serif.
