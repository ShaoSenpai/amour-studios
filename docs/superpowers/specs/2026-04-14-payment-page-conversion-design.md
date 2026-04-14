# Payment Page — Conversion-First Redesign

**Date:** 2026-04-14
**Scope:** `~/Desktop/AMOURstudios_SITE/paiement/index.html` (landing paiement, déployée sur OVH)
**Goal:** Refondre la page de paiement pour maximiser le taux de conversion via trust signals clairs, toggle 1×/3× en évidence, et filtrage des moyens de paiement à ceux pertinents.

---

## Contexte

La page paiement actuelle (OVH `amourstudios.fr/paiement`) utilise déjà Stripe PaymentElement et a une structure fonctionnelle. Problèmes :
- Stripe PaymentElement affiche Bancontact, iDEAL, Wero, Klarna, EPS (inadaptés au public cible FR)
- Le toggle 1× / 3× sans frais est caché en bas, peu d'utilisateurs le voient
- Manque de trust signals visuels (logos cartes, badge Stripe, cadenas)
- Pas de value stack visible au moment du paiement

## Non-goals (volontaire)

- **Pas de témoignages** — pas d'actifs disponibles
- **Pas de social proof chiffré** — pas de metrics validés à afficher
- **Pas d'urgence** (countdown, scarcity) — pas d'angle honnête à proposer actuellement
- **Pas de garantie satisfait/remboursé** — retiré sur demande du porteur
- **Pas de multi-step wizard** — single-page checkout

## Architecture

### Layout

**Desktop ≥ 900px :** 2 colonnes
- Gauche (sticky, ~40% de la largeur) : offer summary + value stack
- Droite (~60%) : formulaire paiement

**Mobile < 900px :** single column, ordre
1. Offer summary compact (titre + prix + 3× mention)
2. Form email/nom/prénom
3. Toggle 1×/3×
4. PaymentElement
5. CTA
6. Trust strip (logos + Stripe badge)
7. Value stack
8. FAQ collapsed

### Colonne gauche (sticky desktop)

- Retour discret
- Titre programme (Anton, uppercase)
- **Prix principal** (Anton ~80px, couleur tomato `#E63326`)
- Sous-prix : _"ou 3 × 166 € sans frais"_ (Instrument Serif italic 20px)
- **Section "Ce qui est inclus"** : checklist avec ✓ pine vert
  - 6 modules
  - 30+ vidéos structurées
  - Accès Discord VIP
  - Accès à vie

### Colonne droite (formulaire)

- Inputs email + prénom + nom (DM Sans, labels tracking 2px uppercase)
- **Toggle 1× / 3× sans frais** : 2 onglets plein ink/paper, actif en ink. Badge mustard "SANS FRAIS" sur l'onglet 3×.
- **Stripe PaymentElement** : restreint à 4 méthodes (card, apple_pay, google_pay, paypal)
- **CTA principal** : "PAYER 497 €" (Anton 16px, fond ink, texte paper). Dynamique : change selon 1×/3× choisi ("Payer 166 € + 2 échéances" en 3×)
- **Trust strip sous le CTA** :
  - 🔒 "Paiement sécurisé via Stripe"
  - Ligne logos : Visa · Mastercard · Amex · Apple Pay · Google Pay · PayPal

### FAQ collapsed (bas de page)

3 questions, fermées par défaut :
1. Comment fonctionne le paiement en 3× sans frais ?
2. Quand aurai-je accès après paiement ?
3. Comment rejoindre le Discord VIP ?

## Stripe config

### Payment method filtering

Dans `stripe.elements()` côté client :
```js
paymentMethodTypes: ['card', 'apple_pay', 'google_pay', 'paypal']
```

Côté backend (Convex `createPaymentIntent`) : ajouter au PaymentIntent
```ts
payment_method_types: ['card', 'paypal']
```
(Apple Pay / Google Pay sont exposés automatiquement via `card` + wallets.)

### 3× sans frais

Le toggle 1×/3× envoie un param `mode` à l'API `create-payment-intent`. Backend :
- 1× → `amount: 49700` (one-shot 497€)
- 3× → utilise Stripe's Klarna-style split (pay-in-3) OU simple schedule :
  - Option 1 : Stripe Subscriptions avec 3 iterations mensuelles
  - Option 2 : Stripe PaymentElement avec `paymentMethodOptions.card.installments` (Mexico only) — ❌ pas dispo FR
  - **Retenu** : créer un customer + payer 166€ immédiat, puis schedule 2 charges SetupIntent futures via Convex scheduler ou Stripe Subscription 3-mois

**Décision backend :** utiliser Stripe Subscription avec `billing_cycle_anchor` pour 3 mois, invoicing auto. Le customer est créé par le PaymentIntent initial, puis une Subscription lui est attachée. Nécessite update du webhook Stripe (déjà en place).

## Visuel

### Typo

| Rôle | Font | Taille |
|---|---|---|
| Titre programme | Anton uppercase | clamp(36px, 5vw, 56px) |
| Prix principal | Anton | clamp(54px, 7vw, 88px) |
| Prix 3× | Instrument Serif italic | 20px |
| Labels sections | DM Sans uppercase tracking 2.5px | 10px |
| Items checklist | DM Sans medium | 15px |
| Labels form | DM Sans uppercase tracking 2px | 10px |
| CTA | Anton | 16px |
| Fine print | DM Sans | 12px opacity 0.6 |

### Couleurs (rôles stricts)

| Couleur | Hex | Usage |
|---|---|---|
| Ink | `#0D0B08` | Texte principal, CTA fond |
| Paper | `#F4EEE1` | Fond page |
| Paper-2 | `#EDE6D3` | Fond colonne gauche |
| Tomato | `#E63326` | Prix principal + CTA hover |
| Pine | `#0D4D35` | Checkmarks value stack |
| Mustard | `#F5B820` | Badge "SANS FRAIS" sur 3× |

### Micro-interactions

- **Toggle 1×/3×** : transition 300ms
- **CTA hover** : tracking 2px → 3px, flèche → translate(4px, 0)
- **Input focus** : border ink au lieu de ink-12
- **Loading CTA** : spinner + "Traitement en cours…", bouton disabled
- **Error** : toast rouge discret sous PaymentElement, CTA reste cliquable
- **Success** : redirect vers `/claim?pi=xxx` sur `amour-studios.vercel.app`

## Files touchés

- `~/Desktop/AMOURstudios_SITE/paiement/index.html` — refonte majeure (HTML + CSS inline + JS)
- `convex/http.ts` — `createPaymentIntent` httpAction : support `mode: '3x'` qui crée un Customer + Subscription
- `convex/stripe.ts` — éventuel helper pour setup 3× subscription
- `convex/schema.ts` — si besoin de tracker le mode de paiement sur `purchases`

## Success criteria

- Taux de conversion mesurable (via Stripe dashboard) — baseline à mesurer avant déploiement
- Page charge en < 2s sur 4G
- Toggle 1×/3× cliqué par ≥ 25% des visiteurs (event tracking à ajouter)
- Aucun paiement échoué pour cause de méthode non supportée (suppression Bancontact/iDEAL/Klarna/Wero/EPS)
- Mobile responsive sans overflow horizontal, touch targets ≥ 44px
