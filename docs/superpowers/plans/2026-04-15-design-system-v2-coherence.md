# Design System v2 — Cohérence couleurs & typos — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réduire l'app Next.js à 2 typos (Instrument Serif + DM Sans) et une palette où chaque couleur a un rôle unique, selon la spec `docs/superpowers/specs/2026-04-15-design-system-v2-coherence-design.md`.

**Architecture:** Touche uniquement l'app Next.js (pas la landing, pas la page paiement). Pas de refactor structurel : remplacement de classes Tailwind inline et ajustement de CSS vars. Vérification visuelle en dev (pas de tests unitaires : changements purement présentationnels).

**Tech Stack:** Next.js 16 (App Router), Tailwind v4, Google Fonts via `next/font/google`, Convex pour la DB.

---

## Fichiers impactés

- `app/layout.tsx` — retirer Anton + JetBrains Mono des imports et variables
- `app/globals.css` — repointer `--font-mono` et `--font-heading`, corriger `h1/h2/h3`
- `components/ds/topbar.tsx` — retirer le dot vert "Amour Studios"
- `components/layout/logo.tsx` — passer le `<span className="text-pine">s</span>` en `text-foreground`
- `components/ds/hero.tsx` — corriger copie "0/X leçons" pour nouveaux users
- `app/page.tsx`, `app/login/page.tsx`, `app/claim/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/profile/page.tsx`, `app/lesson/[lessonId]/page.tsx`, `app/admin/page.tsx`, `app/admin/content/page.tsx`, `app/admin/members/page.tsx` — remplacer `text-[#FF6B1F]` sur italiques/icônes/bordures par `text-foreground` ou `text-foreground/70`
- DB `announcements` — supprimer les 2 résidus de test

### Invariants à respecter

- **UpsellBanner** (`components/ds/upsell-banner.tsx`) garde tout son orange (c'est le seul bouton d'action principal autorisé à être orange).
- **Boutons bg orange** type `bg-[#FF6B1F]` dans `lesson/page.tsx` ligne 205 (bouton principal de la page Accès Verrouillé) et `admin/page.tsx` tabs/accents — conservés si c'est LE bouton d'action principal de la vue.
- **Accents modules** (or/orange/rouge/pêche/sapin/forêt) dans `MODULE_ACCENTS` arrays : **intacts**. Ils ne servent que pour les pastilles de module.

---

### Task 1 : Retirer Anton + JetBrains Mono de layout.tsx

**Files:**
- Modify: `app/layout.tsx:1-53`

- [ ] **Step 1 : Éditer les imports et variables**

Remplacer l'import ligne 2 :

```tsx
import { DM_Sans, Instrument_Serif } from "next/font/google";
```

Supprimer les blocs `anton` (lignes 10-15) et `jetbrainsMono` (lignes 31-36). Supprimer `${anton.variable}` et `${jetbrainsMono.variable}` de la className `<html>` ligne 53. Le résultat doit être :

```tsx
<html
  lang="fr"
  className={`${dmSans.variable} ${instrumentSerif.variable} h-full`}
  suppressHydrationWarning
>
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: build OK, pas d'erreur "Module not found" sur Anton/JetBrains_Mono.

- [ ] **Step 3 : Commit**

```bash
git add app/layout.tsx
git commit -m "chore(ds): drop Anton + JetBrains Mono from layout"
```

---

### Task 2 : Repointer les variables font dans globals.css

**Files:**
- Modify: `app/globals.css:16-18, 335, 342, 349, 433`

- [ ] **Step 1 : Mettre à jour le bloc @theme inline**

Ligne 16-18, remplacer :

```css
  --font-sans: var(--font-body-legacy);
  --font-mono: var(--font-body);
  --font-heading: var(--font-display);
```

Par :

```css
  --font-sans: var(--font-body-legacy);
  --font-mono: var(--font-body-legacy);
  --font-heading: var(--font-serif);
```

- [ ] **Step 2 : Corriger h1/h2/h3**

Ligne 335 (sélecteur h1), remplacer `font-family: var(--font-display);` par `font-family: var(--font-serif);` et `font-style: italic;` en plus.
Ligne 342 (sélecteur h2), remplacer `font-family: var(--font-display);` par `font-family: var(--font-serif);` et `font-style: italic;` en plus.
Ligne 349 (sélecteur h3), remplacer `font-family: var(--font-body);` par `font-family: var(--font-body-legacy);`.

Résultat attendu (diff) :

```css
  h1 {
    font-family: var(--font-serif);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(32px, 5vw, 56px);
    line-height: 0.95;
    letter-spacing: -1.5px;
  }
  h2 {
    font-family: var(--font-serif);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(22px, 3vw, 32px);
    line-height: 0.98;
    letter-spacing: -0.8px;
  }
  h3 {
    font-family: var(--font-body-legacy);
    font-weight: 700;
    font-size: 15px;
    line-height: 1.3;
  }
