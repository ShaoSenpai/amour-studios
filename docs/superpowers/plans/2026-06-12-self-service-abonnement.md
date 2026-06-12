# Self-Service Abonnement (membre Communauté) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal:** Un membre Communauté 79€/mois connecté peut, depuis une page `/compte`, **annuler** son abonnement (fin de période, réactivable) ou **upgrader** vers le Coaching 179€ (bascule immédiate avec proration).

**Architecture:** Page `/compte` en Glass C + actions Convex **self-service** (agissent sur l'abonnement du user AUTHENTIFIÉ via `getAuthUserId`, jamais admin) qui appellent Stripe (`cancel_at_period_end` / `subscriptions.update` avec proration). Le webhook Stripe resynchronise le `purchase`. Réutilise les patterns existants (`cancelSubscription` admin, `upgradeToCoaching`, `recordSubscription`, `assignDiscordRole`/`removeDiscordRoles`).

**Tech Stack:** Convex (actions/internalMutations), Stripe (`subscriptions`), Next 16 App Router, Glass C (`app/studio/_components/glass.tsx`), `@convex-dev/auth` (`getAuthUserId`).

**⚠️ Pas de suite de tests unitaires dans ce repo.** La vérif se fait via : `npx tsc --noEmit`, `npm run build`, `npx convex run --prod <fn>` (test des fonctions backend avec entrées contrôlées), Playwright/manuel pour l'UI, et **Stripe en mode TEST** pour le flux d'argent (carte `4242…`). Les étapes de vérif ci-dessous suivent ça (pas de jest/pytest inventé).

---

## ⚖️ Décisions à confirmer par Kevin (avant d'exécuter)

Ces choix façonnent le plan. Le plan ci-dessous suppose les **recommandations**. Si Kevin préfère une autre option, ajuster la(les) tâche(s) concernée(s).

1. **Approche : custom in-app (recommandé) vs Stripe Customer Portal.**
   - *Custom in-app* (ce plan) : page `/compte` en Glass C, cohérente avec l'app, contrôle total de l'UX + des conditions d'upgrade, réutilise le code Stripe existant.
   - *Stripe Customer Portal* (alternative) : page hébergée par Stripe (annuler/changer plan/carte/factures), ~1 tâche au lieu de 6, mais hors-DA et conditions d'upgrade = standard Stripe. → Si choisi : remplacer Tâches 1-6 par une seule action `createBillingPortalSession` + un bouton « Gérer mon abonnement ». Voir Annexe A.

2. **Conditions de l'upgrade pour un membre EXISTANT : proration immédiate (recommandé).**
   - Le membre paie **maintenant** la différence au prorata des jours restants du mois en cours, puis 179€/mois. Il débloque le coaching **immédiatement**. (≠ l'upsell onboarding +100€ qui était une offre spéciale « maintenant ou jamais ».)
   - Alternative : bascule au prochain cycle (pas de débit immédiat, 179€ le mois suivant, accès coaching seulement au prochain cycle). Moins « instantané ».

3. **Annulation : fin de période + réactivation (recommandé).**
   - `cancel_at_period_end = true` → garde l'accès jusqu'à l'échéance, puis le webhook `customer.subscription.deleted` coupe. Le membre peut **réactiver** (annuler l'annulation) avant l'échéance.
   - Capture d'un **motif** optionnel (pour les stats churn).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `convex/subscriptions.ts` (CRÉER) | Toutes les fonctions **self-service membre** : `mySubscription` (query), `cancelMySubscription`, `reactivateMySubscription`, `upgradeMySubscription` (actions). Séparé du SAV admin de `convex/stripe.ts`. |
| `convex/stripe.ts` (MODIFIER) | Ajouter un internalQuery `_mySubscriptionData` (lecture du purchase du user authentifié) si besoin de db-access depuis les actions. |
| `app/compte/page.tsx` (CRÉER) | Page membre Glass C : statut abonnement + boutons annuler/réactiver/upgrader. |
| `app/compte/layout.tsx` (CRÉER) | Gate auth (redirige non-connecté vers `/login`). |
| `app/page.tsx` (MODIFIER) | (optionnel) lien d'accès — voir Tâche 6. |
| `convex/http.ts` (VÉRIFIER) | Confirmer la resync `customer.subscription.updated/deleted` → patch purchase (Tâche 4). |

Convention : les actions self-service lisent l'utilisateur via `getAuthUserId(ctx)` dans un internalQuery (les actions n'ont pas d'accès db direct), puis agissent sur **son** `purchase.stripeSubscriptionId`. **Jamais** d'`purchaseId` passé par le client (sinon un membre pourrait agir sur l'abonnement d'un autre).

---

## Task 1 : Query `mySubscription` (état de l'abonnement du membre connecté)

**Files:**
- Create: `convex/subscriptions.ts`

- [ ] **Step 1 : Créer le fichier + la query `mySubscription`**

```ts
// convex/subscriptions.ts
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============================================================================
// Self-service abonnement (membre). Toutes les fonctions agissent sur
// l'abonnement de l'utilisateur AUTHENTIFIÉ — jamais d'id passé par le client.
// ============================================================================

/** État de l'abonnement du membre connecté (pour la page /compte). */
export const mySubscription = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authed: false as const };
    const user = await ctx.db.get(userId);
    if (!user) return { authed: false as const };

    // Purchase lié au user (par purchaseId, sinon le plus récent abonnement actif par email).
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !purchase.stripeSubscriptionId) && user.email) {
      const list = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
        .collect();
      purchase =
        list
          .filter(
            (p) =>
              p.stripeSubscriptionId &&
              (p.status === "active" ||
                p.status === "past_due" ||
                p.status === "paid")
          )
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }

    if (!purchase || !purchase.stripeSubscriptionId) {
      return { authed: true as const, hasSubscription: false as const };
    }
    return {
      authed: true as const,
      hasSubscription: true as const,
      tier: purchase.tier ?? null,
      status: purchase.status,
      amountEur: Math.round((purchase.amount ?? 0) / 100),
      currentPeriodEnd: purchase.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: purchase.cancelAtPeriodEnd ?? false,
      canUpgrade: purchase.tier === "communaute" && purchase.status !== "canceled",
    };
  },
});
```

- [ ] **Step 2 : Codegen + tsc**

Run: `npx convex dev --once && npx tsc --noEmit`
Expected: 0 erreur. (`npx convex dev --once` régénère `_generated` et push en dev.)

- [ ] **Step 3 : Tester la query avec un user connecté**

`mySubscription` exige une session authentifiée → non testable via `npx convex run` (pas d'auth CLI). Vérif manuelle reportée à la Tâche 5 (la page /compte affichera la valeur). Ici on s'arrête à : tsc OK + la fonction est déployée (`npx convex env list --prod` non requis ; juste le codegen).

- [ ] **Step 4 : Commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(compte): query mySubscription (état abonnement du membre connecté)"
```

---

## Task 2 : Actions `cancelMySubscription` + `reactivateMySubscription`

**Files:**
- Modify: `convex/subscriptions.ts`
- Modify: `convex/stripe.ts` (réutiliser `stripeClient`, `patchPurchase`, `findUserByPurchase`, `removeDiscordRoles` déjà internes)

- [ ] **Step 1 : internalQuery `_myPurchaseId` (résout le purchase du user authentifié, côté action)**

Les actions n'ont pas d'accès db. On ajoute dans `convex/subscriptions.ts` un internalQuery qui prend le `userId` (résolu dans l'action via une 1re query d'auth) — MAIS `getAuthUserId` ne marche pas dans un internalQuery appelé par une action sans contexte d'auth. Pattern correct : l'action lit l'auth via une `query` publique d'auth d'abord. Ici on encapsule : on ajoute une **query interne d'auth-aware** n'est pas possible → on passe par une **mutation/query publique**. Solution retenue : l'action reçoit le `userId` non, on le résout via `ctx.runQuery(api.subscriptions.mySubscription)` n'expose pas l'id.

→ Ajouter dans `convex/subscriptions.ts` un internalQuery `_resolvePurchaseForUser` (prend `userId: Id<'users'>`) et une query publique `_meId` n'est pas safe. **Pattern propre** : faire des **actions qui appellent `getAuthUserId` indirectement** n'est pas dispo dans les actions.

Décision d'implémentation (lever l'ambiguïté) : on transforme `cancelMySubscription` / `upgradeMySubscription` en **mutations** qui font le travail Convex + planifient une **internalAction** Stripe, OU on garde des **actions** mais on résout l'utilisateur via un internalQuery qui reçoit le `userId` lu par une petite query publique appelée côté client puis passé — NON (un client pourrait passer un autre userId).

**Pattern final, sûr et standard Convex Auth :** ces opérations sont des **actions**, et on résout l'identité dans l'action via `ctx.auth.getUserIdentity()` n'expose pas l'`Id<'users'>`. On utilise donc l'internalQuery suivant qui lit l'auth depuis le `ctx` de l'action n'est pas possible.

> ⚠️ NOTE POUR L'IMPLÉMENTEUR : Convex Auth — `getAuthUserId(ctx)` fonctionne dans `query`, `mutation` ET `action` (le ctx d'action porte l'auth). Donc on PEUT appeler `getAuthUserId(ctx)` directement dans l'action. Le doute ci-dessus est levé : **utiliser `getAuthUserId(ctx)` dans l'action**, puis `ctx.runQuery(internal.subscriptions._purchaseForUser, { userId })` pour lire le purchase. Aucun id n'est accepté du client.

Ajouter l'internalQuery :

```ts
// convex/subscriptions.ts (ajouts)
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const _purchaseForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    let purchase = user.purchaseId ? await ctx.db.get(user.purchaseId) : null;
    if ((!purchase || !purchase.stripeSubscriptionId) && user.email) {
      const list = await ctx.db
        .query("purchases")
        .withIndex("by_email", (q) => q.eq("email", user.email!.toLowerCase()))
        .collect();
      purchase =
        list
          .filter(
            (p) =>
              p.stripeSubscriptionId &&
              (p.status === "active" || p.status === "past_due" || p.status === "paid")
          )
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? purchase;
    }
    if (!purchase || !purchase.stripeSubscriptionId) return null;
    return {
      purchaseId: purchase._id as Id<"purchases">,
      subscriptionId: purchase.stripeSubscriptionId,
      tier: purchase.tier ?? null,
      status: purchase.status,
      cancelAtPeriodEnd: purchase.cancelAtPeriodEnd ?? false,
      discordId: user.discordId ?? null,
      email: user.email ?? null,
    };
  },
});
```

- [ ] **Step 2 : Action `cancelMySubscription`**

```ts
// convex/subscriptions.ts (ajouts)
import { stripeClient } from "./stripe"; // exporter stripeClient depuis stripe.ts si pas déjà (voir note)

