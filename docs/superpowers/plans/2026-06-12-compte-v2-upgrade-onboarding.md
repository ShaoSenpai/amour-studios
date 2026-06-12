# /compte v2 — vraie page de gestion + upgrade payant (179€, carte au choix) + onboarding RDV

**Goal:** Transformer `/compte` en vraie page de gestion d'abonnement : état des lieux complet + upgrade Communauté→Coaching au **plein tarif 179€** (carte au choix, cycle remis à neuf) qui **déclenche l'onboarding RDV** coaching, + résiliation, + nettoyage des accès Discord.

**Décisions produit (verrouillées par Kevin, 2026-06-12) :**
- Upgrade self-service = **179€ plein, cycle remis à neuf** (pas de prorata, pas le +100€ réservé à l'onboarding). Mois coaching démarre aujourd'hui, 179€/mois ensuite. Les jours Communauté restants sont perdus.
- Le membre doit pouvoir **choisir une autre carte** au moment de l'upgrade.
- Après upgrade, il doit passer par un **onboarding RDV** (réserver son 1er rendez-vous Calendly) pour activer le coaching.
- Le bot Discord gère déjà les accès (push depuis Convex). Trou à combler : **rôle « Onboardé » jamais retiré** à la résiliation.

**Architecture paiement (verrouillée) :**
- Upgrade = `stripe.subscriptions.update(sub, { items:[{id,price:coaching}], billing_cycle_anchor:"now", proration_behavior:"none", payment_behavior:"error_if_incomplete" })` → un seul débit 179€ sur la **default_payment_method**, atomique (carte refusée → 402 → pas de bascule).
- Choix de carte = action `startCardUpdate` → **Stripe Checkout `mode:"setup"`** (collecte/ajout de carte, sans débit) → webhook `checkout.session.completed` pose la nouvelle carte en `invoice_settings.default_payment_method` → retour sur `/compte?card=updated` → le membre confirme l'upgrade (qui débite alors la nouvelle carte par défaut). **Un seul point de débit** (l'update de sub), jamais Checkout.

**Tech Stack :** Convex (subscriptions.ts, http.ts, stripe.ts, onboardings.ts), Stripe (apiVersion 2026-03-25.dahlia), Next 16 App Router, DA Glass C, bot Discord Fly (endpoints `/sync-roles`, `/remove-role`, `/remove-onboarded`, `/dm`).

---

## Task 1 — Upgrade : plein tarif 179€, cycle remis à neuf

**Files:** Modify `convex/subscriptions.ts` (`upgradeMySubscription` ~L113-153, `_applyUpgrade` ~L155-165).

- Remplacer dans le `stripe.subscriptions.update` : `proration_behavior:"always_invoice"` → `proration_behavior:"none"` + ajouter `billing_cycle_anchor:"now"`. Garder `payment_behavior:"error_if_incomplete"` + le try/catch + le message d'erreur existant.
- Garder l'idempotence (`tier==="coaching"` → already) et le rate-limit.
- `_applyUpgrade` : `amount:17900`, `duree:undefined` (inchangé). Garder le patch onboarding mais le RE-CÂBLER pour exiger le RDV (cf. Task 3, pas community_ready→form_done aveugle).
- Commentaire explicite sur le « 179 plein, cycle reset » pour la prochaine session.

**Vérif :** `npx tsc --noEmit`. Relecture Stripe par le contrôleur AVANT commit.

---

## Task 2 — Choix d'une autre carte (Stripe Checkout setup)

**Files:** Modify `convex/subscriptions.ts` (+ action `startCardUpdate`), `convex/http.ts` (webhook `checkout.session.completed`).

- `startCardUpdate` (action, user authentifié) : récupère le purchase → `stripe.checkout.sessions.create({ mode:"setup", customer, success_url:".../compte?card=updated", cancel_url:".../compte", currency:"eur" })` → retourne `{ url }`.
- Webhook `checkout.session.completed` dans http.ts : si `session.mode==="setup"` et `setup_intent` présent → récupérer le `payment_method` du SetupIntent → `stripe.customers.update(customer,{ invoice_settings:{ default_payment_method } })`. Logger. (Aucun débit ici.)
- Garder le handler existant `customer.subscription.*` intact.

**Vérif :** `npx tsc --noEmit`. Relecture Stripe (vérifier que le webhook ne double-traite pas, que mode setup est bien isolé).

---

## Task 3 — Onboarding RDV après upgrade (le brancher)

**Files:** Read `convex/onboardings.ts` (steps, `grantOnboarded`, `upsertCalendlySession`), Modify `convex/subscriptions.ts` (`_applyUpgrade`), éventuellement `convex/onboardings.ts`.

