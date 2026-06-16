# Back-office /studio — Optimisation mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les 10 pages du back-office `/studio` utilisables sur téléphone (375px) : navigation en menu burger, tableaux denses transformés en cartes empilées, grilles multi-colonnes qui s'empilent.

**Architecture:** Pas de CSS media queries (l'app est en inline styles « Glass C »). On généralise le hook existant `useIsMobile()` (`app/studio/_components/glass.tsx`, breakpoint `max-width: 900px`) avec le pattern `isMobile ? <mobile> : <desktop>`. Une seule pièce vraiment neuve : le drawer burger dans `app/studio/layout.tsx`. Le reste = appliquer 2 patterns répétables (grille→1 colonne, tableau→cartes) page par page.

**Tech Stack:** Next.js 16 (App Router), React, inline styles + tokens `glass.tsx`, Convex (lecture seule ici), Framer Motion (déjà présent).

---

## Conventions (à lire avant toute tâche)

### Pattern 1 — Grille multi-colonnes → empilement
Toute grille `gridTemplateColumns: "<plusieurs colonnes>"` devient conditionnelle :
```tsx
gridTemplateColumns: isMobile ? "1fr" : "<valeur desktop d'origine>",
```
`isMobile` vient de `useIsMobile()` (importé depuis `../_components/glass` ou le bon niveau relatif). Si le composant ne l'a pas encore, l'ajouter à l'import et appeler `const isMobile = useIsMobile();` en haut du composant, AVANT tout `return` (règle des hooks — voir mémoire `hooks-avant-early-return`).

### Pattern 2 — Tableau (grille `COLS`) → cartes empilées sur mobile
Les tableaux studio sont une ligne d'en-tête + des lignes en `display:grid; gridTemplateColumns: COLS`. Sur mobile, on REMPLACE le rendu par des cartes verticales (une par enregistrement), on MASQUE l'en-tête de colonnes, et on garde le rendu tableau existant sur desktop. Forme :
```tsx
{isMobile ? (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {rows.map((r) => (
      <button key={r.id} onClick={() => /* même action que la ligne desktop */}
        style={{ ...glassRowCardStyle(c), textAlign: "left" }}>
        {/* ligne 1 : identité (avatar + nom) */}
        {/* ligne 2 : 2-3 infos clés en chips */}
      </button>
    ))}
  </div>
) : (
  /* === rendu tableau desktop existant, inchangé === */
)}
```
Style de carte réutilisable (à copier tel quel dans chaque page concernée, pas d'import partagé pour rester local) :
```tsx
const cardStyle = {
  display: "flex", flexDirection: "column" as const, gap: 8,
  padding: 14, borderRadius: 14,
  background: c.chip, border: `1px solid ${c.line}`,
  width: "100%", fontFamily: "inherit", color: c.text, cursor: "pointer",
};
```
Chip d'info dans une carte :
```tsx
<span style={{ ...mono, fontSize: 10, padding: "3px 8px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}`, color: c.muted }}>{label}</span>
```

### Vérification (pas de runner de tests composants dans ce repo)
Chaque tâche se vérifie par :
1. `cd SKOOL/amour-studios && npx tsc --noEmit` → 0 erreur.
2. Contrôle visuel à 375px avec le skill `browse` (`$B`), connecté en admin. Procédure dans la Task 0.
3. Aucune régression desktop : la branche `isMobile ? ... : <desktop>` laisse le chemin desktop identique au code d'origine.

### Règles projet (non négociables)
- Inline styles + tokens `glass.tsx` uniquement (pas de Tailwind sur /studio).
- Tester clair + sombre (les surfaces noires n'utilisent jamais `var(--white)`/`var(--ink)` pour le texte).
- Hooks toujours avant les early returns.
- Commits fréquents (1 par tâche), messages en français.
- Branche dédiée : `feat/studio-mobile`. NE PAS travailler sur la prod sans la branche.
- Déploiement à la toute fin (Task 12), pas après chaque tâche.

---

## File Structure

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `app/studio/layout.tsx` | Shell + navigation. Ajout drawer burger mobile + top bar. | Task 1 |
| `app/studio/page.tsx` | Dashboard « Aujourd'hui ». Grilles KPI/main/relances/semaine. | Task 2 |
| `app/studio/eleves/page.tsx` | Liste élèves. Tableau 8 col → cartes. | Task 3 |
| `app/studio/eleves/[id]/page.tsx` + `_components/fiche-onboarding.tsx` | Fiche élève. Grilles internes 2 col + actions RDV. | Task 4 |
| `app/studio/calendrier/page.tsx` | Calendrier. Vue jour forcée sur mobile + mois lisible. | Task 5 |
| `app/studio/paiements/page.tsx` | Paiements. KPI + graphe SVG responsive + table → cartes. | Task 6 |
| `app/studio/tickets/page.tsx` | Tickets SAV. Table 4 col → cartes. | Task 7 |
| `app/studio/campagnes/page.tsx` | Campagnes. 2 col → 1 col + historique → cartes + dialog. | Task 8 |
| `app/studio/lier/page.tsx` | Liaison manuelle. Input + padding mobile. | Task 9 |
| `app/studio/transcripts/page.tsx` | Orphelins Fireflies. Polish padding/chips. | Task 10 |
| (tous) | QA visuelle 375px clair+sombre + déploiement. | Task 11–12 |

---

## Task 0 : Préparer la branche + l'accès QA navigateur

**Files:** aucun (setup).

- [ ] **Step 1 : Créer la branche dédiée**

Run :
```bash
cd "SKOOL/amour-studios" && git checkout -b feat/studio-mobile && git status
```
Expected : `On branch feat/studio-mobile`, working tree clean.

- [ ] **Step 2 : Démarrer le dev server sur le port 3001**

(Convex dev `SITE_URL=http://localhost:3001` → le port DOIT être 3001.)
Run (en arrière-plan) :
```bash
cd "SKOOL/amour-studios" && PORT=3001 npm run dev
```
Expected : `Local: http://localhost:3001`. Laisser tourner.

