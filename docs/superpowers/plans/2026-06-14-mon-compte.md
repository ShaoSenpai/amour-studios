# « Mon Compte » complet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de `/compte` un vrai espace « Mon compte » : identité + déconnexion, abonnement & prochain prélèvement, historique factures + PDF, RDV coaching, gestion de facturation (Portail Stripe), upsell coaching (1 mois / 3 mois / continuer), et un login qui ramène toujours l'utilisateur sur `/compte` après (re)connexion.

**Architecture :** 3 phases **déployables indépendamment**. Phase 1 = fix auth/redirection (`returnTo`). Phase 2 = enrichissement lecture de `/compte` (+ 2 actions Convex Stripe : factures, portail). Phase 3 = offres coaching (2 prix Stripe : 1 mois one-time + 3 mois récurrent) et upsell par tier. On garde la DA Glass C inline (`app/studio/_components/glass.tsx`) et les actions self-service existantes (`convex/subscriptions.ts`).

**Tech Stack :** Next.js 16 (App Router), Convex (`frugal-curlew-831` prod), Convex Auth (Discord OAuth, `@convex-dev/auth`), Stripe (`stripe@22`, `@stripe/react-stripe-js`), déploiement Vercel + `npx convex deploy`.

**Pas de tests unitaires dans ce repo** → la « preuve » de chaque task = `npx convex dev --once` (typecheck/push dev) + `npm run build` vert + vérification manuelle (navigation privée / Resend / Stripe dashboard). On adapte le format TDD en conséquence.

**Règles projet (CLAUDE.md) :** DA Glass C en inline styles (pas de Tailwind sur /compte) ; après édition `convex/*.ts` → `npx convex dev --once` (codegen seul ne pousse pas) ; déploiement Vercel = `vercel --prod` PUIS `vercel promote` ; dark mode = ne pas utiliser var(--white)/var(--ink) sur surfaces toujours-noires.

---

## File Structure

**Phase 1 (auth/redirect)**
- Modify `app/compte/layout.tsx` — redirige non-authed vers `/login?returnTo=/compte`.
- Modify `app/login/page.tsx` — lit `returnTo`, le passe à `signIn(..., { redirectTo })`.
- Modify `proxy.ts` — un authed qui atteint `/login?returnTo=X` part vers X (au lieu de `/`).

**Phase 2 (mon compte — lecture)**
- Modify `convex/subscriptions.ts` — la query `mySubscription` renvoie aussi l'identité (name/email/discordUsername/image) ; nouvelles actions `myInvoices` (liste factures Stripe) et `startBillingPortal` (Portail Client Stripe).
- Modify `app/compte/page.tsx` — bloc identité + déconnexion, historique factures + PDF, bouton « Gérer ma facturation » (portail). (Abonnement/prochain prélèvement/RDV : déjà affichés, on complète.)

**Phase 3 (offres & upsell coaching)**
- Stripe dashboard — créer le prix **Coaching 3 mois** récurrent (prérequis manuel).
- Modify `convex/stripe.ts` — `priceForTier` / nouveau résolveur de prix (1 mois vs 3 mois) ; env `STRIPE_PRICE_COACHING_1M` / `STRIPE_PRICE_COACHING_3M`.
- Modify `convex/subscriptions.ts` — `upgradeMySubscription({ plan })` accepte la cible (`coaching_1m` | `coaching_3m`) ; `mySubscription` expose les options d'upsell selon le tier.
- Modify `app/compte/page.tsx` — UI upsell par tier (Communauté → prendre coaching 1m/3m ; Coaching → continuer 3m).

---

## PHASE 1 — Login & redirection (`returnTo`)

Objectif : après déconnexion puis reconnexion (ou accès direct non connecté), l'utilisateur arrive sur **/compte**, pas sur /exos. Couvre tous les scénarios via un paramètre `returnTo` propagé dans l'OAuth.

