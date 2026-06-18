# Hub « Mon espace » Discord — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux membres un point d'entrée Discord persistant vers leur espace web (exos + compte) — salon `#mon-espace` épinglé avec boutons-liens + nudge dans le DM d'activation — pour qu'ils n'aient plus à attendre que le coach leur envoie le lien.

**Architecture:** Le bot (discord.js) maintient un message hub épinglé idempotent dans `#mon-espace` (mécanique calquée sur `ensurePinnedGuide()`) avec deux boutons de style Link vers `${SITE_URL}/exos` et `${SITE_URL}/compte`. Côté Convex, le DM « accès complet débloqué » (`grantOnboarded`) gagne les liens + la mention du salon.

**Tech Stack:** Node.js + discord.js v14 (`amour-discord-bot/index.js`), Convex (`convex/onboardings.ts`), déploiement Fly.io (bot) + `npx convex deploy` (backend).

**Note sur les tests :** ce dépôt n'a **pas** de harnais de tests unitaires pour le bot ni pour les DMs Convex. Les garde-fous automatiques sont donc : `node -c index.js` (syntaxe bot) et `npx tsc --noEmit` (types Convex). La validation fonctionnelle est **manuelle sur Discord** (Task 3), conformément à la section Vérification du spec. Ne pas inventer de faux tests.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `SKOOL/amour-discord-bot/index.js` | Hub `#mon-espace` : env, builder boutons, `ensureEspaceHub()`, appel au `ready` | Modify |
| `SKOOL/amour-studios/convex/onboardings.ts` | Nudge : liens espace dans le DM `grantOnboarded` | Modify |
| Manuel (Discord + Fly) | Créer le salon, poser `DISCORD_ESPACE_CHANNEL_ID`, déployer | Task 3 |

---

## Task 1 : Bot — hub `#mon-espace` (salon épinglé + boutons)

**Files:**
- Modify: `SKOOL/amour-discord-bot/index.js` (env ~ligne 60 ; nouveau bloc après `ensurePinnedGuide` qui se termine ~ligne 218 ; appel dans le `ready` ~ligne 161)

- [ ] **Step 1 : Ajouter l'env du salon**

Après la ligne `const PRESENTATIONS_CHANNEL_ID = process.env.DISCORD_PRESENTATIONS_CHANNEL_ID;` (ligne 60), ajouter :

```js
const ESPACE_CHANNEL_ID = process.env.DISCORD_ESPACE_CHANNEL_ID;
```

- [ ] **Step 2 : Ajouter le builder + `ensureEspaceHub()`**

Juste APRÈS la fin de la fonction `ensurePinnedGuide()` (l'accolade fermante ~ligne 218), insérer :

```js
// ─── Hub « Mon espace » : message épinglé + boutons-liens vers l'app ─────────
// Marqueur stable pour la détection idempotente (doit rester en tête de ESPACE_HUB).
const ESPACE_MARKER = "🧡 **Ton espace AMOUR STUDIOS**";
const ESPACE_HUB =
  `🧡 **Ton espace AMOUR STUDIOS**\n\n` +
  `Tout ce qu'il te faut, accessible quand tu veux :\n` +
  `• **Mes exercices** — tes exos de coaching\n` +
  `• **Mon compte** — abonnement, factures, paramètres\n\n` +
  `Clique sur un bouton ci-dessous 👇`;

// Boutons-liens (style Link → ouvrent l'app dans le navigateur). SITE_URL sans
// slash final, comme ailleurs dans le fichier.
function espaceHubRow() {
  const base = SITE_URL.replace(/\/$/, "");
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("📓 Mes exercices")
      .setStyle(ButtonStyle.Link)
      .setURL(`${base}/exos`),
    new ButtonBuilder()
      .setLabel("👤 Mon compte")
      .setStyle(ButtonStyle.Link)
      .setURL(`${base}/compte`)
  );
}