- [ ] **Step 3 : Préparer browse en viewport mobile + login admin**

Suivre le SETUP du skill `browse` (`$B`). Puis :
```bash
$B viewport 375 812
$B goto http://localhost:3001/studio
```
Si redirigé vers `/studio/login`, se connecter avec le compte admin (Discord OAuth) une fois ; la session persiste dans browse. Vérifier qu'on atteint le dashboard.
Expected : capture du dashboard à 375px (servira de référence « avant »).

- [ ] **Step 4 : Capturer l'état « avant » de chaque page (référence)**

```bash
for p in "" eleves calendrier paiements tickets lier campagnes transcripts; do \
  $B goto "http://localhost:3001/studio/$p"; $B screenshot "/tmp/mobile-before-${p:-home}.png"; done
```
Expected : 8 captures. Elles documentent les points de rupture (débordement horizontal, colonnes écrasées) à corriger.

---

## Task 1 : Navigation — menu burger / drawer mobile

**Files:**
- Modify: `app/studio/layout.tsx`

Objectif : sur mobile (`isMobile`), remplacer le rail d'icônes 64px par (a) une top-bar collante avec un bouton ☰ + le logo, et (b) un drawer plein-hauteur qui glisse depuis la gauche avec la nav COMPLÈTE (labels visibles), fermé par défaut, refermé à chaque navigation et au clic sur le fond. Desktop : strictement inchangé.

- [ ] **Step 1 : Ajouter l'état drawer + ajuster `collapsed`**

Dans `StudioShell`, repérer (≈ ligne 80-83) :
```tsx
  const [userCollapsed, setUserCollapsed] = useState(false);
  // En mobile, la sidebar passe en mode compact (64px, icônes seules) plutôt
  // qu'un drawer : le contenu reste lisible sans risque de régression desktop.
  const collapsed = userCollapsed || isMobile;
```
Remplacer par :
```tsx
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop : collapse manuel (rail 64px). Mobile : drawer plein, jamais le rail.
  const collapsed = !isMobile && userCollapsed;
```
Puis, juste après la déclaration de `collapsed`, ajouter l'effet de fermeture à la navigation :
```tsx
  // Ferme le drawer mobile à chaque changement de route.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);
```
(`useEffect` est déjà importé.)

- [ ] **Step 2 : Rendre le conteneur racine + l'aside responsive**

Repérer le `return (` final (≈ ligne 159) et son `<div>` racine (≈ 160-168) :
```tsx
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: dark ? "#0B0B0B" : "#F4F2EE",
        color: sideText,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
```
Remplacer par (flex en colonne sur mobile pour empiler top-bar + contenu ; l'aside passe en overlay fixe donc sort du flux) :
```tsx
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        minHeight: "100vh",
        background: dark ? "#0B0B0B" : "#F4F2EE",
        color: sideText,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      {/* Top-bar mobile : burger + logo (collante). */}
      {isMobile && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 14px",
            background: sideBg,
            borderBottom: `1px solid ${sideLine}`,
          }}
        >
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Ouvrir le menu"
            style={{
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${sideLine}`,
              background: "transparent",
              color: sideText,
              borderRadius: 10,
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            ☰
          </button>
          <div
            style={{
              width: 26,
              height: 26,
              background: ACCENT,
              color: "#0B0B0B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 15,
              borderRadius: 7,
              flexShrink: 0,
            }}
          >
            A
          </div>
          <div style={{ ...mono, fontSize: 10.5, color: sideText, letterSpacing: "0.04em" }}>
            AMOUR STUDIOS · OPS
          </div>
        </header>
      )}

      {/* Fond cliquable derrière le drawer mobile. */}
      {isMobile && mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        />
      )}