export const cancelMySubscription = action({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, { reason }): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement à annuler.");
    if (p.cancelAtPeriodEnd) return { ok: true }; // déjà programmé

    const stripe = await stripeClient();
    await stripe.subscriptions.update(p.subscriptionId, {
      cancel_at_period_end: true,
      ...(reason ? { metadata: { cancel_reason: reason.slice(0, 200) } } : {}),
    });
    await ctx.runMutation(internal.stripe.patchPurchase, {
      purchaseId: p.purchaseId,
      cancelAtPeriodEnd: true,
    });
    await ctx.runMutation(internal.subscriptions._logSelfService, {
      userId,
      type: "subscription.cancel_scheduled",
      title: "Annulation programmée (fin de période)",
    });
    return { ok: true };
  },
});

export const reactivateMySubscription = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement.");
    const stripe = await stripeClient();
    await stripe.subscriptions.update(p.subscriptionId, { cancel_at_period_end: false });
    await ctx.runMutation(internal.stripe.patchPurchase, {
      purchaseId: p.purchaseId,
      cancelAtPeriodEnd: false,
    });
    return { ok: true };
  },
});
```

Note : si `stripeClient` n'est pas exporté depuis `convex/stripe.ts`, l'exporter (`export async function stripeClient()`), OU dupliquer le helper d'init Stripe en haut de `subscriptions.ts`. Vérifier `convex/stripe.ts` : `patchPurchase` (internalMutation) accepte `{ purchaseId, cancelAtPeriodEnd? , status? }` — confirmé par `cancelSubscription`.

- [ ] **Step 3 : internalMutation `_logSelfService` (event)**

```ts
// convex/subscriptions.ts (ajouts)
import { internalMutation } from "./_generated/server";
import { logEvent } from "./lib/events";