### Task 1.1 — `/compte` renvoie vers le login avec `returnTo`

**Files:** Modify `app/compte/layout.tsx`

- [ ] **Step 1 : remplacer la redirection non-authed**

Dans le `useEffect`, remplacer :
```tsx
  useEffect(() => {
    if (me === null) router.replace("/login");
  }, [me, router]);
```
par :
```tsx
  useEffect(() => {
    if (me === null) router.replace("/login?returnTo=%2Fcompte");
  }, [me, router]);
```
(`%2Fcompte` = `/compte` encodé.)

- [ ] **Step 2 : build**

Run : `npm run build` → PASS.

- [ ] **Step 3 : commit**

```bash
git add app/compte/layout.tsx
git commit -m "fix(compte): non-authed -> /login?returnTo=/compte"
```

### Task 1.2 — Le login respecte `returnTo`

**Files:** Modify `app/login/page.tsx`

- [ ] **Step 1 : lire returnTo et le passer à signIn**

Le composant a déjà `const searchParams = useSearchParams();`. Ajouter un helper de sanitisation (n'accepter qu'un chemin interne, jamais une URL externe) et l'utiliser :
```tsx
// en haut du composant, après searchParams :
const rawReturn = searchParams.get("returnTo") || "";
// Sécurité : uniquement un chemin interne ("/...") non protocole-relatif ("//evil").
const returnTo =
  rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";
```
Puis remplacer l'appel `signIn` :
```tsx
// AVANT
await signIn("discord", { redirectTo: "/" });
// APRÈS
await signIn("discord", { redirectTo: returnTo });
```

- [ ] **Step 2 : build**

Run : `npm run build` → PASS.

- [ ] **Step 3 : commit**

```bash
git add app/login/page.tsx
git commit -m "feat(login): respecte returnTo (chemin interne) pour le redirect post-OAuth"
```

### Task 1.3 — Middleware : un authed sur `/login?returnTo=X` part vers X

**Files:** Modify `proxy.ts`

- [ ] **Step 1 : lire la règle actuelle**

Repérer le bloc `/login` (vers la ligne 62) qui fait, si `isAuth`, `nextjsMiddlewareRedirect(request, "/")`.

- [ ] **Step 2 : honorer returnTo**