```
(On vient d'ajouter top-bar + backdrop AVANT l'`<aside>`. L'`<aside>` existant suit.)

- [ ] **Step 3 : Transformer l'aside en rail (desktop) OU drawer (mobile)**

Repérer l'ouverture de l'`<aside>` (≈ ligne 169-184) :
```tsx
      <aside
        style={{
          width: W,
          flexShrink: 0,
          background: sideBg,
          color: sideText,
          borderRight: `1px solid ${sideLine}`,
          display: "flex",
          flexDirection: "column",
          transition: "width var(--dur-instant) var(--ease-spring)",
          position: "sticky",
          top: 0,
          height: "100vh",
          zIndex: 10,
        }}
      >
```
Remplacer par :
```tsx
      <aside
        style={{
          width: isMobile ? 248 : W,
          flexShrink: 0,
          background: sideBg,
          color: sideText,
          borderRight: `1px solid ${sideLine}`,
          display: "flex",
          flexDirection: "column",
          transition: isMobile
            ? "transform 0.25s var(--ease-spring)"
            : "width var(--dur-instant) var(--ease-spring)",
          position: isMobile ? "fixed" : "sticky",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: isMobile ? 50 : 10,
          transform: isMobile ? (mobileNavOpen ? "translateX(0)" : "translateX(-110%)") : undefined,
          boxShadow: isMobile && mobileNavOpen ? "0 0 40px rgba(0,0,0,0.4)" : undefined,
        }}
      >