export const _logSelfService = internalMutation({
  args: { userId: v.id("users"), type: v.string(), title: v.string() },
  handler: async (ctx, { userId, type, title }) => {
    await logEvent(ctx, { userId, type, title, actor: "member" });
  },
});
```

- [ ] **Step 4 : Codegen + tsc + build**

Run: `npx convex dev --once && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK.

- [ ] **Step 5 : Commit**

```bash
git add convex/subscriptions.ts convex/stripe.ts
git commit -m "feat(compte): annulation + réactivation self-service de l'abonnement membre"
```

---

## Task 3 : Action `upgradeMySubscription` (Communauté → Coaching, proration)

**Files:**
- Modify: `convex/subscriptions.ts`

- [ ] **Step 1 : Action `upgradeMySubscription`**

```ts
// convex/subscriptions.ts (ajouts)
import { priceForTier } from "./stripe"; // exporter priceForTier si pas déjà

export const upgradeMySubscription = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true; already?: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement à upgrader.");
    if (p.tier === "coaching") return { ok: true, already: true }; // idempotence

    // Rate-limit (action publique).
    const rl = await ctx.runMutation(internal.rateLimit.checkAndIncrement, {
      key: `upgradeSelf:${userId}`,
      max: 5,
    });
    if (!rl.allowed) throw new Error("Trop de tentatives. Attends une minute.");

    const stripe = await stripeClient();
    const coachingPrice = priceForTier("coaching");
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error("Abonnement Stripe sans item.");

    // Proration immédiate : Stripe facture la différence au prorata sur la carte
    // enregistrée, et passe à 179€/mois. `proration_behavior: "always_invoice"`
    // crée + paie une facture de proration tout de suite (échoue si la carte est
    // refusée → l'abonnement n'est PAS modifié, rien n'est dégradé).
    await stripe.subscriptions.update(p.subscriptionId, {
      items: [{ id: itemId, price: coachingPrice }],
      proration_behavior: "always_invoice",
      metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: "1mois" },
    });

    // Maj Convex : tier coaching + rôle + onboarding coaching (RDV).
    await ctx.runMutation(internal.subscriptions._applyUpgrade, {
      purchaseId: p.purchaseId,
      userId,
      coachingPrice,
    });
    if (p.discordId) {
      await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
        discordId: p.discordId,
        email: p.email ?? "",
        tier: "coaching",
      });
    }
    return { ok: true };
  },
});
```

