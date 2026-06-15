# Boussole de statut Discord — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox syntax.

**Goal :** Quand un membre franchit une étape (paiement, questionnaire, RDV) ou revient sur Discord, le bot lui envoie un DM qui confirme où il en est et lui donne la prochaine action + le lien. Centralise les messages aujourd'hui éparpillés et bouche le trou « coaching : questionnaire fini, RDV pas pris ».

**Architecture :** Toute l'intelligence vit côté Convex. Le bot `index.js` ne change PAS (il reste un envoyeur de DM via `/dm`). Une fonction unique `sendStatusDm(userId)` lit l'état (onboarding.step + tier + statut paiement) et compose le bon message. Elle est appelée à chaque transition (push) et quand un membre coincé reposte dans #présente-toi (pull). La redirection web→Discord existe déjà (écran `done`).

**Tech Stack :** Convex (internalAction + internalQuery), endpoint bot `/dm` existant.

**Déploiement :** `npx convex deploy` uniquement (pas de Vercel : aucun changement front ; pas de Fly : aucun changement bot).

---

## Contexte (états & branchements existants)

Machine d'états onboarding (`convex/onboardings.ts`) :
`awaiting_presentation → link_sent → form_done → rdv_booked` (coaching) / `community_ready` (communauté, saute le RDV).

DM déjà envoyés (NE PAS dupliquer) :
- Présentation détectée → `sendLink` envoie le lien (onboardings.ts:571).
- `grantOnboarded` (onboardings.ts:639) envoie le DM final « 🎉 c'est validé, accès complet » (rdv_booked ou community_ready).

Trou : `form_done` coaching (questionnaire fini, RDV pas pris) → aucun DM.

Helper DM existant : `internal.onboardings.discordDm({ discordId, content })`.

---

### Task 1 : Boussole Convex (onboardings.ts)

**Files:**
- Modify: `convex/onboardings.ts`

- [ ] **Step 1 : Ajouter `_statusForUser` (internalQuery)** — lit l'état composite d'un membre.

```ts
/** Lit l'état composite d'un membre (onboarding + paiement + Discord) pour la
 *  boussole `sendStatusDm`. */
export const _statusForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const email = (user.email ?? "").trim().toLowerCase();
    const isLive = (s?: string) =>
      s === "active" || s === "past_due" || s === "paid";
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !isLive(purchase.status)) && email) {
      const cands = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      purchase =
        cands
          .filter((p) => isLive(p.status))
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    return {
      discordId: user.discordId ?? null,
      firstName: ob?.firstName ?? null,
      tier: (ob?.tier ?? purchase?.tier ?? null) as
        | "coaching"
        | "communaute"
        | null,
      step: ob?.step ?? null,
      token: ob?.token ?? null,
      purchaseStatus: purchase?.status ?? null,
      purchaseActive: purchase ? isLive(purchase.status) : false,
    };
  },
});
```

- [ ] **Step 2 : Ajouter `sendStatusDm` (internalAction)** — compose et envoie le DM selon l'état. State-aware → sûr quel que soit l'appelant.

