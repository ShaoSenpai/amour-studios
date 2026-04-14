# Formation Page Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplifier `ModuleRow` + `LessonLine` dans `app/dashboard/page.tsx` pour gagner en lisibilité, en mixant la clarté de l'ancienne version avec l'identité DS actuelle (stripe + serif italic + mono + badges sémantiques).

**Architecture:** Pur refactor visuel d'un seul fichier (`app/dashboard/page.tsx`). Aucun nouveau composant, aucun changement de data-flow, aucun changement de types. On retire du bruit visuel (wash de fond, XXL, pill dupliquée, barre progression en bas) et on restructure l'intérieur des rows leçons (pastille numérotée + titre + méta à droite + badge statut).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Convex (read-only ici), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-14-formation-page-readability-design.md`

---

## File Structure

Un seul fichier touché :

- **Modify** : `app/dashboard/page.tsx`
  - `ModuleRowView` (lignes ~495-732) : header simplifié (pas de wash, pas de barre de progression en bas, numéro plus sobre, compteur leçons à droite au lieu de pill+compteur)
  - `LessonLine` (lignes ~802-989) : structure restructurée (pastille claire + titre + méta à droite, suppression de l'indicateur "VIDÉO VUE" / "INACCESSIBLE" / "BIENTÔT" multiples → un seul StatusBadge à droite)

Aucune modification de :
- `components/ds/*` (déjà corrects)
- Convex queries
- Types / dataModel

---

## Task 1 : Simplifier le header de module (ModuleRowView)

**Files:**
- Modify: `app/dashboard/page.tsx:553-680` (fonction `ModuleRowView`, la partie `return` jusqu'à fin barre progression)

**But :** Retirer le wash de fond, la barre de progression en bas, réduire le numéro serif, remplacer le bloc `StatusBadge + CountChip` par un simple compteur `4/6 ✓`.

- [ ] **Step 1 : Modifier le container du module**

Dans `app/dashboard/page.tsx`, remplacer le `<div id={...} className="group/module relative overflow-hidden...">` (ligne ~554-562) par :

```tsx
    <div
      id={`module-${modId}`}
      className="group/module relative border border-foreground/10 transition-colors duration-300 hover:border-foreground/25"
      style={{
        opacity: locked ? 0.55 : 1,
        boxShadow: `inset 4px 0 0 0 ${locked ? "rgba(240,233,219,0.15)" : accent}`,
      }}
    >
```

Changements : retire `overflow-hidden`, `bg-foreground/[0.02]`, `hover:bg-foreground/[0.045]`, réduit stripe à 4px, transition en 300ms simple.

- [ ] **Step 2 : Simplifier le bouton header (padding + grid)**

Remplacer le `<button type="button" onClick={...}>` (ligne ~563-580) par :

```tsx
      <button
        type="button"
        onClick={() => {
          if (locked) {
            if (previewMode) onLockedClick();
            return;
          }
          setExpanded(!expanded);
        }}
        className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-5 px-5 py-5 pl-7 text-left md:px-8 md:pl-10 ${
          locked
            ? previewMode
              ? "cursor-pointer"
              : "cursor-not-allowed"
            : "cursor-pointer"
        }`}
        style={{ minHeight: 0 }}
      >
```

Changements : padding réduit (plus aéré mais pas surdimensionné), suppression du hover `pl-9/pl-16` (on garde l'identité sobre).

- [ ] **Step 3 : Réduire le numéro module**

Remplacer le bloc numéro (ligne ~583-591) par :

```tsx
        <div
          className="text-[28px] italic leading-none tracking-tight md:text-[34px]"
          style={{
            fontFamily: "var(--font-serif)",
            color: locked ? "rgba(240,233,219,0.35)" : accent,
          }}
        >
          {String(order + 1).padStart(2, "0")}
        </div>
```

Changements : passe de `text-3xl md:text-4xl` à `text-[28px] md:text-[34px]` pour être aligné baseline avec le titre.

- [ ] **Step 4 : Réduire le titre module**

Remplacer le `<h3>` (ligne ~595-600) par :

```tsx
          <h3
            className="text-[clamp(20px,2.8vw,28px)] font-normal leading-[1.1] tracking-[-0.5px] text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h3>
```

Changements : taille réduite de `clamp(22px,3.5vw,38px)` à `clamp(20px,2.8vw,28px)`, leading un peu plus large pour respirer.

- [ ] **Step 5 : Remplacer StatusBadge + CountChip par un compteur simple**

Remplacer tout le bloc `<div className="flex shrink-0 items-center gap-3 md:gap-4">` (ligne ~612-659) par :

```tsx
        <div className="flex shrink-0 items-center gap-4">
          {/* Compteur leçons — avec check vert si complet */}
          <div
            className="hidden items-center gap-2 font-mono text-[11px] tracking-[1px] md:flex"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <span style={{ color: state === "completed" ? STATE_COLOR.done : "var(--foreground)" }}>
              {String(completed).padStart(2, "0")}
            </span>
            <span className="opacity-40">/</span>
            <span className="opacity-60">{String(total).padStart(2, "0")}</span>
            {state === "completed" && (
              <Check size={14} style={{ color: STATE_COLOR.done }} />
            )}
          </div>

          {/* Chevron / cadenas — petit et discret */}
          <div
            className="flex size-8 items-center justify-center border transition-transform duration-300"
            style={{
              borderColor: locked
                ? "rgba(240,233,219,0.2)"
                : "rgba(240,233,219,0.25)",
              color: locked ? "rgba(240,233,219,0.4)" : "var(--foreground)",
              transform: expanded && !locked ? "rotate(180deg)" : "rotate(0)",
            }}
            aria-hidden
          >
            {locked ? <Lock size={13} /> : <ChevronDown size={14} />}
          </div>
        </div>