> ⚠️ NOTE PAIEMENT : `always_invoice` facture immédiatement la proration via la carte par défaut. Si la carte est refusée, `subscriptions.update` lève une erreur → l'abonnement reste Communauté (pas de dégradation), et l'action throw (message à l'utilisateur). Pas de flux SCA Elements en v1 (comme l'upsell onboarding) — accepter cette limite, ou prévoir un fallback (hors scope, voir Hors-scope).

- [ ] **Step 2 : internalMutation `_applyUpgrade` (purchase + onboarding)**

```ts
// convex/subscriptions.ts (ajouts)
export const _applyUpgrade = internalMutation({
  args: { purchaseId: v.id("purchases"), userId: v.id("users"), coachingPrice: v.string() },
  handler: async (ctx, { purchaseId, userId, coachingPrice }) => {
    await ctx.db.patch(purchaseId, {
      tier: "coaching",
      stripePriceId: coachingPrice,
      amount: 17900,
      duree: undefined,
    });
    // Onboarding : si une row existe et est en community_ready, on la repasse en
    // coaching/form_done pour enchaîner le RDV. Sinon (déjà au-delà), on ne touche pas.
    const ob = await ctx.db
      .query("onboardings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (ob && ob.tier === "communaute") {
      await ctx.db.patch(ob._id, {
        tier: "coaching",
        step: ob.step === "community_ready" ? "form_done" : ob.step,
        updatedAt: Date.now(),
      });
    }
    await logEvent(ctx, {
      userId,
      type: "subscription.tier_changed",
      title: "Upgrade Communauté → Coaching (self-service /compte)",
      actor: "member",
      meta: { from: "communaute", to: "coaching", via: "self_service" },
    });
  },
});
```

- [ ] **Step 3 : Codegen + tsc + build**

Run: `npx convex dev --once && npx tsc --noEmit && npm run build`
Expected: 0 erreur, build OK.