// Au démarrage : s'assure qu'un message hub épinglé existe dans #mon-espace.
// Idempotent (détection par ESPACE_MARKER dans les pins + messages récents) et
// fail-silent. Calqué sur ensurePinnedGuide().
async function ensureEspaceHub() {
  try {
    if (!ESPACE_CHANNEL_ID) return;
    const channel = await client.channels.fetch(ESPACE_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.warn("⚠️ ensureEspaceHub: salon mon-espace introuvable ou non textuel.");
      return;
    }
    const isHub = (m) =>
      m.author?.id === client.user?.id &&
      typeof m.content === "string" &&
      m.content.startsWith(ESPACE_MARKER);
    const pinned = await channel.messages.fetchPinned().catch(() => null);
    if (pinned && pinned.some(isHub)) {
      console.log("🧡 Hub mon-espace déjà épinglé — rien à faire.");
      return;
    }
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (recent && recent.some(isHub)) {
      console.log("🧡 Hub mon-espace déjà présent (non épinglé) — skip.");
      return;
    }
    const message = await channel.send({
      content: ESPACE_HUB,
      components: [espaceHubRow()],
    });
    await message
      .pin()
      .then(() => console.log("🧡 Hub mon-espace posté et épinglé."))
      .catch((e) =>
        console.warn("⚠️ Hub mon-espace posté mais pin échec (Manage Messages ?):", e.message)
      );
  } catch (e) {
    console.warn("⚠️ ensureEspaceHub échec (pas de permission ou erreur):", e.message);
  }
}
```

- [ ] **Step 3 : Appeler `ensureEspaceHub()` au démarrage**

Dans le handler `client.once("ready", ...)`, juste après la ligne `await ensureTicketPanel();` (ligne 161), ajouter :

```js
  // Idempotent + fail-silent : poste/épingle le hub « Mon espace » si absent.
  await ensureEspaceHub();
```

- [ ] **Step 4 : Vérifier la syntaxe**

Run: `cd "SKOOL/amour-discord-bot" && node -c index.js`
Expected: aucune sortie (exit 0). Une erreur de syntaxe afficherait `SyntaxError`.

- [ ] **Step 5 : Commit**

```bash
git add SKOOL/amour-discord-bot/index.js
git commit -m "feat(bot): hub #mon-espace épinglé + boutons Mes exercices / Mon compte (idempotent)"
```

---

## Task 2 : Convex — nudge liens dans le DM d'activation

**Files:**
- Modify: `SKOOL/amour-studios/convex/onboardings.ts:849-857` (fonction `grantOnboarded`, le DM « accès complet »)

- [ ] **Step 1 : Ajouter les liens espace aux deux variantes du DM**

Remplacer EXACTEMENT ce bloc (lignes ~849-857) :

```js
      const hi = u.firstName ? `${u.firstName}, ` : "";
      const content =
        u.tier === "coaching"
          ? `🎉 ${hi}c'est validé ! Ton accès est complet : tu peux désormais écrire dans tous les channels, ton espace exercices est ouvert, et ton 1er RDV est calé. On se voit très vite. 🚀`
          : `🎉 ${hi}bienvenue dans AMOUR STUDIOS ! Ta présentation est validée — tu as maintenant accès à **tous les channels** de la communauté. Partage ta musique, pose tes questions, profite des ressources. 🎵`;
      await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
        discordId: u.discordId,
        content,
      });
```

par :

```js
      const hi = u.firstName ? `${u.firstName}, ` : "";
      const base = (process.env.SITE_URL ?? "https://amour-studios.vercel.app").replace(/\/$/, "");
      // Nudge espace membre : le membre sait où aller dès l'activation, sans que
      // le coach envoie quoi que ce soit. Toujours retrouvable dans #mon-espace.
      const espace = `\n\n👉 **Ton espace** : tes exercices ${base}/exos · ton compte ${base}/compte\n(toujours dispo dans #mon-espace)`;
      const content =
        (u.tier === "coaching"
          ? `🎉 ${hi}c'est validé ! Ton accès est complet : tu peux désormais écrire dans tous les channels, ton espace exercices est ouvert, et ton 1er RDV est calé. On se voit très vite. 🚀`
          : `🎉 ${hi}bienvenue dans AMOUR STUDIOS ! Ta présentation est validée — tu as maintenant accès à **tous les channels** de la communauté. Partage ta musique, pose tes questions, profite des ressources. 🎵`) +
        espace;
      await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
        discordId: u.discordId,
        content,
      });
