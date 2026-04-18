# Reprise DA amourstudios.fr — POC /dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire la font Anton dans l'app et migrer la typo du composant Hero + 3 éléments du /dashboard pour aligner la hiérarchie avec `amourstudios.fr`.

**Architecture:** Ajout de la font Anton via `next/font/google` (injection CSS var `--font-anton`). Création de 3 classes utilitaires dans `app/globals.css` (hors `@theme` Tailwind pour éviter collision avec `.font-display` existant). Migration ciblée de `components/ds/hero.tsx` et 3 éléments de `app/dashboard/page.tsx`.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@theme inline` + `@layer components`), Google Fonts via `next/font`, TypeScript.

**Note TDD adaptée:** Les changements sont purement visuels (fonts). Pas de tests unitaires. Chaque tâche se vérifie par `npm run lint` + `npx tsc --noEmit` + `npm run build` qui doivent tous passer sans erreur sur les fichiers modifiés. Vérification visuelle finale via deploy preview Vercel.

---

## Task 1 : Charger la font Anton

**Files:**
- Modify: `app/layout.tsx` (imports + html className)

- [ ] **Step 1.1 : Ajouter l'import Anton dans `next/font/google`**

Dans `app/layout.tsx` ligne 2, remplacer l'import existant par :

```ts
import { Anton, DM_Sans, Instrument_Serif } from "next/font/google";
```

- [ ] **Step 1.2 : Déclarer la constante `anton` avec variable CSS**

Après la déclaration `instrumentSerif` (après ligne 22), ajouter :

```ts
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});
```

- [ ] **Step 1.3 : Injecter la variable dans la `<html>`**

Ligne 50, remplacer `className={\`${dmSans.variable} ${instrumentSerif.variable} h-full\`}` par :

```tsx
className={`${dmSans.variable} ${instrumentSerif.variable} ${anton.variable} h-full`}
```

- [ ] **Step 1.4 : Vérifier typecheck + lint + build**

```bash
npx tsc --noEmit 2>&1 | grep -E "layout\.tsx" || echo "OK tsc"
npm run lint 2>&1 | grep -E "layout\.tsx" || echo "OK lint"
npm run build 2>&1 | tail -5
```

Expected : aucune erreur sur `app/layout.tsx`. Build doit passer.

- [ ] **Step 1.5 : Commit**

```bash
git add app/layout.tsx
git commit -m "feat(typo): charger font Anton via next/font"
```

---

## Task 2 : Créer les 3 classes utilitaires CSS

**Files:**
- Modify: `app/globals.css` (ajout dans `@layer components`, après `.ds-label` ligne ~465)

- [ ] **Step 2.1 : Ajouter les 3 classes utilitaires**

Dans `app/globals.css`, juste après la déclaration `.ds-label { ... }` (ligne ~465), insérer :

```css
  /* ══════════════════════════════════════════════════════
     Nouveau pallier typo — Anton display
     Aligné avec amourstudios.fr (display condensé fort)
     ══════════════════════════════════════════════════════ */
  .text-display-1 {
    font-family: var(--font-anton), "Arial Narrow", sans-serif;
    font-size: clamp(56px, 9vw, 136px);
    font-weight: 400;
    line-height: 0.9;
    letter-spacing: -1.5px;
  }
  .text-display-2 {
    font-family: var(--font-anton), "Arial Narrow", sans-serif;
    font-size: clamp(28px, 4vw, 56px);
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: -0.8px;
  }
  .text-label-xs {
    font-family: var(--font-body-legacy);
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight: 400;
  }
```

Le fallback `"Arial Narrow", sans-serif` garantit une font condensée si Anton échoue à charger.

- [ ] **Step 2.2 : Vérifier compilation CSS via build**

```bash
npm run build 2>&1 | grep -E "(error|globals\.css)" | head -5 || echo "OK css"
```

Expected : aucune erreur CSS.

- [ ] **Step 2.3 : Commit**

```bash
git add app/globals.css
git commit -m "feat(typo): ajouter classes utilitaires .text-display-1/2 et .text-label-xs"
```

---

## Task 3 : Migrer le composant Hero

**Files:**
- Modify: `components/ds/hero.tsx`

- [ ] **Step 3.1 : Localiser le `<h1>` du Hero et le mot italique**

Lire `components/ds/hero.tsx` pour identifier exactement le JSX du titre (recherche `<h1`). Noter la ligne courante — le `<h1>` utilise actuellement `text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]` et `style={{ fontFamily: "var(--font-serif)" }}`.

- [ ] **Step 3.2 : Remplacer le className et le style du `<h1>`**

Remplacer :

```tsx
<h1
  className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
  style={{ fontFamily: "var(--font-serif)" }}
>
  {titleRender}
</h1>
```

Par :

```tsx
<h1 className="text-display-1">
  {titleRender}
</h1>
```

- [ ] **Step 3.3 : Mettre à jour le rendu du mot italique**

Le rendu de l'italic word se fait dans la fonction `titleRender`. Trouver la ligne (type `<em className="italic">{italicWord}</em>`) et ajouter le style inline pour forcer Instrument Serif :

```tsx
<em className="italic" style={{ fontFamily: "var(--font-serif)" }}>
  {italicWord}
</em>
```

Ceci garantit que le mot italique reste en Instrument Serif même quand le parent passe en Anton (pattern site).

- [ ] **Step 3.4 : Vérifier typecheck + lint**

```bash
npx tsc --noEmit 2>&1 | grep "hero\.tsx" || echo "OK tsc"
npm run lint 2>&1 | grep "hero\.tsx" || echo "OK lint"
```

Expected : aucune erreur.

- [ ] **Step 3.5 : Commit**

```bash
git add components/ds/hero.tsx
git commit -m "feat(hero): migrer h1 en Anton display-1, italic accent reste Instrument Serif"
```

---

## Task 4 : Migrer les 3 éléments du /dashboard

**Files:**
- Modify: `app/dashboard/page.tsx` (3 zones : lignes ~153-158, ~184, ~604-612)

- [ ] **Step 4.1 : Migrer le h2 "Modules"**

Dans `app/dashboard/page.tsx`, localiser la ligne actuelle :

```tsx
<h2
  className="text-3xl italic"
  style={{ fontFamily: "var(--font-serif)" }}
>
  Modules
</h2>
```

Remplacer par :

```tsx
<h2 className="text-display-2">Modules</h2>
```

- [ ] **Step 4.2 : Migrer le h2 "Actu Amour Studios"**

Localiser la ligne actuelle :

```tsx
<h2 className="ds-section">Actu Amour Studios</h2>
```

Remplacer par :

```tsx
<h2 className="text-display-2">Actu Amour Studios</h2>
```

- [ ] **Step 4.3 : Migrer les gros numéros modules dans `ModuleRowView`**

Localiser la ligne (autour de 604-612) :

```tsx
<div
  className="text-[28px] italic leading-none tracking-tight md:text-[34px]"
  style={{
    fontFamily: "var(--font-serif)",
    color: locked ? "var(--state-locked)" : accent,
  }}
>
  {String(order + 1).padStart(2, "0")}
</div>
```

Remplacer par :

```tsx
<div
  className="text-[28px] leading-none tracking-tight md:text-[34px]"
  style={{
    fontFamily: "var(--font-anton), sans-serif",
    color: locked ? "var(--state-locked)" : accent,
  }}
>
  {String(order + 1).padStart(2, "0")}
</div>
```

Noter : retrait de la classe `italic`, font explicite `var(--font-anton)` inline (pas de classe car déjà très spécifique en taille).

- [ ] **Step 4.4 : Vérifier typecheck + lint sur le fichier**

```bash
npx tsc --noEmit 2>&1 | grep "dashboard/page\.tsx" || echo "OK tsc"
npm run lint 2>&1 | grep "dashboard/page\.tsx" || echo "OK lint"
```

Expected : aucune erreur.

- [ ] **Step 4.5 : Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): migrer h2 Modules/Actu + gros numéros modules en Anton"
```

---

## Task 5 : Vérification build complet + deploy preview

**Files:** aucun (vérification cross-fichiers + deploy).

- [ ] **Step 5.1 : Lancer le build complet**

```bash
npm run build 2>&1 | tail -15
```

Expected : `Build Completed` sans erreur. Aucune page ne doit échouer.

- [ ] **Step 5.2 : Lint complet**

```bash
npm run lint 2>&1 | grep -E "(layout\.tsx|globals\.css|hero\.tsx|dashboard/page\.tsx)" | head -10 || echo "OK lint"
```

Expected : pas d'erreurs sur les 4 fichiers modifiés (warnings pré-existants OK).

- [ ] **Step 5.3 : Typecheck complet**

```bash
npx tsc --noEmit 2>&1 | head -10 || echo "OK tsc"
```

Expected : aucune erreur.

- [ ] **Step 5.4 : Deploy preview Vercel (pas prod)**

```bash
vercel --yes 2>&1 | tail -10
```

Noter l'URL preview. Pas `--prod` — on valide d'abord visuellement.

- [ ] **Step 5.5 : Handoff user pour QA visuelle**

Donner l'URL preview au user. Lui demander de vérifier sur `/dashboard` et `/dashboard/outils` :
- Hero "Ton univers se construit." — base en Anton condensé, mot "univers" reste Instrument Serif italic
- Section h2 "Modules" et "Actu Amour Studios" — uniformes en Anton
- Gros numéros 01/02/03 dans les cards de modules — Anton, plus condensés qu'avant
- Pas de régression visuelle ailleurs

Si OK → le user dit go prod :
```bash
vercel --prod --yes 2>&1 | tail -5
```

Si KO → itérer sur les fichiers concernés, re-déployer preview.

- [ ] **Step 5.6 : Commit tag "POC validé"**

Après validation user :

```bash
git log --oneline -5
```

Documentation du POC validé = 4 commits (1 par tâche). Pas de tag supplémentaire nécessaire.

---

## Self-Review

**Spec coverage check (spec `2026-04-19-da-site-reprise-design.md`):**
- Section 1 Tokens (Anton + 3 classes) → Tasks 1 + 2 ✅
- Section 2 Hero → Task 3 ✅
- Section 3 /dashboard (3 changements) → Task 4 (Steps 4.1 / 4.2 / 4.3) ✅
- Verification (lint, tsc, build, deploy preview) → Task 5 ✅

**Placeholder scan:** Aucun TBD, TODO, "similar to", "add appropriate". Chaque step a le code concret ou la commande concrète.

**Type consistency:** Les classes `.text-display-1`, `.text-display-2`, `.text-label-xs` définies en Task 2 sont référencées textuellement en Tasks 3 + 4. Variable `--font-anton` définie par next/font en Task 1 est référencée en Task 2 et Task 4 (step 4.3). Noms alignés.

**Risque notable :** `.text-label-xs` est défini mais non utilisé dans le POC (prévu pour phase 2). Je le garde — coût zéro, dispo immédiatement pour la phase suivante.