```ts
/** La boussole : envoie au membre un DM Discord qui confirme où il en est et
 *  lui donne la prochaine action + le lien. State-aware (réutilisable en push
 *  comme en pull). Ne DM jamais les états déjà couverts par grantOnboarded sauf
 *  fallback explicite. Fail-silent. */
export const sendStatusDm = internalAction({
  args: {
    userId: v.id("users"),
    context: v.optional(
      v.union(
        v.literal("transition"),
        v.literal("reminder"),
        v.literal("payment_active"),
        v.literal("payment_canceled")
      )
    ),
  },
  handler: async (ctx, { userId, context }) => {
    const s = await ctx.runQuery(internal.onboardings._statusForUser, { userId });
    if (!s || !s.discordId) return { ok: false as const, reason: "no_discord" as const };
    const site = process.env.SITE_URL ?? "https://amour-studios.vercel.app";
    const link = s.token ? `${site}/onboarding/${s.token}` : site;
    const Hi = s.firstName ? `Salut ${s.firstName} 👋` : "Salut 👋";
    const hi = s.firstName ? `${s.firstName}, ` : "";

    let content: string | null = null;

    if (context === "payment_canceled" || s.purchaseStatus === "canceled") {
      content = `${Hi}\n\nTon accès AMOUR STUDIOS a pris fin. Si tu veux revenir, tout est ici 👉 ${site}/paiement\nUne question ? Réponds à ce DM. 🧡`;
    } else if (!s.step || s.step === "awaiting_presentation") {
      content = `${Hi}\n\nIl te reste une étape pour débloquer ton accès : **présente-toi dans #🎤・présente-toi** (qui tu es, ton projet, ce que tu cherches). Dès que tu postes, je t'envoie ton lien dans la foulée. 🔥`;
    } else if (s.step === "link_sent") {
      content =
        s.tier === "coaching"
          ? `${Hi}\n\nTu y es presque : termine ton **questionnaire** (~5 min) pour que Walid prépare ton 1er appel 👉 ${link}`
          : `${Hi}\n\nTu y es presque : complète tes **infos** (~2 min) pour débloquer ton accès complet 👉 ${link}`;
    } else if (s.step === "form_done" && s.tier === "coaching") {
      content = `${hi ? `Bravo ${s.firstName} 🙌` : "Bravo 🙌"}\n\nTon questionnaire est **validé** ✅ Dernière étape pour débloquer ton accès Discord complet : **réserve ton 1er RDV avec Walid** 👉 ${link}`;
    } else if (s.step === "rdv_booked" || s.step === "community_ready") {
      content = `🎉 ${hi}tout est validé — tu as accès à tout sur le Discord. À très vite ! 🧡`;
    }

    if (!content) return { ok: false as const, reason: "no_message" as const };
    await ctx.scheduler.runAfter(0, internal.onboardings.discordDm, {
      discordId: s.discordId,
      content,
    });
    return { ok: true as const };
  },
});
```

- [ ] **Step 3 : Push au form_done coaching** — dans `submitAnswers`, quand `finalize` ET coaching ET on passe à `form_done` (branche `else if (ob.step === "link_sent")`), planifier le DM. Repérer ce bloc :

```ts
      } else if (ob.step === "link_sent") {
        patch.step = "form_done";
      }
```

Et après le `await ctx.db.patch(ob._id, patch);` + le `if (finalize)` existant, ajouter le push coaching à côté du `if (ob.tier === "communaute")` (qui fait déjà grantOnboarded). Cible précise : dans le `if (finalize) { ... }`, après la branche communauté, ajouter :

```ts
      // Coaching : questionnaire validé mais RDV pas encore pris → DM boussole
      // « réserve ton RDV » (le seul moment sans confirmation jusqu'ici).
      if (ob.tier === "coaching" && ob.step === "link_sent") {
        await ctx.scheduler.runAfter(0, internal.onboardings.sendStatusDm, {
          userId: ob.userId,
          context: "transition",
        });
      }
```

⚠️ `ob.step` ici reflète l'état AVANT patch (le doc en mémoire). Vérifier que `ob.step === "link_sent"` est bien la condition qui a déclenché le passage à `form_done` (cf. la branche du patch). Si `ob.step` a été muté en mémoire, utiliser une variable capturée avant le patch.

- [ ] **Step 4 : Pull rappel dans `markPresentedByDiscordId`** — quand un membre lié reposte mais n'est PAS en `awaiting_presentation` (donc coincé en `link_sent`/`form_done`, pas final), lui renvoyer un rappel. Repérer :

```ts
    if (ob.step !== "awaiting_presentation") {
      return { ok: true as const, tier, alreadyDone: true as const };
    }
```

Remplacer par :

```ts
    if (ob.step !== "awaiting_presentation") {
      // Membre coincé qui revient poster (link_sent / form_done) → rappel
      // boussole « voilà où tu en es ». Les états finaux (rdv_booked/
      // community_ready) sont déjà filtrés en amont par le bot (rôle Onboardé),
      // mais on garde sendStatusDm state-aware par sécurité.
      if (ob.step === "link_sent" || ob.step === "form_done") {
        await ctx.scheduler.runAfter(0, internal.onboardings.sendStatusDm, {
          userId: user._id,
          context: "reminder",
        });
      }
      return { ok: true as const, tier, alreadyDone: true as const };
    }