Remplacer la redirection `/` par une version qui lit `returnTo` depuis l'URL (en restant interne) :
```ts
// dans le bloc isLoginRoute, quand isAuth :
const rt = request.nextUrl.searchParams.get("returnTo");
const dest = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "/";
return nextjsMiddlewareRedirect(request, dest);
```
(Si `nextjsMiddlewareRedirect` n'accepte pas un chemin arbitraire, utiliser l'équivalent `NextResponse.redirect(new URL(dest, request.url))` selon l'API déjà importée dans le fichier.)

- [ ] **Step 3 : build**

Run : `npm run build` → PASS.

- [ ] **Step 4 : commit**

```bash
git add proxy.ts
git commit -m "fix(proxy): /login authed respecte returnTo (retour /compte)"
```

### Task 1.4 — Vérification tous scénarios + déploiement Phase 1

- [ ] **Step 1 : déployer**

```bash
vercel --prod --yes
```
(Pas de changement Convex en Phase 1.)

- [ ] **Step 2 : vérifier en navigation privée (compte membre de test avec abonnement)**
  - Non connecté → ouvrir `/compte` → doit arriver sur `/login?returnTo=/compte` → connexion Discord → **revient sur /compte** ✓
  - Connecté sur /compte → se déconnecter → se reconnecter via /compte → **revient sur /compte** ✓
  - Déjà connecté → ouvrir `/login?returnTo=/compte` → **/compte** ✓
  - Ouvrir `/login` (sans returnTo) → comportement inchangé (dispatcher → /exos ou /studio) ✓
  - Sécurité : `/login?returnTo=https://evil.com` → ignoré → `/` ✓

- [ ] **Step 3 : commit éventuel des corrections de QA** (sinon rien).

---

## PHASE 2 — Page « Mon compte » complète (lecture)

### Task 2.1 — `mySubscription` renvoie l'identité

**Files:** Modify `convex/subscriptions.ts:14-80` (query `mySubscription`)

- [ ] **Step 1 : ajouter les champs identité au retour**

Le handler charge déjà `user`. Ajouter au `return { ... }` final (objet `hasSubscription:true` ET aussi le cas `hasSubscription:false` pour afficher l'identité même sans abonnement) les champs :
```ts
      name: user.name ?? null,
      email: user.email ?? null,
      discordUsername: user.discordUsername ?? null,
      image: user.image ?? null,
```
Pour le cas `return { authed: true, hasSubscription: false }` (ligne ~29), enrichir de même :
```ts
    if (!purchase || !purchase.stripeSubscriptionId)
      return {
        authed: true as const,
        hasSubscription: false as const,
        name: user.name ?? null,
        email: user.email ?? null,
        discordUsername: user.discordUsername ?? null,
        image: user.image ?? null,
      };
```

- [ ] **Step 2 : push + typecheck**

Run : `npx convex dev --once` → « Convex functions ready ».

- [ ] **Step 3 : commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(compte): mySubscription expose l'identité (name/email/discord/avatar)"
```

### Task 2.2 — Action `myInvoices` (historique factures Stripe)

**Files:** Modify `convex/subscriptions.ts` (nouvelle action)

- [ ] **Step 1 : ajouter l'action**

```ts
// Historique de facturation du membre connecté (lecture seule).
export const myInvoices = action({
  args: {},
  handler: async (
    ctx
  ): Promise<
    Array<{
      id: string;
      amountCents: number;
      currency: string;
      created: number; // ms
      status: string | null;
      pdfUrl: string | null;
      hostedUrl: string | null;
    }>
  > => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) return [];
    const stripe = await stripeClient();
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customer) return [];
    const list = await stripe.invoices.list({ customer, limit: 24 });
    return list.data.map((inv) => ({
      id: inv.id,
      amountCents: inv.amount_paid ?? inv.amount_due ?? 0,
      currency: inv.currency ?? "eur",
      created: (inv.created ?? 0) * 1000,
      status: inv.status ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
    }));
  },
});
```
(`action`, `getAuthUserId`, `internal`, `stripeClient` sont déjà importés dans le fichier — vérifier ; `stripeClient` vient de `./stripe` ou est local : réutiliser l'import déjà présent pour les autres actions de subscriptions.ts.)

- [ ] **Step 2 : push + typecheck**

Run : `npx convex dev --once` → ready.

- [ ] **Step 3 : commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(compte): action myInvoices (historique factures Stripe + PDF)"
```

### Task 2.3 — Action `startBillingPortal` (Portail Client Stripe)

**Files:** Modify `convex/subscriptions.ts` (nouvelle action)

- [ ] **Step 1 : ajouter l'action**

