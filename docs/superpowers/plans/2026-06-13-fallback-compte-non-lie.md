# Fallback « compte non lié à un paiement » + récupération self-service

**Problème (scénario réel, vécu en test) :** un client paie, puis se présente dans `#présente-toi` avec un compte Discord qui n'est PAS celui lié à son paiement (compte supprimé/recréé, mauvais compte au moment de l'OAuth, email différent). Aujourd'hui → `user_not_found` → **silence total**, le client est perdu. Vérifié dans les logs bot : `Présentation détectée pour <discordId> (user_not_found)` puis aucun DM.

**Goal :** rendre ce scénario **auto-récupérable sans intervention coach** et **safe** (preuve de possession de l'email), tout en restant testable sans créer de nouveaux comptes Discord.

**Décision produit (Kevin) :** option self-service automatisable (pas l'outil manuel /studio).

---

## Task 1 — Bot : ne plus rester muet sur une présentation non liée
**File:** `SKOOL/amour-discord-bot/index.js` (handler `messageCreate` + `notifyConvexPresentation`).
- `notifyConvexPresentation` doit **retourner** le JSON de réponse Convex (`{ ok, reason }`) au lieu de juste logger.
- Dans `messageCreate` : après l'appel, si la réponse n'est pas `ok` (reason `user_not_found` / `no_active_purchase`) → **DM le présentateur** un message de récupération (voix Papi Amour, tutoiement) avec le lien `${SITE_URL}/lier`. Réutiliser le helper d'envoi DM interne du bot.
- **Ne plus cacher les présentations échouées** : ne marquer `RECENT_PRESENTATIONS` (`markNotified`) QUE si `ok === true`. Ainsi un ré-essai après liaison fonctionne tout de suite. (Le DM de récup a sa propre anti-redondance : voir Task 1b.)
- Task 1b : pour éviter de DM en boucle un visiteur, garder un petit cache « DM récup déjà envoyé » (TTL 24h) côté bot, séparé de la présentation réussie.

## Task 2 — Convex : statut de présentation exploitable par le bot
**File:** `convex/onboardings.ts` (`markPresentedByDiscordId`, déjà déployé).
- Confirmer qu'elle renvoie bien `{ ok:false, reason }` (`user_not_found` / `no_active_purchase`) et `{ ok:true, tier }` au succès. (Déjà le cas.) Pas de changement majeur attendu, juste vérifier le contrat consommé par le bot.

## Task 3 — Convex : renvoyer le lien d'activation par email (self-service, safe)
**File:** `convex/claimTokens.ts` ou `convex/lifecycle.ts` (réutiliser `refreshForPaymentIntent` + `internal.emails.sendClaimEmail`).
- Action publique `resendActivationByEmail({ email })` :
  - Normaliser l'email. Chercher un purchase **actif** (`active`/`past_due`/`paid`) pour cet email (index `by_email`).
  - Si trouvé → `refreshForPaymentIntent(paymentIntentId, email)` (token frais) → `sendClaimEmail({ to, claimToken, tier, firstName? })`.
  - **Réponse générique TOUJOURS identique** : `{ ok:true }` (« si un paiement existe, tu recevras un email »). Ne JAMAIS révéler si l'email a un paiement (anti-leak).
  - Rate-limit (réutiliser `internal.rateLimit.checkAndIncrement`, clé `resendActivation:<email>`).

## Task 4 — Page `/lier` (récupération self-service)
**File:** `app/lier/page.tsx` (DA Glass C, tokens `c.*`).
- Champ email + bouton « Recevoir mon lien d'activation ». Appelle `api.<...>.resendActivationByEmail`.
- Après envoi : message neutre « Si un paiement est associé à cet email, tu vas recevoir ton lien d'activation. Pense à vérifier tes spams. » + rappel : « connecte-toi avec le compte Discord que tu utilises sur le serveur. »
- Lien support `contact@amourstudios.fr`.

## Task 5 — Claim : autoriser la (re)liaison / transfert
**File:** `convex/claimTokens.ts` (`claimByToken`).
- Si le purchase est **déjà lié** à un AUTRE user au moment du claim : autoriser le **transfert** vers le user courant (le token, envoyé à l'email du paiement, prouve la légitimité).
  - Repointer `purchase.userId` → user courant ; `user.purchaseId` → purchase ; recréer/rattacher l'onboarding au nouveau user.
  - Planifier le **retrait des rôles Discord de l'ancien compte** (`removeDiscordRoles` + `removeOnboardedRole` sur l'ancien `discordId`) et l'**attribution au nouveau** (`assignDiscordRole`).
  - Logguer l'event `purchase.transferred`.
- ⚠️ Relecture obligatoire (logique sensible, multi-compte).

## Task 6 — Alerte coach (filet de visibilité)
**File:** `convex/onboardings.ts` (dans `markPresentedByDiscordId`, branche non-liée) ou `convex/http.ts` (webhook présentation).
- Sur présentation non-liée → `internal.discord.postAlertToStaff` : « ⚠️ <pseudo/discordId> s'est présenté sans paiement lié. Récupération auto envoyée par DM. » (silencieux, juste pour le coach).

## Task 7 — Reset d'identité de test (testabilité)
**File:** `convex/admin.ts` (ou temp) — `internalMutation resetTestIdentity({ email?, discordId? })`.
- Supprime purchases + claimTokens + onboardings + (option) user pour l'email/discordId, retire les rôles Discord, et appelle un endpoint bot `/forget-presentation { discordId }` (nouveau, vide `RECENT_PRESENTATIONS` pour ce compte) afin de pouvoir rejouer avec le même compte.
- Exposer un usage simple (script `npx convex run` documenté, ou bouton /studio plus tard).

---

## Vérification
1. `npx tsc --noEmit` + `node -c index.js` (bot) + `npm run build`.
2. Deploy Convex + Vercel + bot Fly (`--strategy immediate`, singleton).
3. **E2E fallback (1 seul compte Discord de test)** : payer (TEST, email E) → se présenter avec compte D non lié → **recevoir le DM de récup** → ouvrir `/lier` → entrer E → recevoir l'email → cliquer → « Continuer avec Discord » avec D → **lié** → re-présenter → DM onboarding + rôle. 
4. **Transfert** : payer E lié à compte A → se présenter avec compte B → DM récup → `/lier` E → claim avec B → purchase **transféré** sur B, rôles retirés de A, posés sur B.
5. **Anti-leak** : `/lier` avec un email inconnu → même message neutre, aucun email envoyé.
6. **Reset** : `resetTestIdentity` → rejouer le test avec le même compte D.

## Hors scope
- Outil /studio de liaison manuelle (non automatisable) — la récup self-service le remplace ; éventuel ajout futur pour le SAV.
