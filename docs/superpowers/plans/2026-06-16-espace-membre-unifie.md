# Espace Membre Unifié — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fusionner `/exos` et `/compte` en UN seul « espace membre » cohérent, tier-aware, à la DA éditoriale du site — en réutilisant le billing Stripe existant et en ajoutant la continuation mensuelle du coaching.

**Architecture:** Assemblage, pas réécriture. (1) Une coquille partagée `MemberShell` (nav Exercices | Mon compte) au-dessus des pages existantes `/exos` et `/compte`. (2) Routing tier-aware dans le dispatcher racine. (3) Nouvelle action Convex `resumeCoachingMonthly` + flag `canResumeCoaching` pour qu'un coaché dont l'engagement 3 mois est terminé reprenne en mensuel. (4) Reskin des surfaces React de Glass C (glassmorphism) vers l'éditorial du site (mêmes tokens : `#FF5A1F`, Schibsted, DM Mono — seul le traitement des surfaces change).

**Tech Stack:** Next.js 16 (App Router), Convex (`@convex-dev/auth`), Stripe (subscriptions), inline styles (pas de Tailwind sur ces surfaces). Vérification réelle : `npx convex dev --once` (push fonctions) + `vercel --prod` + Playwright + `curl`. Le projet n'a PAS de runner de tests unitaires → la vérification se fait par commandes d'intégration réelles (documentées à chaque tâche), pas par faux tests.

**Référence existant (vérifié 2026-06-16) :**
- Dispatcher : `app/page.tsx:14` → `useQuery(api.users.current)` → `{ role }` → admin=/studio, sinon /exos.
- `/exos/layout.tsx:33` → `api.exercises.accessSummary` → `{ isAuthed, isAdmin, tier, accessibleModules, duree }` ; écran « active ton coaching » si tier≠coaching ; nav linke déjà `/compte`.
- `/compte/page.tsx:67` → `api.subscriptions.mySubscription` (query) ; `:70` `upgradeMySubscription` (action) ; `:71` `startBillingPortal` (action). Aussi exposés : `cancelMySubscription`, `reactivateMySubscription`, `startCardUpdate`, `myInvoices`.
- `convex/subscriptions.ts` : `mySubscription` (14-92), `_purchaseForUser` internalQuery (95-119), `upgradeMySubscription` (166-224). Purchase schema `convex/schema.ts:83-135` (tier/duree/status/stripeSubscriptionId/currentPeriodEnd/cancelAtPeriodEnd).
- DA : `app/studio/_components/glass.tsx` (`palette(dark,ACCENT)`, `ACCENT="#FF5A1F"`, `Glass`, `glassBtn`, `GlassButton`, `Pill`, `mono`, `num`). Polices via `app/layout.tsx` (next/font : `--font-grotesk`, `--font-mono-swiss`).
- Auth : `api.users.current` (`convex/users.ts:18-26`).

**Hors scope (tracks séparés, NE PAS traiter ici) :**
- Contenu pédagogique de Walid (rythme/phrase soleil, fusion Valeurs+Différenciation, drop Viewer idéal) → track « contenu exos ».
- Refonte du PDF en brand guideline complet.
- DA des fichiers HTML d'exos (déjà faite et déployée).

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `app/_components/member-shell.tsx` | Coquille membre partagée : nav (Exercices/Mon compte), header, gate auth, fond DA. | **Créer** |
| `app/exos/layout.tsx` | Enrober le contenu /exos dans `MemberShell` (garder le gate tier + écran upsell). | Modifier |
| `app/compte/layout.tsx` | Enrober /compte dans `MemberShell`. | Modifier |
| `app/page.tsx` | Routing tier-aware : coaché→/exos, communauté→/compte. | Modifier `:18-28` |
| `convex/subscriptions.ts` | Ajouter flag `canResumeCoaching` à `mySubscription` + action `resumeCoachingMonthly`. | Modifier |
| `app/compte/page.tsx` | Bloc « Continuer mon coaching (mensuel) » si `canResumeCoaching`. | Modifier |
| `app/_components/editorial.tsx` | Helpers DA éditoriale (tokens + primitives `EditorialBlock`, `Kicker`, `BigTitle`). | **Créer** (Phase C) |

---

## Phase A — Coquille + nav + routing tier-aware

