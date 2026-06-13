# Polish Apple UI/UX (studio + espace élève) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer les principes Apple (transitions fluides unifiées, boutons avec états hover/active/focus, cibles tactiles 44px, reduced-motion, micro-typo lisible) sur `/studio` et l'espace élève, **sans toucher à l'identité AMOUR** ni à la DA Glass C.

**Architecture:** Couche de tokens motion **additive** dans `globals.css` (règle projet : ne jamais supprimer un token existant — auditer les `var()`), un composant `GlassButton` dont les états vivent en **CSS pur** (classe `.glass-btn`, pas de Tailwind sur les surfaces Glass C — règle 1 du CLAUDE.md), des constantes de spring partagées dans `lib/motion.ts`, puis migrations mécaniques des call sites.

**Tech Stack:** Next.js 16 (App Router, Turbopack — lire `node_modules/next/dist/docs/` avant tout dev), Framer Motion (`framer-motion`, PAS `motion/react`), DA Glass C inline (`app/studio/_components/glass.tsx` = source de vérité), Tailwind 4 uniquement sur les surfaces élève `dashboard/*` et composants `components/*`.

**Contraintes projet non négociables (CLAUDE.md) :**
1. Surfaces studio/exos = inline styles + tokens `glass.tsx`. Les états interactifs passent par des classes **CSS pur** dans `globals.css` (déjà le pattern de `page-transition`), jamais par des utilities Tailwind.
2. Dark mode : pas de `var(--white)`/`var(--ink)` pour du texte sur surfaces toujours-noires. **Tester clair + sombre + mobile à chaque task.**
3. Tokens : additif seulement. Un `var()` orphelin = écran noir au runtime.
4. Pas de tests unitaires UI dans ce repo → la « preuve » de chaque task = `npm run build` qui passe + assertions `grep` + vérification visuelle sur `PORT=3001 npm run dev`.
5. Commits fréquents, un par task.

---

## État des lieux (audit 2026-06-13)

- **Boutons** : `glassBtn()` (`app/studio/_components/glass.tsx:295-328`) retourne des styles statiques — **aucun** `:hover`/`:active`/`:focus-visible`. 22 fichiers l'utilisent.
- **Springs Framer Motion** : 5 réglages différents (320/34, 380/34, 400/26, 420/32, 420/34) répartis sur `sortable-blocks.tsx:20`, `fiche-shared.tsx:31`, `rdv-dialog.tsx:329,369,548,557`, `calendrier/page.tsx:614,636`.
- **Durées hardcodées** : `0.2s ease` (`app/claim/page.tsx:794`), `duration-400` (`app/dashboard/page.tsx:580`), `.18s ease` (`app/studio/layout.tsx:175`).
- **Cibles tactiles < 44px** : NavItem `h-10` (`components/layout/sidebar.tsx:190`), mobile-nav `py-1.5` (`components/layout/mobile-nav.tsx:35,50,57`), theme-toggle 56×30 (`app/globals.css:512`).
- **Focus ring cassé** : bouton `display: contents` (`app/studio/eleves/page.tsx:~212`).
- **Bouton signOut ad hoc** : `app/dashboard/profile/page.tsx:504-510` (classes inline, couleur `#E63326` hardcodée).
- **prefers-reduced-motion** : respecté en CSS global (`globals.css:382-389`) mais PAS par les springs Framer (JS).
- **Micro-typo** : `Pill` 10px, `Segmented` 10.5px (`glass.tsx:368,415`) — sous le seuil de confort.

---

### Task 1 : Tokens motion Apple (additifs)

**Files:**
- Modify: `app/globals.css` (après la ligne 126, bloc `--dur-cascade: 70ms;`)

- [ ] **Step 1 : Ajouter les tokens dans `:root`**

Dans `app/globals.css`, juste après `--dur-cascade: 70ms;` (ligne 126), ajouter — sans rien supprimer :

