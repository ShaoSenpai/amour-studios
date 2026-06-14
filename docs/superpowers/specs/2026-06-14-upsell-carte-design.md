# Upsell — choisir/saisir sa carte (Communauté → Coaching +100€) — Design

**Date :** 2026-06-14
**Statut :** validé sur l'UX (approche A) — en attente relecture de l'archi technique

## Problème

L'upsell d'onboarding (+100€) débite **uniquement** la carte enregistrée en off-session. Deux limites :
1. Si aucune carte n'est enregistrée → échec (« Aucune carte enregistrée »). (Un fallback « carte du client » a déjà été déployé, mais ne couvre pas le cas « aucune carte du tout ».)
2. Le client ne peut pas **payer avec une autre carte** s'il le souhaite.

## Objectif

Sur l'écran upsell, proposer **deux options** :
- **Payer en 1 clic** avec la carte enregistrée (comportement actuel, off-session).
- **Payer avec une autre carte** → formulaire Stripe Elements (on-session, gère la 3DS).
- Si aucune carte enregistrée → on bascule sur le formulaire de saisie.

L'upsell donne du **Coaching 1 mois** (one-time) → la carte ne sert que pour ce **seul paiement de 100€**, pas de « carte par défaut » à gérer (décision validée).

## Décisions validées (UX)

- Approche **A** : les 2 options visibles (1 clic + autre carte).
- Coaching 1 mois = paiement unique → carte = juste pour le +100€.
- Hors scope : modèle d'abonnement « 1 mois vs récurrent » (sujet backend séparé).

## Architecture

### Vue d'ensemble — deux chemins, application centralisée par type de PaymentIntent

| Chemin | Création/Confirmation du PI | Application de l'upgrade + reçu |
|---|---|---|
| **1 clic (carte enregistrée)** | `upgradeToCoaching` : PI off-session `confirm:true`, metadata `type:"upgrade"` | **inline** dans l'action (comportement actuel, inchangé) |
| **Autre carte (Elements)** | `createUpgradeIntent` : PI on-session NON confirmé, metadata `type:"upgrade_web"` ; confirmé côté client | **via webhook** `payment_intent.succeeded` (metadata `type:"upgrade_web"`) |

