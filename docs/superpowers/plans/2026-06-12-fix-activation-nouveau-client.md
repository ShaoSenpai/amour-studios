# Fix activation nouveau client (OAuth découplé de l'appartenance au serveur)

**Bug:** Pour « Continuer avec Discord », `convex/auth.ts` exige d'être DÉJÀ membre du serveur (`NOT_IN_DISCORD_SERVER`). Un nouveau client qui se connecte avant de rejoindre → OAuth échoue silencieusement → aucun compte Convex, paiement jamais lié, aucun rôle → le bot reste muet dans `#présente-toi`. La friction réelle : la création d'un compte Discord au milieu du parcours fait décrocher le client.

**Goal:** Parcours order-independent. Le client se connecte (créant son compte Discord pendant l'OAuth, paiement lié immédiatement), puis est guidé pour rejoindre le serveur ; son rôle s'attribue à l'arrivée (listener bot). La présentation déclenche alors l'onboarding.

**Décision (Kevin) :** approche robuste (découpler l'auth de l'appartenance au serveur). Le bot a déjà l'intent `GuildMembers` → `guildMemberAdd` dispo sans changement portail Discord.

---

## Task 1 — Retirer le guard d'appartenance serveur (auth.ts)
**File:** `convex/auth.ts` (~L28-54, callback `profile`).
- Supprimer le bloc qui `throw "NOT_IN_DISCORD_SERVER"` / `"DISCORD_GUILDS_FETCH_FAILED"` (L29-42). Le `profile()` retourne directement `{id, name, email, image, discordId, discordUsername}`.
- Garder le reste de `createOrUpdateUser` intact (écriture `discordId`, match purchase par email, lien, `ensureForUser`, `assignDiscordRole`).
- L'accès reste gaté par l'achat/le rôle (pas par l'appartenance serveur) → sûr. Laisser la scope `guilds` (inoffensive) pour ne pas changer l'écran de consentement.

## Task 2 — Endpoint Convex « membre a rejoint » (assigne le rôle à l'arrivée)
**Files:** `convex/http.ts` (nouvelle route) + `convex/onboardings.ts` ou `convex/stripe.ts` (fonction interne).
- Nouvelle route HTTP `POST /webhooks/discord/member-joined`, MÊME schéma d'auth que `/webhooks/discord/presentation` (vérifier le header secret comme l'existant). Body `{ discordId }`.
- Handler → résout l'user par `users.by_discord` → si l'user a un purchase ACTIF (status active/past_due/paid), `assignDiscordRole({ discordId, email, tier })` avec le tier du purchase. Idempotent. Si pas d'user / pas de purchase → `{ ok:false }` sans erreur.
- Couvre l'ordre « rejoindre après OAuth » : à l'arrivée, le rôle est posé depuis le purchase déjà lié.

## Task 3 — Listener `guildMemberAdd` (bot)
**File:** `SKOOL/amour-discord-bot/index.js`.
- Ajouter `client.on("guildMemberAdd", (member) => { ... })` : ignorer les bots, vérifier `member.guild.id === GUILD_ID`, POST `${CONVEX_HTTP_URL}/webhooks/discord/member-joined` avec header `Authorization: Bearer ${BOT_SECRET}` (MÊME pattern que l'appel présentation existant `notifyConvexPresentation`), body `{ discordId: member.id }`. Try/catch + logs, fail-silent (ne pas crasher).
- Réutiliser la fonction d'appel Convex existante si elle est générique, sinon copier son pattern.

## Task 4 — Page /claim : guider vers le serveur Discord
**File:** `app/claim/page.tsx`.
- Après OAuth + claim réussis (user authentifié + purchase lié), AVANT de pousser vers `/onboarding/welcome`, afficher (ou insérer dans l'écran `done`) une étape claire **« Rejoins le serveur Discord »** avec le bouton d'invite (`NEXT_PUBLIC_DISCORD_INVITE_URL`, déjà utilisé L417) + sous-texte « puis présente-toi dans #présente-toi ». 
- Vérifier que le lien purchase↔user (claim par token) est robuste : le token doit survivre au round-trip OAuth (cookie `amour_claim`) ; corriger la reconstruction du `redirectTo` si elle perd le token (page.tsx ~L426 utilise `pi`/`session`, pas `t`).
- DA Glass C, tester clair + sombre.

## Task 5 — Deploy + test E2E
- `npx convex deploy -y` + `vercel --prod --yes`. Bot : `fly deploy` (dossier amour-discord-bot) — SINGLETON, 1 machine, ne jamais scale à 2. **Confirmer avec Kevin avant le deploy bot.**
- Test E2E avec un compte Discord NEUF : payer (TEST) → /claim → Continuer avec Discord (créer le compte) → lié ✓ → Rejoins le serveur → rôle attribué auto → #présente-toi → DM reçu.

## Hors scope (filet optionnel, à proposer)
- Cron lifecycle : purchases `active` sans `userId` depuis >X h → renvoyer l'email de claim (`claimTokens.refreshForPaymentIntent` existe déjà).
- Relâcher le gate `isPaying` du bot en présentation (filet anti-race si présentation < attribution rôle).