```css
  /* Motion Apple — polish 2026-06 (ADDITIF : ne pas toucher aux --dur-*/--ease-* existants) */
  --ease-spring: cubic-bezier(.32, .72, 0, 1); /* easing sheet iOS, déjà utilisé par les page transitions */
  --ease-snap: cubic-bezier(.2, .9, .3, 1);
  --dur-instant: 150ms;
  --dur-quick: 250ms;
  --dur-smooth: 400ms;
```

- [ ] **Step 2 : Vérifier qu'aucun token existant n'a bougé**

Run :
```bash
grep -c "dur-fast\|dur-med\|dur-slow\|dur-cascade\|ease-reveal" app/globals.css
```
Expected : même compte qu'avant l'édit (les anciens tokens sont intacts). Puis :
```bash
npm run build
```
Expected : build PASS.

- [ ] **Step 3 : Commit**

```bash
git add app/globals.css
git commit -m "feat(design): tokens motion Apple additifs (ease-spring/snap, dur-instant/quick/smooth)"
```

---

### Task 2 : Constantes spring partagées + reduced-motion

**Files:**
- Create: `lib/motion.ts`

- [ ] **Step 1 : Créer `lib/motion.ts`**

```ts
"use client";

import { useReducedMotion } from "framer-motion";

/** Spring standard Apple-like — remplace les 5 réglages ad hoc du studio. */
export const SPRING = {
  type: "spring" as const,
  stiffness: 400,
  damping: 30,
  mass: 0.9,
};

/** Variante plus vive pour les apparitions de modals/popovers. */
export const SPRING_SNAPPY = {
  type: "spring" as const,
  stiffness: 480,
  damping: 34,
  mass: 0.8,
};

export const NO_MOTION = { duration: 0 };

/** Spring qui respecte prefers-reduced-motion. À utiliser dans tout composant client. */
export function useAppSpring(spring: typeof SPRING = SPRING) {
  const reduced = useReducedMotion();
  return reduced ? NO_MOTION : spring;
}
```

- [ ] **Step 2 : Vérifier la compilation**

Run : `npm run build`
Expected : PASS (le fichier n'est pas encore importé, on valide juste la syntaxe et l'alias `@/lib`).

- [ ] **Step 3 : Commit**

```bash
git add lib/motion.ts
git commit -m "feat(design): springs Framer unifiés + hook useAppSpring (reduced-motion)"
```

---

### Task 3 : Migrer les 8 springs vers `lib/motion`

**Files:**
- Modify: `app/studio/_components/sortable-blocks.tsx:20`
- Modify: `app/studio/eleves/[id]/_components/fiche-shared.tsx:31`
- Modify: `app/studio/_components/rdv-dialog.tsx:329,369,548,557`
- Modify: `app/studio/calendrier/page.tsx:614,636`

- [ ] **Step 1 : `sortable-blocks.tsx`** — supprimer la constante locale ligne 20 :

```ts
// AVANT (ligne 20)
const SPRING = { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.9 };

// APRÈS : supprimer la ligne et ajouter en tête de fichier
import { SPRING } from "@/lib/motion";
```
Les usages existants de `SPRING` dans le fichier restent identiques.

- [ ] **Step 2 : `fiche-shared.tsx:31`** (objet de variants module-level — pas de hook possible ici) :

```ts
// AVANT
transition: { type: "spring" as const, stiffness: 400, damping: 26 },

// APRÈS (+ import { SPRING } from "@/lib/motion" en tête)
transition: SPRING,
```

- [ ] **Step 3 : `rdv-dialog.tsx`** — dans le composant, ajouter :

```ts
import { SPRING, SPRING_SNAPPY, useAppSpring } from "@/lib/motion";
// dans le corps du composant :
const spring = useAppSpring(SPRING);
const springSnappy = useAppSpring(SPRING_SNAPPY);
```
Puis remplacer :
- ligne 329 : `transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}` → `transition={springSnappy}` (apparition du dialog)
- lignes 369, 548, 557 : `transition={{ type: "spring", stiffness: 400, damping: 26 }}` → `transition={spring}`

