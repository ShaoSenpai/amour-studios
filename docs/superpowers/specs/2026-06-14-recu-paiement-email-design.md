# Reçu de paiement par email — Design

**Date :** 2026-06-14
**Statut :** validé (en attente relecture utilisateur)

## Problème

Aucun email de reçu/confirmation de paiement n'est envoyé aujourd'hui — ni Communauté (79€), ni Coaching (179€), ni upsell (+100€). Le seul email proche (`sendClaimEmail`) est une **invitation à activer l'accès** (« active ton accès »), sans montant ni récap, et depuis le guard `!purchase.userId` il ne part que pour les comptes pas encore liés. Un vrai client n'a donc **jamais** de reçu. Tous les autres sites e-commerce envoient un reçu après paiement.

## Objectif

Envoyer un **email de reçu brandé AMOUR** à chaque paiement réussi (initial + renouvellements + upsell), avec le récap : offre, montant, date, carte (•••• last4), et un lien vers le **PDF officiel Stripe** quand il existe.

## Décisions validées

1. Approche **B** : email custom brandé via Resend (cohérent avec les autres emails AMOUR), PAS les reçus Stripe seuls.
2. Un reçu à **chaque prélèvement**, y compris les **renouvellements** mensuels.
3. **Carte •••• last4** affichée sur le reçu (best-effort).
4. **Lien PDF Stripe** dans l'email (abonnements). Pour l'upsell (PaymentIntent isolé, sans PDF Stripe), on pose `receipt_email` sur le PI pour que Stripe envoie aussi son reçu officiel.

Hors scope (sujets séparés, ne pas traiter ici) : le modèle d'abonnement « coaching 1 mois » (one-time vs récurrent), et la feature « saisir/changer de carte » sur l'upsell.

## Architecture

### Composant 1 — Template email `sendPaymentReceipt`

Fichier : `convex/emails.ts` (suit le pattern existant : helper `layout({ title, children })`, envoi via `sendViaResend({ to, subject, html }, ctx)`, échappement via `escape()`).

```ts
export const sendPaymentReceipt = internalAction({
  args: {
    to: v.string(),
    firstName: v.optional(v.string()),
    offerLabel: v.string(),       // "Communauté", "Coaching 1 mois", "Upgrade Coaching (+100€)"
    amountCents: v.number(),      // ex. 7900
    currency: v.string(),         // "eur"
    paidAt: v.number(),           // ms epoch
    cardLast4: v.optional(v.string()),
    receiptPdfUrl: v.optional(v.string()),  // invoice.invoice_pdf (abonnements)
  },
  handler: async (ctx, args) => { /* layout + sendViaResend */ },
});
```

Rendu (HTML, DA orange `#FF5A1F`, comme `claimEmailHtml`) :
- En-tête mono : `◦ Paiement reçu`
- Titre : `Merci${firstName ? ", " + firstName : ""} 🧾`
- Phrase : « Voici le récap de ton paiement AMOUR STUDIOS. »
- Encadré récap (bordure gauche orange) :
  - **Offre** : `{offerLabel}`
  - **Montant** : `{formatEur(amountCents, currency)}` → `79,00 €`
  - **Date** : `{formatDateFr(paidAt)}` → `14 juin 2026`
  - **Moyen de paiement** : `Carte •••• {cardLast4}` (ligne omise si `cardLast4` absent)
- Si `receiptPdfUrl` : bouton/lien `Télécharger le reçu (PDF)` → `{receiptPdfUrl}`
- Footer : « Une question sur ce paiement ? Réponds simplement à cet email. »

Helpers locaux à ajouter dans `emails.ts` :
- `formatEur(cents, currency)` → `(cents/100).toLocaleString("fr-FR", { style:"currency", currency: currency.toUpperCase() })`. Fallback simple si rendu inattendu : `(cents/100).toFixed(2).replace(".", ",") + " €"`.
- `formatDateFr(ms)` → `new Date(ms).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })` (on passe toujours un timestamp explicite).

Subject : `Reçu AMOUR STUDIOS · {offerLabel} · {formatEur(amountCents, currency)}`.

Fail-silent : si `to` vide → `{ ok: false, reason: "no_email" }`, ne throw jamais (un reçu raté ne doit pas casser le webhook).

### Composant 2 — Déclencheur abonnements (`invoice.paid`)

Fichier : `convex/http.ts`, handler `case "invoice.paid"` (~ligne 474). Couvre Communauté + Coaching, **1er paiement ET renouvellements**.

