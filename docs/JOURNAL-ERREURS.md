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
| 17 | **Nouveau client ne peut pas s'activer (paiement jamais lié, bot muet).** Il paie, va sur `/claim`, clique « Continuer avec Discord » **avant d'avoir rejoint le serveur** → l'OAuth échoue en silence, aucun compte Convex, paiement non lié, aucun rôle → quand il se présente dans #présente-toi le bot ne le reconnaît pas. | Le callback `profile()` de `convex/auth.ts` **throwait `NOT_IN_DISCORD_SERVER`** si l'user n'était pas DÉJÀ dans la guild → cercle vicieux pour l'acquisition (créer un compte Discord au milieu fait décrocher le client). Le `discordId` n'entre dans Convex qu'au succès de l'OAuth. | **Découpler l'auth de l'appartenance serveur** : retrait du guard (l'accès reste gaté par l'achat + le rôle). + Listener bot **`guildMemberAdd`** → `/webhooks/discord/member-joined` attribue le rôle d'après le purchase à l'arrivée (couvre l'ordre « rejoindre après OAuth »). + `/claim` guide explicitement « Rejoins le serveur ». ✅ déployé. |
| 18 | **Claim par token cassé après OAuth** (chemin « OAuth d'abord »). | `triggerSignIn` reconstruisait `redirectTo` en `?pi=<valeur>` pour TOUS les kinds → un claim par `token` repartait en `?pi=<token>`, lu au retour comme paymentIntentId → purchase introuvable → claim échoue. Et l'URL primait sur le cookie `amour_claim`. | Mapper chaque kind vers SON param : `token→t`, `session→session`, `pi→pi` (+ `encodeURIComponent`). ✅ déployé. |
| 16 | **Self-service `/compte` injoignable par sa cible.** Le lien vers `/compte` (annuler / upgrade) n'était posé que dans `/exos`, **réservé au Coaching**. Or le membre **Communauté** (cible du bouton « passer au Coaching » 1-clic + « annuler ») atterrit sur l'écran verrouillé « Active ton coaching » de `/exos`, qui ne proposait que l'offre **externe** (= re-payer dehors). | Gap de découvrabilité : la feature existe mais son audience ne peut pas l'atteindre. Détecté avant test, en relisant le parcours réel (dispatcher → `/exos` → écran verrouillé). | CTA conditionnel sur l'écran verrouillé (`exos/layout.tsx`) : `tier==="communaute"` → « Passer au Coaching » + « Gérer mon abonnement » vers `/compte` ; sinon → offre externe d'origine. ✅ déployé. **Leçon : toujours dérouler le parcours de l'utilisateur-cible jusqu'au bout, pas juste construire la page.** |

---

## Angles morts à surveiller (mis à jour par l'audit)

*(rempli par l'audit des scénarios imprévisibles — voir section ci-dessous)*
