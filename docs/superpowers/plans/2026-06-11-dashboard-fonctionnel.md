# Dashboard « Aujourd'hui » 100% cliquable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre chaque widget du dashboard `/studio` (« Aujourd'hui ») actionnable — un clic mène directement à l'élément concerné (l'impayé vers le paiement/l'élève, l'onboarding vers la fiche, etc.).

**Architecture:** Deux couches. (1) **Backend** : enrichir `api.coaching.dashboardToday` pour que chaque item porte son identifiant de liaison (`userId`/`purchaseId`/`date`) — aujourd'hui plusieurs widgets ne sont que du texte. (2) **Frontend** : faire lire des `searchParams` aux pages de destination (`/studio/paiements`, `/studio/eleves`, `/studio/calendrier`) pour pouvoir y arriver pré-filtré, puis câbler chaque widget du dashboard sur la bonne destination.

**Tech Stack:** Next.js 16 (App Router, `useSearchParams`), Convex (queries admin), design Glass C inline (`app/studio/_components/glass.tsx`), `next/navigation` (`useRouter`).

> **Note vérification (pas de TDD unitaire ici)** : ce périmètre est UI + query Convex agrégée. Le projet n'a pas de harnais de tests unitaires pour ces pages. La preuve de bon fonctionnement par tâche = `npx tsc --noEmit` (zéro erreur) + `npm run build` (compile) + smoke manuel décrit (clic → bonne destination). C'est le standard du projet (cf. CLAUDE.md « prouve que ça marche »).

---

## Décisions de design (à valider par Kevin avant exécution)

Chaque widget pointe vers sa destination naturelle. Choix retenus :

| Widget dashboard | Clic → destination | Pourquoi |
|---|---|---|
| KPI **Coaching actifs** | `/studio/eleves?tier=coaching` | Voir la liste filtrée des élèves coaching |
| KPI **Communauté** | `/studio/eleves?tier=commu` | Liste filtrée communauté |
| KPI **Impayés** | `/studio/paiements?status=echec` | Liste filtrée des impayés (past_due) |
| KPI **MRR** | `/studio/paiements` | Vue paiements globale |
| Ligne **Alerte paiement** (impayé) | `/studio/eleves/{userId}` si lié, sinon `/studio/paiements?highlight={purchaseId}` | L'action SAV (relance, change plan, refund) vit sur la fiche élève ; fallback paiement si pas de compte lié |
| Ligne **Onboarding** (col. droite) | `/studio/eleves/{userId}` | Fiche élève |
| Ligne **Activité** | selon type : paiement → `/studio/eleves/{userId}` (ou paiements), membre/session → `/studio/eleves/{userId}` | Aller au profil concerné |
| Cellule **Semaine à venir** (un jour) | `/studio/calendrier?date=YYYY-MM-DD&view=day` | Ouvrir ce jour dans l'agenda |
| Toggle **Jour/Semaine/Mois** (bloc RDV) | `/studio/calendrier?view=jour\|semaine\|mois` | Aujourd'hui décoratif → le rendre fonctionnel |
| Chiffres du **Hero** (« X rdv, Y alertes, Z à relancer ») | rdv → `/studio/calendrier?date=today` · alertes → `/studio/paiements?status=echec` · relances → `/studio/eleves?status=incident` | Raccourcis |

**Convention impayé (exemple explicite de Kevin)** : cliquer une alerte impayé ouvre **la fiche de l'élève concerné** (là où on agit). Si l'achat n'a pas d'utilisateur lié (`userId` null), on retombe sur `/studio/paiements?highlight={purchaseId}` qui surligne la ligne.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `convex/coaching.ts` | Query `dashboardToday` | Modifier : ajouter `purchaseId`/`userId` aux `alertes`, `userId` à `onboarding`, `userId`+`kind` à `activite`, `date` à `rdvSemaine` |
| `app/studio/_components/test-store.ts` | Mock `selectDashboardToday` (mode test) | Modifier : mirrorer les nouveaux champs pour que le mode test ne casse pas |
| `app/studio/paiements/page.tsx` | Page paiements | Modifier : lire `?status=` et `?highlight=` (preset filtre + surlignage) |
| `app/studio/eleves/page.tsx` | Liste élèves | Modifier : lire `?tier=`, `?stage=`, `?status=`, `?q=` (preset filtres) |
| `app/studio/calendrier/page.tsx` | Agenda | Modifier : lire `?date=YYYY-MM-DD` et `?view=` (set anchor + view) |
| `app/studio/page.tsx` | Dashboard | Modifier : rendre KPI / alertes / onboarding / activité / semaine / hero cliquables |