Objectif : après un upgrade, un membre Communauté (qui n'a jamais eu de RDV coaching) doit être invité à **réserver son 1er RDV Calendly**. Le membre est déjà dans Discord, a déjà présenté, a déjà le rôle Onboardé — il ne refait PAS la présentation. Seul manque : le RDV (= leçon M1 L1) + déblocage M1.

- Dans `_applyUpgrade` : au lieu de `community_ready→form_done` aveugle, mettre l'onboarding dans un état « RDV à réserver » (réutiliser le step coaching existant qui précède `rdv_booked` ; lire le flow réel avant de choisir le nom du step). Ne PAS appeler `grantOnboarded` ici (il le sera à la réservation Calendly).
- Vérifier la chaîne existante : réservation Calendly → `upsertCalendlySession` → (auto-tag M1 L1) → `grantOnboarded(coaching)` + unlock M1. Si `grantOnboarded` n'est pas déclenché par la réservation pour un upgrader, le câbler.
- La page `/compte` (Task 4) affichera le CTA « Réserve ton 1er RDV » tant que le RDV n'est pas pris.

**Vérif :** `npx tsc --noEmit`. Tracer le flux dans le rapport (qui appelle quoi).

---

## Task 4 — Vraie page /compte (état des lieux + actions)

**Files:** Rewrite `app/compte/page.tsx` (Glass C). Query backend : étendre `mySubscription` si besoin (prochain RDV, lien Discord, étape onboarding).

État des lieux à afficher :
- Offre actuelle + montant (Communauté 79€ / Coaching 179€), statut, **prochain prélèvement** (ou « se termine le … » si résiliation programmée).
- **Accès Discord** : rôle actif + lien serveur (`discord.gg/78v8PSgjxx`).
- Si Coaching : **prochain RDV** (s'il existe) ou CTA « Réserve ton 1er RDV » (lien Calendly) tant que l'onboarding RDV n'est pas fait.

Actions :
- **Passer au Coaching — 179€** (bouton solide) → `upgradeMySubscription` (débite la carte par défaut). Sous-lien **« utiliser une autre carte »** → `startCardUpdate` (redirige vers Checkout setup). Au retour `?card=updated` → toast « carte mise à jour » + le bouton upgrade reste, prêt à confirmer.
- **Résilier** (ghost) / **Réactiver** (si déjà programmé) — existant.
- **Gérer ma carte** → `startCardUpdate` (même Checkout setup).

Couleurs via tokens `c.*` (jamais noir/blanc hardcodé). Tester clair + sombre + mobile.

**Vérif :** `npx tsc --noEmit` + `npm run build` (route /compte OK).

---

## Task 5 — Nettoyage rôle « Onboardé » à la résiliation

**Files:** Modify `convex/stripe.ts` (+ `removeOnboardedRole` → `POST /remove-onboarded`), `convex/http.ts` (handlers `customer.subscription.deleted` ~L290-340 et `charge.refunded` ~L341+).

- `removeOnboardedRole(discordId)` : `POST ${DISCORD_BOT_ENDPOINT}/remove-onboarded` (l'endpoint bot existe déjà, `index.js:397-422`), même header secret que les autres appels.
- L'appeler dans `customer.subscription.deleted` (juste après `removeDiscordRoles`) et dans `charge.refunded` si applicable.

**Vérif :** `npx tsc --noEmit`.

---

## Task 6 — Deploy + test (Stripe TEST)

- `npx convex deploy -y` (prod) + `vercel --prod --yes`.
- Tests (compte Communauté de test) :
  1. Upgrade carte par défaut → **179€ débité** (pas ~98), statut Coaching, cycle reset (prochain prélèvement à J+1 mois), rôle Coaching ajouté.
  2. « Utiliser une autre carte » → Checkout setup → retour → confirmer upgrade → débit sur la nouvelle carte.
  3. Carte refus `4000 0000 0000 0002` → upgrade échoue proprement, reste Communauté.
  4. Après upgrade → CTA « Réserve ton 1er RDV » → réservation Calendly → rôle/onboarding OK + M1 débloqué.
  5. Résilier → à l'échéance, rôles Membre+Coaching+**Onboardé** retirés.

---

## Hors scope (V2+)
- PaymentElement embarqué (carte sans quitter le site) — pour l'instant redirect Checkout setup.
- Historique des factures dans /compte (Stripe le gère ; lien portail éventuel plus tard).
- Downgrade Coaching→Communauté self-service.