### Task A1: Composant `MemberShell`

**Files:**
- Create: `app/_components/member-shell.tsx`

**Contexte :** une coquille client qui (a) gate l'auth via `api.users.current`, (b) affiche un header avec nav Exercices | Mon compte (onglet actif selon `usePathname`), (c) pose le fond DA. Réutilise les tokens de `glass.tsx`. Le gating TIER reste dans `/exos/layout.tsx` (la shell ne gate que l'auth).

- [ ] **Step 1: Créer le composant**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { palette, mono, ACCENT } from "@/app/studio/_components/glass";
import { useIsDark } from "@/app/studio/_components/use-is-dark";

const NAV = [
  { href: "/exos", label: "Exercices" },
  { href: "/compte", label: "Mon compte" },
];

export function MemberShell({ children }: { children: React.ReactNode }) {
  const me = useQuery(api.users.current);
  const router = useRouter();
  const pathname = usePathname();
  const dark = useIsDark();
  const c = palette(dark);

  useEffect(() => {
    if (me === null) router.replace("/login?returnTo=" + encodeURIComponent(pathname));
  }, [me, router, pathname]);

  if (me === undefined)
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: c.bgGrad }}>
        <Loader2 size={22} style={{ color: c.muted, animation: "spin 1s linear infinite" }} />
      </main>
    );
  if (me === null) return null;

  return (
    <div style={{ minHeight: "100dvh", background: c.bgGrad, color: c.text }}>
      <header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px clamp(16px,5vw,48px)", borderBottom: `1px solid ${c.line}`,
          position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)",
        }}
      >
        <span style={{ fontFamily: "var(--font-grotesk)", fontWeight: 800, letterSpacing: "-0.02em", textTransform: "uppercase", fontSize: 15 }}>
          Amour<span style={{ color: ACCENT }}>studios</span>
        </span>
        <nav style={{ display: "flex", gap: 8 }}>
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <a
                key={n.href}
                href={n.href}
                style={{
                  ...mono, fontSize: 10.5, textDecoration: "none",
                  padding: "8px 14px", borderRadius: 999,
                  color: active ? c.textOnAccent : c.muted,
                  background: active ? ACCENT : c.chip,
                  border: `1px solid ${active ? ACCENT : c.line}`,
                }}
              >
                {n.label}
              </a>
            );
          })}
        </nav>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(20px,4vw,48px) clamp(16px,5vw,48px)" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier que `use-is-dark` existe**

Run: `ls app/studio/_components/use-is-dark.* 2>/dev/null || grep -rl "useIsDark" app/studio/_components/`
Expected: un fichier exporte `useIsDark`. Si le hook est ailleurs, ajuster l'import du Step 1 vers le bon chemin (chercher `export function useIsDark` ou `export const useIsDark`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep member-shell || echo "OK"`
Expected: `OK` (aucune erreur sur member-shell).

- [ ] **Step 4: Commit**

```bash
git add app/_components/member-shell.tsx
git commit -m "feat(membre): coquille partagée MemberShell (nav Exercices|Mon compte + gate auth)"
```

### Task A2: Brancher /compte sur MemberShell

**Files:**
- Modify: `app/compte/layout.tsx`

**Contexte :** `/compte/layout.tsx` fait déjà un gate auth via `api.users.current` + loader. On le remplace par `MemberShell` (qui fait le même gate + ajoute la nav). On garde le `returnTo`.

- [ ] **Step 1: Remplacer le contenu du layout**

```tsx
import { MemberShell } from "@/app/_components/member-shell";

export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
```

- [ ] **Step 2: Vérifier visuellement (local)**

Run:
```bash
PORT=3001 npm run dev
```
Puis ouvrir `http://localhost:3001/compte` connecté. Expected : header avec nav « Exercices | Mon compte » (Mon compte actif), contenu /compte inchangé en dessous.

- [ ] **Step 3: Commit**

```bash
git add app/compte/layout.tsx
git commit -m "feat(membre): /compte dans la coquille MemberShell"
```

### Task A3: Brancher /exos sur MemberShell (sans casser le gate tier)

**Files:**
- Modify: `app/exos/layout.tsx`