Ordre d'exécution : **backend d'abord** (Task 1-2) car le frontend en dépend ; **lecteurs de deep-link** (Task 3-5) ; **câblage dashboard** en dernier (Task 6).

---

## Task 1 : Enrichir `dashboardToday` avec les identifiants de liaison

**Files:**
- Modify: `convex/coaching.ts` (query `dashboardToday`, ~lignes 691-835 pour la construction, ~852+ pour le `return`)

- [ ] **Step 1 : Enrichir `alertesRows` (purchaseId + userId)**

Lire le bloc actuel (~ligne 693-704) et remplacer le `.map` :

```ts
    const alertesRows = allPurchases
      .filter(
        (p) =>
          p.status === "past_due" ||
          (p.status === "canceled" && (p.revokedAt ?? p.createdAt ?? 0) >= monthAgo)
      )
      .slice(0, 6)
      .map((p) => ({
        purchaseId: p._id,
        userId: p.userId ?? null,
        who: p.email?.split("@")[0] ?? "—",
        type: p.status === "past_due" ? "Échec paiement" : "Annulation",
        montant: `${p.tier === "coaching" ? 179 : 79} €`,
      }));
```

- [ ] **Step 2 : Enrichir `rdvSemaine` (date du jour)**

Dans la boucle (~ligne 733-745), ajouter `date: dStart` :

```ts
    const rdvSemaine: Array<{ jour: string; n: number; date: number }> = [];
    for (let i = 0; i < 5; i++) {
      const dStart = todayStart + i * DAY;
      const dEnd = dStart + DAY;
      const n = scheduled.filter(
        (s) => s.scheduledAt >= dStart && s.scheduledAt < dEnd
      ).length;
      const label = new Date(dStart)
        .toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" })
        .toUpperCase()
        .replace(".", "");
      rdvSemaine.push({ jour: label, n, date: dStart });
    }
```

- [ ] **Step 3 : Enrichir `onboarding` (userId)**

Remplacer la déclaration + le `push` (~ligne 786-797) :

```ts
    const onboarding: Array<{
      userId?: Id<"users">;
      who: string;
      etape: string;
      depuis: string;
    }> = [];
    for (const [uid, p] of purchaseByUser) {
      if (p.tier !== "coaching") continue;
      const u = userById.get(uid);
      if (u?.coachingStage && u.coachingStage !== "onboarding") continue;
      if (u?.onboardingCompletedAt) continue;
      const depuis = `${Math.max(1, Math.round((now - (p.paidAt ?? p.createdAt ?? now)) / DAY))} j`;
      onboarding.push({
        userId: u?._id,
        who: nameOf(u),
        etape: u?.coachingStage ? "À programmer" : "Formulaire envoyé",
        depuis,
      });
      if (onboarding.length >= 5) break;
    }
```

- [ ] **Step 4 : Enrichir `activite` (userId + kind)**

Le type `Act` porte déjà `at`/`txt` ; ajouter `userId?`/`kind`. Remplacer (~ligne 802-835) :

```ts
    type Act = {
      at: number;
      txt: string;
      userId?: Id<"users">;
      kind: "payment" | "user" | "session";
    };
    const acts: Act[] = [];
    for (const p of allPurchases) {
      if (p.paidAt) {
        const u = p.userId ? userById.get(p.userId as unknown as string) : null;
        acts.push({
          at: p.paidAt,
          userId: u?._id,
          kind: "payment",
          txt: `Paiement reçu — ${nameOf(u) !== "—" ? nameOf(u) : p.email?.split("@")[0]} · ${p.tier === "coaching" ? "179 €" : "79 €"}`,
        });
      }
    }
    for (const u of liveUsers) {
      if (u.createdAt)
        acts.push({ at: u.createdAt, userId: u._id, kind: "user", txt: `Nouveau membre — ${nameOf(u)}` });
    }
    const completedSessions = await ctx.db
      .query("coachingSessions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();
    for (const s of completedSessions) {
      const u = userById.get(s.userId as unknown as string);
      acts.push({ at: s.updatedAt, userId: s.userId, kind: "session", txt: `RDV terminé — ${nameOf(u)} · notes ajoutées` });
    }
    const rel = (at: number) => {
      const diff = now - at;
      if (diff < 60 * 60 * 1000) return `il y a ${Math.max(1, Math.round(diff / 60000))} min`;
      if (diff < DAY) return `il y a ${Math.round(diff / (60 * 60 * 1000))} h`;
      if (diff < 2 * DAY) return "hier";
      return `il y a ${Math.round(diff / DAY)} j`;
    };
    const activite = acts
      .sort((a, b) => b.at - a.at)
      .slice(0, 6)
      .map((a) => ({ t: rel(a.at), txt: a.txt, userId: a.userId ?? null, kind: a.kind }));
```

