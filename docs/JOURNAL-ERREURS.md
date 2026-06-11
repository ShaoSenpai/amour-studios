# Journal des erreurs — AMOUR STUDIOS

> Tenu à jour au fil des tests. Chaque entrée : **symptôme → cause → correctif → statut**.
> Objectif : ne jamais reperdre de temps sur une erreur déjà rencontrée + tracer les angles morts.

---

## Session de test — 2026-06-11

### 🔴 Bloquants (corrigés)

| # | Symptôme | Cause | Correctif | Statut |
|---|----------|-------|-----------|--------|
| 1 | Paiement : « Erreur inattendue pendant le paiement » au clic Payer | PaymentElement Stripe avec `fields.billingDetails` tous en `"never"` → Stripe exige qu'on fournisse name/phone/address dans `confirmParams`, sinon `IntegrationError`. Cascade champ par champ (name → phone → address). | N'opter `"never"` que pour `name`+`email` (toujours fournis) ; laisser Stripe gérer phone+address (champ Pays pré-rempli France pour une carte). | ✅ vérifié (paiement test complet → /claim) |
| 2 | Les mises à jour du site `amourstudios.fr` invisibles (ancien code servi même en navigation privée / 5G) | OVH n'envoyait **aucun** `Cache-Control` → cache navigateur heuristique « en dur ». | `.htaccess` : `Cache-Control: no-cache` sur les `*.html` (sous `<IfModule mod_headers.c>`). | ✅ headers vérifiés |
| 3 | Page `/claim` **blanche** pour un abonné connecté | L'auto-activation n'acceptait que `status === "paid"`, mais les abonnements Stripe sont `"active"` → aucune condition ne matche → `return null` = écran blanc. | Accepter `paid`/`active`/`incomplete` (comme le backend `claimByToken`) + remplacer le `return null` final par un écran « Finalisation… ». | ✅ déployé |
| 4 | Discord : « invitation invalide » après création de compte | L'invitation `discord.gg/xDg3spYfem` avait **expiré** (les invites Discord expirent par défaut). | Invitation **permanente** (`max_age=0`) : `discord.gg/78v8PSgjxx`. MAJ env Vercel + fallbacks code. | ✅ vérifié |
| 5 | Feed Discord ne postait pas (#paiements / #suivi-élèves) | Le bot n'avait pas accès aux salons privés nouvellement créés (« Missing Access »). | L'admin a ajouté le rôle du bot (Voir + Envoyer) aux salons. | ✅ testé `ok:true` |
| 6 | Intégrations Google/Fireflies inactives en prod | `npx convex env set` SANS `--prod` écrit sur **dev**, pas prod → clés posées sur dev. | Copiées dev→prod. **Toujours `--prod`** + vérifier `convex env list --prod`. | ✅ corrigé |
| 15 | **Texte INVISIBLE** en mode sombre sur /onboarding/welcome, /login, /claim (vu en navigation privée + OS sombre) : fond reste clair mais texte passe en blanc → « fantôme ». | **Mismatch d'hydratation** dans `useIsDark` (glass.tsx) : lazy-init lisait `data-theme` au 1er render client, alors que le SSR rend toujours en clair → React gardait le fond clair (SSR) mais passait le texte en sombre (clair) = blanc sur clair. | 1er render = `false` (cohérent SSR) + correction au mount (useEffect) + cache module anti-flash. **Corrige TOUTES les pages Glass C.** ⚠️ Toujours tester **dark + navigation privée** (visiteur frais). | ✅ vérifié (fond `rgb(8,8,12)` + texte clair) |

### 🟠 Sécurité (audit CSO — corrigés)

| # | Finding | Correctif |
|---|---------|-----------|
| 7 | Next.js 16.2.3 — CVE bypass middleware App Router + DoS | → 16.2.9 |
| 8 | `fast-uri` path traversal | `npm audit fix` |
| 9 | Queries formation legacy non authentifiées (exposaient `muxPlaybackId`) | gating `getAuthUserId` |

### 🟡 Fiabilité / faux positifs (corrigés)

| # | Symptôme | Cause | Correctif |
|---|----------|-------|-----------|
| 10 | Alerte Discord « 16 échecs consécutifs Fireflies » | Le rate-limit Fireflies (429) était compté comme une **panne** d'intégration. | 429 ignoré (pas une panne) + cron Fireflies en **fenêtre RDV** (14-21h UTC) au lieu de H24. |
| 11 | `latestTierForEmail` retombait sur « communauté » pour un coaching `past_due` | Ne lisait que `active`/`paid`. | Ajout de `past_due`. |

### 🎨 Cohérence DA / copy (corrigés)

| # | Quoi | Correctif |
|---|------|-----------|
| 12 | `/login` + `/claim` sur l'ancienne DA magazine | Migrés en Glass C |
| 13 | Vocabulaire « formation » / « VIP » (titre du site + flux claim) | → « Coaching & communauté » |

### ⚠️ Angle mort UX (identifié, à blinder)

| # | Scénario | Ce qui se passe | À faire |
|---|----------|-----------------|---------|
| 14 | L'élève paie mais **ne termine pas l'activation** (clique « Continuer avec Discord » mais n'autorise pas, OU rejoint le serveur sans revenir cliquer) | Aucun user/onboarding créé, 0 rôle → poster dans #présente-toi ne déclenche rien, **sans message d'erreur**. | (audit en cours) rappel email, message Discord d'accueil, ou rendre le retour automatique. |

---

## Angles morts à surveiller (mis à jour par l'audit)

*(rempli par l'audit des scénarios imprévisibles — voir section ci-dessous)*
