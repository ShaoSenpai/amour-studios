# Design System Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser la fondation visuelle Bold Editorial × Premium High-Tech (tokens + composants) et refondre le dashboard comme écran de référence.

**Architecture:** Phase 1 non-destructive. On ajoute les nouveaux tokens CSS par-dessus les existants (coexistence), on crée des nouveaux composants dans `components/ds/`, on réécrit `app/dashboard/page.tsx`. Les autres écrans héritent automatiquement du refresh global (fonts/colors) sans refactor de layout.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Tailwind v4, React 19, TypeScript, Convex, `next/font` pour Google Fonts.

**Spec source:** `docs/superpowers/specs/2026-04-13-design-system-premium-editorial-design.md`

**Vérification :** aucune test suite n'existe dans ce projet. Chaque tâche se vérifie par `npm run build` + `npm run lint` (pas de nouvelle erreur) et test visuel manuel sur `npm run dev`.

---

## Map des fichiers touchés

**Créés :**
- `components/ds/pill.tsx`
- `components/ds/topbar.tsx`
- `components/ds/hero.tsx`
- `components/ds/stat-block.tsx`
- `components/ds/progress-strip.tsx`
- `components/ds/bento-grid.tsx`
- `components/ds/module-card.tsx`
- `components/ds/activity-card.tsx`

**Modifiés :**
- `app/layout.tsx` — charge JetBrains Mono et Instrument Serif via `next/font`
- `app/globals.css` — ajoute tokens (accent-00..05, success, motion vars, grille de fond), fait pointer `--font-body` vers mono
- `app/dashboard/layout.tsx` — remplace `<TopControls />` par `<Topbar />`
- `app/admin/layout.tsx` — remplace `<TopControls />` par `<Topbar />`
- `components/layout/header.tsx` — utilise `Topbar` en version compacte mobile
- `components/layout/top-controls.tsx` — **deprecated** (on peut le supprimer ou le laisser vide pour éviter de casser un import oublié)
- `app/dashboard/page.tsx` — réécrit avec Hero + ProgressStrip + BentoGrid + ActivityCard

---

## Task 1: Fonts — charger JetBrains Mono et Instrument Serif via next/font

**Files:**
- Modify: `app/layout.tsx:1-20`

**Contexte :** Actuellement `Anton` + `DM_Sans` sont chargés via `next/font`, et `Instrument Serif` via `<link>` CDN. Pour le nouveau design on veut **Instrument Serif (display/italic) + JetBrains Mono (body)**. `Anton` et `DM_Sans` peuvent rester chargés le temps de la transition (certains écrans non-refactorés pourraient encore y faire référence) — on les retirera en phase 2.

- [ ] **Step 1: Modifier `app/layout.tsx` pour ajouter Instrument_Serif et JetBrains_Mono via next/font**

Remplacer les lignes 1-20 :

```tsx
import type { Metadata } from "next";
import { Anton, DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body-legacy",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
```

- [ ] **Step 2: Mettre à jour le `className` du `<html>` pour inclure toutes les variables**

Remplacer ligne 37 `className={`${anton.variable} ${dmSans.variable} h-full`}` par :