**Pourquoi ce découpage :** le chemin 1-clic marche déjà et donne un retour instantané (on n'y touche pas). Le chemin Elements applique l'upgrade **via webhook** → robuste même si le client ferme la page juste après avoir payé (l'upgrade s'applique quand même). Les deux types de PI sont distincts (`upgrade` vs `upgrade_web`) → **aucun double** : le webhook ne traite QUE `upgrade_web`, donc le PI off-session (`upgrade`) n'est jamais re-traité par le webhook.

### Backend

**1. `createUpgradeIntent({ token })`** — nouvelle action (convex/stripe.ts)
- Reprend les validations 1→5 de `upgradeToCoaching` (offre éligible, fenêtre 1h, tier communaute, abonnement+customer présents, rate-limit `upgrade:{token}`).
- Crée un PaymentIntent **non confirmé**, on-session :
  ```
  amount: 10000, currency: "eur", customer: customerId,
  automatic_payment_methods: { enabled: true },
  description: "Upgrade Communauté → Coaching (+100€)",
  receipt_email: data.email,                       // reçu officiel Stripe
  metadata: { type: "upgrade_web", token, userId: data.userId },
  ```
  (idempotencyKey `upgrade-web-pi:{token}` → re-clics renvoient le même PI, pas de PI multiples.)
- Retourne `{ clientSecret: pi.client_secret }`. **N'applique RIEN** (pas de bascule sub).

**2. Webhook `payment_intent.succeeded`** — nouveau case dans convex/http.ts
- Si `metadata.type !== "upgrade_web"` → ignore (les PI off-session `type:"upgrade"` et tout le reste ne déclenchent rien ici).
- Sinon : lit `token` depuis metadata, recharge l'onboarding (`_obByToken`), puis applique **exactement** la même séquence que `upgradeToCoaching` étape 8-9 :
  - `stripe.subscriptions.update(subId, { items:[{id, price: coaching}], proration_behavior:"none", metadata:{tier:"coaching", duree:"1mois"} })`
  - `_applyUpgradePurchase` + `_applyUpgradeOnboarding` (idempotents : no-op si déjà coaching)
  - `assignDiscordRole(tier:"coaching")`
  - `sendPaymentReceipt(offerLabel:"Upgrade Coaching (+100€)", amountCents:10000, cardLast4 depuis le PI, paidAt: pi.created*1000)`
- **Idempotent** : sous la garde `claimStripeEvent` (event traité une fois) + `_applyUpgrade*` idempotents. Pas de double upgrade ni double reçu.
- Pour factoriser, extraire la séquence (bascule sub + `_applyUpgradePurchase` + `_applyUpgradeOnboarding` + `assignDiscordRole` + **reçu** `sendPaymentReceipt`) dans un helper interne `internal.stripe._applyUpgradeFromPaymentIntent({ token, paymentIntentId })`. **Le helper porte le reçu** → un seul endroit, pas de double.

**3. `upgradeToCoaching` (1 clic)** — inchangé fonctionnellement ; refactor pour appeler le helper commun `_applyUpgradeFromPaymentIntent` après le débit off-session réussi. On **retire le bloc reçu inline actuel** (il passe dans le helper) → off-session et on-session envoient le reçu par le même chemin, exactement une fois chacun.

### Frontend (`app/onboarding/[token]/page.tsx` — `UpsellBlock`)

Réutilise l'infra Elements existante (`@stripe/react-stripe-js`, `loadStripe`, clé publishable — cf. `components/payment/payment-modal.tsx`).

États du bloc upsell :
1. **Défaut** : bouton **« Débloquer le coaching · +100€ »** (1 clic, `upgradeToCoaching`) + lien **« Payer avec une autre carte »** + lien « Non merci ».
2. **Clic « autre carte »** (ou échec 1-clic « aucune carte ») → appelle `createUpgradeIntent({token})` → reçoit `clientSecret` → affiche `<Elements options={{ clientSecret, appearance }}><PaymentElement/></Elements>` + bouton **« Payer 100€ »** + lien « ← revenir ».
3. **Paiement** : `stripe.confirmPayment({ elements, redirect: "if_required" })` (gère 3DS en modal). 
   - Succès → afficher « Paiement validé, on débloque ton coaching… » (spinner). La **query réactive** `data` passe à `tier:"coaching"`/`step:"form_done"` quand le webhook a appliqué → le `useEffect` existant bascule l'écran sur l'étape **RDV**. (Délai typique 1-3 s.)
   - Échec/refus → message d'erreur, reste sur le formulaire (rien débité tant que non confirmé).

Détails :
- Le formulaire s'ouvre **inline** dans le `UpsellBlock` (pas de modal séparé) pour rester dans le flux.
- Le bouton 1-clic et le lien « autre carte » coexistent (option 1) ; si `upgradeToCoaching` renvoie l'erreur « Aucune carte enregistrée », on ouvre automatiquement le formulaire (option 2) avec un petit message « Ajoute une carte pour débloquer ».

## Sécurité

- `createUpgradeIntent` valide l'éligibilité côté serveur (mêmes guards que `upgradeToCoaching`) → un client ne peut pas créer un PI hors fenêtre/hors tier.
- L'upgrade n'est appliqué que par le webhook **signé** Stripe (`payment_intent.succeeded`, signature vérifiée) → pas d'application déclenchable par le client. Le `token` vient de la metadata posée par NOUS à la création.
- `idempotencyKey` sur le PI → pas de PI/charge multiples sur re-clic.

## Idempotence / pas de doublon

- Webhook sous `claimStripeEvent` (un event traité une fois).
- `_applyUpgrade*` idempotents (no-op si déjà coaching).
- Reçu : off-session = inline (PI `type:"upgrade"`) ; on-session = webhook (PI `type:"upgrade_web"`). Types disjoints → **un seul reçu** par paiement. (+ reçu officiel Stripe via `receipt_email` dans les deux cas.)

## Edge cases

- **Client ferme la page juste après avoir payé (on-session)** : l'upgrade s'applique quand même (webhook). À sa prochaine visite du lien, le `useEffect` voit `tier:coaching` → écran RDV. ✓
- **3DS requise** : gérée par `confirmPayment` on-session (modal). (≠ off-session 1-clic qui, lui, ne peut pas faire de 3DS → si la carte enregistrée exige une auth, le 1-clic échoue proprement et le client bascule sur « autre carte ».)
- **Offre expirée pendant la saisie** : `createUpgradeIntent` rejette si hors fenêtre ; si déjà créé puis fenêtre expirée avant confirmation, le webhook applique quand même (le client a payé) — acceptable.

## Hors scope

- Modèle d'abonnement « coaching 1 mois » one-time vs récurrent (sujet séparé).
- Sauvegarder la nouvelle carte comme moyen de paiement par défaut (inutile : one-time, validé).

## Tests / preuve (manuel — pas de tests unitaires dans ce repo)

1. `npx convex dev --once` + `npm run build` verts.
2. **1 clic** (carte enregistrée) : upsell → débloque, reçu reçu (déjà OK aujourd'hui).
3. **Autre carte** : « payer avec une autre carte » → `4242…` → paiement → l'écran passe à RDV (via webhook) ; reçu « Upgrade Coaching (+100€) » reçu.
4. **3DS** : carte test 3DS (`4000 0027 6000 3184`) → modal d'auth → succès → upgrade.
5. **Aucune carte** : compte sans carte → le 1-clic propose le formulaire → saisie → upgrade.
6. **Anti-doublon** : rejouer l'event `payment_intent.succeeded` → pas de 2e upgrade/reçu.
7. **Page fermée après paiement** : confirmer puis fermer → rouvrir le lien → écran RDV.

## Déploiement

Convex prod (`npx convex deploy`) + Vercel prod (frontend) + `vercel promote`. Vérifier que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (clé publishable, déjà utilisée par payment-modal) est dispo côté front.