Étapes (dans la section déjà protégée par l'idempotence `claimStripeEvent` → pas de doublon de reçu si Stripe rejoue l'event) :
1. Étendre le type local `invoice` pour lire aussi : `invoice_pdf?: string | null`, `hosted_invoice_url?: string | null`, `charge?: string | null`, et `status_transitions?: { paid_at?: number }`.
2. Après `recordSubscription` + récupération de `purchase` (déjà fait), calculer :
   - `offerLabel` depuis `purchase.tier` : `coaching` → `"Coaching"`, sinon `"Communauté"`. (Le montant distingue de toute façon ; pas besoin de différencier initial/renouvellement dans le libellé.)
   - `amountCents = invoice.amount_paid`, `currency = invoice.currency ?? "eur"`.
   - `paidAt = invoice.status_transitions?.paid_at ? invoice.status_transitions.paid_at * 1000 : Date.now()` (préférer la date réelle de la facture ; `Date.now()` est OK en httpAction comme fallback).
   - `cardLast4` : best-effort. Si `invoice.charge`, `stripe.charges.retrieve(invoice.charge)` puis `charge.payment_method_details?.card?.last4`. Try/catch → `undefined` si échec (ne bloque pas l'email).
   - `receiptPdfUrl = invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? undefined`.
3. `ctx.runAction(internal.emails.sendPaymentReceipt, { to: targetEmail, firstName: "", offerLabel, amountCents, currency, paidAt, cardLast4, receiptPdfUrl })`.
   - `targetEmail` = même résolution que l'email de claim existant (`email || purchase?.email`).
   - **Indépendant du guard `!purchase.userId`** : le reçu part à CHAQUE paiement, lié ou non (contrairement à l'email de claim).

### Composant 3 — Déclencheur upsell (`upgradeToCoaching`)

Fichier : `convex/stripe.ts`, action `upgradeToCoaching`.
1. À la **création du PaymentIntent** (+100€), ajouter `receipt_email: data.email ?? undefined` → Stripe envoie aussi son reçu officiel du PI.
2. Après `pi.status === "succeeded"` (et après que l'upgrade est appliqué côté Convex), planifier le reçu brandé :
   - `cardLast4` : depuis le PI. `paymentMethodId` est déjà connu ; option simple = `stripe.paymentMethods.retrieve(paymentMethodId)` → `pm.card?.last4` (try/catch). Pas de retrieve si on peut lire `pi.charges`/`pi.latest_charge` (selon version API) — best-effort, omis si indispo.
   - `paidAt = pi.created * 1000` (le PI a un champ `created` en secondes).
   - `ctx.scheduler.runAfter(0, internal.emails.sendPaymentReceipt, { to: data.email ?? "", firstName: data.firstName ?? "", offerLabel: "Upgrade Coaching (+100€)", amountCents: 10000, currency: "eur", paidAt: pi.created * 1000, cardLast4, receiptPdfUrl: undefined })`.

## Idempotence / pas de doublon

- **Abonnements** : le handler `invoice.paid` est protégé par `claimStripeEvent` (event Stripe traité une seule fois). Le reçu est envoyé dans cette section → un seul reçu par facture, même si Stripe rejoue l'event.
- **Upsell** : le PI a un `idempotencyKey: upgrade-pi:{token}` (pas de double-débit). Le reçu est planifié sur le chemin succès de l'action ; un re-clic après succès relance l'action mais le rate-limit `upgrade:{token}` (max 5/min) et le retour rapide limitent le risque. Risque résiduel = un éventuel reçu en double sur retry rapproché → **acceptable** (low-risk, pas de double-débit). Ne pas sur-ingénierer un flag dédié pour le MVP.

## Données disponibles (vérifié)

- `invoice.paid` event : `amount_paid`, `currency`, `customer_email`, `invoice_pdf`, `hosted_invoice_url`, `charge`, `status_transitions.paid_at` (tous standards sur le payload Stripe).
- `purchase` (via `findPurchaseBySubscription`) : `tier`, `email`, `userId`.
- `upgradeToCoaching` : `data.email`, `data.firstName`, `paymentMethodId`, `pi.created`.

## Tests / preuve (pas de test unitaire dans ce repo → preuve manuelle)

1. `npx convex dev --once` (codegen + push dev) puis `npm run build` vert.
2. Reçu Communauté : payer un 79€ test → vérifier l'arrivée du reçu (Resend logs / boîte mail test) avec montant `79,00 €`, date, carte, lien PDF.
3. Reçu upsell : déclencher l'upgrade +100€ → reçu `Upgrade Coaching (+100€)` à `100,00 €`.
4. Renouvellement : (si testable) simuler un `invoice.paid` de renouvellement → 2e reçu.
5. Anti-doublon : rejouer le même event Stripe (CLI `stripe events resend` ou via dashboard) → **pas** de 2e reçu (idempotence).
6. Email manquant : `to` vide → pas de crash du webhook.

## Déploiement

Convex prod (`npx convex deploy`). Pas de changement frontend. Variables d'env Resend déjà en place (les autres emails fonctionnent).