```tsx
className={`${anton.variable} ${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full`}
```

- [ ] **Step 3: Supprimer le `<link>` CDN Instrument Serif et le `<style>` inline (lignes 42-46)**

Retirer ce bloc :

```tsx
<link
  href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
  rel="stylesheet"
/>
<style>{`:root { --font-serif: 'Instrument Serif', Georgia, serif; }`}</style>
```

`next/font` écrit désormais `--font-serif` automatiquement.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds, no font-related errors.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(ds): charge Instrument Serif + JetBrains Mono via next/font"
```

---

## Task 2: Tokens — ajouter les nouveaux tokens dans `globals.css`

**Files:**
- Modify: `app/globals.css:155-220` (bloc dark mode) et ajout en fin de fichier

**Contexte :** On ajoute les 6 couleurs d'accent module, le vert success `#00FF85`, les variables de motion, la grille de fond. On fait aussi pointer `--font-body` (via JetBrains Mono) et garde `--font-serif` pour Instrument Serif. Le mode light existant reste intact.

- [ ] **Step 1: Ajouter les accent-module tokens dans le bloc `:root` (light mode) après la ligne 89 (`--lagoon: #2B7A6F;`)**

Insérer ce bloc après ligne 89 :

```css
  /* Accents modules (phase 1 DS — indexés par module.order) */
  --accent-00: #F5B820; /* Or — Fondations */
  --accent-01: #FF6B1F; /* Orange — Création */
  --accent-02: #E63326; /* Rouge — Stratégie */
  --accent-03: #F2B8A2; /* Pêche — Communauté */
  --accent-04: #2B7A6F; /* Vert sapin — Monétisation */
  --accent-05: #0D4D35; /* Vert forêt — Expansion */

  /* Accent système */
  --ds-success: #00FF85;
  --ds-alert: #FF6B1F;

  /* Motion */
  --ease-reveal: cubic-bezier(.2, .9, .3, 1);
  --dur-fast: 300ms;
  --dur-med: 700ms;
  --dur-slow: 900ms;
  --dur-cascade: 70ms;

  /* Grid background (actif en dark mode) */
  --grid-line: rgba(13, 11, 8, 0.04);
```

- [ ] **Step 2: Dupliquer ces tokens dans le bloc `html[data-theme="dark"]` (ajouter après ligne 202 `--shadow-float: ...`)**

```css
  /* Accents modules — identiques en dark mode */
  --accent-00: #F5B820;
  --accent-01: #FF6B1F;
  --accent-02: #E63326;
  --accent-03: #F2B8A2;
  --accent-04: #2B7A6F;
  --accent-05: #0D4D35;

  --ds-success: #00FF85;
  --ds-alert: #FF6B1F;

  --grid-line: rgba(240, 233, 219, 0.03);
```

- [ ] **Step 3: Ajouter une utility `.ds-grid-bg` en fin de fichier (avant la dernière accolade fermante `}` ligne 722)**

Insérer juste avant la dernière `}` :

```css
  /* Grid background for premium high-tech surfaces */
  .ds-grid-bg {
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: 24px 24px;
  }

  /* Cascade reveal keyframes (réutilisé par les composants DS) */
  @keyframes ds-fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .ds-reveal {
    animation: ds-fade-up var(--dur-slow) var(--ease-reveal) both;
  }
  .ds-cascade > * {
    animation: ds-fade-up var(--dur-slow) var(--ease-reveal) both;
  }
  .ds-cascade > *:nth-child(1) { animation-delay: 0ms; }
  .ds-cascade > *:nth-child(2) { animation-delay: 70ms; }
  .ds-cascade > *:nth-child(3) { animation-delay: 140ms; }
  .ds-cascade > *:nth-child(4) { animation-delay: 210ms; }
  .ds-cascade > *:nth-child(5) { animation-delay: 280ms; }
  .ds-cascade > *:nth-child(6) { animation-delay: 350ms; }
  .ds-cascade > *:nth-child(7) { animation-delay: 420ms; }
  .ds-cascade > *:nth-child(8) { animation-delay: 490ms; }
```

- [ ] **Step 4: Verify build + visuel**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev` et ouvre n'importe quelle page → vérifie que rien n'est cassé (les pages existantes utilisent encore les tokens historiques, les nouveaux tokens sont additifs).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(ds): ajoute tokens accent modules, motion, grille de fond"
```

---

## Task 3: Composant `Pill`

**Files:**
- Create: `components/ds/pill.tsx`

**Contexte :** Badge de statut uniformisé (`VIP ACTIF`, `EN COURS`, `COMPLÉTÉ`, `LOCKED`, `EN ATTENTE`). Variants de couleur.

- [ ] **Step 1: Créer `components/ds/pill.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type PillVariant = "success" | "alert" | "neutral" | "locked";

export function Pill({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: PillVariant;
  className?: string;
}) {
  const variants: Record<PillVariant, string> = {
    success:
      "bg-[rgba(0,255,133,0.12)] text-[#00FF85] border-[rgba(0,255,133,0.35)]",
    alert:
      "bg-[rgba(255,107,31,0.12)] text-[#FF6B1F] border-[rgba(255,107,31,0.35)]",
    neutral:
      "bg-foreground/[0.06] text-foreground/80 border-foreground/15",
    locked:
      "bg-transparent text-foreground/40 border-foreground/15 border-dashed",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-[2px] font-mono text-[10px] uppercase tracking-[2px]",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ds/pill.tsx
git commit -m "feat(ds): composant Pill (status badges)"
```

---

## Task 4: Composant `Topbar`

**Files:**
- Create: `components/ds/topbar.tsx`

**Contexte :** Barre horizontale `Logo serif | Search ⌘K | VIP pill + NIV + avatar`. Remplace `TopControls` sur desktop, présente aussi en mobile (version compacte).

- [ ] **Step 1: Créer `components/ds/topbar.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pill } from "./pill";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Search } from "lucide-react";

export function Topbar() {
  const user = useQuery(api.users.current);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!user) return null;

  const xp = user.xp ?? 0;
  const level = Math.floor(xp / 500) + 1;
  const isVip = !!user.purchaseId;

  return (
    <div className="sticky top-0 z-30 border-b border-foreground/15 bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 md:px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-serif text-xl italic text-foreground"
        >
          <span className="h-2 w-2 rounded-full bg-[#00FF85] ds-pulse" aria-hidden />
          <span className="hidden sm:inline">Amour Studios</span>
          <span className="sm:hidden">A.</span>
        </Link>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) router.push(`/dashboard?q=${encodeURIComponent(query.trim())}`);
          }}
          className="flex items-center gap-2 border border-foreground/15 bg-foreground/[0.03] px-3 py-2"
        >
          <Search size={14} className="text-foreground/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une leçon, une note…"
            className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-foreground/40"
          />
          <kbd className="hidden sm:inline border border-foreground/20 px-[5px] py-[1px] font-mono text-[9px] tracking-wider text-foreground/60">
            ⌘K
          </kbd>
        </form>

        <div className="flex items-center gap-2 md:gap-3">
          <Pill variant={isVip ? "success" : "alert"} className="hidden sm:inline-flex">
            ● {isVip ? "VIP ACTIF" : "EN ATTENTE"}
          </Pill>
          <span className="hidden font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/60 md:inline">
            NIV.{String(level).padStart(2, "0")} · {xp.toLocaleString("fr-FR")} XP
          </span>
          <NotificationBell />
          <ThemeToggle />
          <Link
            href="/dashboard/profile"
            className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-[#FF6B1F] font-serif text-sm italic text-[#0D0B08]"
            aria-label="Profil"
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-full object-cover" />
            ) : (
              (user.name ?? "?")[0]?.toUpperCase()
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ajouter l'animation `ds-pulse` dans `globals.css`**

Ajouter juste après le bloc `@keyframes ds-fade-up` ajouté en Task 2 :

```css
  @keyframes ds-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .ds-pulse { animation: ds-pulse 1400ms ease-in-out infinite; }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ds/topbar.tsx app/globals.css
git commit -m "feat(ds): composant Topbar (unifie TopControls + Header)"
```

---

## Task 5: Brancher `Topbar` dans les layouts dashboard et admin

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `components/layout/header.tsx`

**Contexte :** `Topbar` remplace `TopControls`. Sur mobile, le `Header` actuel n'a plus besoin d'afficher NotificationBell/ThemeToggle (déjà dans Topbar qui est responsive). On simplifie le Header pour n'afficher le logo que si nécessaire — ou on le supprime puisque Topbar gère déjà le logo.

- [ ] **Step 1: Lire `app/dashboard/layout.tsx` pour repérer l'import et le render de `TopControls`**

Run: `cat app/dashboard/layout.tsx`

- [ ] **Step 2: Remplacer `TopControls` par `Topbar` dans `app/dashboard/layout.tsx`**

Remplacer :

```tsx
import { TopControls } from "@/components/layout/top-controls";
```

par :

```tsx
import { Topbar } from "@/components/ds/topbar";
```

Puis remplacer `<TopControls />` par `<Topbar />`.

- [ ] **Step 3: Même remplacement dans `app/admin/layout.tsx`**

Mêmes 2 remplacements (import + balise).

- [ ] **Step 4: Simplifier `components/layout/header.tsx`**

Écraser complètement le fichier avec :

```tsx
"use client";

// Le Header mobile historique est remplacé par Topbar (déjà responsive).
// Ce composant reste exporté pour éviter de casser les imports dans
// app/lesson/[lessonId]/page.tsx qui le consomme. Il rend null : Topbar
// gère désormais la barre du haut sur tous les viewports.
export function Header() {
  return null;
}
```

**Note :** `app/lesson/[lessonId]/page.tsx` importe `Header`. En phase 1 on ne retravaille pas la page leçon, donc on garde l'import fonctionnel (retourne `null`). Le `Sidebar` desktop s'affiche toujours. La page leçon aura sa propre `Topbar` quand on la retravaillera en phase 2.

Pour que la page leçon ait quand même accès à la Topbar visuellement en phase 1, ajouter l'import dans la page leçon à l'étape suivante.

- [ ] **Step 5: Ajouter `<Topbar />` dans `app/lesson/[lessonId]/page.tsx` au niveau où `<Header />` était**

Dans `app/lesson/[lessonId]/page.tsx`, remplacer :

```tsx
import { Header } from "@/components/layout/header";
```

par :

```tsx
import { Topbar } from "@/components/ds/topbar";
```

Puis remplacer chaque occurrence `<Header />` par `<Topbar />` (3 occurrences : ligne ~78, ligne ~95, et la version principale).

- [ ] **Step 6: Verify build + test visuel**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`, ouvre `/dashboard` → vérifie que la Topbar s'affiche en haut (logo + search + VIP pill + avatar). Pareil sur `/dashboard/profile` et `/admin/content`.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/layout.tsx app/admin/layout.tsx components/layout/header.tsx app/lesson/[lessonId]/page.tsx
git commit -m "feat(ds): branche Topbar dans dashboard/admin/lesson layouts"
```

---

## Task 6: Composant `StatBlock`

**Files:**
- Create: `components/ds/stat-block.tsx`

- [ ] **Step 1: Créer `components/ds/stat-block.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function StatBlock({
  label,
  value,
  unit,
  sub,
  accent = "#00FF85",
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-foreground/15 bg-foreground/[0.04] p-5 transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:bg-foreground/[0.08]",
        className
      )}
      style={
        {
          // CSS var for hover border color
          "--stat-accent": accent,
        } as React.CSSProperties
      }
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
      }}
    >
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[2.5px] text-foreground/50">
        ◦ {label}
      </div>
      <div
        className="font-serif text-4xl italic leading-none"
        style={{ color: accent }}
      >
        {value}
        {unit && <span className="ml-1 text-xl opacity-60">{unit}</span>}
      </div>
      {sub && <div className="mt-1 font-mono text-[10px] text-foreground/50">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ds/stat-block.tsx
git commit -m "feat(ds): composant StatBlock (stats colorées)"
```

---

## Task 7: Composant `Hero`

**Files:**
- Create: `components/ds/hero.tsx`

- [ ] **Step 1: Créer `components/ds/hero.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Hero({
  caption,
  title,
  italicWord,
  ctaLabel,
  ctaHref,
  aside,
  className,
}: {
  caption: string;
  title: string;
  italicWord?: string;
  ctaLabel?: string;
  ctaHref?: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  // Split title around italicWord so we can style the italic span inline
  let titleRender: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleRender = (
      <>
        {before}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {after}
      </>
    );
  }

  return (
    <section
      className={cn(
        "ds-reveal grid gap-4 md:grid-cols-[2fr_1fr]",
        className
      )}
    >
      <div className="relative overflow-hidden bg-[#F0E9DB] p-8 text-[#0D0B08] md:p-10">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[3px] opacity-55">
          — {caption}
        </div>
        <h1 className="mb-6 font-serif text-[clamp(42px,5.5vw,72px)] font-normal leading-[0.95] tracking-[-2px]">
          {titleRender}
        </h1>
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="group inline-flex items-center gap-2.5 bg-[#0D0B08] px-5 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#F0E9DB] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:pr-7"
          >
            {ctaLabel}
            <span className="font-serif text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1">
              →
            </span>
          </Link>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-6 -right-6 font-serif text-[260px] italic leading-[0.7] opacity-[0.06]"
        >
          ·
        </span>
      </div>
      {aside && <div className="flex flex-col gap-4">{aside}</div>}
    </section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ds/hero.tsx
git commit -m "feat(ds): composant Hero (split beige + CTA serif)"
```

---

## Task 8: Composant `ProgressStrip`

**Files:**
- Create: `components/ds/progress-strip.tsx`

- [ ] **Step 1: Créer `components/ds/progress-strip.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function ProgressStrip({
  label = "ROUTE COMPLÈTE",
  percent,
  fraction,
  className,
}: {
  label?: string;
  percent: number;
  fraction?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto_auto] items-center gap-5 border border-foreground/15 bg-foreground/[0.04] px-5 py-4",
        className
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60">
        ◦ {label}
      </span>
      <div className="relative h-[3px] bg-foreground/10">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
          style={{
            width: `${clamped}%`,
            background: "linear-gradient(90deg, #00FF85, #FF6B1F)",
          }}
        />
      </div>
      <span className="font-serif text-xl italic text-[#00FF85]">{clamped}%</span>
      {fraction && (
        <span className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60">
          {fraction}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ds/progress-strip.tsx
git commit -m "feat(ds): composant ProgressStrip (progression globale)"
```

---

## Task 9: Composants `BentoGrid` + `ModuleCard`

**Files:**
- Create: `components/ds/bento-grid.tsx`
- Create: `components/ds/module-card.tsx`

- [ ] **Step 1: Créer `components/ds/bento-grid.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Grille responsive 6 colonnes (desktop) / 4 (tablet) / 2 (mobile).
 * Les enfants déclarent leur span via la classe `data-span="2|3|4|6"`.
 */
export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ds-cascade grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Créer `components/ds/module-card.tsx`**

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Pill } from "./pill";
import { cn } from "@/lib/utils";

export type ModuleCardState = "completed" | "in-progress" | "upcoming" | "locked";

const ACCENT_BY_ORDER = [
  "#F5B820", // 00 Or
  "#FF6B1F", // 01 Orange
  "#E63326", // 02 Rouge
  "#F2B8A2", // 03 Pêche
  "#2B7A6F", // 04 Vert sapin
  "#0D4D35", // 05 Vert forêt
];

export function ModuleCard({
  href,
  order,
  title,
  italicWord,
  description,
  badgeLabel,
  state,
  completed = 0,
  total = 0,
  span = 2,
}: {
  href: string;
  order: number;
  title: string;
  italicWord?: string;
  description?: string;
  badgeLabel: string;
  state: ModuleCardState;
  completed?: number;
  total?: number;
  span?: 2 | 3 | 4 | 6;
}) {
  const accent = ACCENT_BY_ORDER[order % ACCENT_BY_ORDER.length];
  const isLocked = state === "locked";
  const spanClass = {
    2: "col-span-2",
    3: "col-span-2 md:col-span-3",
    4: "col-span-2 md:col-span-4",
    6: "col-span-2 md:col-span-4 lg:col-span-6",
  }[span];

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleNode = (
      <>
        {before}
        <em className="italic">{italicWord}</em>
        {after}
      </>
    );
  }

  const body = (
    <>
      <div className="font-serif text-xl italic opacity-80">
        {String(order + 1).padStart(2, "0")}
      </div>
      <h3 className="font-serif text-2xl font-normal leading-[1.05] md:text-3xl">
        {titleNode}
      </h3>
      {description && (
        <p className="mt-3 max-w-[240px] font-mono text-[11px] opacity-75">
          {description}
        </p>
      )}
      <div className="mt-auto flex items-center gap-2 pt-4 font-mono text-[9px] uppercase tracking-[1.5px]">
        <Pill variant={isLocked ? "locked" : "neutral"}>
          {state === "completed" && "✓ COMPLÉTÉ"}
          {state === "in-progress" && "EN COURS"}
          {state === "upcoming" && "À VENIR"}
          {state === "locked" && "◉ LOCKED"}
        </Pill>
        {total > 0 && state !== "locked" && (
          <>
            <span>
              {String(completed).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
            {state === "in-progress" && (
              <>
                <div className="relative ml-1 h-[2px] flex-1 bg-current/20">
                  <div
                    className="absolute inset-y-0 left-0 bg-current transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span>{percent}%</span>
              </>
            )}
          </>
        )}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 right-5 font-serif text-[40px] italic opacity-50 transition-all duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1.5 group-hover:opacity-100"
      >
        →
      </span>
    </>
  );

  const baseClasses = cn(
    "group relative flex min-h-[200px] flex-col overflow-hidden p-6 transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] hover:-translate-y-1",
    spanClass
  );

  if (isLocked) {
    return (
      <div
        className={cn(
          baseClasses,
          "cursor-not-allowed border border-dashed border-foreground/15 bg-foreground/[0.04] text-foreground/40"
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={baseClasses}
      style={{ background: accent, color: "#0D0B08" }}
    >
      {body}
    </Link>
  );
}
```

Note : `badgeLabel` est reçu en prop mais pas rendu directement (les pills affichent l'état, pas le thème du module — le thème transparaît par la couleur). On garde la prop pour évolutions futures.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/ds/bento-grid.tsx components/ds/module-card.tsx
git commit -m "feat(ds): BentoGrid + ModuleCard (tuiles modules colorées)"
```

---

## Task 10: Composant `ActivityCard`

**Files:**
- Create: `components/ds/activity-card.tsx`

- [ ] **Step 1: Créer `components/ds/activity-card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function ActivityCard({
  label,
  title,
  italicWord,
  body,
  live = false,
  className,
}: {
  label: string;
  title: string;
  italicWord?: string;
  body: string;
  live?: boolean;
  className?: string;
}) {
  let titleNode: React.ReactNode = title;
  if (italicWord && title.includes(italicWord)) {
    const [before, after] = title.split(italicWord);
    titleNode = (
      <>
        {before}
        <em className="italic text-[#FF6B1F]">{italicWord}</em>
        {after}
      </>
    );
  }

  return (
    <div
      className={cn(
        "relative border border-foreground/15 bg-foreground/[0.04] p-5",
        className
      )}
    >
      {live && (
        <span
          aria-label="Live"
          className="absolute right-5 top-5 h-1.5 w-1.5 rounded-full bg-[#00FF85] ds-pulse"
        />
      )}
      <div className="mb-3 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50">
        ◦ {label}
      </div>
      <h4 className="mb-2 font-serif text-xl font-normal leading-tight">
        {titleNode}
      </h4>
      <p className="font-mono text-[11px] leading-relaxed text-foreground/65">
        {body}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/ds/activity-card.tsx
git commit -m "feat(ds): composant ActivityCard (strip notifications/badges)"
```

---

## Task 11: Réécrire `app/dashboard/page.tsx`

**Files:**
- Modify: `app/dashboard/page.tsx` (réécriture complète de la vue principale après les gates)

**Contexte :** On garde strictement les gates (purchase gate ligne 47, onboarding gate ligne 67) et la logique Convex (queries/mutations). On réécrit uniquement le bloc JSX après la ligne 79 (`return (…)` principal) avec les nouveaux composants. On retire le logout du bas (il reste dans la sidebar et dans le profil).

- [ ] **Step 1: Lire la version courante pour repérer les bornes exactes**

Run: `head -80 app/dashboard/page.tsx` puis `sed -n '79,125p' app/dashboard/page.tsx`

- [ ] **Step 2: Écraser le fichier avec la nouvelle version**

Remplacer intégralement `app/dashboard/page.tsx` par :

```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Hero } from "@/components/ds/hero";
import { StatBlock } from "@/components/ds/stat-block";
import { ProgressStrip } from "@/components/ds/progress-strip";
import { BentoGrid } from "@/components/ds/bento-grid";
import { ModuleCard, type ModuleCardState } from "@/components/ds/module-card";
import { ActivityCard } from "@/components/ds/activity-card";

export default function DashboardPage() {
  const user = useQuery(api.users.current);
  const purchase = useQuery(api.purchases.current);
  const modules = useQuery(api.modules.list);
  const progress = useQuery(api.progress.myProgress);
  const globalProgress = useQuery(api.progress.globalProgress);
  const badges = useQuery(api.badges.myBadges);
  const { signOut } = useAuthActions();
  const updateStreak = useMutation(api.streaks.updateStreak);

  useEffect(() => {
    if (user) updateStreak().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  if (
    user === undefined || purchase === undefined || modules === undefined ||
    progress === undefined || globalProgress === undefined || badges === undefined
  ) {
    return (
      <main className="ds-grid-bg px-6 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="skeleton mb-4 h-40 w-full rounded-none" />
          <div className="skeleton mb-6 h-16 w-full rounded-none" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-40 rounded-none md:col-span-2" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (user === null) return null;
  const isAdmin = user.role === "admin";

  // Gate 1 — no purchase
  if (!purchase && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>Accès en <span className="font-serif italic text-primary">attente</span></h1>
          <p className="text-sm text-muted-foreground">
            Ton compte est connecté, mais aucun achat n&apos;est lié à <span className="font-medium text-foreground">{user.email}</span>.
          </p>
          <a href="https://www.amourstudios.fr/paiement" target="_blank" rel="noopener noreferrer"
            className="inline-flex h-12 w-full max-w-xs items-center justify-center bg-primary text-primary-foreground font-medium">
            Acheter la formation — 497 €
          </a>
          <p className="text-xs text-muted-foreground">Déjà payé ? <a href="mailto:contact@amourstudios.fr" className="text-primary hover:underline">contact@amourstudios.fr</a></p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>Se déconnecter</Button>
        </div>
      </main>
    );
  }

  // Gate 2 — no onboarding
  if (!user.onboardingCompletedAt && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>Onboarding <span className="font-serif italic text-primary">en cours</span></h1>
          <p className="text-sm text-muted-foreground">Paiement confirmé ! Appel d&apos;onboarding nécessaire.</p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>Se déconnecter</Button>
        </div>
      </main>
    );
  }

  // Main view — DS refresh
  const firstName = user.name?.split(" ")[0] ?? "artiste";
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dateLabel = today.charAt(0).toUpperCase() + today.slice(1);

  // Find the "in-progress" module to route the CTA
  const resumeHref = useResumeHref(modules, progress);

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">

        <Hero
          caption={`Salut ${firstName} · ${dateLabel}`}
          title="Ton univers se construit."
          italicWord="univers"
          ctaLabel={resumeHref ? "Reprendre la formation" : "Explorer les modules"}
          ctaHref={resumeHref ?? "#modules"}
          aside={
            <>
              <StatBlock
                label="PROGRESSION"
                value={globalProgress.percent}
                unit="%"
                sub={`${globalProgress.completed} / ${globalProgress.total} leçons`}
                accent="#00FF85"
              />
              <StatBlock
                label="STREAK"
                value={user.streakDays ?? 0}
                unit="j"
                sub="Garde le rythme"
                accent="#FF6B1F"
              />
            </>
          }
          className="mb-4"
        />

        <ProgressStrip
          percent={globalProgress.percent}
          fraction={`${globalProgress.completed}/${globalProgress.total}`}
          className="mb-8"
        />

        <section id="modules" className="mb-10">
          <div className="mb-6 flex items-baseline justify-between border-b border-foreground/15 pb-4">
            <h2 className="font-serif text-3xl italic">Modules</h2>
            <div className="hidden gap-4 font-mono text-[10px] uppercase tracking-[2px] md:flex">
              <span className="border-b border-[#00FF85] pb-1">◦ Tous</span>
              <span className="opacity-40">◦ En cours</span>
              <span className="opacity-40">◦ Complétés</span>
              <span className="opacity-40">◦ À venir</span>
            </div>
          </div>

          <ModulesBento modules={modules} progress={progress} isAdmin={isAdmin} />
        </section>

        <section className="mb-10 grid gap-3 md:grid-cols-3">
          <ActivityCard
            label={`NOUVEAU · ${modules.length} MODULES`}
            title="Nouvelle leçon publiée"
            italicWord="publiée"
            body={`Module ${modules[0]?.title ?? "—"} — check les dernières leçons ajoutées.`}
            live
          />
          <ActivityCard
            label={badges.length > 0 ? `BADGE · ${badges.length} DÉBLOQUÉS` : "BADGE · À GAGNER"}
            title={badges.length > 0 ? `${badges[badges.length - 1].label} débloqué` : "Ton premier badge t'attend"}
            italicWord={badges.length > 0 ? "débloqué" : "attend"}
            body={badges.length > 0 ? "Continue pour en débloquer d'autres — chaque module = 1 badge." : "Complète toutes les leçons d'un module pour gagner son badge."}
          />
          <ActivityCard
            label="COMMUNAUTÉ"
            title="Rejoins la conversation"
            italicWord="conversation"
            body={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ? "Les autres artistes sont sur Discord — #entraide & #nouveautés." : "Discord arrive bientôt."}
          />
        </section>

      </div>
    </main>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function useResumeHref(
  modules: { _id: Id<"modules">; title: string; order: number }[],
  progress: Record<string, { lessonCompletedAt?: number }>
) {
  // Pas de query dépendante ici — on retourne juste le premier module non complété.
  return useMemo(() => {
    if (!modules || modules.length === 0) return null;
    return `/dashboard#module-${modules[0]._id}`;
    // Note : pour un vrai "resume exact lesson" il faudrait fetcher les lessons
    // de tous les modules. En phase 1 on route vers les modules, le user choisit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules?.[0]?._id]);
}

function ModulesBento({
  modules,
  progress,
  isAdmin,
}: {
  modules: { _id: Id<"modules">; title: string; description: string; order: number; badgeLabel: string }[];
  progress: Record<string, { lessonCompletedAt?: number }>;
  isAdmin: boolean;
}) {
  return (
    <BentoGrid>
      {modules.map((mod, idx) => (
        <ModuleCardBound
          key={mod._id}
          mod={mod}
          progress={progress}
          idx={idx}
          isAdmin={isAdmin}
          modules={modules}
        />
      ))}
    </BentoGrid>
  );
}

function ModuleCardBound({
  mod,
  progress,
  idx,
  isAdmin,
  modules,
}: {
  mod: { _id: Id<"modules">; title: string; description: string; order: number; badgeLabel: string };
  progress: Record<string, { lessonCompletedAt?: number }>;
  idx: number;
  isAdmin: boolean;
  modules: { _id: Id<"modules"> }[];
}) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId: mod._id });
  const prevLessons = useQuery(
    api.lessons.listByModule,
    idx > 0 ? { moduleId: modules[idx - 1]._id } : "skip"
  );

  if (lessons === undefined) {
    return <div className="skeleton h-[200px] rounded-none md:col-span-2" />;
  }

  const completed = lessons.filter((l) => progress[l._id]?.lessonCompletedAt).length;
  const total = lessons.length;

  // Compute state
  let state: ModuleCardState;
  if (total > 0 && completed === total) state = "completed";
  else if (completed > 0) state = "in-progress";
  else {
    // Locked if previous module not fully completed (and not admin)
    const prevUnlocked =
      idx === 0 ||
      isAdmin ||
      (prevLessons && prevLessons.every((l) => progress[l._id]?.lessonCompletedAt));
    state = prevUnlocked ? "upcoming" : "locked";
  }

  // First in-progress module gets wider span
  const span: 2 | 4 = state === "in-progress" ? 4 : 2;

  // Extract italic word (last word of title)
  const words = mod.title.split(" ");
  const italicWord = words.length > 1 ? words[words.length - 1] : undefined;

  return (
    <ModuleCard
      href={`/lesson/${lessons[0]?._id ?? ""}`}
      order={mod.order}
      title={mod.title}
      italicWord={italicWord}
      description={mod.description}
      badgeLabel={mod.badgeLabel}
      state={state}
      completed={completed}
      total={total}
      span={span}
    />
  );
}
```

- [ ] **Step 3: Vérifier que l'import `Id` de dataModel est toujours utile**

L'import `Id` est utilisé dans les types internes (`ModulesBento`, `ModuleCardBound`). OK.

- [ ] **Step 4: Verify build + lint**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run lint 2>&1 | grep "app/dashboard/page.tsx"`
Expected: aucune nouvelle erreur sur cette page. Les erreurs éventuelles sur d'autres fichiers (exercices, etc.) sont pré-existantes et hors scope.

- [ ] **Step 5: Test visuel**

Run: `npm run dev` puis ouvrir `http://localhost:3000/dashboard` en étant loggué.

Checklist :
- [ ] Topbar sticky en haut avec logo, search, pill VIP/NIV, avatar orange
- [ ] Hero split — titre `Ton univers se construit.` avec `univers` en orange italique, CTA noir
- [ ] 2 StatBlocks (Progression vert, Streak orange) à droite
- [ ] ProgressStrip pleine largeur avec dégradé vert→orange
- [ ] Section "Modules" avec tabs (Tous actif, les autres faded)
- [ ] BentoGrid avec modules colorés (le module "en cours" occupe 4 colonnes, les autres 2)
- [ ] 3 ActivityCards en bas (Nouveau / Badge / Communauté)
- [ ] Au hover sur un module → translate vers le haut + flèche qui glisse
- [ ] Cascade d'entrée visible au chargement

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(ds): réécrit dashboard avec Hero + Bento + ActivityStrip"
```

---

## Task 12: `app/globals.css` — déplacer `--font-body` pour pointer vers JetBrains Mono

**Files:**
- Modify: `app/globals.css:15-18`

**Contexte :** Actuellement `--font-sans` et `--font-mono` pointent tous les deux vers `var(--font-body)` (qui est DM_Sans). Maintenant que `--font-body` est JetBrains Mono (Task 1), tout le site va passer en mono. C'est voulu pour la phase 1. Pour éviter les régressions dans des endroits où on ne veut pas de mono, on introduit `--font-sans-legacy` et on laisse `--font-sans` pointer dessus.

- [ ] **Step 1: Modifier le mapping Tailwind**

Remplacer lignes 15-18 :

```css
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
  --font-mono: var(--font-body);
  --font-heading: var(--font-display);
```

par :

```css
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body-legacy);
  --font-mono: var(--font-body);
  --font-heading: var(--font-display);
```

**Note :** `--font-body-legacy` est la variable créée en Task 1 Step 1 pour DM_Sans. Tout ce qui utilise `font-sans` (Tailwind) reste sur DM_Sans, ce qui évite les régressions. Nos nouveaux composants DS utilisent explicitement `font-mono` (qui pointe maintenant sur JetBrains Mono) ou `font-serif` (Instrument Serif via `var(--font-serif)`).

- [ ] **Step 2: Modifier la règle `body` ligne 257 pour garder DM_Sans comme default**

Ligne 257, remplacer :

```css
    font-family: var(--font-body);
```

par :

```css
    font-family: var(--font-body-legacy);
```

Cela préserve DM_Sans comme font par défaut de l'app. Les composants DS qui veulent du mono appliquent `font-mono` via Tailwind.

- [ ] **Step 3: Verify build + test visuel**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`, ouvrir `/dashboard/profile` et `/lesson/<id>` → pas de régression typographique (tout reste en DM_Sans sauf dans les composants DS qui ont explicitement `font-mono`).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(ds): sépare font-sans (DM_Sans legacy) de font-mono (JetBrains)"
```

---

## Task 13: Verification finale + déploiement

**Files:**
- Aucun modifié ici, c'est la passe de validation.

- [ ] **Step 1: Lint complet**

Run: `npm run lint 2>&1 | tail -20`
Expected: aucune NOUVELLE erreur par rapport aux erreurs pré-existantes (sidebar-provider, theme-toggle, exercises/*, lessons module var). Les composants DS ne doivent introduire aucune erreur.

- [ ] **Step 2: Build complet**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual QA checklist**

Démarrer `npm run dev` + `npx convex dev` et tester :

Desktop (1440px) :
- [ ] `/dashboard` — Topbar + Hero + Stats + Progress + Bento modules colorés + Activity strip
- [ ] Cascade d'entrée visible
- [ ] Hover modules → transform + flèche
- [ ] ⌘K focuse la search de la Topbar
- [ ] `/dashboard/profile` — pas cassé, garde son layout actuel mais hérite des nouvelles couleurs/fonts si config tailwind remonte
- [ ] `/lesson/<id>` — Topbar visible, le reste du layout leçon intact
- [ ] `/admin/content` — Topbar visible, layout admin intact

Mobile (iPhone SE devtools) :
- [ ] Topbar condensée (logo, search, avatar)
- [ ] Hero stacke (stats passent sous le hero-main)
- [ ] Bento passe en 2 colonnes
- [ ] Activity passe en 1 colonne

- [ ] **Step 4: Commit final (si quelque chose a dû être ajusté au QA)**

Si pas de fix : pas de commit supplémentaire.
Sinon :

```bash
git add <fichiers ajustés>
git commit -m "fix(ds): ajustements suite au QA phase 1"
```

- [ ] **Step 5: Déployer en prod (sur demande du user)**

Deux commandes à faire tourner en séquence :

```bash
vercel --prod --yes
npx convex deploy --yes
```

Attendre le "Deployment ready" + "Deployed Convex functions".

---

## Notes post-implémentation

À faire en phase 2 (specs séparés, dans l'ordre recommandé) :

1. **Page leçon** — refactor avec Topbar intégrée, video container modernisé, sidebar right avec ModuleProgressCompact, commentaires threaded plus dense.
2. **Profil** — refondu avec avatar DS, stats en bento StatBlock, grid de badges, paramètres Discord plus riches.
3. **Login + Landing `/`** — grande hero editorial, CTA ambitieux.
4. **Admin** — dashboard ops avec ProgressStrip des metrics clés, BentoGrid des modules éditables.

Chaque phase 2 réutilise 100% des composants `components/ds/` créés ici — la fondation est stable.