```ts
// Ouvre le Portail Client Stripe (factures, carte, plan) — page hébergée Stripe.
export const startBillingPortal = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Non authentifié");
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    if (!p) throw new Error("Aucun abonnement.");
    const stripe = await stripeClient();
    const sub = await stripe.subscriptions.retrieve(p.subscriptionId);
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customer) throw new Error("Customer Stripe introuvable.");
    const site = process.env.SITE_URL ?? "https://amour-studios.vercel.app";
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${site}/compte`,
    });
    return { url: session.url };
  },
});
```

- [ ] **Step 2 : prérequis Stripe (à signaler)** — le Portail Client doit être **activé/configuré** dans le dashboard Stripe (Settings → Billing → Customer portal). Sans ça, `billingPortal.sessions.create` échoue. À faire côté dashboard (manuel) avant le déploiement Phase 2.

- [ ] **Step 3 : push + typecheck + commit**

```bash
npx convex dev --once
git add convex/subscriptions.ts
git commit -m "feat(compte): action startBillingPortal (Portail Client Stripe)"
```

### Task 2.4 — UI `/compte` : identité + déconnexion + factures + portail

**Files:** Modify `app/compte/page.tsx`

Le fichier a déjà : `useAuthActions()` (signOut), `useQuery(api.subscriptions.mySubscription)`, et les blocs abonnement/upgrade/résiliation/RDV. On AJOUTE, en DA Glass C inline (suivre les `Glass`/`mono`/`num` déjà importés) :

- [ ] **Step 1 : bloc identité + déconnexion (haut de page)**

Au-dessus du bloc abonnement, ajouter un encadré `Glass` :
```tsx
{/* Identité connectée */}
<Glass c={c} dark={c.dark} style={{ marginBottom: 14 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Avatar name={sub?.discordUsername || sub?.name || sub?.email || "?"} size={40} dark={c.dark} image={sub?.image ?? undefined} />
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sub?.discordUsername || sub?.name || "Mon compte"}
      </div>
      <div style={{ ...mono, fontSize: 11, color: c.muted }}>{sub?.email ?? "—"}</div>
    </div>
    <GlassButton c={c} kind="ghost" onClick={() => void signOut().then(() => router.replace("/login?returnTo=%2Fcompte"))}>
      Se déconnecter
    </GlassButton>
  </div>
</Glass>
```
(Importer `Avatar` et `GlassButton` depuis `../studio/_components/glass` s'ils ne le sont pas déjà.)

- [ ] **Step 2 : bloc historique factures**

Charger les factures via l'action `myInvoices` au montage (les actions ne sont pas réactives → `useAction` + `useState`/`useEffect`) :
```tsx
const myInvoices = useAction(api.subscriptions.myInvoices);
const [invoices, setInvoices] = useState<Array<{ id: string; amountCents: number; currency: string; created: number; status: string | null; pdfUrl: string | null; hostedUrl: string | null }>>([]);
useEffect(() => {
  if (sub?.hasSubscription) myInvoices({}).then(setInvoices).catch(() => {});
}, [sub?.hasSubscription, myInvoices]);
```
Puis afficher un `Glass` listant chaque facture : date (`new Date(created).toLocaleDateString("fr-FR", { day:"numeric", month:"short", year:"numeric" })`), montant (`(amountCents/100).toFixed(2).replace(".", ",") + " €"`), statut, et un lien `Reçu PDF` → `pdfUrl ?? hostedUrl` (cible `_blank`). Si `invoices.length === 0` → « Aucune facture pour le moment. »

- [ ] **Step 3 : bouton « Gérer ma facturation » (portail)**

Dans le bloc abonnement (ou sous les factures) :
```tsx
const startBillingPortal = useAction(api.subscriptions.startBillingPortal);
// ...
<GlassButton c={c} kind="ghost" onClick={() =>
  startBillingPortal({}).then((r) => { window.location.href = r.url; }).catch((e) => toast.error((e as Error).message))
}>
  Gérer ma facturation ↗
</GlassButton>
```

- [ ] **Step 4 : build + vérif**

Run : `npm run build` → PASS. Vérifier en local (`PORT=3001 npm run dev`, compte de test avec abonnement) : identité affichée, déconnexion OK (revient sur /login?returnTo=/compte), factures listées avec PDF, bouton portail ouvre Stripe. **Tester clair + sombre + mobile.**

- [ ] **Step 5 : commit + déploiement Phase 2**

```bash
git add app/compte/page.tsx
git commit -m "feat(compte): identité + déconnexion + historique factures PDF + portail Stripe"
npx convex deploy -y
vercel --prod --yes
```

---

## PHASE 3 — Offres & upsell coaching depuis `/compte`

Contexte produit (validé 2026-06-14) : **un seul prix coaching** existe (179€/mois récurrent, `STRIPE_PRICE_COACHING` = `price_1TgXRbEPVgDbT6ZucHZ5WJPz`). Les deux « offres » diffèrent **uniquement par le comportement**, PAS par le prix → **aucun nouveau prix Stripe, aucune nouvelle env var** :
- **Coaching 1 mois** = bascule sur le prix coaching + `cancel_at_period_end: true` (1 prélèvement puis stop).
- **Coaching 3 mois** = bascule sur le prix coaching, **récurrent** (`cancel_at_period_end: false`, le membre résilie quand il veut).
- **Continuer mon coaching** (coaché dont l'abo est en annulation programmée) = retirer l'annulation = `reactivateMySubscription` **qui existe déjà** → on le ré-expose juste avec un libellé adapté.

Depuis /compte : **Communauté** → prendre coaching 1 mois OU 3 mois ; **Coaching avec annulation programmée** → continuer (3 mois). (Distinct de l'upsell d'onboarding +100€ qui reste dans `stripe.ts`.)

### ~~Task 3.1 — Prix Stripe~~ — SUPPRIMÉE
Plus de prix/env à créer (cf. décision ci-dessus). On réutilise `priceForTier("coaching")`.

### Task 3.2 — `upgradeMySubscription({ plan })` (même prix, comportement différent)

**Files:** Modify `convex/subscriptions.ts` (action `upgradeMySubscription` + query `mySubscription`)

- [ ] **Step 1 : accepter la cible de plan**

`upgradeMySubscription` passe d'aucun argument à `{ plan }`. **Même prix** (`priceForTier("coaching")`) pour les deux ; seul `cancel_at_period_end` change :
```ts
export const upgradeMySubscription = action({
  args: { plan: v.union(v.literal("coaching_1m"), v.literal("coaching_3m")) },
  handler: async (ctx, { plan }): Promise<{ ok: true; already?: boolean }> => {
    // ... mêmes guards existants (auth, purchase, déjà coaching → already, rate-limit) ...
    const coachingPrice = priceForTier("coaching"); // un seul prix coaching
    // ... retrieve sub + itemId ...
    await stripe.subscriptions.update(p.subscriptionId, {
      items: [{ id: itemId, price: coachingPrice }],
      proration_behavior: "none",
      billing_cycle_anchor: "now",
      payment_behavior: "error_if_incomplete",
      cancel_at_period_end: plan === "coaching_1m", // 1 mois = 1 prélèvement puis stop ; 3 mois = récurrent
      metadata: { ...(sub.metadata ?? {}), tier: "coaching", duree: plan === "coaching_1m" ? "1mois" : "3mois" },
    });
    // ... try/catch 402, _applyUpgrade, assignDiscordRole inchangés ...
```
⚠️ Le `cancelAtPeriodEnd` du purchase doit refléter le choix : après l'upgrade, patcher `cancelAtPeriodEnd` sur le purchase (via `internal.stripe.patchPurchase`, déjà utilisé par cancel/reactivate) à `plan === "coaching_1m"` — sinon le webhook le resynchronisera mais l'UI pourrait être en retard. Ajouter ce patch après `_applyUpgrade`.

- [ ] **Step 2 : `mySubscription` expose les options d'upsell**

Remplacer `canUpgrade` par :
```ts
canTakeCoaching: purchase.tier === "communaute" && purchase.status !== "canceled", // Communauté → propose 1m + 3m
canContinueCoaching: purchase.tier === "coaching" && purchase.cancelAtPeriodEnd === true && purchase.status !== "canceled", // coaché en annulation programmée → propose de continuer
```
(« Continuer » = lever l'annulation = `reactivateMySubscription` qui existe déjà ; pas de nouvelle action backend.)

- [ ] **Step 3 : push + typecheck + commit**

```bash
npx convex dev --once
git add convex/subscriptions.ts
git commit -m "feat(offres): upgradeMySubscription({plan}) 1m=cancel/3m=récurrent + flags upsell"
```

### Task 3.3 — UI upsell `/compte` par tier

**Files:** Modify `app/compte/page.tsx`

- [ ] **Step 1 : adapter le bloc upgrade existant**

Le bloc upgrade actuel (`upgradeMut({})`) appelle sans argument. Le remplacer par une UI conditionnelle :
- Si `sub.canTakeCoaching` (Communauté) → deux boutons : **« Coaching 1 mois · 179€ »** (`upgradeMut({ plan: "coaching_1m" })`) et **« Coaching 3 mois · 179€/mois »** (`upgradeMut({ plan: "coaching_3m" })`), avec un court descriptif (1 mois = un prélèvement ; 3 mois = abonnement qui continue).
- Si `sub.canContinueCoaching` (Coaching dont l'abo est en annulation programmée) → un bouton **« Continuer mon coaching »** qui appelle **`reactivateMut({})`** (réactivation existante = lève l'annulation), PAS upgradeMut. Note : le bouton « Réactiver » générique existant peut être réutilisé/relibellé selon le tier.
- Sinon → pas de bloc upsell.
Chaque clic réutilise le helper `run(...)` existant + le toast succès, puis refresh de `mySubscription` (réactif).

- [ ] **Step 2 : build + vérif**

Run : `npm run build` → PASS. Tester (compte Communauté de test) : voir les 2 options ; prendre « 3 mois » avec carte test `4242` → bascule coaching, toast OK, l'écran reflète le nouveau tier. Tester aussi le cas carte refusée (`4000 0000 0000 0002`) → message d'erreur, **pas** de bascule (atomicité `error_if_incomplete`). Clair + sombre + mobile.

- [ ] **Step 3 : commit + déploiement Phase 3**

```bash
git add app/compte/page.tsx
git commit -m "feat(compte): upsell coaching par tier (Communauté 1m/3m, Coaching continuer 3m)"
npx convex deploy -y
vercel --prod --yes
```

---

## Self-Review

1. **Couverture du périmètre :**
   - Identité + déconnexion → Task 2.1 + 2.4 ✓
   - Abonnement & prochain prélèvement → déjà dans `mySubscription` (currentPeriodEnd/cancelAtPeriodEnd) ✓
   - Historique factures + PDF → Task 2.2 + 2.4 ✓
   - RDV coaching → déjà exposé (`needsFirstRdv`/`nextRdvAt`) — affichage à confirmer dans /compte (déjà présent) ✓
   - Portail Stripe (hybride) → Task 2.3 + 2.4 ✓
   - Upsell Communauté → coaching (1m/3m) et Coaching → continuer (3m) → Task 3.1-3.3 ✓
   - Résiliation → déjà existante (`cancelMySubscription`), inchangée ✓
   - Login revient sur /compte (tous scénarios) → Phase 1 ✓

2. **Placeholders :** aucune section « TBD ». Le seul point ouvert assumé = la nature exacte du prix « Coaching 1 mois » (one-time vs recurring+cancel) → tranché dans Task 3.1 (recurring + `cancel_at_period_end`).

3. **Cohérence des types :** `upgradeMut({ plan })` (Task 3.2) ↔ UI (Task 3.3) utilisent `"coaching_1m"|"coaching_3m"` ; `mySubscription` expose `canTakeCoaching`/`canContinueCoaching` (Task 3.2) consommés en 3.3 ; `myInvoices`/`startBillingPortal` (2.2/2.3) consommés en 2.4 avec la même forme.

4. **Dépendances inter-phases :** Phase 1 indépendante (déployable seule). Phase 2 indépendante (lecture, déployable seule). Phase 3 dépend de la création des prix Stripe (Task 3.1, manuel) — bloquant à signaler avant exécution.

5. **YAGNI :** pas de downgrade self-service, pas d'annulation immédiate (hors scope, restent côté admin).