- [ ] **Step 5 : Typecheck**

Run : `npx tsc --noEmit`
Expected : zéro erreur. (Le `return` n'a pas besoin de modif : `alertes: alertesRows`, `onboarding`, `activite`, `rdvSemaine` portent désormais les nouveaux champs ; vérifier que le `return` référence bien ces variables — c'est déjà le cas.)

- [ ] **Step 6 : Déployer la query + smoke**

Run : `npx convex deploy -y`
Expected : « Deployed Convex functions ». Puis vérifier la forme :
Run : `npx convex run --prod coaching:dashboardToday '{}' | head -40`
Expected : les objets `alertes`/`onboarding`/`activite` montrent maintenant `purchaseId`/`userId`/`kind`, et `rdvSemaine` montre `date`.

- [ ] **Step 7 : Commit**

```bash
git add convex/coaching.ts
git commit -m "feat(dashboard): enrichit dashboardToday avec les IDs de liaison (alertes/onboarding/activite/semaine)"
```

---

## Task 2 : Mirrorer les nouveaux champs dans le mode test

**Files:**
- Modify: `app/studio/_components/test-store.ts` (fonction `selectDashboardToday`)

But : le dashboard utilise `selectDashboardToday()` quand `testMode` est actif. Sans ces champs, le mode test crasherait ou afficherait des liens cassés.

- [ ] **Step 1 : Lire la forme actuelle**

Run : `grep -n "selectDashboardToday\|alertes\|onboarding\|activite\|rdvSemaine" app/studio/_components/test-store.ts`
Lire la fonction `selectDashboardToday` pour repérer où `alertes`/`onboarding`/`activite`/`rdvSemaine` sont construits.

- [ ] **Step 2 : Ajouter les champs aux mocks**

Dans `selectDashboardToday`, ajouter aux items mock (utiliser des ids de démo existants du store, ex. `uid("u_mxlo")`, `pid("p_mxlo")`) :
- `alertes[]` → `purchaseId: pid("p_xxx")`, `userId: uid("u_xxx")`
- `onboarding[]` → `userId: uid("u_xxx")`
- `activite[]` → `userId: uid("u_xxx") | null`, `kind: "payment" | "user" | "session"`
- `rdvSemaine[]` → `date: <timestamp du jour i>` (ex. `Date.now() + i * 86400000`)