**Contexte :** `/exos/layout.tsx` gate l'auth ET le tier (écran « active ton coaching » si tier≠coaching). On enrobe TOUT le rendu actuel (y compris l'écran upsell) dans `MemberShell`, pour garder la nav visible même sur l'écran upsell (un Communauté doit pouvoir cliquer « Mon compte »). Le gate tier reste tel quel, juste déplacé À L'INTÉRIEUR de la shell.

- [ ] **Step 1: Lire le layout actuel pour repérer le `return` de l'écran upsell et le `return children`**

Run: `sed -n '1,164p' app/exos/layout.tsx`
Expected : repérer (a) le `if (!summary.isAdmin && summary.tier !== "coaching") return (<Glass…>écran upsell</Glass>)`, et (b) le `return <>{children}</>` final.

- [ ] **Step 2: Enrober les DEUX returns dans `<MemberShell>`**

Ajouter l'import en tête :
```tsx
import { MemberShell } from "@/app/_components/member-shell";
```
Puis envelopper l'écran upsell ET le rendu enfant. Exemple du return final :
```tsx
  // tier coaching ou admin → catalogue
  return <MemberShell>{children}</MemberShell>;
```
Et l'écran upsell (garder le contenu Glass existant, juste l'envelopper) :
```tsx
  if (!summary.isAdmin && summary.tier !== "coaching") {
    return (
      <MemberShell>
        {/* … bloc Glass « Active ton coaching » EXISTANT, inchangé … */}
      </MemberShell>
    );
  }
```
⚠️ Ne PAS dupliquer le gate auth : `MemberShell` le fait déjà. Retirer du layout `/exos` la redirection `/login` redondante (garder uniquement la logique TIER + le `useQuery(api.exercises.accessSummary)`).

- [ ] **Step 3: Vérifier les 2 cas (local)**

Ouvrir `http://localhost:3001/exos` :
- connecté **coaching/admin** → nav + catalogue.
- connecté **communauté** → nav + écran « active ton coaching » (et le bouton « Mon compte » de la nav fonctionne).

- [ ] **Step 4: Commit**

```bash
git add app/exos/layout.tsx
git commit -m "feat(membre): /exos dans MemberShell (gate tier conservé, nav sur l'écran upsell)"
```

### Task A4: Routing tier-aware dans le dispatcher

**Files:**
- Modify: `app/page.tsx:18-28`

**Contexte :** aujourd'hui tout membre non-admin va sur `/exos` (un Communauté y voit l'écran upsell). On veut : coaché→/exos, Communauté→/compte (son espace utile). Le tier est sur le purchase ; le plus simple côté client = lire `api.subscriptions.mySubscription` (déjà existant) en plus de `api.users.current`.

- [ ] **Step 1: Modifier la logique de redirection**

```tsx
const me = useQuery(api.users.current);
const sub = useQuery(api.subscriptions.mySubscription);

useEffect(() => {
  if (me === undefined) return;
  if (me === null) { router.replace("/login"); return; }
  if (me.role === "admin") { router.replace("/studio"); return; }
  if (sub === undefined) return; // attendre le tier
  const tier = sub.authed && sub.hasSubscription ? sub.tier : null;
  router.replace(tier === "coaching" ? "/exos" : "/compte");
}, [me, sub, router]);
```

- [ ] **Step 2: Vérifier les redirections (local)**

- compte coaching → `/` redirige vers `/exos`.
- compte communauté → `/` redirige vers `/compte`.
- admin → `/studio`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(membre): dispatcher tier-aware (coaché→/exos, communauté→/compte)"
```

---

## Phase B — Continuation mensuelle du coaching

### Task B1: Exposer `canResumeCoaching` dans `mySubscription`

**Files:**
- Modify: `convex/subscriptions.ts` (query `mySubscription`, 14-92)

**Contexte :** un coaché dont l'engagement 3 mois est terminé a `tier === "coaching"` + `status === "canceled"` (cancel_at atteint). On ajoute un flag `canResumeCoaching = (tier === "coaching" && status === "canceled")` pour piloter l'UI. (Distinct de `canTakeCoaching` qui sert à l'upsell Communauté→Coaching.)

- [ ] **Step 1: Lire le bloc de retour actuel pour insérer le flag**

Run: `sed -n '14,92p' convex/subscriptions.ts`
Expected : repérer l'objet retourné quand `hasSubscription: true` (avec `tier`, `status`, `canTakeCoaching`, …).

- [ ] **Step 2: Ajouter le calcul + le champ**

Dans le handler, juste avant le `return { … }` du cas abonnement actif :
```ts
const canResumeCoaching = tier === "coaching" && status === "canceled";
```
Et dans l'objet retourné, ajouter :
```ts
      canResumeCoaching,