```

Changements : retire `StatusBadge` + `CountChip` + `Trophy` animé. Garde juste `4/6` (avec `✓` vert si complet) + chevron/lock sobre 32px.

- [ ] **Step 6 : Retirer la barre de progression en bas**

Supprimer entièrement le bloc (ligne ~662-679) :

```tsx
      {/* Progress bar — fine ligne en bas du row, seulement si en cours */}
      {!locked && state === "in-progress" && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground/[0.06]">
          <div
            className="h-full transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
            style={{
              width: `${percent}%`,
              background: accent,
            }}
          />
        </div>
      )}
      {!locked && state === "completed" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: accent }}
        />
      )}
```

Suppression totale. La lisibilité vient du compteur `4/6` + stripe latérale.

- [ ] **Step 7 : Vérification visuelle**

Lancer le dev server si pas déjà lancé :

```bash
npm run dev
```

Ouvrir `http://localhost:3000/dashboard` (connecté en VIP).
Attendu :
- Stripe colorée à gauche visible
- Numéro module `01`, `02`, etc. en serif italic taille raisonnable (pas XXL)
- Titre + description à côté
- Compteur `4/6` à droite + chevron discret
- Pas de barre de progression horizontale en bas de la card
- Pas de fond lavé (`wash`) coloré
- Click ouvre/ferme le module normalement

- [ ] **Step 8 : Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): simplifier le header de module

- retire wash de fond + barre de progression en bas
- numéro serif recalibré (28-34px au lieu de clamp XXL)
- compteur leçons (4/6 ✓) remplace StatusBadge+CountChip
- chevron/lock sobre 32px

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 : Restructurer LessonLine (pastille + méta + badge unique)

**Files:**
- Modify: `app/dashboard/page.tsx:802-989` (fonction `LessonLine`)

**But :** Passer d'une ligne à 4 éléments (numéro carré + titre serif + 3-4 pills empilées + XP + durée + flèche) à une ligne à 4 éléments plus clairs (pastille ronde colorée + titre + méta discrète + 1 seul badge sémantique à droite).

- [ ] **Step 1 : Remplacer la pastille carrée par une pastille ronde colorée**

Dans `LessonLine` (fonction commence ligne ~802), remplacer la logique couleurs (ligne ~826-842) et le bloc `<div className="flex size-8 ...">` (ligne ~860-878) par :