```

- [ ] **Step 3 : Corriger .font-display**

Ligne 432-433, remplacer :

```css
  .font-display {
    font-family: var(--font-display);
  }
```

Par :

```css
  .font-display {
    font-family: var(--font-serif);
    font-style: italic;
  }
```

- [ ] **Step 4 : Corriger body**

Ligne 327, remplacer `font-family: var(--font-body-legacy);` — pas de changement nécessaire (DM Sans reste). Vérifier que ligne 328 `font-size: 15px;` est conservée.

- [ ] **Step 5 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6 : Commit**

```bash
git add app/globals.css
git commit -m "chore(ds): repoint font vars — h1/h2 serif italic, font-mono → DM Sans"
```

---

### Task 3 : Neutraliser les italiques éditoriaux orange (remplacer par foreground)

**Files:**
- Modify: `app/page.tsx:38`
- Modify: `app/login/page.tsx:49`
- Modify: `app/dashboard/page.tsx:219`
- Modify: `app/dashboard/profile/page.tsx:163`
- Modify: `app/claim/page.tsx:576`
- Modify: `app/lesson/[lessonId]/page.tsx:185, 256`
- Modify: `app/admin/page.tsx:62`
- Modify: `app/admin/content/page.tsx:71`
- Modify: `app/admin/members/page.tsx:60`

- [ ] **Step 1 : Remplacer toutes les occurrences `italic text-[#FF6B1F]` dans les `<em>` par `italic text-foreground`**

Dans chaque fichier listé, rechercher :

```tsx
<em className="italic text-[#FF6B1F]">
```

et remplacer par :

```tsx
<em className="italic text-foreground">
```

Cas particuliers :
- `app/page.tsx:38` — `<em className="italic text-[#FF6B1F]">univers</em>` → `<em className="italic text-foreground">univers</em>`
- `app/claim/page.tsx:576` — italic dynamique `{italicWord}`, même remplacement
- `app/lesson/[lessonId]/page.tsx:256` — même remplacement

- [ ] **Step 2 : Vérifier via grep qu'il ne reste plus d'italic orange dans les pages (en dehors de UpsellBanner)**

Run: `grep -rn 'italic text-\[#FF6B1F\]' app/` (ne doit rien retourner)

- [ ] **Step 3 : Commit**

```bash
git add app/
git commit -m "style(ds): neutralise italiques éditoriaux orange → foreground"
```

---

### Task 4 : Neutraliser les icônes et liens orange dans les pages

**Files:**
- Modify: `app/claim/page.tsx:175, 234, 361, 741`
- Modify: `app/dashboard/page.tsx:307`
- Modify: `app/admin/page.tsx:442`

- [ ] **Step 1 : Remplacer les icônes Loader/alertes orange par foreground**

- `app/claim/page.tsx:234` :
```tsx
<Loader2 className="animate-spin text-[#FF6B1F]" />
```
→
```tsx
<Loader2 className="animate-spin text-foreground" />
```

- `app/admin/page.tsx:442` : `className="mr-2 inline text-[#FF6B1F]"` → `className="mr-2 inline text-foreground"`

- [ ] **Step 2 : Remplacer les liens underline orange par foreground**

- `app/claim/page.tsx:175` : `className="text-[#FF6B1F] underline"` → `className="text-foreground underline"`
- `app/claim/page.tsx:361` : même remplacement
- `app/claim/page.tsx:741` : `text-[#FF6B1F] transition-opacity hover:opacity-80` → `text-foreground transition-opacity hover:opacity-80`
- `app/dashboard/page.tsx:307` : `className="text-[#FF6B1F] underline-offset-2 hover:underline"` → `className="text-foreground underline-offset-2 hover:underline"`

- [ ] **Step 3 : Vérifier qu'il n'y a plus d'icône/lien orange hors UpsellBanner et boutons d'action principale**

Run: `grep -rn 'text-\[#FF6B1F\]' app/`

Occurrences restantes autorisées : aucune. (Tous les italiques sont fix par Task 3, tous les liens/icônes par Task 4.)

- [ ] **Step 4 : Commit**

```bash
git add app/
git commit -m "style(ds): neutralise icônes et liens orange → foreground"
```

---

### Task 5 : Neutraliser les focus borders orange des inputs

**Files:**
- Modify: `app/dashboard/page.tsx:243`
- Modify: `app/dashboard/profile/page.tsx:179` (hover state)
- Modify: `app/admin/page.tsx:458, 466`
- Modify: `app/admin/content/page.tsx:201, 210, 218, 326, 337, 974`

- [ ] **Step 1 : Remplacer `focus:border-[#FF6B1F]` par `focus:border-foreground`**

Dans chaque fichier listé, rechercher :

```tsx
focus:border-[#FF6B1F]
```

et remplacer par :

```tsx
focus:border-foreground
```

- [ ] **Step 2 : Profile avatar hover**

`app/dashboard/profile/page.tsx:179` : `hover:border-[#FF6B1F]` → `hover:border-foreground`

- [ ] **Step 3 : Vérifier**

Run: `grep -rn 'focus:border-\[#FF6B1F\]\|hover:border-\[#FF6B1F\]' app/`
Expected: aucune occurrence restante.

- [ ] **Step 4 : Commit**

```bash
git add app/
git commit -m "style(ds): neutralise focus/hover borders orange → foreground"
```

---

### Task 6 : Neutraliser les tabs actifs et boutons secondaires orange dans admin

**Files:**
- Modify: `app/admin/page.tsx:302, 483`
- Modify: `app/admin/content/page.tsx:98, 1237`
- Modify: `app/admin/members/page.tsx:83`
- Modify: `app/lesson/[lessonId]/page.tsx:375, 385`

- [ ] **Step 1 : Remplacer les tabs actifs orange par sapin**

Dans les tabs admin avec pattern `border-b-2 border-[#FF6B1F] text-foreground`, remplacer par `border-b-2 border-foreground text-foreground`. Fichiers concernés :
- `app/admin/content/page.tsx:98`
- `app/admin/members/page.tsx:83`

- [ ] **Step 2 : Remplacer les boutons de sélection actifs orange**

Pattern `border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]` (boutons actifs dans modales admin), remplacer par `border-foreground bg-foreground text-background`. Fichiers :
- `app/admin/page.tsx:302, 483`
- `app/admin/content/page.tsx:1237`
- `app/lesson/[lessonId]/page.tsx:375`

- [ ] **Step 3 : Lesson page cartes "numéros" orange**

`app/lesson/[lessonId]/page.tsx:385` : les pastilles de numéro isActive orange → foreground.

```tsx
isActive ? "bg-[#0D0B08] text-[#FF6B1F]" : "bg-[#FF6B1F] text-[#0D0B08]"
```
→
```tsx
isActive ? "bg-[#0D0B08] text-background" : "bg-foreground text-background"
```

- [ ] **Step 4 : Vérifier**

Run: `grep -rn 'border-\[#FF6B1F\]\|bg-\[#FF6B1F\]' app/`

Occurrences restantes autorisées :
- `app/lesson/[lessonId]/page.tsx:205` — bouton primaire "Passer à la leçon suivante / Débloquer" (seul bouton d'action de la vue locked)
- Pas d'autre.

- [ ] **Step 5 : Commit**

```bash
git add app/
git commit -m "style(ds): tabs/boutons actifs admin passent orange → foreground"
```

---

### Task 7 : Retirer le dot vert et le logo pine

**Files:**
- Modify: `components/ds/topbar.tsx:53`
- Modify: `components/layout/logo.tsx:14`

- [ ] **Step 1 : Supprimer le span dot dans topbar**

`components/ds/topbar.tsx:53` :

```tsx
<span className="h-2 w-2 rounded-full ds-pulse" style={{ background: "var(--state-done)" }} aria-hidden />
```

→ supprimer complètement cette ligne.

- [ ] **Step 2 : Passer le "s" du logo en foreground**

`components/layout/logo.tsx:14` :

```tsx
<span className="text-pine">s</span>
```

→

```tsx
<span className="text-foreground">s</span>
```

- [ ] **Step 3 : Commit**

```bash
git add components/
git commit -m "style(ds): retire dot vert topbar et pine sur logo"
```

---

### Task 8 : Copie bienveillante sur hero pour nouveaux users

**Files:**
- Modify: `components/ds/hero.tsx:67-88`

- [ ] **Step 1 : Remplacer le rendu 0% par un message d'accueil**

Dans le bloc `{progress && (...)}`, ajouter un cas `progress.completed === 0` qui affiche un message positif au lieu de la barre à 0%.

Remplacer les lignes 67-89 par :

```tsx
{progress && (
  <div className="mt-10 border-t border-foreground/20 pt-5">
    {progress.completed === 0 ? (
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[2px] opacity-70" style={{ fontFamily: "var(--font-body-legacy)" }}>
        <span>◦ Prêt à commencer</span>
        <span>Module 01 en premier</span>
      </div>
    ) : (
      <>
        <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[2px] opacity-70" style={{ fontFamily: "var(--font-body-legacy)" }}>
          <span>◦ Progression</span>
          <span>
            <span className="font-bold" style={{ color: "var(--state-done)" }}>
              {progress.percent}%
            </span>
            <span className="mx-2 opacity-40">·</span>
            <span>{progress.completed}/{progress.total} leçons</span>
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="ds-progress-fill h-full rounded-full"
            style={{
              width: `${progress.percent}%`,
              background: "linear-gradient(90deg, var(--progress-grad-from), var(--progress-grad-to))",
            }}
          />
        </div>
      </>
    )}
  </div>
)}
```

- [ ] **Step 2 : Vérifier build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3 : Commit**

```bash
git add components/ds/hero.tsx
git commit -m "feat(ds): hero affiche 'Prêt à commencer' au lieu de 0% pour nouveaux users"
```

---

### Task 9 : Nettoyer fontFamily JetBrains Mono inline

**Files:**
- Rechercher tout `fontFamily: "var(--font-body)"` dans `app/` et `components/` et remplacer par suppression de la prop (fallback à body default = DM Sans).

- [ ] **Step 1 : Lister les occurrences**

Run: `grep -rn "var(--font-body)" app/ components/`

Chaque occurrence `style={{ fontFamily: "var(--font-body)" }}` doit être supprimée puisque `--font-body` était JetBrains Mono et que le body hérite déjà de DM Sans (`--font-body-legacy`).

- [ ] **Step 2 : Editer chaque fichier**

Pour chaque ligne matchée, retirer `style={{ fontFamily: "var(--font-body)" }}` (ou retirer uniquement la clé fontFamily si d'autres props sont présentes).

Exemple `components/ds/topbar.tsx:72` :

```tsx
className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-foreground/40"
style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
```

→

```tsx
className="flex-1 bg-transparent text-xs outline-none placeholder:text-foreground/40"
style={{ minHeight: 0 }}
```

(retirer aussi `font-mono` des classes Tailwind puisque `--font-mono` pointe maintenant vers DM Sans — mais puisque DM Sans est déjà le default du body, c'est redondant. Retirer `font-mono` quand présent sur la même ligne.)

- [ ] **Step 3 : Vérifier**

Run: `grep -rn "var(--font-body)" app/ components/`
Expected: plus aucune occurrence (ou uniquement `--font-body-legacy` qui est valide).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add app/ components/
git commit -m "chore(ds): retire fontFamily var(--font-body) inline (JetBrains Mono removed)"
```

---

### Task 10 : Supprimer les announcements de test en prod

**Files:**
- Modify: DB Convex `announcements` table

- [ ] **Step 1 : Lister les announcements**

Via le dashboard Convex ou via la page `/admin/content` onglet announcements, lister les entrées présentes.

Identifier les deux entrées de test :
- "test / regardez les vidéos"
- "NOUVEAU TEST / La formation arrive bientôt"

- [ ] **Step 2 : Supprimer via l'UI admin**

Se rendre sur `https://amourstudios.fr/admin/content` (onglet Announcements), supprimer les deux entrées via le bouton de suppression.

Alternative CLI (si l'UI ne permet pas) : via le Convex dashboard web, table `announcements`, supprimer manuellement.

- [ ] **Step 3 : Vérifier**

Recharger `/dashboard` — aucun bandeau announcement de test ne doit apparaître.

- [ ] **Step 4 : Pas de commit (DB uniquement)**

---

### Task 11 : Build final et déploiement

- [ ] **Step 1 : Build local**

Run: `npm run build`
Expected: OK, zéro warning sur les fonts ou les variables CSS manquantes.

- [ ] **Step 2 : Lancer le dev server et vérifier manuellement**

Run: `npm run dev`

Tester les vues suivantes :
- `/` (landing app) → italique "univers" en noir, bouton sapin
- `/dashboard` (VIP avec progression) → "Progression N%" normal
- `/dashboard` (VIP avec 0 leçon) → "Prêt à commencer · Module 01 en premier"
- `/dashboard` (free user) → UpsellBanner orange (seul élément orange), italique "attente" en noir, topbar sans dot vert
- `/lesson/<anyId>` → titres serif italique, bouton primaire orange OK
- `/admin` → onglets sans orange
- `/admin/content` → onglets neutres
- `/admin/members` → onglets neutres, badges "Payé" en sapin (déjà fait précédemment)

- [ ] **Step 3 : Deploy Vercel**

Run: `vercel --prod --yes`
Expected: READY.

---

## Self-review

**Spec coverage :**
- Règle "une couleur = un rôle" → Tasks 3, 4, 5, 6, 7 ✅
- Typo 2 familles → Tasks 1, 2, 9 ✅
- Bandeau preview mis en valeur → UpsellBanner garde son orange, tout le reste neutralisé autour (Tasks 3-7) ✅
- Hiérarchie dashboard → Task 8 (nouveau user) + UpsellBanner intouchée ✅
- Nettoyage announcements → Task 9 ✅
- M03 → explicitement hors scope (user a confirmé) ✅

**Placeholders :** aucun "TODO", "similar to", ou vague. Toutes les lignes ciblées ont un path:line et un patch concret.

**Cohérence typage :** pas de code applicatif neuf, uniquement présentation — pas de risque de mismatch API.
