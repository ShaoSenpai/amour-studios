# Hub « Mon espace » Discord — Design

**Date :** 2026-06-17
**Statut :** validé (brainstorming)

## Problème

Tout le parcours AMOUR STUDIOS est ancré dans Discord (paiement → Discord → onboarding). L'espace membre web (`/exos` pour les exercices, `/compte` pour la facturation) n'est accessible que par des **liens envoyés en DM au coup par coup** (claim, lien d'onboarding). Une fois onboardé, le membre **n'a aucun moyen self-serve** de revenir sur ses exos ou son compte : il dépend du coach qui lui renvoie le lien. Il faut un **point d'entrée persistant et découvrable** depuis Discord.

## Solution retenue

Un **salon Discord dédié `#🧡・mon-espace`** contenant un **message épinglé avec deux boutons-liens** (« Mes exercices » → `/exos`, « Mon compte » → `/compte`), maintenu par le bot de façon idempotente. Plus un **nudge à l'activation** : le DM « accès complet débloqué » pointe vers ces liens et le salon.

Approche écartée (YAGNI) : slash commands `/exos` `/compte`, boutons supplémentaires (RDV/support), auto-création du salon par le bot.

## Composants

### 1. Salon `#mon-espace` + message hub (bot)

**Fichier :** `SKOOL/amour-discord-bot/index.js`

- **Setup manuel (une fois, par Walid) :** créer le salon `#🧡・mon-espace`, visible par les membres onboardés (les non-onboardés ne le voient pas — cohérent avec le gate `gateNonOnboarded` qui ne montre que `#présente-toi` + `#sos` aux non-onboardés ; un nouveau salon est masqué pour eux par défaut). Poser son ID en secret Fly `DISCORD_ESPACE_CHANNEL_ID`.
- **`ESPACE_HUB`** : constante contenu du message, préfixée d'un **marqueur stable** (ex. `🧡 **Ton espace AMOUR STUDIOS**`) pour la détection idempotente, identique au pattern `GUIDE_MARKER`.
- **`ensureEspaceHub()`** : appelée au `ready` (à côté de `ensurePinnedGuide()`). Récupère le salon via `DISCORD_ESPACE_CHANNEL_ID` ; si un message hub épinglé existe déjà (détecté par le marqueur), ne fait rien ; sinon poste le message **avec les boutons** puis l'épingle. **Idempotent + fail-silent** (salon introuvable / pas de perm Manage Messages → `console.warn`, on continue), exactement comme `ensurePinnedGuide()`.
- **Boutons** : un `ActionRowBuilder` avec deux `ButtonBuilder` de style **Link** (`ButtonStyle.Link` + `.setURL(...)`), même mécanique que le bouton ticket existant :
  - « Mes exercices » → `${SITE_URL}/exos`
  - « Mon compte » → `${SITE_URL}/compte`
  - `SITE_URL` = `process.env.SITE_URL` (déjà défini, = l'app Vercel). `/exos` et `/compte` existent ; le login Discord gère l'identité, donc une URL fixe convient pour tous.

**Pourquoi pas d'auto-création :** un salon créé par le bot serait visible de `@everyone` par défaut et échapperait au gate (les non-onboardés le verraient). La création manuelle laisse Walid régler la visibilité proprement.

### 2. Nudge à l'activation (Convex)

**Fichier :** `convex/onboardings.ts` — `sendStatusDm`, branche contexte `complete` (le DM « 🎉 c'est validé, ton accès est complet »).

- Compléter le contenu avec **deux liens directs** + une mention du salon :
  - `Tes exercices : ${site}/exos`
  - `Ton compte : ${site}/compte`
  - « (toujours dispo dans #mon-espace) »
- `site` = `process.env.SITE_URL ?? "https://amour-studios.vercel.app"` (déjà en place dans `sendStatusDm`).
- Le membre connaît donc son point d'entrée dès l'activation, sans intervention du coach.

## Comportements & cas limites

- **Communauté** : le bouton « Mes exercices » mène à l'écran d'upsell `/exos` (comportement attendu, pas un bug — c'est une occasion de vente). Les boutons sont les mêmes pour tous (message statique).
- **Non-onboardé** : ne voit pas `#mon-espace` (gate). N'a de toute façon pas l'accès complet.
- **Idempotence** : `ensureEspaceHub()` ne re-poste jamais si le hub épinglé existe (détection par marqueur + scan des pins), comme le guide.
- **Permissions** : le bot a déjà Manage Messages (épingle le guide aujourd'hui) → il peut épingler le hub.

## Variables d'environnement

- `DISCORD_ESPACE_CHANNEL_ID` (nouveau, secret Fly) : ID du salon `#mon-espace`.
- `SITE_URL` (existant) : base de l'app.

## Vérification

1. Poser `DISCORD_ESPACE_CHANNEL_ID` + créer le salon → `fly deploy` (bot, singleton) → au `ready`, le hub est posté + épinglé dans `#mon-espace`.
2. Cliquer « Mes exercices » / « Mon compte » → ouvre `/exos` / `/compte` (login Discord si besoin).
3. Redémarrer le bot → le hub n'est PAS reposté (idempotent).
4. Terminer un onboarding (compte test) → le DM « c'est validé » contient les 2 liens + la mention `#mon-espace`.
5. Salon introuvable / ID absent → `console.warn`, le bot ne crashe pas.

## Hors scope

- Slash commands `/exos` `/compte`.
- Boutons supplémentaires (RDV, support).
- Auto-création du salon par le bot.