(Reprendre les helpers d'id-cast `uid`/`pid` déjà présents en haut du fichier.)

- [ ] **Step 3 : Typecheck**

Run : `npx tsc --noEmit`
Expected : zéro erreur (la forme du mock doit matcher le retour réel utilisé par `page.tsx`).

- [ ] **Step 4 : Commit**

```bash
git add app/studio/_components/test-store.ts
git commit -m "test(dashboard): mirroir des nouveaux champs de liaison dans selectDashboardToday"
```

---

## Task 3 : Deep-link de la page Paiements (`?status=` + `?highlight=`)

**Files:**
- Modify: `app/studio/paiements/page.tsx`

- [ ] **Step 1 : Lire le filtre actuel**

Run : `grep -n "useState\|useSearchParams\|statut\|filter\|segmented\|Segmented\|subscriptions" app/studio/paiements/page.tsx | head -30`
Repérer : le state du filtre d'état (segmented `tous|actifs|echec|annule`) et la liste `subscriptions` (chaque item a `id` = purchaseId).

- [ ] **Step 2 : Lire `searchParams` au montage et pré-régler le filtre**

En haut du composant page, ajouter (Next 16 : `useSearchParams` nécessite que la page soit cliente ; elle l'est déjà « use client ») :

```tsx
import { useSearchParams } from "next/navigation";
// ...
const searchParams = useSearchParams();
// Mapping ?status= → valeur du segmented existant. "echec" = past_due (impayés).
const initialStatus = (() => {
  const s = searchParams.get("status");
  if (s === "echec" || s === "past_due") return "echec";
  if (s === "actifs" || s === "active") return "actifs";
  if (s === "annule" || s === "canceled") return "annule";
  return "tous";
})();
const highlightId = searchParams.get("highlight"); // purchaseId à surligner
```

Puis initialiser le state du filtre avec `initialStatus` au lieu de `"tous"` :
`const [statusFilter, setStatusFilter] = useState(initialStatus);` (adapter au nom réel du state trouvé au Step 1).

- [ ] **Step 3 : Surligner la ligne ciblée par `?highlight=`**

Dans le rendu de chaque ligne d'abonnement, comparer `sub.id` à `highlightId` et appliquer un style d'accent (bordure `ACCENT`, léger fond) quand ça matche. Optionnel : `useEffect` + `ref` pour scroller la ligne en vue :

```tsx
const rowRef = useRef<HTMLDivElement | null>(null);
useEffect(() => {
  if (highlightId && rowRef.current) {
    rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}, [highlightId]);
// sur la ligne dont sub.id === highlightId : ref={rowRef} + style surligné
```

- [ ] **Step 4 : Vérif**

Run : `npx tsc --noEmit && npm run build`
Expected : compile, route `/studio/paiements` présente.
Smoke : ouvrir `/studio/paiements?status=echec` → le filtre « échec » est pré-sélectionné. Ouvrir `/studio/paiements?highlight=<un id réel>` → la ligne est surlignée + centrée.

- [ ] **Step 5 : Commit**

```bash
git add app/studio/paiements/page.tsx
git commit -m "feat(paiements): deep-link ?status= et ?highlight= (arriver pré-filtré/surligné)"
```

---

## Task 4 : Deep-link de la liste Élèves (`?tier=&stage=&status=&q=`)

**Files:**
- Modify: `app/studio/eleves/page.tsx`

- [ ] **Step 1 : Lire les filtres actuels**

Run : `grep -n "useState\|useSearchParams\|tier\|coachingStage\|status\|recherche\|search\|segment" app/studio/eleves/page.tsx | head -30`
Repérer les states : segment tier (`tous|coaching|commu`), étape (`coachingStage`), paiement (`tous|ok|incident`), recherche `q`.

- [ ] **Step 2 : Initialiser depuis `searchParams`**

```tsx
import { useSearchParams } from "next/navigation";
// ...
const searchParams = useSearchParams();
const initTier = (searchParams.get("tier") ?? "tous"); // "coaching" | "commu" | "tous"
const initStage = (searchParams.get("stage") ?? "toutes");
const initStatus = (searchParams.get("status") ?? "tous"); // "ok" | "incident" | "tous"
const initQ = (searchParams.get("q") ?? "");
```

Puis brancher chaque state existant sur sa valeur init (adapter aux noms réels) :
`const [tierFilter, setTierFilter] = useState(initTier);` etc.
Mapping à respecter : `?tier=coaching` → segment coaching ; `?tier=commu` → communauté ; `?status=incident` → paiement « incident » (past_due) ; `?status=ok` → actifs.

- [ ] **Step 3 : Vérif**

Run : `npx tsc --noEmit && npm run build`
Smoke : `/studio/eleves?tier=coaching` → liste filtrée coaching. `/studio/eleves?status=incident` → uniquement les impayés. `/studio/eleves?q=jean` → recherche pré-remplie.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/eleves/page.tsx
git commit -m "feat(eleves): deep-link ?tier=&stage=&status=&q= (liste pré-filtrée)"
```

---

## Task 5 : Deep-link de l'Agenda (`?date=YYYY-MM-DD&view=`)

**Files:**
- Modify: `app/studio/calendrier/page.tsx`

- [ ] **Step 1 : Lire l'état anchor/view**

Run : `grep -n "useState\|anchor\|view\|day\|week\|month\|Aujourd" app/studio/calendrier/page.tsx | head -30`
Repérer : `anchor` (Date state) et `view` (`day|week|month`).

- [ ] **Step 2 : Initialiser depuis `searchParams`**

```tsx
import { useSearchParams } from "next/navigation";
// ...
const searchParams = useSearchParams();
const initView = (() => {
  const v = searchParams.get("view");
  if (v === "jour" || v === "day") return "day";
  if (v === "semaine" || v === "week") return "week";
  if (v === "mois" || v === "month") return "month";
  return "week"; // défaut actuel — vérifier le défaut réel au Step 1
})();
const initAnchor = (() => {
  const d = searchParams.get("date"); // "YYYY-MM-DD"
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parsed = new Date(d + "T12:00:00"); // midi pour éviter les bascules TZ
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
})();
```

Brancher `useState(initAnchor)` et `useState(initView)` (adapter aux noms réels). Si `?date=` est fourni sans `?view=`, forcer `view = "day"` (ouvrir le jour précis).

- [ ] **Step 3 : Vérif**

Run : `npx tsc --noEmit && npm run build`
Smoke : `/studio/calendrier?date=2026-06-12&view=day` → ouvre le 12 juin en vue jour. `/studio/calendrier?view=mois` → vue mois.

- [ ] **Step 4 : Commit**

```bash
git add app/studio/calendrier/page.tsx
git commit -m "feat(calendrier): deep-link ?date=YYYY-MM-DD&view= (ouvrir un jour précis)"
```

---

## Task 6 : Câbler tous les widgets du dashboard

**Files:**
- Modify: `app/studio/page.tsx`

Tout est déjà importé (`useRouter` ligne 5). On ajoute des `onClick`/`cursor:pointer` + un petit helper de navigation par activité.

- [ ] **Step 1 : Helper jour → URL agenda + KPI cliquables**

Au-dessus du `return`, ajouter un helper date :

```tsx
const toISODate = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const todayISO = toISODate(Date.now());
```

Rendre les 4 KPI cliquables — englober chaque `<KPI .../>` dans un wrapper cliquable OU ajouter une prop `onClick` au composant `KPI` (préféré). Étendre la signature de `KPI` (lignes 35-78) avec `onClick?: () => void` et appliquer sur le `<Glass>` racine : `style={{ ..., cursor: onClick ? "pointer" : "default" }} onClick={onClick}`. Puis :

```tsx
<KPI ... label="Coaching actifs" onClick={() => router.push("/studio/eleves?tier=coaching")} />
<KPI ... label="Communauté"      onClick={() => router.push("/studio/eleves?tier=commu")} />
<KPI ... label="Impayés"   warn featured onClick={() => router.push("/studio/paiements?status=echec")} />
<KPI ... label="MRR"             onClick={() => router.push("/studio/paiements")} />
```

- [ ] **Step 2 : Alertes paiement cliquables (l'exemple de Kevin)**

Dans le bloc « Paiements » (lignes 236-244), rendre chaque ligne cliquable vers la fiche élève (fallback paiement) :

```tsx
{d.alertes.map((a, i) => (
  <div
    key={i}
    onClick={() => {
      if (a.userId) router.push(`/studio/eleves/${a.userId}`);
      else router.push(`/studio/paiements?highlight=${a.purchaseId}`);
    }}
    style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: "pointer", borderRadius: 10 }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.who}</div>
      <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{a.type}</div>
    </div>
    <div style={{ ...num, fontSize: 14, whiteSpace: "nowrap" }}>{a.montant}</div>
  </div>
))}
```

- [ ] **Step 3 : Onboarding (col. droite) cliquable**

Bloc « Onboarding » (lignes 298-307), rendre chaque ligne cliquable si `o.userId` :

```tsx
{d.onboarding.map((o, i) => (
  <div
    key={i}
    onClick={() => { if (o.userId) router.push(`/studio/eleves/${o.userId}`); }}
    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 6px", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: o.userId ? "pointer" : "default", borderRadius: 10 }}
  >
    <Avatar name={o.who} size={28} dark={dark} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{o.who}</div>
      <div style={{ ...mono, color: c.muted, marginTop: 2 }}>{o.etape}</div>
    </div>
    <div style={{ ...mono, color: c.faint }}>+{o.depuis}</div>
  </div>
))}
```

- [ ] **Step 4 : Activité cliquable**

Bloc « Activité » (lignes 321-326), router vers la fiche élève si `a.userId` :

```tsx
{d.activite.map((a, i) => (
  <div
    key={i}
    onClick={() => { if (a.userId) router.push(`/studio/eleves/${a.userId}`); }}
    style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: i > 0 ? `1px solid ${c.hairline}` : "none", cursor: a.userId ? "pointer" : "default" }}
  >
    <div style={{ ...mono, color: c.faint, width: 84, flexShrink: 0, fontSize: 9.5 }}>{a.t}</div>
    <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.txt}</div>
  </div>
))}
```

- [ ] **Step 5 : Cellules « Semaine à venir » cliquables**

Bloc « Semaine » (lignes 281-286), router vers l'agenda du jour :

```tsx
{d.rdvSemaine.map((day, i) => (
  <div
    key={i}
    onClick={() => router.push(`/studio/calendrier?date=${toISODate(day.date)}&view=day`)}
    style={{ background: i === 0 ? ACCENT : c.chip, color: i === 0 ? "#0B0B0B" : c.text, borderRadius: 14, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: `1px solid ${i === 0 ? "transparent" : c.line}`, boxShadow: `inset 0 1px 0 ${i === 0 ? "rgba(255,255,255,0.2)" : c.inner}`, cursor: "pointer" }}
  >
    <div style={{ ...mono, fontSize: 9.5, opacity: 0.7 }}>{day.jour}</div>
    <div style={{ ...num, fontSize: 22, fontWeight: 500 }}>{day.n}</div>
  </div>
))}
```

- [ ] **Step 6 : Toggle Jour/Semaine/Mois (bloc RDV) fonctionnel**

Lignes 159-161, rendre chaque pastille cliquable vers l'agenda :

```tsx
{["Jour", "Semaine", "Mois"].map((s, i) => (
  <span
    key={s}
    onClick={() => router.push(`/studio/calendrier?view=${s === "Jour" ? "jour" : s === "Semaine" ? "semaine" : "mois"}`)}
    style={{ ...mono, fontSize: 10.5, padding: "6px 12px", borderRadius: 999, cursor: "pointer", background: i === 0 ? (dark ? "rgba(255,255,255,0.92)" : "#0B0B0B") : "transparent", color: i === 0 ? (dark ? "#0B0B0B" : "#FFF") : c.muted }}
  >{s}</span>
))}
```

- [ ] **Step 7 : Chiffres du Hero cliquables**

Lignes 126-130, transformer les 3 chiffres en raccourcis (garder le style, ajouter `cursor:pointer` + `onClick`) :

```tsx
<div style={{ fontSize: 15, color: c.muted, marginTop: -2 }}>
  <span onClick={() => router.push(`/studio/calendrier?date=${todayISO}&view=day`)} style={{ color: c.text, fontWeight: 500, cursor: "pointer" }}>{d.rdvJour.length} rendez-vous</span>,
  <span onClick={() => router.push("/studio/paiements?status=echec")} style={{ color: ACCENT, fontWeight: 500, cursor: "pointer" }}> {d.alertes.length} alertes</span>,
  <span onClick={() => router.push("/studio/eleves?status=incident")} style={{ color: c.text, cursor: "pointer" }}> {d.relances.length} élèves à relancer</span>.