```

- [ ] **Step 5 : Vérifier la compilation** — `cd SKOOL/amour-studios && npx convex dev --once` (push dev) ou `npx tsc --noEmit -p convex` si dispo. Attendu : pas d'erreur de type. (Pas de tests unitaires dans ce repo Convex ; la preuve se fait via logs au déploiement, cf. Task 3.)

- [ ] **Step 6 : Commit** — `git add convex/onboardings.ts && git commit -m "feat(bot): boussole DM statut (push form_done coaching + pull rappel présente-toi)"`

---

### Task 2 : DM paiement (http.ts)

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1 : Welcome DM au paiement (subscription.created uniquement)** — dans `case "customer.subscription.created"/"updated"`, le bloc `if (user?._id && status === "active" && tier)` appelle déjà `ensureForUser` + `regrantOnboardedIfDone`. Récupérer le retour de regrant et, UNIQUEMENT pour une vraie création (`event.type === "customer.subscription.created"`) ET si regrant n'a PAS finalisé (= nouveau membre), envoyer le DM boussole. Modifier :

```ts
          if (user?._id && status === "active" && tier) {
            await ctx.runMutation(internal.onboardings.ensureForUser, {
              userId: user._id,
            });
            const regrant = await ctx.runMutation(
              internal.onboardings.regrantOnboardedIfDone,
              { userId: user._id }
            );
            // Nouveau membre (pas un re-paiement d'onboarding déjà finalisé) :
            // DM boussole d'accueil « paiement validé → présente-toi ».
            // Seulement à la CRÉATION (jamais sur updated = renouvellement).
            if (
              event.type === "customer.subscription.created" &&
              !regrant.ok
            ) {
              await ctx.runAction(internal.onboardings.sendStatusDm, {
                userId: user._id,
                context: "payment_active",
              });
            }
          }
```

- [ ] **Step 2 : DM accès terminé (subscription.deleted)** — dans `case "customer.subscription.deleted"`, après `removeDiscordRoles` + `removeOnboardedRole`, ajouter le DM. Repérer le bloc `if (user?.discordId) { ...removeOnboardedRole... }` et ajouter après les deux removes, AVANT la fermeture du `if (email)` :

```ts
            // DM boussole « ton accès a pris fin » (couvre résiliation ET fin
            // auto du coaching 3 mois). On a besoin du userId : on le tient via
            // findUserByEmail ci-dessus.
            await ctx.runAction(internal.onboardings.sendStatusDm, {
              userId: user._id,
              context: "payment_canceled",
            });
```

⚠️ Vérifier que `user._id` est bien dispo dans ce scope (findUserByEmail renvoie le doc user). Si seul `user.discordId` est garanti, ajuster `_statusForUser`/`sendStatusDm` n'est pas possible sans userId → utiliser `user._id` (présent sur le doc).

- [ ] **Step 3 : Vérifier la compilation** — `npx convex dev --once` (dev) → pas d'erreur.

- [ ] **Step 4 : Commit** — `git add convex/http.ts && git commit -m "feat(bot): DM paiement validé (création) + accès terminé (résiliation/fin 3 mois)"`

---

## Hors périmètre (déjà en place)

- Redirection web→Discord : l'écran `done` (page.tsx:333) a déjà le bouton « Aller sur Discord ». L'étape `rdv` (coaching) garde le Calendly inline — c'est voulu (il DOIT réserver avant d'être renvoyé). Le DM boussole `form_done` est le filet si la page est quittée.
- Anti-spam pull : géré par le cache 24h du bot (`RECENT_PRESENTATIONS`) + idempotence Convex.
- Relances 24h/48h/7j : déjà existantes (cron), complémentaires.

## Self-review

- Couverture : paiement (created) ✓, présentation (existant) ✓, questionnaire coaching→RDV (NOUVEAU) ✓, RDV/communauté final (existant grantOnboarded) ✓, résiliation/fin 3 mois (NOUVEAU) ✓, retour membre coincé (NOUVEAU pull) ✓.
- Pas de double-DM : created gardé par `!regrant.ok` + type created ; final via grantOnboarded (sendStatusDm n'est PAS appelé sur rdv_booked/community_ready en transition) ; updated/renouvellement → aucun DM.
- Types : `sendStatusDm` args `context` optionnel ; `regrant.ok` existe (regrantOnboardedIfDone retourne `{ ok }`).