- [ ] **Step 4 : `calendrier/page.tsx`** — même pattern :

```ts
import { SPRING, useAppSpring } from "@/lib/motion";
const spring = useAppSpring(SPRING);
```
- ligne 614 : `transition={{ type: "spring", stiffness: 380, damping: 34 }}` → `transition={spring}`
- ligne 636 : `transition={{ type: "spring", stiffness: 420, damping: 34 }}` → `transition={spring}`

⚠️ Si la ligne 614/636 est dans un sous-composant qui n'est pas le composant racine, déclarer le `useAppSpring` dans CE sous-composant (règles des hooks).

- [ ] **Step 5 : Vérifier qu'il ne reste plus de spring ad hoc**

Run :
```bash
grep -rn "stiffness" app --include="*.tsx" | grep -v "lib/motion"
```
Expected : 0 résultat.
Run : `npm run build` → PASS.

- [ ] **Step 6 : Vérification visuelle**

Run : `PORT=3001 npm run dev`, ouvrir `/studio/calendrier` et la fiche élève, ouvrir/fermer le dialog RDV, glisser un bloc. Les animations doivent rester fluides (clair + sombre).

- [ ] **Step 7 : Commit**

```bash
git add app/studio lib/motion.ts
git commit -m "refactor(design): springs Framer unifiés via lib/motion + reduced-motion"
```

---

### Task 4 : `GlassButton` — états hover/active/focus en CSS pur

**Files:**
- Modify: `app/globals.css` (nouvelles classes, à placer près des styles studio existants, ex. avant le bloc `.studio-*` ligne ~1173)
- Modify: `app/studio/_components/glass.tsx` (nouveau composant après `glassBtn`, ligne 328)

**Principe :** `glassBtn()` continue de fournir les couleurs/padding en inline (DA Glass C). La classe `.glass-btn` ajoute UNIQUEMENT des propriétés non posées en inline (`transform`, `filter`, `outline`, `transition`) — donc aucune collision inline vs CSS, et le reduced-motion global (`globals.css:382`) s'applique gratuitement.

- [ ] **Step 1 : Ajouter le CSS dans `app/globals.css`**

```css
/* ── GlassButton : états interactifs (polish Apple 2026-06) ─────────────
   Les couleurs restent en inline (DA Glass C). Ici : uniquement des
   propriétés jamais posées en inline → pas de conflit. */
.glass-btn {
  transition:
    transform var(--dur-instant) var(--ease-spring),
    filter var(--dur-instant) var(--ease-spring),
    opacity var(--dur-instant) var(--ease-spring);
}
.glass-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}
.glass-btn:active {
  transform: translateY(0) scale(0.97);
  filter: brightness(0.96);
  transition-duration: 80ms;
}
.glass-btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.glass-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* Boutons de Segmented : feedback sans déplacement (pas de translateY dans un rail) */
.glass-seg {
  transition: filter var(--dur-instant) var(--ease-snap);
}
.glass-seg:hover { filter: brightness(1.1); }
.glass-seg:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
  border-radius: 999px;
}
```

- [ ] **Step 2 : Ajouter `GlassButton` dans `glass.tsx`** (après `glassBtn`, ligne 328) :