- [ ] **Step 4 : Commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(compte): upgrade Communauté → Coaching self-service (proration immédiate)"
```

---

## Task 4 : Vérifier la resync webhook Stripe → purchase

**Files:**
- Verify: `convex/http.ts` (handler du webhook Stripe)

Objectif : s'assurer que quand Stripe modifie l'abonnement (annulation à l'échéance, proration, changement de prix), le `purchase` Convex est resynchronisé — sinon `/compte` affiche un état périmé.

- [ ] **Step 1 : Lire le switch d'events du webhook**

Run: `grep -nE "customer.subscription|invoice\.paid|recordSubscription|patchPurchase|currentPeriodEnd|cancel_at_period_end" convex/http.ts convex/stripe.ts`
Vérifier que ces events sont gérés :
- `customer.subscription.updated` → patch purchase (`status`, `cancelAtPeriodEnd`, `currentPeriodEnd`, `tier`/`stripePriceId` si le prix a changé).
- `customer.subscription.deleted` → `status: "canceled"` + `removeDiscordRoles`.

- [ ] **Step 2 : Si `customer.subscription.updated` n'est PAS géré → l'ajouter**

Dans le `switch (event.type)` du webhook (`convex/http.ts`), ajouter (en suivant le pattern des cases existants — `claimStripeEvent` en tête, try/catch) :

```ts
case "customer.subscription.updated": {
  const sub = event.data.object as Stripe.Subscription;
  await ctx.runMutation(internal.stripe.syncSubscription, {
    stripeSubscriptionId: sub.id,
    status: sub.status, // active | past_due | canceled | incomplete...
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : undefined,
    stripePriceId: sub.items.data[0]?.price?.id,
  });
  break;
}
```

Et créer l'internalMutation `syncSubscription` dans `convex/stripe.ts` (patch le purchase trouvé par `by_subscription`, dérive `tier` depuis `stripePriceId` via les env `STRIPE_PRICE_COACHING`/`STRIPE_PRICE_COMMUNITY`). Si `syncSubscription` (ou équivalent) existe déjà, **ne rien ajouter**.

- [ ] **Step 3 : Vérif**

Run: `npx convex dev --once && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4 : Commit (seulement si modif)**

```bash
git add convex/http.ts convex/stripe.ts
git commit -m "fix(webhook): resync customer.subscription.updated → purchase (statut/cancel/prix)"
```

---

## Task 5 : Page `/compte` (UI Glass C)

**Files:**
- Create: `app/compte/layout.tsx`
- Create: `app/compte/page.tsx`

- [ ] **Step 1 : Gate auth (`layout.tsx`)**

```tsx
// app/compte/layout.tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { palette, useIsDark, ACCENT } from "../studio/_components/glass";

export default function CompteLayout({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.current);
  const router = useRouter();
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  useEffect(() => {
    if (me === null) router.replace("/login");
  }, [me, router]);
  if (me === undefined)
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  if (me === null) return null;
  return <>{children}</>;
}
```

- [ ] **Step 2 : La page (`page.tsx`) — statut + boutons**