```tsx
  // ─── Pastille sémantique ───────────────────────────────
  const pillBg = completed
    ? STATE_COLOR.done
    : videoSeen
    ? STATE_COLOR.active
    : "transparent";
  const pillBorder = completed || videoSeen
    ? "transparent"
    : unlocked
    ? "rgba(240,233,219,0.3)"
    : "rgba(240,233,219,0.15)";
  const pillColor = completed || videoSeen
    ? "#0D0B08"
    : unlocked
    ? "rgba(240,233,219,0.8)"
    : STATE_COLOR.locked;
```

Puis remplacer le rendu du numéro (ligne ~860-878) par :

```tsx
      <div
        className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold"
        style={{
          background: pillBg,
          borderColor: pillBorder,
          color: pillColor,
          fontFamily: "var(--font-body)",
        }}
      >
        {completed ? (
          <Check size={11} />
        ) : !unlocked ? (
          <Lock size={10} />
        ) : (
          String(order + 1).padStart(2, "0")
        )}
      </div>
```

Changements : carré → rond (`rounded-full`), size-8 → size-6 (plus discret), retire l'icône `PlayCircle` (status "videoSeen" sera signalé par la couleur orange du fond).

- [ ] **Step 2 : Simplifier le titre**

Remplacer le bloc titre (ligne ~881-892) par :

```tsx
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-normal leading-snug"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "16px",
            color: completed
              ? "rgba(240,233,219,0.8)"
              : unlocked
              ? "var(--foreground)"
              : "rgba(240,233,219,0.45)",
          }}
        >
          {title}
        </div>
```

Changements : taille passe de 17px à 16px, retire le `line-through` sur completed (le check vert dans la pastille + badge FAIT suffisent), retire les transitions de couleur.

- [ ] **Step 3 : Simplifier la méta (durée · XP uniquement)**

Remplacer le bloc `<div className="mt-1 flex items-center gap-2 font-mono text-[9.5px]...">` (ligne ~893-967) et tout ce qu'il contient par :

```tsx
        <div
          className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {duration > 0 && <span>{Math.floor(duration / 60)} min</span>}
          {duration > 0 && <span className="opacity-30">·</span>}
          <span
            className="font-bold"
            style={{ color: completed ? STATE_COLOR.done : "rgba(240,233,219,0.55)" }}
          >
            {completed ? "+" : ""}
            {xpReward} XP
          </span>
        </div>
      </div>
```

Changements : suppression de tous les pills de statut inline (FAIT/VIDÉO VUE/INACCESSIBLE/BIENTÔT/À FAIRE). Garde juste `durée · XP`. Le statut est désormais le badge à droite (step suivant).

- [ ] **Step 4 : Ajouter un StatusBadge unique à droite**

Remplacer le bloc flèche `{unlocked && (<span className="text-xl italic ...">→</span>)}` (ligne ~970-977) par :

```tsx
      <div className="shrink-0">
        {completed ? (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
            style={{ background: STATE_COLOR.done, color: "#0D0B08", fontFamily: "var(--font-body)" }}
          >
            ✓ FAIT
          </span>
        ) : videoSeen ? (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
            style={{ background: STATE_COLOR.active, color: "#0D0B08", fontFamily: "var(--font-body)" }}
          >
            ● ACTIF
          </span>
        ) : !unlocked ? (
          <span
            className="font-mono text-[10px] uppercase tracking-[1.5px] px-2 py-1 border border-dashed"
            style={{ color: STATE_COLOR.locked, borderColor: "rgba(240,233,219,0.25)", fontFamily: "var(--font-body)" }}
          >
            🔒 BLOQUÉ
          </span>
        ) : placeholder ? (
          <span
            className="font-mono text-[10px] uppercase tracking-[1.5px] px-2 py-1 border"
            style={{ color: STATE_COLOR.pending, borderColor: "rgba(240,233,219,0.25)", fontFamily: "var(--font-body)" }}
          >
            BIENTÔT
          </span>
        ) : (
          <span
            className="text-lg italic text-foreground/25 group-hover/lesson:text-foreground/60 transition-colors"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            →
          </span>
        )}
      </div>
```

Changements : un seul élément à droite selon l'état. Flèche serif uniquement pour une leçon "à faire, dispo" (pas de badge redondant). Icônes emoji 🔒 pour le bloqué (plus lisible qu'un pill textuel).

- [ ] **Step 5 : Ajuster le container de la ligne**