```tsx
/** Bouton Glass C avec états hover/active/focus (classe CSS .glass-btn).
 *  Remplace le pattern `<button style={glassBtn(c, kind)}>`. */
export function GlassButton({
  c,
  kind = "ghost",
  style,
  ...props
}: React.ComponentProps<"button"> & {
  c: C;
  kind?: "solid" | "ghost" | "ink";
}) {
  return (
    <button
      className="glass-btn"
      style={{ ...glassBtn(c, kind), ...style }}
      {...props}
    />
  );
}
```
(Si `React` n'est pas importé : `import type { ComponentProps } from "react";` et utiliser `ComponentProps<"button">`.)

- [ ] **Step 3 : Ajouter la classe aux boutons de `Segmented`** (`glass.tsx:410`) :

```tsx
<button
  key={it.id}
  className="glass-seg"
  onClick={() => onChange(it.id)}
  ...
```

- [ ] **Step 4 : Build + vérif**

Run : `npm run build` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add app/globals.css app/studio/_components/glass.tsx
git commit -m "feat(design): GlassButton avec etats hover/active/focus-visible en CSS pur"
```

---

### Task 5 : Migration `glassBtn` → `GlassButton` — surfaces studio (13 fichiers)

**Files (Modify) :** `app/studio/error.tsx`, `app/studio/layout.tsx`, `app/studio/page.tsx`, `app/studio/transcripts/page.tsx`, `app/studio/eleves/[id]/page.tsx`, `app/studio/eleves/[id]/_components/fiche-onboarding.tsx`, `app/studio/eleves/[id]/_components/fiche-payment.tsx`, `app/studio/campagnes/page.tsx`, `app/studio/calendrier/page.tsx`, `app/studio/_components/onboardings-pending.tsx`, `app/studio/_components/rdv-dialog.tsx`, `app/studio/login/page.tsx`

**Transformation mécanique** (identique partout) :

```tsx
// AVANT
<button onClick={...} style={glassBtn(c, "solid")}>＋ Nouveau RDV</button>
// APRÈS
<GlassButton c={c} kind="solid" onClick={...}>＋ Nouveau RDV</GlassButton>

// AVANT (avec overrides de style — les garder via la prop style)
<button style={{ ...glassBtn(c, "ghost"), width: "100%" }}>…</button>
// APRÈS
<GlassButton c={c} kind="ghost" style={{ width: "100%" }}>…</GlassButton>
```
Mettre à jour l'import dans chaque fichier : `import { …, GlassButton } from "…/glass"` (et retirer `glassBtn` de l'import s'il n'est plus utilisé dans le fichier).

- [ ] **Step 1 : Lister les call sites**

Run : `grep -rn "glassBtn(" app/studio --include="*.tsx" | grep -v "_components/glass.tsx"`

- [ ] **Step 2 : Appliquer la transformation fichier par fichier** (pattern ci-dessus, conserver kind et overrides à l'identique)

- [ ] **Step 3 : Vérifier qu'il ne reste rien**

Run :
```bash
grep -rn "style={glassBtn(\|style={{ ...glassBtn(\|style={{...glassBtn(" app/studio --include="*.tsx" | grep -v "_components/glass.tsx"
```
Expected : 0 résultat. Run : `npm run build` → PASS.

- [ ] **Step 4 : Vérification visuelle** — `/studio` (boutons ＋ Note / ＋ Nouveau RDV), `/studio/transcripts`, dialog RDV : hover = lift léger, clic = press, Tab = ring visible. **Clair + sombre.**

- [ ] **Step 5 : Commit**

```bash
git add app/studio
git commit -m "refactor(studio): migration glassBtn -> GlassButton (etats interactifs)"
```

---

### Task 6 : Migration `glassBtn` → `GlassButton` — surfaces élève/publiques (9 fichiers)

**Files (Modify) :** `app/exos/error.tsx`, `app/exos/layout.tsx`, `app/exos/[id]/page.tsx`, `app/admin/page.tsx`, `app/compte/page.tsx`, `app/login/page.tsx`, `app/onboarding/welcome/page.tsx`, `app/onboarding/[token]/page.tsx`, `app/claim/page.tsx`

- [ ] **Step 1 : Même transformation mécanique que Task 5** sur ces 9 fichiers. Import depuis `@/app/studio/_components/glass` (vérifier le chemin d'import déjà utilisé dans chaque fichier pour `glassBtn` et le réutiliser tel quel).

- [ ] **Step 2 : Cas particuliers à NE PAS migrer aveuglément** : les boutons avec styles 100% ad hoc (ex. `discordBtn` dans `app/login/page.tsx:26-42`, couleur Discord `#5865F2` volontaire). Pour ceux-là, ajouter seulement `className="glass-btn"` au `<button>`/`<a>` pour gagner les états, sans toucher au style inline :

```tsx
<button className="glass-btn" style={discordBtn} onClick={...}>
```

- [ ] **Step 3 : Vérification**

Run :
```bash
grep -rn "style={glassBtn(\|...glassBtn(" app --include="*.tsx" | grep -v "_components/glass.tsx"
```
Expected : 0 résultat. `npm run build` → PASS.

- [ ] **Step 4 : Vérification visuelle** — `/login`, `/compte` (boutons upgrade/annulation), `/exos` (écran verrouillé Communauté), `/claim`. **Clair + sombre + mobile.**

- [ ] **Step 5 : Commit**

```bash
git add app
git commit -m "refactor(eleve): migration glassBtn -> GlassButton sur les surfaces eleve/publiques"
```

---

### Task 7 : Fix focus ring — bouton `display: contents` (liste élèves)

**Files:**
- Modify: `app/studio/eleves/page.tsx:~212`
- Modify: `app/globals.css` (classe `.glass-row`)

- [ ] **Step 1 : Lire le contexte autour de la ligne 212** pour déterminer si le `display: contents` est load-bearing (enfants participant à une grid du parent).

- [ ] **Step 2 — Branche A (le parent n'est PAS une grid)** : remplacer par un vrai bouton block :

```tsx
<button
  onClick={() => router.push(`/studio/eleves/${m._id}`)}
  className="glass-row"
  style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
>
```

**Branche B (display: contents nécessaire à la grid)** : garder `display: contents`, poser le ring sur le premier enfant :

```css
/* globals.css */
.glass-row:focus-visible > :first-child {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 12px;
}
```
et ajouter `className="glass-row"` au bouton.

Dans les deux branches, ajouter aussi le hover :
```css
.glass-row { transition: filter var(--dur-instant) var(--ease-snap); }
.glass-row:hover { filter: brightness(1.04); }
```

- [ ] **Step 3 : Vérifier au clavier** — `PORT=3001 npm run dev`, `/studio/eleves`, naviguer avec Tab : chaque ligne montre un ring visible, Enter ouvre la fiche.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/eleves/page.tsx app/globals.css
git commit -m "fix(a11y): focus ring visible sur les lignes de la liste eleves"
```

---

### Task 8 : Bouton « Se déconnecter » → composant `Button`

**Files:**
- Modify: `app/dashboard/profile/page.tsx:504-510`

- [ ] **Step 1 : Remplacer le bouton ad hoc** (surface Tailwind → on utilise le composant shadcn existant) :

```tsx
// AVANT (lignes 504-510)
<button
  onClick={() => signOut()}
  className="flex w-full items-center justify-center gap-2 border border-foreground/15 bg-foreground/[0.02] py-4 font-mono text-[11px] uppercase tracking-[2px] text-foreground/60 transition-all hover:border-[rgba(230,51,38,0.4)] hover:bg-[rgba(230,51,38,0.05)] hover:text-[#E63326]"
  style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
>
  <LogOut size={13} /> Se déconnecter
</button>

// APRÈS
<Button
  variant="outline"
  onClick={() => signOut()}
  className="h-auto w-full gap-2 rounded-none border-foreground/15 bg-foreground/[0.02] py-4 font-mono text-[11px] uppercase tracking-[2px] text-foreground/60 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
  style={{ fontFamily: "var(--font-body-legacy)" }}
>
  <LogOut size={13} /> Se déconnecter
</Button>
```
Ajouter l'import : `import { Button } from "@/components/ui/button";` (vérifier s'il existe déjà). `rounded-none` préserve le rendu carré actuel de cette carte ; la couleur destructive remplace le `#E63326` hardcodé par le token.

- [ ] **Step 2 : Vérifier** — `/dashboard/profile` en bas de page : hover rouge, Tab → ring, clic → déconnexion vers `/login`. **Clair + sombre.** `npm run build` → PASS.

- [ ] **Step 3 : Commit**

```bash
git add app/dashboard/profile/page.tsx
git commit -m "refactor(profile): bouton deconnexion via composant Button + token destructive"
```

---

### Task 9 : Cibles tactiles 44px (sidebar, mobile-nav, theme-toggle)

**Files:**
- Modify: `components/layout/sidebar.tsx:190`
- Modify: `components/layout/mobile-nav.tsx:35,50,57`
- Modify: `app/globals.css:512-530` (`.theme-toggle`)

- [ ] **Step 1 : Sidebar NavItem** (`sidebar.tsx:190`) — `h-10` (40px) → `h-11` (44px) :

```tsx
const className = `flex items-center gap-3 h-11 rounded-lg text-sm transition-all duration-200 ${
```

- [ ] **Step 2 : Mobile nav** — lignes 35, 50 et 57 de `mobile-nav.tsx` : remplacer `py-1.5` par `py-2 min-h-11 justify-center` dans les trois `className` (les items passent à ≥44px effectifs).

- [ ] **Step 3 : Theme toggle** — garder le visuel 56×30, étendre la zone cliquable via pseudo-élément. Dans `app/globals.css`, compléter le bloc `.theme-toggle` (ligne 512) :

```css
.theme-toggle {
  /* … propriétés existantes inchangées … */
  position: relative;
}
.theme-toggle::before {
  content: "";
  position: absolute;
  inset: -8px; /* 30px + 2×8 = 46px de zone tactile */
}
```
⚠️ Si `.theme-toggle` a déjà un `position`, ne pas le dupliquer. Vérifier qu'aucun `::before` n'existe déjà sur ce sélecteur (`grep -n "theme-toggle::before" app/globals.css` → doit être vide avant l'ajout).

- [ ] **Step 4 : Vérifier** — mobile (DevTools, iPhone SE 375px) : nav basse et sidebar confortables au pouce ; le toggle thème répond autour du visuel. `npm run build` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add components/layout/sidebar.tsx components/layout/mobile-nav.tsx app/globals.css
git commit -m "fix(a11y): cibles tactiles 44px (sidebar, mobile-nav, theme-toggle)"
```

---

### Task 10 : Durées hardcodées → tokens motion

**Files:**
- Modify: `app/claim/page.tsx:794`
- Modify: `app/dashboard/page.tsx:580`
- Modify: `app/studio/layout.tsx:175`

- [ ] **Step 1 : `claim/page.tsx:794`** (les `var()` fonctionnent dans les styles inline) :

```tsx
// AVANT
transition: "border-color 0.2s ease, background 0.2s ease",
// APRÈS
transition: "border-color var(--dur-instant) var(--ease-snap), background var(--dur-instant) var(--ease-snap)",
```

- [ ] **Step 2 : `dashboard/page.tsx:580`** :

```tsx
// AVANT
className="… transition-[height] duration-400 ease-[cubic-bezier(.22,1,.36,1)] …"
// APRÈS
className="… transition-[height] [transition-duration:var(--dur-smooth)] [transition-timing-function:var(--ease-spring)] …"
```

- [ ] **Step 3 : `app/studio/layout.tsx:175`** (largeur sidebar) :

```tsx
// AVANT
transition: "width .18s ease",
// APRÈS
transition: "width var(--dur-instant) var(--ease-spring)",
```

- [ ] **Step 4 : Vérifier** — hover carte leçon `/dashboard`, sélection d'option `/claim`, collapse sidebar studio : transitions fluides, pas de saccade. `npm run build` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add app/claim/page.tsx app/dashboard/page.tsx app/studio/layout.tsx
git commit -m "refactor(design): durees hardcodees remplacees par les tokens motion"
```

---

### Task 11 : Micro-typo lisibilité (Pill / Segmented)

**Files:**
- Modify: `app/studio/_components/glass.tsx:368` (Pill) et `:415` (Segmented)

- [ ] **Step 1 : `Pill`** (ligne 368) : `fontSize: 10` → `fontSize: 11`.

- [ ] **Step 2 : `Segmented`** (ligne 415) : `fontSize: 10.5` → `fontSize: 11` et padding `"6px 12px"` → `"8px 14px"` (meilleure cible tactile dans le rail).

- [ ] **Step 3 : Vérifier qu'aucun layout ne casse** — `/studio` (pills statuts), `/studio/calendrier` (segmented jour/semaine/mois), `/studio/eleves` (filtres) : pas de wrap inattendu, pas de débordement. **Clair + sombre.** `npm run build` → PASS.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/_components/glass.tsx
git commit -m "feat(design): pills et segmented 11px + padding tactile"
```

---

### Task 12 : QA visuelle finale (preuve)

**Files:** aucun (vérification)

- [ ] **Step 1 : Build complet** — `npm run build` → PASS, zéro warning nouveau.

- [ ] **Step 2 : Parcours visiteur frais** (règle QA : ne PAS contourner le preloader) — navigation privée sur `PORT=3001 npm run dev` :
  - `/login` → boutons Discord : hover/press/focus OK
  - `/studio` : ＋ Note / ＋ Nouveau RDV (lift + press), sidebar collapse fluide, Tab montre les rings
  - `/studio/eleves` : lignes focusables au clavier
  - `/studio/calendrier` + dialog RDV : springs unifiés
  - `/exos` (compte Communauté → écran verrouillé), `/compte`, `/claim`
  - `/dashboard/profile` : bouton Se déconnecter
- [ ] **Step 3 : Les 3 matrices obligatoires** — chaque écran ci-dessus en **clair**, **sombre** (toggle), **mobile 375px**. Aucune régression de contraste (attention règle « surfaces toujours-noires »).

- [ ] **Step 4 : Reduced motion** — DevTools → Rendering → `prefers-reduced-motion: reduce` : les springs Framer (dialog RDV, calendrier) ne doivent plus animer.

- [ ] **Step 5 : Commit final éventuel** (corrections de QA), puis récap des commits :

```bash
git log --oneline -12
```

---

### Task 13 (OPTIONNELLE — demander confirmation à l'utilisateur) : Déploiement

- [ ] **Step 1 :** `vercel --prod` puis **impérativement** `vercel promote <url>` (sinon le domaine public ne bouge pas — règle projet).
- [ ] **Step 2 :** Vérifier `https://amour-studios.vercel.app/studio` en visiteur frais (clair/sombre/mobile).

---

## Self-Review (fait à l'écriture du plan)

1. **Couverture du brief** : transitions ✓ (Tasks 1-3, 10), boutons ✓ (4-6, 8), ergonomie/UX ✓ (7, 9, 11), direction Apple sans casser la DA ✓ (états en CSS pur, tokens additifs).
2. **Placeholders** : aucun — chaque step a son code ou sa commande exacte ; les deux migrations mécaniques (Tasks 5-6) donnent le pattern exact avant/après + grep de complétude.
3. **Cohérence des types** : `GlassButton` (Task 4) consommé tel quel en Tasks 5-6 (`c`, `kind`, `style`) ; `SPRING`/`SPRING_SNAPPY`/`useAppSpring` (Task 2) consommés en Task 3 avec les mêmes signatures.
4. **Hors périmètre assumé (YAGNI)** : refonte de l'échelle typographique complète (15+ tailles) et responsive déclaratif des pages Glass C — gros chantiers séparés, à planifier ensuite si souhaité.