```tsx
// app/compte/page.tsx
"use client";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ACCENT, palette, useIsDark, mono, num, Glass, glassBtn } from "../studio/_components/glass";

export default function ComptePage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const sub = useQuery(api.subscriptions.mySubscription);
  const cancelMut = useAction(api.subscriptions.cancelMySubscription);
  const reactivateMut = useAction(api.subscriptions.reactivateMySubscription);
  const upgradeMut = useAction(api.subscriptions.upgradeMySubscription);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const shell = { background: c.bgGrad, color: c.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', system-ui, sans-serif", padding: 24 } as const;

  if (sub === undefined)
    return <main style={shell}><Loader2 className="animate-spin" style={{ color: c.muted }} /></main>;

  if (!sub.authed || !("hasSubscription" in sub) || !sub.hasSubscription)
    return (
      <main style={shell}>
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460 }}>
          <div style={{ padding: "40px 38px" }}>
            <div style={{ ...mono, color: c.muted }}>Mon compte</div>
            <h1 style={{ ...num, fontSize: 30, margin: "10px 0 0" }}>Aucun abonnement actif.</h1>
            <p style={{ fontSize: 14, color: c.muted, marginTop: 12 }}>
              Tu n'as pas d'abonnement en cours. <a href="https://amourstudios.fr" style={{ color: ACCENT }}>Découvrir les offres ↗</a>
            </p>
          </div>
        </Glass>
      </main>
    );

  const isCoaching = sub.tier === "coaching";
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR") : null;

  return (
    <main style={shell}>
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div>
            <div style={{ ...mono, color: c.muted }}>Mon abonnement</div>
            <h1 style={{ ...num, fontSize: 32, margin: "10px 0 0" }}>
              {isCoaching ? "Coaching" : "Communauté"} · {sub.amountEur}€/mois
            </h1>
            <p style={{ fontSize: 13.5, color: c.muted, marginTop: 10 }}>
              Statut : {sub.status}{sub.cancelAtPeriodEnd && periodEnd ? ` · se termine le ${periodEnd}` : periodEnd ? ` · prochain prélèvement le ${periodEnd}` : ""}
            </p>
          </div>

          {/* UPGRADE (communauté seulement) */}
          {sub.canUpgrade && (
            <div style={{ border: `1px solid ${c.line}`, background: c.chip, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>PASSER AU COACHING</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 12px" }}>
                Débloque le coaching 1:1 avec Walid (RDV + exos). Tu passes à 179€/mois, la différence au prorata est prélevée maintenant.
              </p>
              <button onClick={() => run("up", () => upgradeMut({}), "🎉 Coaching débloqué !")} disabled={!!busy}
                style={{ ...glassBtn(c, "solid"), width: "100%", opacity: busy ? 0.6 : 1 }}>
                {busy === "up" ? "Activation…" : "Passer au Coaching (179€/mois)"}
              </button>
            </div>
          )}

          {/* ANNULER / RÉACTIVER */}
          {sub.cancelAtPeriodEnd ? (
            <button onClick={() => run("re", () => reactivateMut({}), "Abonnement réactivé.")} disabled={!!busy}
              style={{ ...glassBtn(c, "solid"), width: "100%", opacity: busy ? 0.6 : 1 }}>
              {busy === "re" ? "…" : "Réactiver mon abonnement"}
            </button>
          ) : (
            <button onClick={() => { if (confirm("Annuler ton abonnement à la fin de la période en cours ?")) run("ca", () => cancelMut({}), "Annulation programmée à la fin de la période."); }} disabled={!!busy}
              style={{ ...glassBtn(c, "ghost"), width: "100%", opacity: busy ? 0.6 : 1 }}>
              {busy === "ca" ? "…" : "Annuler mon abonnement"}
            </button>
          )}

          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center" }}>
            Besoin d'aide ? <a href="mailto:contact@amourstudios.fr" style={{ color: c.muted }}>contact@amourstudios.fr</a>
          </p>
        </div>
      </Glass>
    </main>
  );
}
```

- [ ] **Step 3 : tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 erreur, route `/compte` listée.

- [ ] **Step 4 : Vérif visuelle (Playwright, mode clair ET sombre)**

Déployer en dev/preview puis charger `/compte` connecté. Vérifier : le statut s'affiche, le bloc upgrade n'apparaît QUE pour communauté, le bouton annuler/réactiver bascule. **Tester en mode sombre** (piège connu, cf. `docs/JOURNAL-ERREURS.md` #15).

- [ ] **Step 5 : Commit**

```bash
git add "app/compte/layout.tsx" "app/compte/page.tsx"
git commit -m "feat(compte): page /compte self-service (statut + annuler/réactiver/upgrader) Glass C"
```

---

## Task 6 : Accès à `/compte`

**Files:**
- Modify: `app/exos/layout.tsx` (ajouter un lien « Mon compte ») OU `app/page.tsx`

- [ ] **Step 1 : Ajouter un lien discret vers `/compte`**

Le plus utile : un lien « Mon compte / abonnement » accessible depuis `/exos` (où atterrissent tous les membres). Ajouter dans `app/exos/layout.tsx` (ou la page `/exos`) un petit lien Glass C `<a href="/compte">Mon abonnement</a>` en header/footer. (Optionnel : un message Discord épinglé avec le lien `amour-studios.vercel.app/compte`.)

- [ ] **Step 2 : tsc + build + commit**

```bash
npx tsc --noEmit && npm run build
git add "app/exos/layout.tsx"
git commit -m "feat(compte): lien d'accès à /compte depuis l'espace membre"
```

---

## Task 7 : Vérification end-to-end (Stripe TEST)

**Files:** aucun (vérif manuelle).

- [ ] **Step 1 : Déployer**

Run: `npx convex deploy -y && vercel --prod --yes`
Expected: déployés.

- [ ] **Step 2 : Flux annulation (membre communauté de test)**

Connecté en tant que membre communauté → `/compte` → « Annuler » → vérifier dans Stripe (test) que `cancel_at_period_end = true` sur l'abonnement, et que `/compte` affiche « se termine le … » + le bouton « Réactiver ». Cliquer « Réactiver » → `cancel_at_period_end = false`.

- [ ] **Step 3 : Flux upgrade**

`/compte` → « Passer au Coaching » → vérifier : une **facture de proration** est créée + payée dans Stripe (test), l'abonnement passe sur le price coaching, le purchase Convex devient `tier: coaching` (`npx convex data purchases --prod` ou la fiche /studio), le rôle Discord Coaching est attribué, et l'espace `/exos` n'affiche plus « active ton coaching ».

- [ ] **Step 4 : Idempotence / sécurité**

- Re-cliquer « Passer au Coaching » quand déjà coaching → `{already:true}`, aucun nouveau débit.
- Vérifier qu'un membre ne peut pas agir sur l'abonnement d'un autre (les actions n'acceptent aucun id client — confirmer en relisant `subscriptions.ts`).