Remplacer le `<div className={...group/lesson flex items-center gap-4 py-3.5 pl-1 pr-2...}>` (ligne ~853-859) par :

```tsx
    <div
      className={`group/lesson flex items-center gap-4 py-3 px-2 transition-colors duration-200 ${
        unlocked
          ? "hover:bg-foreground/[0.03]"
          : "cursor-not-allowed"
      }`}
    >
```

Changements : padding vertical réduit à 12px (`py-3`), retire le `hover:pl-3` (plus sobre), transition simple 200ms sur background.

- [ ] **Step 6 : Vérification visuelle**

Recharger `http://localhost:3000/dashboard`. Ouvrir un module.
Attendu :
- Chaque ligne leçon contient : pastille ronde (vert si fait / orange si actif / outline si à venir / cadenas si bloqué) + numéro, titre serif 16px, méta `12 min · 50 XP`, puis badge à droite (`✓ FAIT` vert / `● ACTIF` orange / `🔒 BLOQUÉ` / flèche `→`)
- Pas de pill multiples empilées
- Hover : fond subtil uniquement, pas de shift d'indentation
- Lignes séparées par `divide-y` (conservé du parent)

- [ ] **Step 7 : Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): restructurer LessonLine pour la lisibilité

- pastille ronde 24px (vert/orange/outline/cadenas) au lieu de carré 32px
- titre serif 16px sans line-through sur completed
- méta réduite à durée · XP (XP en vert si gagné)
- 1 seul badge sémantique à droite (FAIT/ACTIF/BLOQUÉ) ou flèche serif
- hover sobre (background uniquement, pas de shift)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 : Nettoyer les composants devenus inutilisés

**Files:**
- Modify: `app/dashboard/page.tsx:734-800` (fonctions `StatusBadge` et `CountChip`)

**But :** Après Task 1+2, `StatusBadge` (local) et `CountChip` ne sont plus appelés nulle part dans le fichier. Les supprimer pour garder le fichier propre.

- [ ] **Step 1 : Vérifier que StatusBadge et CountChip ne sont plus utilisés**

```bash
grep -n "StatusBadge\|CountChip" app/dashboard/page.tsx
```

Attendu : seule la définition (lignes 736 et 777 environ) apparaît — aucun `<StatusBadge` ou `<CountChip` en usage.

Si un usage apparaît ailleurs, ne pas supprimer et signaler.

- [ ] **Step 2 : Supprimer les deux fonctions**

Dans `app/dashboard/page.tsx`, supprimer le bloc entier de la ligne `// ─── Indicateurs sémantiques ─────────────────────────────` (~ligne 734) jusqu'à la fin de la fonction `CountChip` (~ligne 800, juste avant `function LessonLine`).

Concrètement : supprimer les deux fonctions `function StatusBadge(...)` et `function CountChip(...)` et le commentaire séparateur au-dessus.

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur (le fichier utilisait déjà ces fonctions uniquement en local).

Si erreur `Cannot find name 'StatusBadge'` ou `'CountChip'` : un appel a été oublié en Task 1/2, le retrouver et le supprimer.

- [ ] **Step 4 : Vérifier que `Trophy` et `PlayCircle` ne sont plus utilisés**

```bash
grep -n "Trophy\|PlayCircle" app/dashboard/page.tsx
```

Si l'import existe sans usage, le retirer de la ligne :

```tsx
import { ChevronDown, Lock, Zap, Check, Trophy, PlayCircle } from "lucide-react";
```

Devient (exemple si les deux sont inutilisés) :

```tsx
import { ChevronDown, Lock, Check } from "lucide-react";
```