```

- [ ] **Step 4 : Masquer le bouton collapse ‹/› sur mobile (inutile dans un drawer plein)**

Repérer le bouton de collapse (≈ ligne 372-387) :
```tsx
            <button
              onClick={() => setUserCollapsed((v) => !v)}
              style={{
                width: 28,
                height: 28,
                border: `1px solid ${sideLine}`,
                background: "transparent",
                color: sideMuted,
                cursor: "pointer",
                borderRadius: 8,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {collapsed ? "›" : "‹"}
            </button>
```
L'envelopper dans `{!isMobile && (...)}` :
```tsx
            {!isMobile && (
              <button
                onClick={() => setUserCollapsed((v) => !v)}
                style={{
                  width: 28,
                  height: 28,
                  border: `1px solid ${sideLine}`,
                  background: "transparent",
                  color: sideMuted,
                  cursor: "pointer",
                  borderRadius: 8,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {collapsed ? "›" : "‹"}
              </button>
            )}
```

- [ ] **Step 5 : Typecheck**

Run : `cd "SKOOL/amour-studios" && npx tsc --noEmit`
Expected : 0 erreur.

- [ ] **Step 6 : Vérif visuelle 375px**

```bash
$B goto http://localhost:3001/studio
$B screenshot /tmp/mobile-nav-closed.png      # top-bar ☰ visible, pas de rail
$B click "text=☰"                              # ou: $B snapshot -i puis clic sur le bouton
$B screenshot /tmp/mobile-nav-open.png         # drawer plein avec labels + backdrop
```
Expected : drawer fermé par défaut (contenu pleine largeur, juste la top-bar) ; à l'ouverture, nav complète avec labels + fond sombre ; un clic sur un lien navigue ET referme le drawer. Vérifier aussi en desktop (`$B viewport 1280 800 && $B goto .../studio`) que le rail 220/64px est intact, puis revenir à `$B viewport 375 812`.

- [ ] **Step 7 : Commit**

```bash
cd "SKOOL/amour-studios" && git add app/studio/layout.tsx && \
git commit -m "feat(studio mobile): navigation en menu burger/drawer sur mobile (rail desktop inchangé)"
```

---

## Task 2 : Dashboard « Aujourd'hui »

**Files:**
- Modify: `app/studio/page.tsx`

Le dashboard n'utilise PAS `useIsMobile` aujourd'hui. Points de rupture (lignes indicatives, à reconfirmer en lisant le fichier) : KPI `repeat(4, …)` (~L153), grille principale `1.55fr / 1fr` (~L161), relances/alertes `1fr 1fr` (~L213), grille semaine `repeat(5, 1fr)` (~L300), padding global `26` (~L131).

- [ ] **Step 1 : Importer et instancier `useIsMobile`**

Dans l'import depuis `./_components/glass`, ajouter `useIsMobile`. Dans le composant page (avant tout `return`), ajouter :
```tsx
const isMobile = useIsMobile();
```

- [ ] **Step 2 : KPI 4 colonnes → 1 colonne**

Repérer `gridTemplateColumns: "repeat(4, minmax(0,1fr))"` (KPI). Remplacer par :
```tsx
gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))",
```

- [ ] **Step 3 : Grille principale 2 colonnes → empilée**

Repérer `gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)"`. Remplacer par :
```tsx
gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)",
```

- [ ] **Step 4 : Relances / Alertes 2 colonnes → empilées**

Repérer la grille `gridTemplateColumns: "1fr 1fr"` du bloc relances/alertes. Remplacer par :
```tsx
gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
```

- [ ] **Step 5 : Grille « Semaine » 5 colonnes → scroll horizontal contenu**

Repérer `gridTemplateColumns: "repeat(5, 1fr)"`. Les 5 jours sont illisibles à 375px. On garde les 5 colonnes mais on permet un scroll horizontal interne en leur donnant une largeur mini. Envelopper la grille semaine dans un conteneur scrollable OU appliquer sur la grille :
```tsx
// sur la grille semaine :
gridTemplateColumns: "repeat(5, 1fr)",
minWidth: isMobile ? 440 : undefined,
// et sur son parent direct, ajouter :
overflowX: isMobile ? "auto" : undefined,
```
(Si la grille n'a pas de parent dédié, l'entourer d'un `<div style={{ overflowX: isMobile ? "auto" : undefined, margin: isMobile ? "0 -6px" : undefined }}>…</div>`.)

- [ ] **Step 6 : Padding global mobile**

Repérer le `padding: 26` du conteneur de page. Remplacer par :
```tsx
padding: isMobile ? 14 : 26,
```
Faire de même pour le hero si son padding est `"28px 32px"` → `isMobile ? "20px 16px" : "28px 32px"`.

- [ ] **Step 7 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio
$B screenshot /tmp/mobile-dashboard.png
```
Expected : KPI empilés 1 par ligne, blocs principaux empilés, relances/alertes empilées, semaine scrollable sans casser la page, aucun débordement horizontal de la page entière. Tester clair + sombre (toggle thème dans le drawer).

- [ ] **Step 8 : Commit**

```bash
git add app/studio/page.tsx && \
git commit -m "feat(studio mobile): dashboard Aujourd'hui responsive (KPI/blocs/semaine empilés)"
```

---

## Task 3 : Liste élèves — tableau → cartes

**Files:**
- Modify: `app/studio/eleves/page.tsx`

Tableau 8 colonnes `COLS = "minmax(200px, 1.3fr) 110px 110px 1fr 140px 130px 100px 40px"` (~L124) : Élève, Offre, Paiement, Étape, Prochain RDV, Téléphone, Dernière act., chevron. Min ~820px → déborde. La page a déjà un état de tri (`sortDir`) et une barre de filtres.

- [ ] **Step 1 : Importer `useIsMobile`**

Ajouter `useIsMobile` à l'import `glass`. Dans le composant, avant tout `return` : `const isMobile = useIsMobile();`.

- [ ] **Step 2 : Définir le style de carte (en haut du composant, après `const c = ...`)**
```tsx
const cardStyle = {
  display: "flex", flexDirection: "column" as const, gap: 8,
  padding: 14, borderRadius: 14,
  background: c.chip, border: `1px solid ${c.line}`,
  width: "100%", fontFamily: "inherit", color: c.text, cursor: "pointer", textAlign: "left" as const,
};
```

- [ ] **Step 3 : Brancher le rendu mobile (cartes) à la place du tableau**

Repérer le bloc qui rend l'en-tête de colonnes + la liste des lignes (la grille `COLS`). L'envelopper dans `{isMobile ? (<cartes/>) : (<tableau existant/>)}`. Le rendu cartes (garder l'`onClick` de navigation déjà utilisé par la ligne desktop — typiquement `router.push(`/studio/eleves/${row._id}`)`) :
```tsx
{isMobile ? (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {/* `rows` = la même liste filtrée/triée que le tableau desktop */}
    {rows.map((s) => (
      <button key={s._id} onClick={() => router.push(`/studio/eleves/${s._id}`)} style={cardStyle}>
        {/* Identité */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={s.discordUsername || s.name || "?"} size={34} dark={dark} image={s.image} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.discordUsername || s.name || "—"}
            </div>
            <div style={{ ...mono, fontSize: 10, color: c.muted }}>
              {s.tier === "coaching" ? "Coaching" : "Communauté"}
            </div>
          </div>
        </div>
        {/* Infos clés en chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {/* Étape onboarding */}
          {s.stageLabel && (
            <span style={{ ...mono, fontSize: 10, padding: "3px 8px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}`, color: c.muted }}>{s.stageLabel}</span>
          )}
          {/* Prochain RDV */}
          {s.nextRdvLabel && (
            <span style={{ ...mono, fontSize: 10, padding: "3px 8px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}`, color: c.muted }}>📅 {s.nextRdvLabel}</span>
          )}
          {/* Statut paiement */}
          {s.paymentLabel && (
            <span style={{ ...mono, fontSize: 10, padding: "3px 8px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}`, color: c.muted }}>{s.paymentLabel}</span>
          )}
        </div>
      </button>
    ))}
  </div>
) : (
  /* === rendu tableau desktop existant, inchangé (en-tête COLS + lignes) === */
)}
```
NOTE pour l'implémenteur : adapter les noms de champs (`s.discordUsername`, `s.tier`, `s.stageLabel`, `s.nextRdvLabel`, `s.paymentLabel`, `s.image`) à ceux RÉELLEMENT présents sur les lignes (les lire dans le rendu desktop existant et réutiliser exactement les mêmes accessions/labels). Importer `Avatar` depuis `glass` s'il ne l'est pas déjà. Ne PAS dupliquer la logique de filtre/tri : réutiliser la même variable de liste que le tableau.

- [ ] **Step 4 : Barre de filtres — autoriser le wrap propre sur mobile**

Sur le conteneur de la barre de filtres (Segmented + selects + recherche), s'assurer de `flexWrap: "wrap"` et donner à l'input de recherche `flex: isMobile ? "1 1 100%" : undefined` pour qu'il prenne toute la largeur sur mobile.

- [ ] **Step 5 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/eleves
$B screenshot /tmp/mobile-eleves.png
```
Expected : liste en cartes empilées, chaque carte cliquable → fiche élève, filtres lisibles, aucun débordement horizontal. Clair + sombre.

- [ ] **Step 6 : Commit**

```bash
git add app/studio/eleves/page.tsx && \
git commit -m "feat(studio mobile): liste élèves en cartes empilées sur mobile"
```

---

## Task 4 : Fiche élève — grilles internes + actions RDV

**Files:**
- Modify: `app/studio/eleves/[id]/page.tsx`
- Modify: `app/studio/eleves/[id]/_components/fiche-onboarding.tsx`

La grille principale 2 colonnes utilise DÉJÀ `isMobile` (~L927) — ne pas y toucher. Restent des grilles internes `1fr 1fr` non responsive : bloc Paiement (~L724), bloc Discord (~L757), coordonnées onboarding (`fiche-onboarding.tsx` ~L181), et les actions du RDV à venir qui se chevauchent.

- [ ] **Step 1 : Bloc Paiement — grille 2 col → 1 col**

Dans `[id]/page.tsx`, repérer la grille du bloc Paiement `gridTemplateColumns: "1fr 1fr"` (~L724). `isMobile` est déjà disponible dans ce fichier. Remplacer par :
```tsx
gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
```

- [ ] **Step 2 : Bloc Discord — grille 2 col → 1 col**

Même fichier, grille du bloc Discord `gridTemplateColumns: "1fr 1fr"` (~L757) → `isMobile ? "1fr" : "1fr 1fr"`.

- [ ] **Step 3 : Actions du RDV à venir — empiler sur mobile**

Repérer la grille `gridTemplateColumns: "auto 1fr auto"` du RDV mis en avant (~L530) et la rangée de boutons d'action en flex (reprogrammer/annuler/no-show/éditer/supprimer). Sur mobile : passer la grille à `isMobile ? "1fr" : "auto 1fr auto"` et garantir `flexWrap: "wrap"` + `gap` suffisant sur la rangée d'actions pour qu'elle s'empile sans déborder. Vérifier que `marginLeft: "auto"` éventuel devient `marginLeft: isMobile ? 0 : "auto"`.

- [ ] **Step 4 : Coordonnées onboarding — grille 2 col → 1 col**

Dans `fiche-onboarding.tsx`, ce composant n'a pas `isMobile`. L'ajouter : importer `useIsMobile` depuis `../../../_components/glass`, et en haut de `OnboardingBlock` (avant le `return`) : `const isMobile = useIsMobile();`. Repérer (~L180-183) :
```tsx
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
```
Remplacer la ligne `gridTemplateColumns` par :
```tsx
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
```

- [ ] **Step 5 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/eleves      # ouvrir une fiche via une carte
$B screenshot /tmp/mobile-fiche.png
```
Expected : tous les champs (paiement, discord, coordonnées) empilés en 1 colonne, actions RDV empilées sans chevauchement, hero lisible. Clair + sombre.

- [ ] **Step 6 : Commit**

```bash
git add "app/studio/eleves/[id]/page.tsx" "app/studio/eleves/[id]/_components/fiche-onboarding.tsx" && \
git commit -m "feat(studio mobile): fiche élève — grilles internes et actions RDV empilées"
```

---

## Task 5 : Calendrier — vue jour par défaut sur mobile

**Files:**
- Modify: `app/studio/calendrier/page.tsx`

Le calendrier utilise déjà `isMobile` (grille latérale + `minWidth: 700` qui force un scroll horizontal sur la semaine). La vue SEMAINE (7 col) et MOIS (7 col) sont illisibles à 375px. Décision : sur mobile, démarrer en vue JOUR (1 colonne pleine largeur, déjà correcte) et garder le scroll horizontal en secours pour semaine/mois.

- [ ] **Step 1 : Forcer la vue jour à l'init sur mobile**

Repérer l'état de vue (`const [view, setView] = useState<...>("week")` ou similaire). Initialiser selon le device au montage, sans casser le SSR. Ajouter, après l'init de `isMobile` et de `view`, un effet one-shot :
```tsx
const didInitView = useRef(false);
useEffect(() => {
  if (didInitView.current) return;
  didInitView.current = true;
  if (isMobile) setView("day");
}, [isMobile]);
```
(`useRef`/`useEffect` à importer si besoin.) Cela bascule en vue jour au premier rendu mobile sans empêcher l'utilisateur de choisir semaine/mois ensuite (le scroll horizontal existant reste le filet).

- [ ] **Step 2 : Vue mois — réduire le bruit sur mobile**

Si la grille mois `repeat(7, 1fr)` est conservée, réduire le padding/typo des cellules sur mobile pour limiter la casse : repérer le style des cellules de la grille mois et appliquer `padding: isMobile ? 4 : <desktop>` et `fontSize: isMobile ? 10 : <desktop>` sur le contenu des cellules. (Le clic sur une cellule bascule déjà en vue jour — comportement existant à conserver.)

- [ ] **Step 3 : Sélecteur de vues + en-tête — wrap**

S'assurer que la rangée des contrôles (jour/semaine/mois + navigation de période) a `flexWrap: "wrap"` pour ne pas déborder à 375px.

- [ ] **Step 4 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/calendrier
$B screenshot /tmp/mobile-calendrier-day.png
```
Expected : au chargement mobile, vue JOUR pleine largeur lisible ; bascule semaine/mois possible (scroll horizontal toléré) ; sidebar RDV empilée sous la grille. Clair + sombre.

- [ ] **Step 5 : Commit**

```bash
git add app/studio/calendrier/page.tsx && \
git commit -m "feat(studio mobile): calendrier en vue jour par défaut sur mobile + contrôles qui wrappent"
```

---

## Task 6 : Paiements — KPI + graphe + table → cartes

**Files:**
- Modify: `app/studio/paiements/page.tsx`

Points de rupture : KPI `repeat(4, minmax(0,1fr))`, grille graphe+répartition `minmax(0,1.6fr) minmax(0,1fr)`, table abonnements 6 col `COLS = "minmax(200px, 1.3fr) 140px 100px 120px 130px 130px"`, et un AreaChart SVG à largeur codée en dur (`W = 720`).

- [ ] **Step 1 : Importer `useIsMobile`** (ajouter à l'import `glass`, instancier avant tout `return`).

- [ ] **Step 2 : KPI 4 col → 1 col**
```tsx
gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))",
```

- [ ] **Step 3 : Grille graphe + répartition → empilée**
```tsx
gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.6fr) minmax(0,1fr)",
```

- [ ] **Step 4 : AreaChart SVG responsive**

Repérer le SVG MRR à largeur fixe (`width={720}` / `viewBox="0 0 720 …"`). Le rendre fluide : mettre `width="100%"` + conserver le `viewBox` d'origine + `preserveAspectRatio="none"` (ou `xMidYMid meet` selon le rendu voulu) et `style={{ display: "block", width: "100%", height: "auto" }}`. Le `viewBox` interne reste 720 de large (coordonnées inchangées) ; seul l'affichage se met à l'échelle du conteneur. Ne PAS recalculer les points.

- [ ] **Step 5 : Table abonnements → cartes (Pattern 2)**

Définir `cardStyle` (cf. Conventions), envelopper le tableau dans `{isMobile ? (<cartes/>) : (<table existant/>)}`. Chaque carte : nom de l'abonné (identité) + chips {tier, statut, montant, prochaine échéance}. Réutiliser les mêmes champs/labels que les colonnes du tableau desktop, et le même `onClick` de ligne s'il existe (sinon, carte non cliquable).

- [ ] **Step 6 : Padding mobile** du conteneur de page → `isMobile ? 14 : <desktop>`.

- [ ] **Step 7 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/paiements
$B screenshot /tmp/mobile-paiements.png
```
Expected : KPI empilés, graphe MRR à la largeur de l'écran (pas coupé), répartition sous le graphe, abonnements en cartes. Clair + sombre.

- [ ] **Step 8 : Commit**

```bash
git add app/studio/paiements/page.tsx && \
git commit -m "feat(studio mobile): paiements — KPI/graphe responsive + abonnements en cartes"
```

---

## Task 7 : Tickets — table → cartes

**Files:**
- Modify: `app/studio/tickets/page.tsx`

Deux sections (Ouverts / Fermés), chacune un tableau 4 col `gridTemplateColumns: "minmax(180px, 1.4fr) 120px minmax(160px, 1fr) 150px"` (min ~610px → déborde).

- [ ] **Step 1 : Importer `useIsMobile`** (ajouter à l'import `glass`, instancier avant tout `return`).

- [ ] **Step 2 : Les deux tableaux → cartes (Pattern 2)**

Définir `cardStyle` (cf. Conventions). Pour CHAQUE section (Ouverts, Fermés), envelopper le rendu tableau dans `{isMobile ? (<cartes/>) : (<table existant/>)}`. Carte : sujet/élève (identité) + chips {statut, date, dernière réponse}. Réutiliser le `onClick` de ligne existant (ouverture du ticket).

- [ ] **Step 3 : Padding mobile** → `isMobile ? 14 : <desktop>`.

- [ ] **Step 4 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/tickets
$B screenshot /tmp/mobile-tickets.png
```
Expected : tickets en cartes empilées, sections Ouverts/Fermés lisibles, aucun débordement. Clair + sombre.

- [ ] **Step 5 : Commit**

```bash
git add app/studio/tickets/page.tsx && \
git commit -m "feat(studio mobile): tickets en cartes empilées sur mobile"
```

---

## Task 8 : Campagnes — 2 col → 1 col + historique → cartes + dialog

**Files:**
- Modify: `app/studio/campagnes/page.tsx`

Grille principale 2 col `minmax(0,1fr) minmax(0,1.15fr)` (segments / composer), historique table 5 col `"110px minmax(0,1.4fr) minmax(0,2fr) 90px 140px"`, dialog `maxWidth: 420`, inputs `flex: "1 1 240px"`.

- [ ] **Step 1 : Importer `useIsMobile`** (ajouter à l'import `glass`, instancier avant tout `return`).

- [ ] **Step 2 : Grille principale → empilée**
```tsx
gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.15fr)",
```

- [ ] **Step 3 : Inputs trop larges**

Pour les inputs `flex: "1 1 240px"`, passer la base à `isMobile ? "1 1 100%" : "1 1 240px"` afin qu'ils prennent la pleine largeur sans déborder à 360px.

- [ ] **Step 4 : Historique → cartes (Pattern 2)**

Définir `cardStyle`, envelopper le tableau historique dans `{isMobile ? (<cartes/>) : (<table existant/>)}`. Carte : nom de campagne (identité) + chips {date, segment, taille, statut}. Réutiliser les champs des colonnes desktop.

- [ ] **Step 5 : Dialog de confirmation — largeur mobile**

Repérer `maxWidth: 420` du dialog. Remplacer par `maxWidth: "min(420px, calc(100vw - 32px))"` pour éviter le débordement sur iPhone SE.

- [ ] **Step 6 : Padding mobile** → `isMobile ? 14 : <desktop>`.

- [ ] **Step 7 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/campagnes
$B screenshot /tmp/mobile-campagnes.png
```
Expected : segments puis composer empilés, inputs pleine largeur, historique en cartes, dialog confiné dans l'écran. Clair + sombre. (Le canal WhatsApp peut être masqué — ne pas s'en inquiéter.)

- [ ] **Step 8 : Commit**

```bash
git add app/studio/campagnes/page.tsx && \
git commit -m "feat(studio mobile): campagnes — 1 colonne, historique en cartes, dialog confiné"
```

---

## Task 9 : Lier — formulaire mobile

**Files:**
- Modify: `app/studio/lier/page.tsx`

Input de recherche `flex: "1 1 240px"` (déborde <360px), padding `"32px 28px 64px"`, lignes de résultat en flex wrap.

- [ ] **Step 1 : Importer `useIsMobile`** (ajouter à l'import `glass`, instancier avant tout `return`).

- [ ] **Step 2 : Input recherche pleine largeur sur mobile**

`flex: isMobile ? "1 1 100%" : "1 1 240px"` sur l'input email. S'assurer que le bouton « Chercher » passe en dessous (le conteneur a `flexWrap: "wrap"`).

- [ ] **Step 3 : Padding mobile**

`padding: isMobile ? "20px 16px 48px" : "32px 28px 64px"` sur le conteneur de page.

- [ ] **Step 4 : Lignes de résultat**

Vérifier que chaque ligne (email + chip statut + bouton Lier) a `flexWrap: "wrap"` + `gap` ; sur mobile, le bouton Lier peut passer sous l'email — acceptable.

- [ ] **Step 5 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/lier
$B screenshot /tmp/mobile-lier.png
```
Expected : formulaire pleine largeur, input non débordant, résultats lisibles. Clair + sombre.

- [ ] **Step 6 : Commit**

```bash
git add app/studio/lier/page.tsx && \
git commit -m "feat(studio mobile): page Lier — input pleine largeur + padding mobile"
```

---

## Task 10 : Transcripts — polish

**Files:**
- Modify: `app/studio/transcripts/page.tsx`

Déjà ~80% responsive (cartes orphelins utilisent `isMobile`). `useIsMobile` est importé mais peu/pas utilisé pour le padding.

- [ ] **Step 1 : Padding mobile**

Si le conteneur de page a un padding fixe (≈ 26/28), le passer en `isMobile ? 14 : <desktop>`.

- [ ] **Step 2 : Chips participants — wrap propre**

Sur le conteneur des chips de participants, garantir `flexWrap: "wrap"` + `gap` pour éviter tout débordement <360px.

- [ ] **Step 3 : Typecheck + vérif visuelle**

Run : `npx tsc --noEmit` (0 erreur).
```bash
$B goto http://localhost:3001/studio/transcripts
$B screenshot /tmp/mobile-transcripts.png
```
Expected : cartes orphelins pleine largeur, boutons Rattacher/Ignorer empilés, chips qui wrappent. Clair + sombre.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/transcripts/page.tsx && \
git commit -m "feat(studio mobile): transcripts — padding mobile + chips qui wrappent"
```

---

## Task 11 : QA visuelle complète 375px (clair + sombre)

**Files:** aucun (vérification ; corrections inline si défaut).

- [ ] **Step 1 : Balayage de toutes les pages, thème clair**
```bash
$B viewport 375 812
for p in "" eleves calendrier paiements tickets lier campagnes transcripts; do \
  $B goto "http://localhost:3001/studio/$p"; \
  $B eval "Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0)"; \
  $B screenshot "/tmp/mobile-after-${p:-home}.png"; done
```
Expected : pour CHAQUE page, le débordement horizontal (`scrollWidth - clientWidth`) doit être 0 (ou ≤1). Tout écart > quelques px = grille/élément à corriger sur la page concernée (revenir à sa tâche, appliquer Pattern 1/2). Ouvrir au moins une fiche élève depuis une carte.

- [ ] **Step 2 : Balayage thème sombre**

Ouvrir le drawer, basculer en sombre, refaire le balayage. Vérifier qu'aucun texte ne disparaît (pas de `var(--white)`/`var(--ink)` sur surface noire) et qu'aucun débordement n'apparaît.

- [ ] **Step 3 : Vérif non-régression desktop**
```bash
$B viewport 1280 800
for p in "" eleves calendrier paiements tickets lier campagnes transcripts; do \
  $B goto "http://localhost:3001/studio/$p"; $B screenshot "/tmp/desktop-after-${p:-home}.png"; done
```
Expected : rail de nav 220/64px intact, tableaux en mode tableau (pas cartes), grilles multi-colonnes inchangées. Comparer aux captures « before » de la Task 0 (le desktop ne doit pas avoir bougé).

- [ ] **Step 4 : Console sans erreur**
```bash
$B viewport 375 812 && $B goto http://localhost:3001/studio && $B console
```
Expected : pas d'erreur React (#310 hooks, clés manquantes…).

- [ ] **Step 5 : Corriger les défauts trouvés + commit**

Pour chaque défaut : appliquer le Pattern adéquat, `npx tsc --noEmit`, re-vérifier la page, puis :
```bash
git add -A && git commit -m "fix(studio mobile): corrections QA 375px (<page(s) concernée(s)>)"
```

---

## Task 12 : Déploiement

**Files:** aucun (build + deploy).

- [ ] **Step 1 : Build de production local**

Run : `cd "SKOOL/amour-studios" && npx tsc --noEmit && npm run build`
Expected : typecheck 0 erreur, build Next.js réussi (pas d'erreur de prerendering).

- [ ] **Step 2 : Merge de la branche**

Run :
```bash
cd "SKOOL/amour-studios" && git checkout main && git merge --no-ff feat/studio-mobile -m "feat(studio): optimisation mobile complète du back-office (nav burger + cartes + grilles empilées)"
```
(Si le repo n'utilise pas `main` comme défaut, utiliser la branche par défaut réelle.)

- [ ] **Step 3 : Déployer l'app (Vercel)**

Run :
```bash
npx vercel --prod --yes
```
Puis promouvoir l'URL retournée :
```bash
npx vercel promote <url-retournée> --yes
```
Expected : déploiement OK. Un `409 "already the current production deployment"` au promote = succès (pattern connu de ce projet). PAS de déploiement Convex nécessaire (aucune fonction backend touchée).

- [ ] **Step 4 : Vérif post-déploiement sur le domaine public**
```bash
$B viewport 375 812 && $B goto https://amour-studios.vercel.app/studio && $B screenshot /tmp/mobile-prod.png
```
Expected : nav burger + dashboard responsive en prod. Login admin si nécessaire.

---

## Self-Review (rempli par l'auteur du plan)

**Couverture spec :** Les 3 décisions utilisateur sont couvertes — (1) périmètre « tout le back-office » → Tasks 1–10 couvrent les 10 pages (login exclu, il n'a pas de chrome) ; (2) « cartes empilées » pour les tableaux → Pattern 2 appliqué à élèves (T3), paiements (T6), tickets (T7), campagnes/historique (T8) ; (3) « menu burger » → Task 1. Grilles non-tabulaires empilées via Pattern 1 (dashboard T2, fiche T4, paiements/campagnes). Calendrier T5. QA + déploiement T11–T12.

**Placeholders :** aucun « TODO/TBD ». Les `<desktop>` dans les snippets désignent explicitement « la valeur d'origine déjà présente à cette ligne » (conservation du desktop), pas un trou à inventer.

**Cohérence des noms :** `cardStyle` (style de carte), `useIsMobile` (hook existant), Pattern 1 / Pattern 2 référencés uniformément. Les noms de champs des cartes (T3/T6/T7/T8) sont marqués « à confirmer en lisant le rendu desktop » car ils dépendent des données réelles de chaque page — l'implémenteur les lit dans le tableau desktop et réutilise exactement les mêmes accès.

**Réserve assumée :** pour les tableaux→cartes, les champs exacts ne sont pas pré-listés ligne par ligne (ils varient par page et doivent matcher le rendu desktop). Chaque tâche tableau impose : lire le tableau desktop, réutiliser ses accès/labels/onClick. C'est volontaire pour éviter d'inventer des champs erronés.