```

- [ ] **Step 2 : Vérifier les types**

Run: `cd "SKOOL/amour-studios" && npx tsc --noEmit`
Expected: aucune sortie (exit 0).

- [ ] **Step 3 : Commit**

```bash
git add SKOOL/amour-studios/convex/onboardings.ts
git commit -m "feat(onboarding): DM d'activation pointe vers l'espace membre (exos + compte + #mon-espace)"
```

---

## Task 3 : Setup manuel + déploiement + vérification fonctionnelle

**Files:** aucun (config Discord + Fly + déploiements).

- [ ] **Step 1 : Créer le salon Discord**

Sur le serveur AMOUR STUDIOS : créer un salon texte `🧡・mon-espace`, **visible par les membres onboardés** (laisser masqué pour `@everyone`/non-onboardés est le comportement par défaut vis-à-vis du gate). Copier son **ID** (clic droit → Copier l'identifiant ; mode développeur Discord activé).

- [ ] **Step 2 : Poser le secret Fly**

```bash
cd "SKOOL/amour-discord-bot" && fly secrets set DISCORD_ESPACE_CHANNEL_ID=<ID_DU_SALON>
```
Expected: Fly redéploie la machine (secret appliqué).

- [ ] **Step 3 : Déployer le bot**

```bash
cd "SKOOL/amour-discord-bot" && fly deploy --strategy immediate
```
Expected: déploiement OK ; le bot est en **singleton (1 machine)**.

- [ ] **Step 4 : Déployer Convex (DM d'activation)**

```bash
cd "SKOOL/amour-studios" && npx convex deploy -y
```
Expected: `✔ Deployed Convex functions`.

- [ ] **Step 5 : Vérifier le hub**

1. Healthcheck : `curl -s -o /dev/null -w "%{http_code}\n" https://amour-discord-bot.fly.dev/health` → `200`.
2. Dans `#mon-espace` : un message épinglé « 🧡 Ton espace AMOUR STUDIOS » avec **2 boutons** est présent.
3. Cliquer **Mes exercices** → ouvre `/exos` (login Discord si pas connecté). Cliquer **Mon compte** → ouvre `/compte`.

- [ ] **Step 6 : Vérifier l'idempotence**

Redémarrer le bot (`fly apps restart amour-discord-bot` ou re-deploy). Logs attendus : `🧡 Hub mon-espace déjà épinglé — rien à faire.` Le hub n'est **pas** reposté (aucun doublon dans `#mon-espace`).

- [ ] **Step 7 : Vérifier le nudge d'activation**

Terminer un onboarding avec un compte test (jusqu'à l'attribution du rôle Onboardé) → le DM « 🎉 c'est validé » contient les liens `/exos` + `/compte` et la mention `#mon-espace`.

- [ ] **Step 8 : Vérifier le fail-soft (sécurité)**

Si `DISCORD_ESPACE_CHANNEL_ID` est absent ou pointe vers un salon supprimé → logs `⚠️ ensureEspaceHub: salon mon-espace introuvable...`, le bot **ne crashe pas** (les autres fonctions tournent).

---

## Self-Review (auteur du plan)

**Couverture du spec :**
- Salon `#mon-espace` + message hub idempotent → Task 1 (Step 2-3) + Task 3 (Step 1-3, 5-6). ✓
- 2 boutons-liens `/exos` + `/compte` → Task 1 (Step 2, `espaceHubRow`). ✓
- Nudge DM activation (2 variantes tier) → Task 2. ✓
- Env `DISCORD_ESPACE_CHANNEL_ID` → Task 1 Step 1 + Task 3 Step 2. ✓
- Fail-silent / idempotence → Task 1 Step 2 (mirroir `ensurePinnedGuide`) + Task 3 Step 6, 8. ✓
- Hors scope (slash commands, auto-création, boutons RDV/support) → non implémenté. ✓

**Placeholders :** aucun (code complet à chaque étape, commandes exactes).

**Cohérence des noms :** `ESPACE_CHANNEL_ID`, `ESPACE_MARKER`, `ESPACE_HUB`, `espaceHubRow()`, `ensureEspaceHub()`, `DISCORD_ESPACE_CHANNEL_ID`, `SITE_URL` — utilisés de façon identique d'une tâche à l'autre. `ButtonStyle.Link` / `ActionRowBuilder` / `ButtonBuilder` déjà importés dans `index.js`. ✓