Note : vérifier aussi si `Zap` est encore utilisé (était dans l'ancien XP badge). Si non, le retirer aussi.

- [ ] **Step 5 : Vérifier la compilation finale**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur.

Puis recharger le navigateur et vérifier que tout marche toujours.

- [ ] **Step 6 : Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
chore(dashboard): retirer StatusBadge/CountChip et imports inutilisés

Suppression des helpers devenus orphelins après la refonte
lisibilité (Task 1 + 2). Nettoyage des imports lucide-react.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 : Vérification finale (preview mode + états)

**Files:** aucun — validation uniquement.

**But :** Valider les 4 états du spec (FAIT / ACTIF / À VENIR / BLOQUÉ) dans les deux modes (VIP et preview).

- [ ] **Step 1 : Test en VUE ADMIN**

Se connecter en admin. Topbar → cycle "VUE ADMIN".
Vérifier sur `/dashboard` :
- Tous les modules sont accessibles (stripe visible sur tous)
- Modules complétés : compteur `06/06 ✓` vert
- Modules en cours : compteur partiel, chevron pointant vers le bas quand ouvert
- Modules upcoming : compteur `00/06`, chevron fermé

- [ ] **Step 2 : Test en VUE MEMBRE VIP**

Topbar → cycle "VUE MEMBRE VIP".
Vérifier :
- Modules déverrouillés séquentiellement selon progression
- Compteur vert `✓` apparaît quand module complet
- Pas de cadenas sur modules accessibles

- [ ] **Step 3 : Test en VUE PREVIEW**

Topbar → cycle "VUE PREVIEW".
Vérifier :
- Module contenant la leçon "Vision Board" (preview) est accessible
- Autres modules : stripe gris + opacity 0.55 + cadenas dans le chevron
- Click sur module locked ouvre la modal upsell
- Dans le module preview ouvert : Vision Board accessible (pastille outline ou orange selon status), autres leçons avec badge `🔒 BLOQUÉ`

- [ ] **Step 4 : Test responsive**

Redimensionner la fenêtre < 768px.
Vérifier :
- Compteur `4/6` disparaît (classe `hidden md:flex`) — normal
- Chevron reste visible
- Titre + numéro restent lisibles
- Pastille ronde + titre + badge à droite s'affichent correctement sur mobile

- [ ] **Step 5 : Test dark + light mode**

Toggle theme via `ThemeToggle`.
Vérifier en light mode :
- Stripe couleur toujours visible
- Texte lisible (pas trop pâle)
- Pastille ronde visible (bordure + contenu)
- Badges semantic toujours lisibles

Si un problème apparaît en light mode (contraste insuffisant), noter pour un follow-up mais ne pas bloquer ce plan.

- [ ] **Step 6 : Push (optionnel, selon finalisation)**

Si tout est OK :

```bash
git status
git log --oneline -5
```

Informer l'utilisateur que les 3 commits (Task 1, 2, 3) sont prêts. Lui demander s'il veut push vers `origin/main` ou rester local.

---

## Self-Review

**1. Spec coverage :**
- ✅ Stripe gauche 4px → Task 1 Step 1
- ✅ Numéro serif italic recalibré → Task 1 Step 3
- ✅ Titre serif italic 20px → Task 1 Step 4 (clamp jusqu'à 28px, conforme)
- ✅ Sous-titre mono 11px → déjà dans le code, conservé
- ✅ Compteur `4/6 ✓` → Task 1 Step 5
- ✅ Chevron discret → Task 1 Step 5
- ✅ Retrait wash de fond → Task 1 Step 1
- ✅ Retrait barre progression bas → Task 1 Step 6
- ✅ Pastille ronde 24px colorée → Task 2 Step 1 (size-6 = 24px)
- ✅ Titre leçon serif 16px → Task 2 Step 2
- ✅ Méta `durée · XP` + XP vert → Task 2 Step 3
- ✅ StatusBadge unique à droite → Task 2 Step 4
- ✅ Hover sobre → Task 2 Step 5
- ✅ Preview mode cadenas → Task 2 Step 1 + Step 4 + Task 4 Step 3
- ✅ Nettoyage code orphelin → Task 3

**2. Placeholder scan :** aucun TBD/TODO. Chaque step contient le code complet.

**3. Type consistency :**
- `STATE_COLOR` utilisé partout avec mêmes clés (`done`, `active`, `pending`, `locked`) — déjà défini ligne 20-25, conservé.
- `ModuleCardState` (type importé) n'est plus utilisé après Task 3 dans `StatusBadge` local, mais reste utilisé par `ModuleRowView` via `state` — vérifier en Task 3 Step 3 (tsc) que ça passe.
- `completed` / `unlocked` / `videoSeen` / `placeholder` : props de `LessonLine` inchangées entre Task 2 Steps.
