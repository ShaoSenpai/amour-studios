# TODO Setup — Ce que tu dois faire

> Liste des actions manuelles à faire sur des services externes pour que l'app fonctionne réellement. Je ne peux pas les faire à ta place (il faut se connecter, cliquer, etc.).

---

## ✅ Déjà fait

- [x] Convex dev en local (tourne en arrière-plan)

---

## 🔴 PHASE 2 — Discord (à faire maintenant)

### 1. Créer l'app Discord OAuth
- [ ] Aller sur https://discord.com/developers/applications
- [ ] Cliquer **"New Application"** → nom : `Amour Studios`
- [ ] Onglet **"OAuth2"** → copier le **Client ID** dans `.env.local` → `DISCORD_CLIENT_ID`
- [ ] Cliquer **"Reset Secret"** → copier le **Client Secret** → `DISCORD_CLIENT_SECRET`
- [ ] Dans **"Redirects"** ajouter : `http://127.0.0.1:3211/api/auth/callback/discord`
- [ ] (Plus tard, pour prod : ajouter aussi `https://ton-deploy.convex.cloud/api/auth/callback/discord`)
- [ ] Sauvegarder

### 2. Créer le serveur Discord (si pas déjà fait)
- [ ] Ouvrir Discord → créer un serveur `Amour Studios`
- [ ] Paramètres utilisateur → Avancé → activer **"Mode développeur"**
- [ ] Clic droit sur le serveur → **"Copier l'ID du serveur"** → `DISCORD_GUILD_ID`
- [ ] Créer un rôle : **Paramètres du serveur > Rôles > Créer un rôle** → nom : `Membre Formation`
- [ ] Clic droit sur le rôle → **"Copier l'ID"** → `DISCORD_MEMBER_ROLE_ID`

### 3. Créer le bot Discord
- [ ] Retour sur https://discord.com/developers/applications → ton app `Amour Studios`
- [ ] Onglet **"Bot"** → cliquer **"Add Bot"**
- [ ] **"Reset Token"** → copier → `DISCORD_BOT_TOKEN`
- [ ] Activer **"Server Members Intent"** dans les **Privileged Gateway Intents**
- [ ] Sauvegarder
- [ ] Onglet **"OAuth2 > URL Generator"** :
  - Scopes : `bot`
  - Bot Permissions : `Manage Roles`
  - Copier l'URL en bas → ouvrir dans un nouvel onglet → ajouter le bot à ton serveur
- [ ] **IMPORTANT** : dans Discord, glisser le rôle du bot **au-dessus** du rôle `Membre Formation` (sinon il pourra pas l'assigner)

---

## 🟡 PHASE 3 — Stripe (plus tard, quand on fera la landing vente)

- [ ] Créer un compte Stripe https://stripe.com (ou te connecter)
- [ ] Mode **Test** activé
- [ ] https://dashboard.stripe.com/test/apikeys → copier **Secret key** → `STRIPE_SECRET_KEY`
- [ ] Copier **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] https://dashboard.stripe.com/test/products → **Créer un produit** :
  - Nom : `Formation Amour Studios`
  - Prix : `297 €` (ou ce que tu veux)
  - One-time
- [ ] Copier le **Price ID** (commence par `price_...`) → `STRIPE_PRICE_ID`
- [ ] Pour le webhook (plus tard) : `STRIPE_WEBHOOK_SECRET` (je t'expliquerai)

---

## 🟡 PHASE 5 — Mux (plus tard, quand on fera le player vidéo)

- [ ] Créer un compte https://mux.com (gratuit pour commencer)
- [ ] https://dashboard.mux.com/settings/access-tokens → **Generate new token**
- [ ] Copier `MUX_TOKEN_ID` et `MUX_TOKEN_SECRET`
- [ ] https://dashboard.mux.com/settings/signing-keys → **Create signing key**
- [ ] Copier `MUX_SIGNING_KEY_ID` et `MUX_SIGNING_KEY_PRIVATE`

---

## 🟡 PHASE 3 — Resend (plus tard, pour les emails)

- [ ] Créer un compte https://resend.com (gratuit)
- [ ] https://resend.com/api-keys → **Create API key** → `RESEND_API_KEY`
- [ ] (Optionnel) ajouter ton domaine pour envoyer depuis `hello@amourstudios.app`
- [ ] Sinon utiliser `onboarding@resend.dev` pour tester

---

## 🟡 PHASE 4 — Calendly (plus tard, pour l'onboarding)

- [ ] Créer un compte https://calendly.com
- [ ] Créer un event "Onboarding Amour Studios"
- [ ] Copier l'URL → `NEXT_PUBLIC_CALENDLY_URL`

---

## 🟡 PHASE 9 — Bot Discord héberg. (plus tard, pour la prod)

- [ ] Créer un compte https://fly.io (gratuit) ou https://railway.app
- [ ] Le bot sera dans un repo séparé — on s'en occupera en Phase 9

---

## 🟡 DÉPLOIEMENT (tout à la fin)

- [ ] Créer un compte https://vercel.com (gratuit, lié à GitHub)
- [ ] Acheter un domaine `amourstudios.app` (ou autre) sur Namecheap / OVH / Porkbun
- [ ] `npx convex login` puis `npx convex deploy` pour passer Convex en prod
- [ ] Ajouter toutes les variables d'env sur Vercel
- [ ] Configurer le webhook Stripe en prod