</div>
```

- [ ] **Step 8 : Vérif complète**

Run : `npx tsc --noEmit && npm run build`
Expected : compile, route `/studio` présente.
Smoke (mode réel) : sur `/studio`, cliquer successivement : KPI Impayés → paiements filtré ; une ligne alerte → fiche de l'élève impayé ; une ligne onboarding → fiche ; une ligne activité → fiche ; une cellule de jour → agenda ce jour ; toggle Semaine → agenda vue semaine ; chiffre « X alertes » du hero → paiements filtré.

- [ ] **Step 9 : Commit + déploiement**

```bash
git add app/studio/page.tsx
git commit -m "feat(dashboard): tous les widgets cliquables (KPI, alertes, onboarding, activité, semaine, hero)"
vercel --prod --yes
```
(Convex déjà déployé en Task 1. Vérifier `curl -sI https://amour-studios.vercel.app | head -1` → 200.)

---

## Vérification finale (toutes tâches)

1. `npx tsc --noEmit` → zéro erreur.
2. `npm run build` → compile, routes `/studio`, `/studio/paiements`, `/studio/eleves`, `/studio/calendrier` présentes.
3. Smoke deep-links directs : ouvrir à la main `…/paiements?status=echec`, `…/eleves?tier=coaching`, `…/calendrier?date=<demain>&view=day` → chacun arrive pré-filtré/positionné.
4. Smoke dashboard : depuis `/studio`, chaque widget mène à la bonne destination (voir tableau « Décisions de design »).
5. Mode test (`?test=...` ou toggle test) : le dashboard s'affiche sans erreur avec les nouveaux champs mockés.

## Hors scope (volontaire)

- Pas de nouvelle page de détail « achat » individuel (`/studio/paiements/[id]`) — on surligne dans la liste existante.
- Pas de synchronisation inverse URL↔état (mettre à jour l'URL quand on change un filtre à la main) — uniquement la lecture au montage. À ajouter plus tard si besoin de bookmark/partage.
- Pas de refonte visuelle des widgets — on ajoute seulement l'interactivité (curseur + clic), zéro changement de mise en page.