```

- [ ] **Step 3: Pousser + vérifier le retour**

Run:
```bash
npx convex dev --once
# puis tester le retour pour un user coaché annulé (remplacer <subId>):
```
Expected : push sans erreur ; `mySubscription` renvoie `canResumeCoaching` (true pour un coaching canceled, false sinon).

- [ ] **Step 4: Commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(coaching): flag canResumeCoaching (coaching terminé → peut reprendre)"
```

### Task B2: Action `resumeCoachingMonthly`

**Files:**
- Modify: `convex/subscriptions.ts` (ajouter l'action en fin de fichier)

**Contexte :** crée un NOUVEL abonnement Stripe mensuel (price coaching, SANS `cancel_at` → récurrent sans fin) en réutilisant le customer existant, puis applique le tier coaching côté Convex. Réutilise les patterns de `upgradeMySubscription` + `createSubscription` (http). Pas de nouveau price (STRIPE_PRICE_COACHING = 179€/mois récurrent). Mensuel = pas de `cancel_at`.

- [ ] **Step 1: Lire `upgradeMySubscription` + `_applyUpgrade` + `priceForTier` pour réutiliser les helpers**

Run: `sed -n '166,310p' convex/subscriptions.ts`
Expected : repérer `priceForTier`, `_applyUpgrade` (internalMutation), `_purchaseForUser`, l'init Stripe (`new Stripe(process.env.STRIPE_SECRET_KEY!, …)`), et comment le `stripeCustomerId` est récupéré.

- [ ] **Step 2: Écrire l'action**

```ts
export const resumeCoachingMonthly = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true } | { error: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { error: "not_authed" };

    // Purchase courant (même helper que l'upgrade)
    const p = await ctx.runQuery(internal.subscriptions._purchaseForUser, { userId });
    // Si déjà coaching actif, no-op
    if (p && p.tier === "coaching" && (p.status === "active" || p.status === "past_due")) {
      return { ok: true };
    }

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-03-25.dahlia" });

    // Récupérer le customer (depuis le purchase existant ou par email)
    const cust = await ctx.runQuery(internal.subscriptions._stripeCustomerForUser, { userId });
    if (!cust) return { error: "no_customer" };

    const coachingPrice = priceForTier("coaching");
    const claimToken = generateClaimToken();

    // NOUVEL abonnement mensuel : PAS de cancel_at (récurrent sans fin)
    const subscription = await stripe.subscriptions.create({
      customer: cust.stripeCustomerId,
      items: [{ price: coachingPrice }],
      payment_behavior: "error_if_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription", payment_method_types: ["card"] },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: { tier: "coaching", duree: "3mois", resume: "monthly", email: cust.email ?? "", claim_token: claimToken },
    });

    // Enregistre le purchase coaching actif + applique l'accès (réutilise les internals existants)
    await ctx.runMutation(internal.subscriptions._recordResumedCoaching, {
      userId,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: cust.stripeCustomerId,
      stripePriceId: coachingPrice,
      email: cust.email ?? "",
    });

    return { ok: true };
  },
});
```

> ⚠️ Cette action référence 2 internals à créer si absents (Step 3) : `_stripeCustomerForUser` et `_recordResumedCoaching`. Vérifier d'abord s'ils existent sous un autre nom (l'upgrade récupère déjà customer + applique le tier — réutiliser ces helpers plutôt que dupliquer).

- [ ] **Step 3: Créer les internals manquants OU réutiliser**

Run: `grep -nE "internalQuery|internalMutation|_applyUpgrade|stripeCustomerId|_stripeCustomer|_record" convex/subscriptions.ts convex/stripe.ts`
Expected : si `_applyUpgrade` pose déjà le tier coaching + débloque l'accès, l'appeler dans `resumeCoachingMonthly` à la place de `_recordResumedCoaching`. Si un helper customer existe (ex dans `_purchaseForUser` qui renvoie déjà le customer), l'utiliser. Sinon, créer `_stripeCustomerForUser` (internalQuery qui lit `purchase.stripeCustomerId` ou cherche par email) et `_recordResumedCoaching` (internalMutation qui insère un purchase `{ tier:"coaching", duree:"3mois", status:"active", stripeSubscriptionId, stripeCustomerId, stripePriceId, userId, createdAt }` + lie `user.purchaseId` + appelle le helper d'accès coaching). Suivre le pattern EXACT de `_applyUpgrade`.

- [ ] **Step 4: Pousser + smoke-test (Stripe TEST)**

Run:
```bash
npx convex dev --once
```
Puis, en Stripe TEST, depuis /compte d'un compte coaching annulé, déclencher l'action (Task B3). Expected : nouvel abonnement Stripe créé (récurrent, sans cancel_at), purchase coaching `active`, accès /exos rétabli.

- [ ] **Step 5: Commit**

```bash
git add convex/subscriptions.ts
git commit -m "feat(coaching): resumeCoachingMonthly — reprendre le coaching en mensuel (récurrent)"
```

### Task B3: UI « Continuer mon coaching (mensuel) » dans /compte

**Files:**
- Modify: `app/compte/page.tsx` (bloc abonnement, près de l'upsell ligne 269-295)

**Contexte :** afficher un bloc CTA quand `sub.canResumeCoaching === true`. Réutilise le pattern visuel du bloc upgrade existant + un `useAction`.

- [ ] **Step 1: Ajouter le hook action**

Près de `const upgradeMut = useAction(api.subscriptions.upgradeMySubscription);` :
```tsx
const resumeMut = useAction(api.subscriptions.resumeCoachingMonthly);
const [resuming, setResuming] = useState(false);
```

- [ ] **Step 2: Ajouter le bloc CTA (après le bloc upgrade Communauté)**

```tsx
{sub.canResumeCoaching && (
  <div style={{ marginTop: 16, padding: "16px 18px", borderRadius: 14, border: `1px solid ${ACCENT}55`, background: `${ACCENT}10` }}>
    <div style={{ ...mono, fontSize: 10, color: ACCENT, marginBottom: 6 }}>Continuer le coaching</div>
    <p style={{ fontSize: 13, lineHeight: 1.5, color: c.muted, margin: "0 0 12px" }}>
      Ton accompagnement de 3 mois est terminé. Tu peux le reprendre en <strong>mensuel</strong> (179€/mois, sans engagement, résiliable quand tu veux).
    </p>
    <GlassButton
      c={c}
      kind="solid"
      disabled={resuming}
      onClick={async () => {
        setResuming(true);
        try {
          const r = await resumeMut({});
          if ("error" in r) toast.error("Impossible de reprendre. Vérifie ta carte sur le portail Stripe.");
          else { toast.success("Coaching réactivé 🧡"); location.reload(); }
        } catch { toast.error("Erreur. Réessaie."); }
        finally { setResuming(false); }
      }}
    >
      {resuming ? "Réactivation…" : "Reprendre mon coaching (mensuel)"}
    </GlassButton>
  </div>
)}
```

- [ ] **Step 3: Vérifier import `ACCENT`/`GlassButton`/`toast`**

Run: `grep -nE "import.*(ACCENT|GlassButton)|from \"sonner\"|toast" app/compte/page.tsx | head`
Expected : `ACCENT`, `GlassButton` importés de glass.tsx ; `toast` de `sonner`. Ajouter les imports manquants.

- [ ] **Step 4: Vérif E2E (Stripe TEST)**

Compte coaching annulé → /compte affiche le bloc → clic « Reprendre » → abonnement recréé, page recharge, accès /exos OK.

- [ ] **Step 5: Commit**

```bash
git add app/compte/page.tsx
git commit -m "feat(coaching): CTA 'continuer mon coaching (mensuel)' dans /compte"
```

---

## Phase C — DA éditoriale sur les pages React (design-itératif)

> **Note honnête :** Glass C et le site partagent déjà accent `#FF5A1F` + Schibsted + DM Mono. Le delta = passer les SURFACES du glassmorphism (cartes verre floutées) au traitement ÉDITORIAL du site (fonds clairs/blancs, blocs bordés `1px`, gros titres uppercase, kickers DM Mono orange). C'est du design : on itère VISUELLEMENT (screenshots Playwright) plutôt que pré-écrire chaque pixel. Faire APRÈS validation des phases A+B.

### Task C1: Primitives éditoriales partagées

**Files:**
- Create: `app/_components/editorial.tsx`

- [ ] **Step 1: Créer les primitives** (`Kicker`, `BigTitle`, `EditorialBlock`)

```tsx
import { ACCENT } from "@/app/studio/_components/glass";

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: "var(--font-mono-swiss)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: ACCENT, display: "inline-flex", alignItems: "center", gap: 12 }}>
      {children}<span style={{ width: 40, height: 1, background: ACCENT }} />
    </span>
  );
}

export function BigTitle({ w1, w2 }: { w1: string; w2?: string }) {
  return (
    <h1 style={{ fontFamily: "var(--font-grotesk)", fontWeight: 800, fontSize: "clamp(40px,7vw,84px)", lineHeight: 0.92, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "12px 0" }}>
      <span style={{ display: "block" }}>{w1}</span>
      {w2 && <span style={{ display: "block", color: ACCENT }}>{w2}</span>}
    </h1>
  );
}

export function EditorialBlock({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ border: `1px solid ${dark ? "rgba(255,255,255,.14)" : "#E4E2DC"}`, background: dark ? "#0A0A0A" : "#FFFFFF", borderRadius: 0, padding: "clamp(20px,3vw,32px)" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep editorial || echo OK
git add app/_components/editorial.tsx
git commit -m "feat(membre): primitives DA éditoriale (Kicker/BigTitle/EditorialBlock)"
```

### Task C2: Reskin /compte en éditorial

**Files:**
- Modify: `app/compte/page.tsx`

- [ ] **Step 1: Remplacer les conteneurs `Glass` par `EditorialBlock` + hero `Kicker`/`BigTitle`**

Garder TOUTE la logique (queries, actions, conditions) ; ne changer QUE le wrapping visuel : `<Glass c={c} strong>` → `<EditorialBlock>`, ajouter en tête `<Kicker>Mon compte</Kicker><BigTitle w1="Mon" w2="Compte" />`. Conserver les blocs identité / abonnement / RDV / upgrade / resume / portail.

- [ ] **Step 2: QA visuelle (Playwright, local)**

Servir l'app, screenshot `/compte`. Expected : look éditorial (blanc, bordures fines, titre orange) cohérent avec les exos HTML, toutes les actions présentes.

- [ ] **Step 3: Commit**

```bash
git add app/compte/page.tsx
git commit -m "feat(membre): /compte en DA éditoriale du site"
```

### Task C3: Reskin /exos catalogue en éditorial

**Files:**
- Modify: `app/exos/page.tsx`

- [ ] **Step 1: Hero `Kicker`/`BigTitle` + lignes d'exos en blocs bordés**

Garder la logique (queries `accessSummary`/`listAllWithState`, regroupement modules, états). Remplacer le hero Glass par `<Kicker>Mes exercices</Kicker><BigTitle w1="Mes" w2="Exos" />` + compteur ; lignes d'exos en lignes bordées (dot status accent + titre + sous-label), modules verrouillés en bloc gris.

- [ ] **Step 2: QA visuelle + vérifier que les liens vers /exos/[id] marchent**

- [ ] **Step 3: Commit**

```bash
git add app/exos/page.tsx
git commit -m "feat(membre): catalogue /exos en DA éditoriale du site"
```

---

## Déploiement & vérification finale

- [ ] **Backend :** `npx convex deploy` (prod `frugal-curlew-831`).
- [ ] **Front :** `vercel --prod` PUIS `vercel promote <url>` (sinon le domaine public ne bouge pas).
- [ ] **E2E prod (3 comptes) :**
  - **Coaching actif** : `/` → /exos, nav OK, /compte OK, exos accessibles, PDF OK.
  - **Communauté** : `/` → /compte, écran /exos = upsell, bouton upgrade OK.
  - **Coaching terminé (annulé)** : /compte affiche « Continuer mensuel » → reprise OK → /exos rétabli.
- [ ] **Non-régression billing :** annuler / réactiver / changer carte / portail Stripe / factures fonctionnent encore.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for full review pipeline, or individual reviews above.
