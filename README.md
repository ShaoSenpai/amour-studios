# amour-studios

App principale du projet AMOUR STUDIOS (coaching pour artistes musicaux).
Next.js 16 (App Router, Turbopack) + Convex + Convex Auth (Discord OAuth).

## Espaces

- **`/studio`** — back-office du coach Walid (admin). Dashboard « Aujourd'hui », fiche élève, calendrier RDV, blocs paiement / Discord / onboarding.
- **`/exos`** — espace élève coaching 179€. Catalogue par module avec gating tier + avancée. Détail d'un exo en iframe externe (outils interactifs).
- **`/`** — dispatcher : non authed → `/login`, admin → `/studio`, élève → `/exos`.

## Stack

- Next.js 16 (Turbopack)
- Convex (backend + auth)
- Convex Auth (Discord OAuth)
- Framer Motion (transitions Apple-style)
- Stripe (abonnements coaching / communauté)
- Resend (email), Mux (vidéos), Calendly (webhook RDV), Twilio (WhatsApp — live)
- DA **Glass C** (verre + ACCENT `#FF5A1F`, Schibsted Grotesk + DM Mono). Source : `app/studio/_components/glass.tsx`.

## Lancer en local

> ⚠️ **`SITE_URL` Convex dev = `http://localhost:3001`**. Le serveur **doit** tourner sur 3001.

```bash
npm install
npx convex dev          # backend dev (déploiement flexible-lobster-990)
PORT=3001 npm run dev   # frontend (port 3001 obligatoire)
```

## Déploiement

```bash
# Backend Convex (prod = frugal-curlew-831)
npx convex deploy

# Frontend Vercel
vercel --prod
vercel promote <url>    # si le domaine public ne bouge pas
```

Live sur **amour-studios.vercel.app**.

## Repère

```
app/         routes (studio, exos, login, …)
convex/      schéma + queries + mutations + auth
components/  exercises, outils, payment, ds, …
proxy.ts     middleware (auth gating /exos)
```

Brief Claude complet → `CLAUDE.md`. Contexte projet à jour → `docs/CONTEXTE-PROJET.md`.

Plans / specs avril 2026 (ancienne offre formation 450€) archivés dans `../../2_ARCHIVE/old-docs/skool-app-april-2026/`.
