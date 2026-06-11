@AGENTS.md

# AMOUR STUDIOS — App Next.js + Convex

> Brief Claude pour bosser sur cette app. Maj 2026-06-09.

---

## Ce que c'est

App principale du projet AMOUR STUDIOS. Deux espaces :

- **`/studio`** — back-office coach **Walid** (admin). Dashboard « Aujourd'hui » Glass C, fiche élève, calendrier RDV, blocs paiement/Discord/onboarding, transitions Apple-style entre pages.
- **`/exos`** — espace élève **coaching 179€**. Catalogue par module avec gating tier+avancée. Détail d'un exo en iframe externe.
- **`/`** — root dispatcher : non authed → `/login`, admin → `/studio`, élève → `/exos`.

---

## Offres en jeu

| Tier | Prix | Accès |
|---|---|---|
| Communauté | 79€ | Discord, ressources. **Pas d'exos.** |
| Coaching 1 mois | 179€ | M1 Positionnement (6 exos visibles). |
| Coaching 3 mois | 179€/mois | M1 d'office + M2/M3 débloqués par avancée OU par Walid manuellement. |

Programme coaching = **3 modules × 5 leçons head-to-head** (M1 Positionnement / M2 Contenu / M3 Feedback & Analyse). Les exos en BDD avec `exerciseUrl` (outil externe iframe) sont les seuls exposés à l'élève.

---

## Stack

- **Next.js 16** (Turbopack, App Router) — ⚠️ breaking changes par rapport au training data. Avant tout dev, lire `node_modules/next/dist/docs/` (cf. `AGENTS.md`).
- **Convex** backend : prod = `frugal-curlew-831`, dev = `flexible-lobster-990`. `SITE_URL` Convex dev = `http://localhost:3001` → le dev server **DOIT** tourner sur 3001 (`PORT=3001 npm run dev`).
- **Convex Auth + Discord OAuth** (`@convex-dev/auth`).
- **Framer Motion** (`framer-motion`, pas `motion/react`) pour AnimatePresence + transitions de pages.
- **Stripe** (`@stripe/react-stripe-js`) — abonnements coaching/communauté. Webhook côté Convex.
- **Resend** (email), **Twilio** (WhatsApp, live), **Calendly** (webhook RDV), **Mux** (vidéos).
- **DA Glass C** : `app/studio/_components/glass.tsx` est la source de vérité (palette/Glass/mono/num/ACCENT). Toute nouvelle surface s'écrit en **inline styles** avec ces tokens.

---

## Repère rapide

```
app/
├── page.tsx              dispatcher racine
├── login/                login Discord
├── studio/               back-office Walid (Glass C)
│   ├── _components/      glass.tsx, test-store.ts, demo-data.ts
│   ├── eleves/[id]/      fiche élève complète
│   ├── calendrier/       jour/semaine/mois
│   └── ...
├── exos/                 espace élève coaching
│   ├── layout.tsx        gate auth + tier
│   ├── page.tsx          catalogue par module
│   └── [id]/page.tsx     détail + ExerciseRenderer
convex/
├── schema.ts             users, exercises, modules, lessons, purchases…
├── lib/access.ts         accessibleModules() + COACHING_MODULE_ORDERS [1,2,3]
├── exercises.ts          listAllWithState, getExerciseForUser, accessSummary
├── exerciseResponses.ts  save/complete + auto-unlock module suivant
├── users.ts              unlockModule/lockModule (admin)
└── admin.ts              helpers diagnostic (_inspectExercises…)
components/
├── exercises/            FormExercise, ChecklistExercise, TableExercise,
│                         VisionBoard, ExerciseIframe, ExerciseRenderer
└── outils/, payment/…
proxy.ts                  middleware auth (/exos protégé)
```

---

## Règles non-évidentes

1. **DA Glass C inline** — pas de classes Tailwind pour les surfaces studio/exos. Toujours `palette(useIsDark())` + tokens du fichier `glass.tsx`. Ne pas réintroduire de Tailwind utility-first sur ces pages.
2. **Auto-save 800ms intacte** sur les exos (form/checklist/table/vision-board) : ne pas toucher au pattern `timeoutRef + setTimeout` ni à la structure JSON `data` ni aux hooks `initialized.current`.
3. **Déploiement Convex** — `npx convex deploy` (prod) ou `npx convex dev --once` (push fonctions en dev). Codegen seul (`npx convex codegen`) ne pousse PAS les fonctions → erreur runtime « Could not find public function ».
4. **Déploiement Vercel** — `vercel --prod` PUIS `vercel promote <url>` si le domaine public ne bouge pas. Git n'auto-déploie pas (configuré ainsi). Studio live sur `amour-studios.vercel.app`.
5. **Catalogue `/exos`** — affiche uniquement les exos avec `exerciseUrl` défini, non taggés `hiddenFromCoaching`, sur modules order ∈ {1,2,3}. L'auto-unlock compte ces mêmes exos.
6. **Surfaces toujours-noires** (dark mode) — pas de `var(--white)`/`var(--ink)` pour le texte ; ces tokens s'inversent et deviennent invisibles. Tester clair + sombre + mobile à chaque modif DA.
7. **CSS `:root` legacy** — quand on remplace des tokens, auditer toutes les `var()` du repo. Un `--ease-out` oublié = écran noir au runtime.
8. **QA preloader** — toujours tester en visiteur frais (pas en contournant), pour valider le flux d'intro réel.

---

## État & roadmap

À jour : `docs/CONTEXTE-PROJET.md`.

**Live (2026-06-11)** : Studio + /exos + auth Discord + dispatcher + paiements/SAV Stripe + bot Discord (Fly, durci, 1 machine) + onboarding E2E (présentation #présente-toi câblée) + Calendly 1er RDV + Fireflies (transcripts + écran orphelins /studio/transcripts) + Google Meet + feed & alertes Discord (channels paiements/suivi-élèves/alertes) + dashboard « Aujourd'hui » 100% cliquable.

**Reste à faire** :
- **Backups Convex** : à activer dans le dashboard Convex (Settings → Backups). Seul vrai filet de sécurité manquant.
- Bascule Stripe TEST → LIVE (sk_live + price IDs + whsec) si pas encore fait.
- `TWILIO_*` (campagnes WhatsApp) — volontairement en pause (canal masqué dans /studio/campagnes).
- Tour de contrôle brique B (CRM avancé) — partiel.

Note : `GOOGLE_*` + `FIREFLIES_API_KEY` sont sur prod depuis le 2026-06-11 (avaient été posés sur dev par erreur — cf. piège `convex env` SANS `--prod` = dev).

Anciens plans/specs (avril 2026) archivés dans `../../2_ARCHIVE/old-docs/skool-app-april-2026/` — ne pas les utiliser comme référence, ils décrivent l'ancienne offre formation 450€ + DA magazine.