- [ ] **Step 5 : Mettre à jour le journal**

Ajouter dans `docs/JOURNAL-ERREURS.md` (section angles morts) toute limite découverte (ex : SCA non géré sur la proration, comportement past_due).

---

## Self-Review (checklist, fait après écriture)

**Spec coverage :**
- Annuler (fin de période) → Tâche 2 (`cancelMySubscription`) + UI Tâche 5. ✅
- Réactiver → Tâche 2 (`reactivateMySubscription`). ✅
- Upgrader Communauté → Coaching → Tâche 3 (`upgradeMySubscription`, proration) + UI. ✅
- « membre existant, peu importe depuis quand » → les actions agissent sur l'abonnement courant, sans fenêtre temporelle (≠ upsell onboarding). ✅
- Resync de l'état → Tâche 4 (webhook). ✅
- Accès membre → Tâche 5 (page) + Tâche 6 (lien). ✅

**Placeholders :** la Tâche 2 Step 1 contient une longue NOTE de raisonnement (résolution d'auth dans une action) qui se conclut par la décision claire « utiliser `getAuthUserId(ctx)` dans l'action ». L'implémenteur doit suivre la décision finale (en gras), pas le raisonnement barré. Le reste : code complet, chemins exacts.

**Cohérence des types :** `_purchaseForUser` renvoie `{ purchaseId, subscriptionId, tier, status, cancelAtPeriodEnd, discordId, email }` — utilisé tel quel dans les 3 actions. `patchPurchase` (existant) accepte `{ purchaseId, status?, cancelAtPeriodEnd? }`. `assignDiscordRole` attend `{ discordId, email, tier }`. ✅

**Dépendances à vérifier au début de l'exécution** (sinon adapter) : `stripeClient` et `priceForTier` doivent être **exportés** depuis `convex/stripe.ts` (sinon les exporter en Tâche 2 Step 1) ; `patchPurchase` et `assignDiscordRole` sont des internals existants ; `rateLimit.checkAndIncrement` existe (utilisé par `createSubscription`).

---

## Hors-scope (V2)

- Flux **SCA/3DS** sur la proration de l'upgrade (si la carte exige une authentification). V1 échoue proprement (message). V2 : PaymentIntent confirmable côté Elements.
- Changer de carte / voir les factures → renvoyer vers le **Stripe Customer Portal** (Annexe A) ou une page factures dédiée.
- Downgrade Coaching → Communauté.
- Offre de rétention à l'annulation (réduction, pause).
- Coaching **3 mois** (engagement `cancel_at`) : l'annulation/upgrade self-service ne cible que le mensuel ; le 3-mois engagé est hors-scope (géré côté admin).

---

## Annexe A — Alternative : Stripe Customer Portal (si Décision 1 = Portal)

Remplace les Tâches 1-6 par :
1. Action `createBillingPortalSession` (`convex/subscriptions.ts`) : `getAuthUserId` → résout le `stripeCustomerId` → `stripe.billingPortal.sessions.create({ customer, return_url: SITE_URL + "/exos" })` → renvoie `url`.
2. Configurer le portail dans le dashboard Stripe (Settings → Billing → Customer portal) : autoriser **annulation** + **changement de plan** (Communauté ↔ Coaching), désactiver le reste si non voulu.
3. UI : un seul bouton « Gérer mon abonnement » → ouvre `url` (redirect).
4. Webhook : la resync (Tâche 4) devient **obligatoire** (le portail modifie l'abonnement côté Stripe, Convex doit suivre).

Trade-off : ~80% moins de code, robuste (factures/carte/dunning gérés), mais UI hors-DA Glass C et conditions d'upgrade = standard Stripe (proration par défaut, pas de copie émotionnelle custom).
