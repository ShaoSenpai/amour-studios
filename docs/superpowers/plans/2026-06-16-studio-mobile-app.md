# Back-office /studio — Refonte « vraie app téléphone » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer le back-office `/studio` de « responsive (ça casse pas) » à « vraie app téléphone » : épuré, lisible, gros touch targets (≥44px), zéro crop/débordement, navigation native (bottom tab bar), overlays en bottom-sheets. Toutes les fonctionnalités conservées.

**Architecture:** On garde le moteur existant (`useIsMobile()` max-width:900px, inline styles « Glass C », pattern `isMobile ? mobile : desktop`). On AJOUTE un petit système de design mobile (constantes d'espacement/touch/typo/safe-area dans `glass.tsx`), deux primitives neuves (`BottomTabBar`, `MobileSheet`), et on retravaille chaque écran pour un feel natif (listes au lieu de grilles à scroll horizontal, onglets sur la fiche élève dense, dialogs en bottom-sheets). Desktop (>900px) strictement inchangé partout.

**Tech Stack:** Next.js 16 (App Router), React, inline styles + tokens `glass.tsx`, Framer Motion (déjà là), createPortal (déjà utilisé).

---

## Décisions de design (à valider avant exécution)

1. **Navigation mobile → bottom tab bar** (remplace le drawer burger). 5 onglets en bas : **Aujourd'hui · Élèves · Calendrier · Paiements · Plus**. « Plus » ouvre un bottom-sheet listant Tickets / Lier / Campagnes / Transcripts + thème + déconnexion. Top-bar conservée (titre de section). Desktop = sidebar inchangée.
2. **Fiche élève → onglets** (segmented control) sur mobile : **Infos · RDV · Parcours · Activité** — au lieu d'un scroll infini. Desktop = disposition actuelle inchangée.
3. **Calendrier → vue Jour uniquement sur mobile** + **agenda** (liste des prochains RDV sous la grille). Les vues Semaine/Mois (grille 7 colonnes à scroll horizontal = anti-app) sont masquées sur mobile. Desktop = 3 vues inchangées.
4. **Tous les dialogs → bottom-sheets sur mobile** (plein largeur, collés en bas, header/footer sticky, champs en 1 colonne) : RDV dialog, confirmations campagnes, modal SAV paiement.
5. **Selects custom (FilterSelect/StatusSelect)** : menu recadré dans l'écran (ne sort plus à droite) + scroll interne. (On garde le style, on ne passe pas au `<select>` natif.)
6. **Système mobile** : touch targets ≥ 44px, corps de texte ≥ 15px, plus de police < 11px, padding/gap via une échelle, safe-area iOS (notch + home indicator). Plus de grilles à scroll horizontal : on passe en listes/cartes empilées.

Si une de ces décisions ne te convient pas, dis-le avant l'exécution et je révise le plan.

---

## Conventions (à lire avant toute tâche)

### Verification (pas de tests composants dans ce repo)
Chaque tâche : `cd SKOOL/amour-studios && npx tsc --noEmit` (0 erreur). La QA visuelle 375px est centralisée (Task 13) + relecture du diff. Le `npm run build` final garde le filet anti-régression SSR.

### Règles projet (non négociables)
- Inline styles + tokens `glass.tsx` uniquement (pas de Tailwind sur /studio).
- **Desktop strictement inchangé** : toute branche `isMobile ? mobile : <desktop>` conserve la valeur desktop d'origine EXACTE. Sur >900px rien ne bouge. (Exigence explicite de Kevin.)
- Surfaces sombres : pas de `var(--white)`/`var(--ink)` pour du texte. Tester clair + sombre.
- Hooks (`useIsMobile`/`useState`/`useRef`/`useEffect`) toujours AVANT les early returns (React #310).
- Commits fréquents (1 par tâche), messages en français.
- Branche dédiée : `feat/studio-mobile-app`. Déploiement seulement à la fin (Task 13).

### Le système mobile (défini en Task 1, utilisé partout)
Après Task 1, ces constantes existent dans `glass.tsx` et sont importables :
- `TOUCH = { min: 44, comfortable: 48 }` — hauteur mini des cibles tactiles.
- `SAFE = { top, bottom, left, right }` — `env(safe-area-inset-*)`.
- `SPACE = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24 }` — échelle d'espacement.
- Pattern padding page : `padding: isMobile ? SPACE.md : 26`. Pattern gap blocs : `isMobile ? SPACE.md : 16`.

---

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `app/studio/_components/glass.tsx` | + tokens mobile (TOUCH/SAFE/SPACE) ; glassBtn 44px mobile ; FilterSelect recadré+scroll | T1 |
| `app/studio/eleves/[id]/_components/fiche-shared.tsx` | StatusSelect recadré+scroll (même fix que FilterSelect) | T2 |
| `app/studio/_components/bottom-tab-bar.tsx` | **NOUVEAU** — barre d'onglets bas mobile + sheet « Plus » | T3 |
| `app/studio/layout.tsx` | Intègre la bottom tab bar sur mobile (remplace le drawer) ; safe-area top-bar ; padding-bottom contenu | T3 |
| `app/studio/_components/mobile-sheet.tsx` | **NOUVEAU** — primitive bottom-sheet (overlay + panneau bas + header/footer sticky) | T4 |
| `app/studio/page.tsx` | Dashboard : Semaine en liste, KPI compacts, hero stack, RDV 2 lignes | T5 |
| `app/studio/eleves/page.tsx` | Liste : barre de filtres épurée, cartes aérées (ellipsis, identité empilée) | T6 |
| `app/studio/eleves/[id]/page.tsx` + `_components/*` | Fiche : onglets mobile, hero stack, actions RDV réduites | T7 |
| `app/studio/calendrier/page.tsx` | Mobile : vue Jour seule + agenda ; contrôles empilés | T8 |
| `app/studio/paiements/page.tsx` | Graphe MRR lisible mobile, KPI compacts, cartes ellipsis | T9 |
| `app/studio/_components/rdv-dialog.tsx` | RDV dialog → MobileSheet + champs 1 colonne sur mobile | T10 |
| `app/studio/campagnes/page.tsx` | Composer vertical, confirm dialog → sheet, textarea/boutons | T11 |
| `app/studio/eleves/[id]/_components/fiche-payment.tsx` + tickets/lier/transcripts | Modal SAV → sheet ; ellipsis `minWidth:0` ; polish | T12 |
| (tous) | QA 375px clair+sombre + build + deploy | T13 |

---

## Task 0 : Branche + dev server

**Files:** aucun (setup).

- [ ] **Step 1 : Branche**

Run : `cd "SKOOL/amour-studios" && git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/studio-mobile-app && git status`
Expected : `On branch feat/studio-mobile-app`.

- [ ] **Step 2 : Dev server (port 3001 obligatoire)**

Run (arrière-plan) : `cd "SKOOL/amour-studios" && PORT=3001 npm run dev`
Expected : `Local: http://localhost:3001`.

---

## Task 1 : Système de design mobile + glassBtn 44px + FilterSelect recadré

**Files:**
- Modify: `app/studio/_components/glass.tsx`

- [ ] **Step 1 : Ajouter les constantes mobile**

Juste après `export const R = 22;` (≈L23), insérer :
```tsx
// ── Système mobile : cibles tactiles, safe-area iOS, échelle d'espacement ──
/** Hauteur/largeur mini d'une cible tactile (WCAG 2.5.5). */
export const TOUCH = { min: 44, comfortable: 48 } as const;
/** Encoches iOS (notch + home indicator) + gestures Android. */
export const SAFE = {
  top: "env(safe-area-inset-top, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
  right: "env(safe-area-inset-right, 0px)",
} as const;
/** Échelle d'espacement (grille 4px) pour un mobile aéré mais pas chargé. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
```

- [ ] **Step 2 : glassBtn — touch target 44px (sans casser le desktop)**

`glassBtn` (≈L296) est utilisé partout. On NE change PAS la signature mais on garantit une hauteur tactile mini via `minHeight` + un padding vertical un poil plus généreux, SANS toucher au rendu desktop visuel (le `minHeight` n'agrandit que les boutons trop courts). Dans l'objet `base` (≈L297-308), remplacer `padding: "11px 16px",` par :
```tsx
    padding: "12px 16px",
    minHeight: TOUCH.min,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
```
(Effet : tous les boutons Glass atteignent 44px de haut, centrés ; le look desktop reste quasi identique, juste +1px de padding et un centrage propre. C'est un changement global assumé, pas gated isMobile, car 44px de touch ne dégrade pas le desktop.)

- [ ] **Step 3 : FilterSelect — recadrer le menu dans l'écran + scroll**

Dans `FilterSelect`, le calcul de position (≈L484-497) pose `left: r.left` → déborde à droite sur mobile. Remplacer le corps de `update` (≈L487-488) par un clamp sur le viewport :
```tsx
      const r = btnRef.current!.getBoundingClientRect();
      const MENU_W = 200; // ~ largeur du menu (minWidth 180 + marge)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
      // Si pas la place en dessous, ouvrir au-dessus.
      const below = r.bottom + 6;
      const tooLow = below + 260 > window.innerHeight;
      const top = tooLow ? Math.max(8, r.top - 6 - 260) : below;
      setRect({ top, left });
```
Puis sur le `<div>` du menu porté (≈L541-558), ajouter le scroll interne + borner la largeur sur petit écran : dans son `style`, après `minWidth: 180,`, ajouter :
```tsx
              maxWidth: "calc(100vw - 16px)",
              maxHeight: "min(320px, 60vh)",
              overflowY: "auto",
```

- [ ] **Step 4 : Typecheck**

Run : `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 5 : Commit**

```bash
git add app/studio/_components/glass.tsx && \
git commit -m "feat(mobile app): tokens mobile (TOUCH/SAFE/SPACE) + boutons 44px + FilterSelect recadré/scrollable"
```

---

## Task 2 : StatusSelect recadré (même fix que FilterSelect)

**Files:**
- Modify: `app/studio/eleves/[id]/_components/fiche-shared.tsx`

`StatusSelect` (≈L80-189) duplique le pattern de menu porté `position:fixed` (`minWidth: 150`, calcul `left: r.left`) → déborde pareil sur mobile.

- [ ] **Step 1 : Recadrer la position**

Repérer le `useLayoutEffect`/`update` qui pose `setRect({ top: r.bottom + 6, left: r.left })`. Le remplacer par le même clamp (largeur menu 180) :
```tsx
      const r = btnRef.current!.getBoundingClientRect();
      const MENU_W = 180;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
      const below = r.bottom + 6;
      const tooLow = below + 240 > window.innerHeight;
      const top = tooLow ? Math.max(8, r.top - 6 - 240) : below;
      setRect({ top, left });
```

- [ ] **Step 2 : Scroll + largeur bornée**

Sur le `<div>` du menu porté, après son `minWidth: 150,`, ajouter `maxWidth: "calc(100vw - 16px)", maxHeight: "min(300px, 60vh)", overflowY: "auto",`.

- [ ] **Step 3 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add "app/studio/eleves/[id]/_components/fiche-shared.tsx" && \
git commit -m "fix(mobile app): StatusSelect recadré dans l'écran + scroll (plus de débordement à droite)"
```

---

## Task 3 : Bottom tab bar (nav native mobile)

**Files:**
- Create: `app/studio/_components/bottom-tab-bar.tsx`
- Modify: `app/studio/layout.tsx`

But : sur mobile, remplacer le drawer burger par une barre d'onglets en bas (5 entrées, safe-area), + un sheet « Plus » pour les pages secondaires. Top-bar conservée. Desktop inchangé.

- [ ] **Step 1 : Créer le composant `BottomTabBar`**

Create `app/studio/_components/bottom-tab-bar.tsx` :
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCENT, SAFE, TOUCH, mono, type C } from "./glass";

export type TabItem = { href: string; label: string; icon: string; exact: boolean };

// 4 destinations principales + un onglet « Plus » (sheet). Les `secondary`
// vont dans le sheet. `active(href, exact)` reprend la logique du layout.
export function BottomTabBar({
  c,
  dark,
  primary,
  secondary,
  orphanCount,
  isActive,
  footer,
}: {
  c: C;
  dark: boolean;
  primary: TabItem[];
  secondary: TabItem[];
  orphanCount: number;
  isActive: (href: string, exact: boolean) => boolean;
  footer: React.ReactNode; // thème + déconnexion (réutilise le markup du layout)
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sideBg = dark ? "#0B0B0B" : "#FFFFFF";
  const sideLine = dark ? "rgba(255,255,255,0.08)" : "rgba(11,11,11,0.08)";
  const muted = dark ? "rgba(244,242,238,0.55)" : "rgba(11,11,11,0.5)";

  const anySecondaryActive = secondary.some((s) => isActive(s.href, s.exact));

  const tab = (active: boolean, onClick?: () => void) => ({
    flex: 1,
    minWidth: 0,
    height: TOUCH.comfortable,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    color: active ? ACCENT : muted,
    fontFamily: "inherit",
    padding: 0,
  });

  return (
    <>
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 45,
          background: sideBg,
          borderTop: `1px solid ${sideLine}`,
          display: "flex",
          paddingBottom: SAFE.bottom,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {primary.map((it) => {
          const active = isActive(it.href, it.exact);
          return (
            <Link key={it.href} href={it.href} style={tab(active)}>
              <span style={{ fontSize: 18, lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>{it.icon}</span>
              <span style={{ ...mono, fontSize: 8.5, letterSpacing: "0.02em" }}>{it.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)} style={tab(anySecondaryActive)}>
          <span style={{ fontSize: 18, lineHeight: 1, position: "relative" }}>
            ⋯
            {orphanCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -8, width: 7, height: 7, borderRadius: 7, background: ACCENT }} />
            )}
          </span>
          <span style={{ ...mono, fontSize: 8.5, letterSpacing: "0.02em" }}>Plus</span>
        </button>
      </nav>

      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)" }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 61,
              background: sideBg,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTop: `1px solid ${sideLine}`,
              padding: 14,
              paddingBottom: `calc(14px + ${SAFE.bottom})`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 4, background: sideLine, margin: "2px auto 10px" }} />
            {secondary.map((it) => {
              const active = isActive(it.href, it.exact);
              const badge = it.href === "/studio/transcripts" ? orphanCount : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    minHeight: TOUCH.min,
                    padding: "0 12px",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: active ? c.text : c.muted,
                    background: active ? c.chip : "transparent",
                    fontSize: 15,
                  }}
                >
                  <span style={{ fontSize: 16, width: 18, textAlign: "center", color: active ? ACCENT : c.muted, fontFamily: "'DM Mono', monospace" }}>{it.icon}</span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {badge > 0 && (
                    <span style={{ ...mono, fontSize: 9.5, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: ACCENT, color: "#0B0B0B", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{badge}</span>
                  )}
                </Link>
              );
            })}
            <div style={{ height: 1, background: sideLine, margin: "8px 0" }} />
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2 : Brancher dans `layout.tsx` — split nav primary/secondary**

Dans `StudioShell` (`layout.tsx`), après la constante `NAV` ou en tête de composant, dériver :
```tsx
const PRIMARY = NAV.filter((n) => ["/studio", "/studio/eleves", "/studio/calendrier", "/studio/paiements"].includes(n.href));
const SECONDARY = NAV.filter((n) => !PRIMARY.includes(n));
```
(`NAV` items ont `{href,label,icon,exact}` = le type `TabItem`.) Importer `BottomTabBar` + `SAFE` depuis les bons chemins (`./_components/bottom-tab-bar`, `SAFE` depuis `./_components/glass`).

- [ ] **Step 3 : Rendre la bottom bar sur mobile (et retirer le drawer mobile)**

Sur mobile, on garde la top-bar (Task 1 précédente l'a posée) mais on remplace le DRAWER par la bottom bar. Concrètement, dans le `return` de `StudioShell` :
1. L'`<aside>` (drawer/rail) ne doit s'afficher QUE sur desktop : l'envelopper `{!isMobile && (<aside>…</aside>)}`. (Le rail desktop est inchangé.)
2. Le backdrop + le drawer mobile de l'étape précédente ne servent plus → supprimer le bloc backdrop mobile ET le `transform/position:fixed` mobile de l'aside (puisque l'aside est désormais desktop-only). Le bouton ☰ de la top-bar n'ouvre plus rien → le retirer de la top-bar (garder logo + titre).
3. Après le `<main>`, rendre la bottom bar :
```tsx
{isMobile && (
  <BottomTabBar
    c={c}
    dark={dark}
    primary={PRIMARY}
    secondary={SECONDARY}
    orphanCount={orphanCount}
    isActive={(href, exact) => (exact ? pathname === href : pathname.startsWith(href))}
    footer={
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => { const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; if (next === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); try { localStorage.setItem("amour-theme", next); } catch {} }} style={{ ...mono, fontSize: 12, minHeight: 44, padding: "0 12px", background: "transparent", border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(11,11,11,0.08)"}`, color: c.text, borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
          {dark ? "☼ Clair" : "☾ Sombre"}
        </button>
        <button onClick={() => void signOut().then(() => router.replace("/studio/login"))} style={{ ...mono, fontSize: 12, minHeight: 44, padding: "0 12px", background: "transparent", border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(11,11,11,0.08)"}`, color: c.text, borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
          Se déconnecter
        </button>
      </div>
    }
  />
)}
```

- [ ] **Step 4 : Réserver l'espace pour la bottom bar + safe-area top-bar**

Sur le `<main>`, ajouter un padding bas sur mobile pour que la tab bar ne masque pas le contenu :
```tsx
<main style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? `calc(${TOUCH.comfortable}px + ${SAFE.bottom} + 8px)` : undefined }}>
```
Sur la top-bar mobile, gérer le notch : ajouter `paddingTop: SAFE.top` et `height: calc(56px + ${SAFE.top})` (ou laisser 56 + paddingTop). Importer `TOUCH`, `SAFE` dans layout.

- [ ] **Step 5 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/_components/bottom-tab-bar.tsx app/studio/layout.tsx && \
git commit -m "feat(mobile app): bottom tab bar native (4 onglets + Plus) remplace le drawer ; safe-area iOS ; desktop inchangé"
```

---

## Task 4 : Primitive MobileSheet (bottom-sheet pour les dialogs)

**Files:**
- Create: `app/studio/_components/mobile-sheet.tsx`

But : un wrapper réutilisable qui, sur mobile, rend un dialog en **feuille collée en bas** (plein largeur, coins arrondis haut, header sticky + corps scrollable + footer sticky), et sur desktop rend une **modale centrée** classique. Les dialogs existants l'utiliseront (T10, T11, T12).

- [ ] **Step 1 : Créer le composant**

Create `app/studio/_components/mobile-sheet.tsx` :
```tsx
"use client";

import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";
import { SAFE, type C } from "./glass";

// Bottom-sheet sur mobile, modale centrée sur desktop. Ferme sur Échap + clic fond.
export function MobileSheet({
  c,
  dark,
  isMobile,
  onClose,
  title,
  children,
  footer,
  maxWidth = 460,
}: {
  c: C;
  dark: boolean;
  isMobile: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panelBg = dark ? "rgba(20,20,26,0.98)" : "rgba(255,253,250,0.98)";

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: panelBg,
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          border: `1px solid ${c.line}`,
          color: c.text,
          width: isMobile ? "100%" : "min(" + maxWidth + "px, calc(100vw - 48px))",
          maxHeight: isMobile ? "calc(100vh - 40px)" : "calc(100vh - 48px)",
          borderRadius: isMobile ? "22px 22px 0 0" : 20,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        {(title || isMobile) && (
          <div style={{ flexShrink: 0, padding: isMobile ? "10px 18px 12px" : "18px 22px 12px", borderBottom: `1px solid ${c.hairline}` }}>
            {isMobile && <div style={{ width: 40, height: 4, borderRadius: 4, background: c.line, margin: "0 auto 10px" }} />}
            {title && <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>}
          </div>
        )}
        <div style={{ overflowY: "auto", padding: isMobile ? 18 : 22, flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ flexShrink: 0, padding: isMobile ? `12px 18px calc(12px + ${SAFE.bottom})` : "14px 22px", borderTop: `1px solid ${c.hairline}`, display: "flex", gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur (le composant n'est pas encore importé, c'est normal qu'il soit inutilisé à ce stade — il le sera en T10-T12).
```bash
git add app/studio/_components/mobile-sheet.tsx && \
git commit -m "feat(mobile app): primitive MobileSheet (bottom-sheet mobile / modale desktop)"
```

---

## Task 5 : Dashboard — épuré et sans scroll horizontal

**Files:**
- Modify: `app/studio/page.tsx`

Cibles (lignes indicatives, à reconfirmer) : padding page (~133), KPI minHeight (~68), grille « Semaine » `repeat(5,1fr)` + `minWidth 440` à scroll (~300-303), boutons hero (~147), ligne RDV `82px 1fr auto auto` (~186).

- [ ] **Step 1 : Padding + gaps mobile**

Importer `SPACE` depuis glass. Padding page → `isMobile ? SPACE.md : 26` (déjà `14` → passer à `SPACE.md`=12). Gaps entre blocs → `isMobile ? SPACE.md : 16` là où c'est `16`.

- [ ] **Step 2 : KPI compacts**

Sur la carte KPI (`minHeight: 168`), passer `minHeight: isMobile ? 120 : 168`. La grille reste `isMobile ? "1fr" : "repeat(4, …)"`.

- [ ] **Step 3 : « Semaine » — liste verticale au lieu de grille à scroll horizontal**

Remplacer le bloc Semaine : sur mobile, au lieu de la grille 5 colonnes + `minWidth:440` + `overflowX:auto`, rendre une **liste verticale** (un jour par ligne : date + nb de RDV, cliquable vers le calendrier). Garder la grille 5 colonnes sur desktop. Forme :
```tsx
{isMobile ? (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {/* `semaine` = la même source de données que la grille desktop (5 jours) */}
    {semaine.map((j) => (
      <button key={j.key} onClick={() => router.push(`/studio/calendrier?date=${j.dateParam}`)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, padding: "0 14px", borderRadius: 12, background: c.chip, border: `1px solid ${c.line}`, color: c.text, fontFamily: "inherit", width: "100%", cursor: "pointer" }}>
        <span style={{ fontSize: 14 }}>{j.labelLong /* ex. "Lun 16 juin" */}</span>
        <span style={{ ...mono, fontSize: 11, color: j.count ? ACCENT : c.faint }}>{j.count ? `${j.count} RDV` : "—"}</span>
      </button>
    ))}
  </div>
) : (
  /* === grille 5 colonnes desktop existante, inchangée === */
)}
```
NOTE implémenteur : lire le rendu desktop de la Semaine pour réutiliser exactement la source de données (les 5 jours, leur date, leur compte de RDV) et la convention de deep-link calendrier (`?date=`). Adapter `j.labelLong`/`j.dateParam`/`j.count`/`j.key` aux champs réels.

- [ ] **Step 4 : Boutons hero pleine largeur empilés sur mobile**

Sur le conteneur des 2 GlassButtons du hero (`flex, gap:8`), ajouter `flexDirection: isMobile ? "column" : "row"` et donner aux boutons `width: isMobile ? "100%" : undefined` (ou `flex: 1`).

- [ ] **Step 5 : Ligne RDV du jour — 2 lignes sur mobile**

La grille `82px 1fr auto auto` écrase tout à 375px. Sur mobile, passer la ligne RDV en 2 niveaux : grille `isMobile ? "auto 1fr" : "82px 1fr auto auto"` et déplacer les actions (bouton « Démarrer ») sous le nom en `flexWrap`. Réduire l'avatar éventuel à 32px sur mobile. Garder le rendu desktop exact.

- [ ] **Step 6 : Troncatures**

Sur les libellés de nom/élève des listes (RDV, relances, alertes), s'assurer du trio `overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"` + `minWidth:0` sur le conteneur flex parent.

- [ ] **Step 7 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/page.tsx && \
git commit -m "feat(mobile app): dashboard épuré — Semaine en liste (zéro scroll horizontal), KPI compacts, hero empilé, RDV 2 lignes"
```

---

## Task 6 : Liste élèves — filtres épurés + cartes aérées

**Files:**
- Modify: `app/studio/eleves/page.tsx`

- [ ] **Step 1 : Barre de filtres lisible sur mobile**

Aujourd'hui Segmented + 2 FilterSelect + recherche wrappent salement. Sur mobile, structurer en lignes nettes :
- Ligne 1 : `Segmented` (tier) en pleine largeur (`width: "100%"` sur mobile).
- Ligne 2 : les 2 `FilterSelect` (Étape, Paiement) côte à côte (`display:flex; gap:8`).
- Ligne 3 : recherche pleine largeur.
Concrètement, sur le conteneur de filtres, `flexDirection: isMobile ? "column" : "row"` + `alignItems: isMobile ? "stretch" : "center"`, et donner au Segmented `width: isMobile ? "100%" : undefined`. Raccourcir le placeholder : `placeholder={isMobile ? "Pseudo…" : "Rechercher par pseudo Discord…"}`.

- [ ] **Step 2 : Cartes élèves aérées (identité empilée + ellipsis + 2 chips max)**

Dans le rendu carte mobile (déjà en place), aérer :
- Identité : garder Avatar + nom, mais s'assurer du `minWidth:0` sur le bloc texte et de l'ellipsis sur le nom.
- Limiter à **2 chips** : Étape + Prochain RDV. Garder le statut paiement en `Pill` coloré (acquis). RETIRER le téléphone/dernière activité de la carte (réservés au détail).
- Padding carte `isMobile ? 14 : …`, gap interne `10`. Hauteur de frappe : toute la carte est déjà un `<button>` (bon).

- [ ] **Step 3 : Tri en mode cartes**

Vérifier que l'en-tête « Élève » cliquable (tri date) reste accessible sur mobile : si l'en-tête de tableau est masqué en cartes, ajouter un petit contrôle de tri au-dessus des cartes (`mono`, « Plus récents ↓ / ↑ », `minHeight:44`) qui toggle `sortDir`.

- [ ] **Step 4 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/eleves/page.tsx && \
git commit -m "feat(mobile app): liste élèves — filtres en lignes nettes + cartes aérées (ellipsis, 2 chips, tri accessible)"
```

---

## Task 7 : Fiche élève — onglets (segmented) + hero + actions

**Files:**
- Modify: `app/studio/eleves/[id]/page.tsx`
- Modify: `app/studio/eleves/[id]/_components/*` (au besoin pour les actions RDV)

But : tuer le scroll infini. Sur mobile, regrouper les blocs en 4 onglets ; desktop reste la disposition 2 colonnes actuelle.

- [ ] **Step 1 : État d'onglet (mobile)**

Dans `[id]/page.tsx`, ajouter (avant tout early return) :
```tsx
const [tab, setTab] = useState<"infos" | "rdv" | "parcours" | "activite">("infos");
```
(`isMobile` est déjà présent.)

- [ ] **Step 2 : Barre d'onglets segmented (mobile only)**

Juste sous le hero, rendre `{isMobile && (<segmented 4 onglets/>)}` : 4 boutons, `minHeight:44`, l'actif en `background:c.chip` + texte `c.text`, inactifs `c.muted`, conteneur `display:flex; gap:4; background:c.chip; padding:4; borderRadius:14; position:sticky; top:<hauteur top-bar>; zIndex:5`. Labels : Infos / RDV / Parcours / Activité.

- [ ] **Step 3 : Router les blocs dans les onglets sur mobile**

La grille principale 2 colonnes (`isMobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)"`) reste. Mais sur mobile, n'afficher que les blocs de l'onglet actif. Mapper les blocs existants :
- **Infos** : Paiement + Discord + Onboarding (coordonnées/questionnaire).
- **RDV** : RDV à venir + Historique RDV.
- **Parcours** : Curriculum/exercices.
- **Activité** : Notes CRM + timeline d'activité.
Technique : envelopper chaque bloc (ou groupe) par `{(!isMobile || tab === "infos") && (<bloc/>)}` etc. Sur desktop (`!isMobile`) tous les blocs s'affichent comme aujourd'hui (disposition inchangée). NE PAS casser l'ordre/disposition desktop : le `!isMobile ||` garantit l'affichage desktop complet.

- [ ] **Step 4 : Hero empilé sur mobile**

Le hero (avatar+infos | bordure | boutons) wrappe mal. Sur mobile : `flexWrap` ok mais retirer la `borderLeft` (`borderLeft: isMobile ? "none" : ...`), passer la colonne actions en pleine largeur sous l'avatar (`minWidth: isMobile ? "100%" : 220`) et empiler les boutons (`flexDirection: isMobile ? "column" : ...`, boutons `width:100%`).

- [ ] **Step 5 : Actions RDV réduites sur mobile**

Dans le bloc « RDV à venir », la rangée d'actions (Reprogrammer/Annuler/No-show/Éditer/Supprimer + Marquer fait) déborde. Sur mobile : garder visibles **Marquer fait** (accent, pleine largeur) + **Reprogrammer** ; regrouper les autres (Annuler/No-show/Éditer/Supprimer) derrière un bouton kebab `⋯` qui ouvre un petit menu (réutiliser le pattern menu porté, ou un simple bloc déroulant). Empiler vertical (`flexDirection: isMobile ? "column" : "row"`). Garder le desktop intact.

- [ ] **Step 6 : Troncatures titres de blocs**

Vérifier dans `sortable-blocks.tsx` (ou le composant de bloc repliable) que le titre a `overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap; minWidth:0` pour ne pas déborder.

- [ ] **Step 7 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add "app/studio/eleves/[id]/page.tsx" "app/studio/eleves/[id]/_components" && \
git commit -m "feat(mobile app): fiche élève en onglets (Infos/RDV/Parcours/Activité) + hero empilé + actions RDV réduites (desktop inchangé)"
```

---

## Task 8 : Calendrier — Jour + agenda sur mobile

**Files:**
- Modify: `app/studio/calendrier/page.tsx`

- [ ] **Step 1 : Forcer Jour + masquer Semaine/Mois sur mobile**

L'effet one-shot force déjà `setView("day")` sur mobile. Compléter : masquer les boutons « Semaine » et « Mois » sur mobile (`{!isMobile && (<bouton semaine/mois/>)}`) pour qu'on ne retombe pas sur la grille 7 colonnes à scroll horizontal. Garder « Jour » (et la nav ‹ ›). Desktop : 3 vues inchangées.

- [ ] **Step 2 : Agenda sous la grille jour**

La sidebar RDV (liste des prochains RDV) disparaît sur mobile (grille latérale `isMobile ? "1fr" : …`). Pour ne pas perdre l'info, rendre la **liste agenda sous** la grille du jour sur mobile : réutiliser le composant/markup de la liste RDV de la sidebar, affiché `{isMobile && (<liste agenda/>)}` après la grille jour. Source de données = la même que la sidebar.

- [ ] **Step 3 : Contrôles empilés**

La rangée nav + label + toggle de vue déborde. Sur mobile : `flexDirection: column` ou 2 niveaux nets (`flexWrap:"wrap"` + largeurs maîtrisées) ; le label de période sur sa propre ligne, centré. Filtres de statut de la sidebar : si rendus sur mobile, passer en grille `1fr 1fr`.

- [ ] **Step 4 : Padding hero/page mobile**

Padding page calendrier → `isMobile ? SPACE.md : 26`.

- [ ] **Step 5 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/calendrier/page.tsx && \
git commit -m "feat(mobile app): calendrier mobile = vue Jour + agenda (Semaine/Mois masquées) + contrôles empilés"
```

---

## Task 9 : Paiements — graphe lisible + compact

**Files:**
- Modify: `app/studio/paiements/page.tsx`

- [ ] **Step 1 : KPI compacts**

`minHeight` des KPI → `isMobile ? 120 : <desktop>`. Grille déjà `isMobile ? "1fr" : …`.

- [ ] **Step 2 : Graphe MRR lisible sur mobile**

Le SVG (`viewBox 0 0 720 200`, labels `fontSize="9"`) est illisible à 375px. Sur mobile, agrandir le texte interne du SVG et alléger : passer les `fontSize="9"` des labels à `fontSize="14"` quand `isMobile` (le texte SVG est en unités viewBox, donc 14 sur 720 reste proportionné après mise à l'échelle), et n'afficher qu'un label de mois sur deux (ou les extrêmes + le courant) pour ne pas surcharger. Garder le desktop tel quel. Si l'`AreaChart` est un sous-composant, lui passer `isMobile` en prop (déjà fait pour le height en chantier précédent).

- [ ] **Step 3 : Cartes abonnements — anti-débordement**

Sur les conteneurs texte (nom/email) des cartes, ajouter `minWidth:0` + ellipsis (`overflow:hidden; textOverflow:ellipsis; whiteSpace:nowrap`).

- [ ] **Step 4 : Padding mobile** → `isMobile ? SPACE.md : 26`.

- [ ] **Step 5 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/paiements/page.tsx && \
git commit -m "feat(mobile app): paiements — graphe MRR lisible sur mobile + KPI compacts + cartes anti-débordement"
```

---

## Task 10 : RDV dialog → bottom-sheet

**Files:**
- Modify: `app/studio/_components/rdv-dialog.tsx`

- [ ] **Step 1 : Envelopper le contenu dans `MobileSheet`**

Le dialog actuel (overlay `fixed` + panneau `maxWidth:440`) devient : importer `MobileSheet` + `useIsMobile`. Remplacer l'overlay/panneau maison par `<MobileSheet c={c} dark={dark} isMobile={isMobile} onClose={onClose} title="…" footer={<boutons annuler/valider/>}>{corps}</MobileSheet>`. Le corps (champs) et les boutons existants sont réutilisés tels quels ; seul le contenant change. (Garde la logique métier intacte.)

- [ ] **Step 2 : Champs en 1 colonne sur mobile**

Les grilles internes du dialog (`Date | Heure` en `1fr 1fr`, `Module | Leçon` en `1fr 1fr`) → `isMobile ? "1fr" : "1fr 1fr"`. Textarea `rows={isMobile ? 2 : 3}`.

- [ ] **Step 3 : Boutons footer pleine largeur empilés sur mobile**

Dans le `footer` du MobileSheet, donner aux 2 boutons `flex:1` (ils remplissent la largeur) ; sur très petit écran ça reste lisible. `minHeight:44` (via glassBtn déjà patché).

- [ ] **Step 4 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/_components/rdv-dialog.tsx && \
git commit -m "feat(mobile app): RDV dialog en bottom-sheet mobile (champs 1 colonne, boutons pleine largeur)"
```

---

## Task 11 : Campagnes — composer vertical + confirm en sheet

**Files:**
- Modify: `app/studio/campagnes/page.tsx`

- [ ] **Step 1 : Composer vertical lisible**

Grille principale déjà `isMobile ? "1fr" : …`. Réduire la textarea du composer sur mobile : `rows={isMobile ? 4 : 6}`. S'assurer que l'aperçu et les inputs ont `width:100%` (via `inputStyle`).

- [ ] **Step 2 : Dialog de confirmation → `MobileSheet`**

Remplacer le `ConfirmDialog` maison (overlay `fixed` + `maxWidth`) par `<MobileSheet …>`. Boutons d'action (Envoyer test / Envoyer à N) en `footer`, `flex:1`, empilés sur mobile (`flexDirection` du footer : le MobileSheet pose `display:flex; gap:8` en ligne ; pour empiler sur mobile, donner aux boutons `flex:"1 1 100%"` ou passer le footer en colonne via un wrapper).

- [ ] **Step 3 : Padding mobile** → `isMobile ? SPACE.md : 26`.

- [ ] **Step 4 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add app/studio/campagnes/page.tsx && \
git commit -m "feat(mobile app): campagnes — composer vertical + confirmation en bottom-sheet"
```

---

## Task 12 : Modal SAV en sheet + polish secondaires

**Files:**
- Modify: `app/studio/eleves/[id]/_components/fiche-payment.tsx`
- Modify: `app/studio/tickets/page.tsx`
- Modify: `app/studio/lier/page.tsx`
- Modify: `app/studio/transcripts/page.tsx`

- [ ] **Step 1 : Modal SAV paiement → `MobileSheet`**

Dans `fiche-payment.tsx`, le `SavModalShell` (overlay `fixed`, `maxWidth`) → `MobileSheet`. Champs/radios du SAV en 1 colonne sur mobile. Inputs `width:100%`. Backdrop blur géré par le sheet.

- [ ] **Step 2 : Tickets — anti-débordement**

Conteneurs email/nom des `TicketCard` : `minWidth:0` + ellipsis. Padding `isMobile ? SPACE.md : …`.

- [ ] **Step 3 : Lier — boutons empilés + chips lisibles**

Les boutons « Chercher »/« Lier » s'empilent déjà via wrap ; garantir `minHeight:44`. Chips de statut : `fontSize` mini 11 sur mobile.

- [ ] **Step 4 : Transcripts — résumé borné**

Borner la hauteur du résumé IA sur mobile (`maxHeight: isMobile ? 200 : undefined; overflowY:"auto"`). Chips participants : `flexWrap` ok, ellipsis sur le texte.

- [ ] **Step 5 : Typecheck + commit**

Run : `npx tsc --noEmit` → 0 erreur.
```bash
git add "app/studio/eleves/[id]/_components/fiche-payment.tsx" app/studio/tickets/page.tsx app/studio/lier/page.tsx app/studio/transcripts/page.tsx && \
git commit -m "feat(mobile app): modal SAV en bottom-sheet + polish tickets/lier/transcripts (ellipsis, touch 44px)"
```

---

## Task 13 : QA 375px + build + déploiement

**Files:** aucun (vérif + deploy ; corrections inline si défaut).

- [ ] **Step 1 : Balayage débordement horizontal (toutes pages)**

Le débordement horizontal = le défaut « app » n°1. Pour chaque page, mesurer `scrollWidth - clientWidth` doit être ≤ 1 :
```bash
$B viewport 375 812
for p in "" eleves calendrier paiements tickets lier campagnes transcripts; do \
  $B goto "http://localhost:3001/studio/$p"; \
  $B eval "Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0)"; done
```
(Le balayage suppose une session admin dans browse ; sinon, faire vérifier les captures par l'utilisateur. Voir note QA en bas.)

- [ ] **Step 2 : Checklist app native (clair + sombre)**

Pour chaque écran : (a) bottom tab bar visible + onglet actif correct ; (b) aucun scroll horizontal ; (c) aucun texte < 11px ; (d) boutons ≥ 44px ; (e) dialogs en sheet collé en bas ; (f) selects ne sortent pas de l'écran ; (g) fiche élève en onglets ; (h) calendrier en Jour+agenda. Tester en thème sombre (aucun texte invisible).

- [ ] **Step 3 : Non-régression desktop**

```bash
$B viewport 1280 800
for p in "" eleves calendrier paiements tickets lier campagnes transcripts; do $B goto "http://localhost:3001/studio/$p"; $B screenshot "/tmp/desktop-app-${p:-home}.png"; done
```
Expected : sidebar (pas de bottom bar), tableaux en tableaux, dialogs centrés, 3 vues calendrier — identique à avant.

- [ ] **Step 4 : Build prod**

Run : `cd "SKOOL/amour-studios" && npx tsc --noEmit && npm run build`
Expected : typecheck 0 erreur + build OK (26 routes).

- [ ] **Step 5 : Merge + déploiement**

```bash
cd "SKOOL/amour-studios" && git checkout main && git merge --no-ff feat/studio-mobile-app -m "feat(studio): refonte mobile app (bottom tab bar + onglets fiche + bottom-sheets + écrans aérés)" && \
npx vercel --prod --yes
```
Puis `npx vercel promote <url> --yes` (un `409 already current production` = succès). Pas de Convex à déployer (aucune fonction backend touchée).

- [ ] **Step 6 : Vérif post-déploiement**

`$B viewport 375 812 && $B goto https://amour-studios.vercel.app/studio && $B screenshot /tmp/mobile-app-prod.png` (login admin si besoin).

---

## Note QA (visibilité mobile)

La vérif visuelle headless nécessite une session admin (Discord OAuth) difficile à automatiser. Deux options de secours, à décider à l'exécution :
1. **Preview deploy** à mi-parcours (après T1-T8) : `npx vercel` (sans `--prod`) → URL de preview que Kevin ouvre sur son téléphone pour un retour rapide avant de finir T9-T13.
2. À défaut, s'appuyer sur typecheck + build + relecture de diff + mesure programmatique du débordement, et un check final de Kevin sur son téléphone après déploiement.

---

## Self-Review (rempli par l'auteur du plan)

**Couverture spec :** « vraie app téléphone, épuré, lisible, pas chargé, touch, zéro crop, garder les fonctionnalités » → bottom tab bar (T3) + système touch/typo/espacement (T1) + bottom-sheets (T4,T10,T11,T12) + selects recadrés (T1,T2) + écrans aérés sans scroll horizontal (T5 Semaine→liste, T8 calendrier→jour+agenda, T6 cartes, T9 graphe) + fiche en onglets (T7). Aucune fonctionnalité retirée (regroupées/déplacées, jamais supprimées). Desktop inchangé (gate `isMobile`/`!isMobile`).

**Placeholders :** les `<desktop>` = valeur d'origine à conserver (explicite). Les champs de données des nouveaux rendus (Semaine liste, cartes, agenda) sont marqués « à lire dans le rendu desktop existant » car ils dépendent des données réelles — l'implémenteur réutilise les mêmes accès, pas d'invention.

**Cohérence des noms :** `TOUCH`/`SAFE`/`SPACE` (T1) réutilisés partout ; `MobileSheet` (T4) consommé en T10/T11/T12 ; `BottomTabBar`/`TabItem` (T3) ; le clamp de menu identique en T1 (FilterSelect) et T2 (StatusSelect).

**Risque assumé :** T7 (fiche en onglets) et T3 (nav) sont les changements les plus structurels → revue spec + qualité par sous-agents en exécution, et idéalement un preview deploy pour validation visuelle avant le merge final.
