# Payment Page Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la page `amourstudios.fr/paiement` (fichier `~/Desktop/AMOURstudios_SITE/paiement/index.html`) pour maximiser la conversion : layout 2 colonnes, toggle 1×/3× en évidence, payment methods restreints (card/apple/gpay/paypal), trust signals logos + Stripe, FAQ simplifiée, sans garantie ni urgence.

**Architecture:** HTML/CSS/JS inline dans un seul fichier `index.html` (~780 lignes). Backend Convex (`convex/stripe.ts`) déjà prêt pour 1×/3× via `createPaymentIntent` — on ajoute juste la restriction `payment_method_types` explicite. Déploiement via FTP OVH (l'utilisateur le fait manuellement).

**Tech Stack:** HTML5 + CSS inline (variables DA déjà définies : Anton/Instrument Serif/DM Sans, palette ink/paper/tomato/pine/mustard), Stripe.js v3 PaymentElement, fetch API vers Convex httpAction.

**Spec:** `docs/superpowers/specs/2026-04-14-payment-page-conversion-design.md`

---

## File Structure

Un seul fichier frontend + une micro-modif backend :

- **Modify** : `convex/stripe.ts` — ajouter `payment_method_types: ['card', 'paypal']` sur le 1× (wallets Apple/Google passent via `card`)
- **Modify** : `~/Desktop/AMOURstudios_SITE/paiement/index.html` — restructurer HTML body + CSS additionnel + JS updates

Après édition, l'utilisateur uploadera `index.html` via FTP OVH.

---

## Task 1 : Backend — Restrict payment_method_types (1× mode)

**Files:**
- Modify: `convex/stripe.ts` (ligne ~42-54, le bloc `if (mode === "1x")`)

**But :** Remplacer `automatic_payment_methods: { enabled: true }` par `payment_method_types: ['card', 'paypal']` pour forcer Stripe à n'offrir que carte (+ Apple/Google Pay via wallets) + PayPal. Supprime Bancontact, iDEAL, Wero, Klarna, EPS.

- [ ] **Step 1 : Modifier le PaymentIntent 1× dans stripe.ts**

Dans `convex/stripe.ts`, remplacer le bloc (ligne ~41-61) :

```ts
    if (mode === "1x") {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 49700,
        currency: "eur",
        automatic_payment_methods: { enabled: true },
        receipt_email: normalizedEmail || undefined,
        description: "AMOURstudios® — Le Programme Créateur (1×)",
        metadata: {
          product: "amourstudios_programme_createur",
          mode: "1x",
          source: "amourstudios.fr/paiement",
          email: normalizedEmail,
        },
      });
      return {
        clientSecret: paymentIntent.client_secret,
        amount: 49700,
        currency: "eur",
        mode: "1x",
      };
    }
```

par :

```ts
    if (mode === "1x") {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 49700,
        currency: "eur",
        payment_method_types: ["card", "paypal"],
        receipt_email: normalizedEmail || undefined,
        description: "AMOURstudios® — Le Programme Créateur (1×)",
        metadata: {
          product: "amourstudios_programme_createur",
          mode: "1x",
          source: "amourstudios.fr/paiement",
          email: normalizedEmail,
        },
      });
      return {
        clientSecret: paymentIntent.client_secret,
        amount: 49700,
        currency: "eur",
        mode: "1x",
      };
    }
```

Note : Apple Pay et Google Pay s'affichent automatiquement dans le PaymentElement dès que `card` est dans `payment_method_types` et que l'environnement supporte les wallets (HTTPS + compat navigateur).

- [ ] **Step 2 : Update le PaymentIntent dans la Subscription 3×**

Dans le même fichier, au niveau de `stripe.subscriptions.create` (ligne ~86-99), ajouter `payment_settings.payment_method_types` :

Trouver :

```ts
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_3X }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      cancel_at: threeMonthsFromNow,
      description: "AMOURstudios® — Le Programme Créateur (3×)",
      metadata: {
        product: "amourstudios_programme_createur",
        mode: "3x",
        source: "amourstudios.fr/paiement",
      },
    });
```

Remplacer par :

```ts
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICE_3X }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      expand: ["latest_invoice.payment_intent"],
      cancel_at: threeMonthsFromNow,
      description: "AMOURstudios® — Le Programme Créateur (3×)",
      metadata: {
        product: "amourstudios_programme_createur",
        mode: "3x",
        source: "amourstudios.fr/paiement",
      },
    });
```

Note : les Subscriptions ne supportent pas PayPal de base (restreint à card + SEPA). On reste sur `card` seulement pour le 3×.

- [ ] **Step 3 : Valider TypeScript**

Exécuter :

```bash
cd /Users/kevinbouaphanh/Documents/Claude/Projects/SKOOL/amour-studios
npx tsc --noEmit
```

Attendu : aucune erreur.

- [ ] **Step 4 : Déployer Convex prod**

```bash
cd /Users/kevinbouaphanh/Documents/Claude/Projects/SKOOL/amour-studios
npx convex deploy --cmd "npm run build" --yes
```

Attendu : `✔ Deployed Convex functions to https://frugal-curlew-831.convex.cloud`

- [ ] **Step 5 : Commit**

```bash
cd /Users/kevinbouaphanh/Documents/Claude/Projects/SKOOL/amour-studios
git add convex/stripe.ts
git commit -m "$(cat <<'EOF'
fix(stripe): restreindre payment_method_types à card/paypal (1×) + card (3×)

Retire Bancontact, iDEAL, Wero, Klarna, EPS qui s'affichaient via
automatic_payment_methods. Public cible = FR, wallets Apple/Google Pay
restent exposés via card.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 : Frontend CSS — Nouveaux styles (toggle, trust-strip, payment-logos)

**Files:**
- Modify: `~/Desktop/AMOURstudios_SITE/paiement/index.html` (bloc `<style>`, après la ligne des `.pf-modes` existantes)

**But :** Ajouter les règles CSS nécessaires pour le nouveau toggle 1×/3×, la trust strip avec logos, et les ajustements typo pour le prix principal XXL.

- [ ] **Step 1 : Localiser le bloc `.pf-modes` existant**

Dans `~/Desktop/AMOURstudios_SITE/paiement/index.html`, trouver le bloc CSS `.pf-modes` (vers la ligne 250-280 selon la version). Il contient déjà des styles pour le radio de mode. Les préserver mais les étendre.

Exécuter pour repérer :

```bash
grep -n "\.pf-modes\|\.pf-mode\b\|\.sum-price\|\.sum-trust\|\.pf-submit" ~/Desktop/AMOURstudios_SITE/paiement/index.html | head -20
```

- [ ] **Step 2 : Ajouter les nouveaux blocs CSS juste avant `/* ════ FAQ */`**

Trouver la ligne `/* ════ FAQ */` dans le `<style>`. Juste au-dessus, insérer :

```css
/* ════ Price highlight (colonne gauche) */
.sum-price-xxl{
  font-family:var(--display);
  font-size:clamp(54px,7vw,88px);
  line-height:.9;
  color:var(--tomato);
  margin-top:28px;
  letter-spacing:-.02em;
}
.sum-price-or{
  display:block;
  font-family:var(--serif);
  font-style:italic;
  font-size:20px;
  color:var(--ink-60);
  margin-top:6px;
}

/* ════ Toggle 1× / 3× (au-dessus du PaymentElement) */
.pay-mode-toggle{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
  padding:4px;
  background:var(--ink-06);
  border-radius:12px;
  margin-bottom:20px;
}
.pay-mode-opt{
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:12px 16px;
  border-radius:9px;
  cursor:pointer;
  transition:background .3s var(--ease), color .3s var(--ease);
  font-family:var(--body);
}
.pay-mode-opt input{position:absolute;opacity:0;pointer-events:none}
.pay-mode-opt .pm-main{
  font-family:var(--display);
  font-size:20px;
  line-height:1;
  letter-spacing:-.01em;
}
.pay-mode-opt .pm-sub{
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:1.5px;
  margin-top:4px;
  opacity:.7;
}
.pay-mode-opt .pm-badge{
  position:absolute;
  top:-8px;
  right:-6px;
  background:var(--mustard);
  color:var(--ink);
  font-size:9px;
  font-weight:700;
  letter-spacing:1.5px;
  padding:3px 6px;
  border-radius:4px;
  text-transform:uppercase;
}
.pay-mode-opt:has(input:checked){
  background:var(--ink);
  color:var(--paper);
}
.pay-mode-opt:has(input:checked) .pm-sub{opacity:.8}

/* ════ Trust strip sous le CTA */
.pf-trust-strip{
  display:flex;
  flex-direction:column;
  gap:12px;
  margin-top:18px;
  padding-top:18px;
  border-top:1px solid var(--ink-12);
}
.pf-trust-line{
  display:flex;
  align-items:center;
  gap:10px;
  font-size:12px;
  color:var(--ink-60);
}
.pf-trust-line svg{width:14px;height:14px;flex:none}
.pf-payment-logos{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
}
.pf-pay-logo{
  height:22px;
  padding:4px 8px;
  background:var(--paper-2);
  border:1px solid var(--ink-12);
  border-radius:4px;
  font-family:var(--body);
  font-weight:700;
  font-size:10px;
  letter-spacing:1px;
  color:var(--ink-60);
  display:inline-flex;
  align-items:center;
  text-transform:uppercase;
}
```

- [ ] **Step 3 : Vérifier visuellement que le CSS s'applique bien (localement)**

Ouvrir le fichier dans un navigateur :

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

À ce stade rien n'a changé côté HTML, donc le rendu est identique. On valide juste qu'il n'y a pas d'erreur CSS (dev tools → Console, aucune erreur rouge).

- [ ] **Step 4 : Commit**

```bash
cd ~/Desktop/AMOURstudios_SITE
git add paiement/index.html
git commit -m "feat(paiement-css): styles toggle 1x/3x + trust strip + price XXL" || echo "Note: repo git optional"
```

(Si pas de repo git pour AMOURstudios_SITE, ignorer. L'utilisateur déploie via FTP.)

---

## Task 3 : Frontend HTML — Colonne gauche (offer summary refait)

**Files:**
- Modify: `~/Desktop/AMOURstudios_SITE/paiement/index.html` (bloc `<aside class="summary">`, lignes ~440-475)

**But :** Retirer le prix barré (strike) + le bloc garantie + le support trust (sum-trust-item). Garder : titre programme, value stack (checklist), prix XXL avec 3× en italique en dessous.

- [ ] **Step 1 : Localiser `<aside class="summary">` et son contenu actuel**

```bash
grep -n "aside class=\"summary\"\|</aside>" ~/Desktop/AMOURstudios_SITE/paiement/index.html | head -4
```

- [ ] **Step 2 : Remplacer tout le bloc `<aside class="summary">…</aside>`**

Par le nouveau contenu :

```html
  <aside class="summary">
    <div class="sum-label">Ta commande</div>
    <h1 class="sum-product">Le Programme <em>Créateur</em></h1>
    <p class="sum-tag">la méthode éditoriale pour artistes</p>

    <div class="sum-price-xxl" id="sum-amount">497 €</div>
    <div class="sum-price-or" id="sum-or">ou 3 × 166 € sans frais</div>

    <ul class="sum-list">
      <li><strong>6 modules</strong> · 30+ vidéos structurées</li>
      <li>Docs téléchargeables · checklists · templates</li>
      <li>Cadre éditorial &amp; visuel complet</li>
      <li><strong>Accès à vie</strong> + mises à jour offertes</li>
      <li>Communauté privée d'artistes</li>
    </ul>
  </aside>
```

Notes :
- Plus de `<span class="strike">` (plus de prix barré)
- Plus de bloc `.sum-trust` (plus de garantie / support)
- Plus de `<div class="sum-price-note">` — info 3× déplacée dans `.sum-price-or`
- Le prix utilise la nouvelle classe `.sum-price-xxl` définie en Task 2

- [ ] **Step 3 : Vérifier le rendu**

Rafraîchir le navigateur sur le fichier local :

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Attendu :
- Colonne gauche visible avec : label "Ta commande" · titre programme · tag · prix XXL tomato · mention "ou 3 × 166 € sans frais" en italique · value stack
- Aucun élément garantie / support ne doit être visible

---

## Task 4 : Frontend HTML — Colonne droite (form refait avec toggle 1×/3×)

**Files:**
- Modify: `~/Desktop/AMOURstudios_SITE/paiement/index.html` (bloc `<form id="payment-form">`)

**But :** Remettre le toggle 1×/3× en évidence tout en haut du form, remplacer le `card-element` par un PaymentElement restreint, ajouter trust strip + logos sous le CTA.

- [ ] **Step 1 : Localiser `<form id="payment-form">` et son contenu**

```bash
grep -n "payment-form\|pf-card-element\|pf-submit\|pf-foot" ~/Desktop/AMOURstudios_SITE/paiement/index.html | head -15
```

- [ ] **Step 2 : Remplacer le `<form id="payment-form" class="pay-form" novalidate>…</form>`**

Par :

```html
  <form id="payment-form" class="pay-form" novalidate>
    <div class="pf-step">Règlement</div>
    <h2 class="pf-title">Paiement</h2>

    <div id="pf-config-warning" class="pf-warning" hidden>
      <strong>Configuration requise</strong>
      Remplace <code>STRIPE_PUBLISHABLE_KEY</code> dans ce fichier par ta clé publishable Stripe (pk_live_…). Le backend est déjà en ligne sur Convex.
    </div>

    <!-- Toggle 1x / 3x — en évidence au-dessus du PaymentElement -->
    <div class="pay-mode-toggle" role="radiogroup" aria-label="Mode de paiement">
      <label class="pay-mode-opt">
        <input type="radio" name="mode" value="1x" checked>
        <span class="pm-main">497 €</span>
        <span class="pm-sub">un seul paiement</span>
      </label>
      <label class="pay-mode-opt">
        <input type="radio" name="mode" value="3x">
        <span class="pm-main">3 × 166 €</span>
        <span class="pm-sub">mensuel</span>
        <span class="pm-badge">sans frais</span>
      </label>
    </div>

    <div class="pf-field">
      <label for="pf-email">Email (facture + accès)</label>
      <input type="email" id="pf-email" name="email" required autocomplete="email" placeholder="ton@email.fr">
    </div>

    <div class="pf-field">
      <label for="payment-element">Moyen de paiement</label>
      <div id="payment-element" class="pf-card-element"></div>
    </div>

    <div id="pf-error" class="pf-error" role="alert" hidden></div>

    <button type="submit" id="pf-submit" class="pf-submit">
      <span class="pf-submit-label">Payer 497 €</span>
      <span class="pf-arrow" aria-hidden="true">→</span>
    </button>

    <!-- Trust strip sous le CTA -->
    <div class="pf-trust-strip">
      <div class="pf-trust-line">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Paiement sécurisé · <strong>Stripe</strong> — PCI-DSS niveau 1</span>
      </div>
      <div class="pf-payment-logos">
        <span class="pf-pay-logo">Visa</span>
        <span class="pf-pay-logo">Mastercard</span>
        <span class="pf-pay-logo">Amex</span>
        <span class="pf-pay-logo">Apple Pay</span>
        <span class="pf-pay-logo">Google Pay</span>
        <span class="pf-pay-logo">PayPal</span>
      </div>
    </div>
  </form>
```

Notes :
- L'ancien `#card-element` devient `#payment-element` (Stripe PaymentElement a un ID différent)
- Le `.pf-foot` est remplacé par `.pf-trust-strip` avec 2 lignes (sécurité + logos)

- [ ] **Step 3 : Vérifier le rendu**

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Attendu :
- Toggle 1×/3× visible tout en haut du form, deux onglets côte à côte, 1× sélectionné par défaut (fond ink, texte paper)
- Onglet 3× affiche badge "SANS FRAIS" en mustard
- Champ email conservé
- Zone `#payment-element` vide pour l'instant (Stripe chargera dedans en Task 5)
- CTA "Payer 497 €"
- Trust strip en bas avec icône cadenas + ligne logos

---

## Task 5 : Frontend JS — Wiring Stripe PaymentElement + toggle 1×/3×

**Files:**
- Modify: `~/Desktop/AMOURstudios_SITE/paiement/index.html` (bloc `<script>` principal, vers ligne 570+)

**But :** Remplacer le setup Stripe Elements actuel pour utiliser le `paymentElement` (au lieu de cardElement) + pass `paymentMethodOrder`, gérer le toggle 1×/3× pour refaire un PaymentIntent à la volée, et mettre à jour le CTA dynamiquement.

- [ ] **Step 1 : Localiser le `<script>` principal et la fonction d'init Stripe**

```bash
grep -n "Stripe(STRIPE_PUBLISHABLE_KEY)\|stripe.elements\|cardElement\|confirmPayment" ~/Desktop/AMOURstudios_SITE/paiement/index.html | head -10
```

- [ ] **Step 2 : Remplacer entièrement le bloc `<script>…</script>` principal (juste après `<script src="https://js.stripe.com/v3/"></script>`)**

Par :

```html
<script src="https://js.stripe.com/v3/"></script>
<script>
(function(){
  // ─── Config ────────────────────────────────────────────────────
  var STRIPE_PUBLISHABLE_KEY = "pk_test_MZefSYo2ALTiGYM9ib3QY6ZE";
  var API_ENDPOINT = "https://frugal-curlew-831.convex.site/api/create-payment-intent";
  var CLAIM_REDIRECT_BASE = "https://amour-studios.vercel.app/claim";

  var configWarning = document.getElementById("pf-config-warning");
  if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.indexOf("pk_") !== 0) {
    if (configWarning) configWarning.hidden = false;
    return;
  }

  // ─── Refs DOM ──────────────────────────────────────────────────
  var form = document.getElementById("payment-form");
  var submitBtn = document.getElementById("pf-submit");
  var submitLabel = form.querySelector(".pf-submit-label");
  var errorEl = document.getElementById("pf-error");
  var amountEl = document.getElementById("sum-amount");
  var orEl = document.getElementById("sum-or");
  var emailInput = document.getElementById("pf-email");
  var modeInputs = form.querySelectorAll('input[name="mode"]');

  // ─── State ─────────────────────────────────────────────────────
  var stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
  var elements = null;
  var paymentElement = null;
  var clientSecret = null;
  var currentMode = "1x";

  // ─── UI helpers ────────────────────────────────────────────────
  function setSubmitDisabled(disabled, label){
    submitBtn.disabled = disabled;
    if (label && submitLabel) submitLabel.textContent = label;
  }
  function showError(msg){
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError(){
    errorEl.hidden = true;
    errorEl.textContent = "";
  }
  function updatePriceUI(mode){
    if (mode === "3x") {
      if (amountEl) amountEl.textContent = "3 × 166 €";
      if (orEl) orEl.textContent = "première mensualité aujourd'hui · aucun frais";
      if (submitLabel) submitLabel.textContent = "Payer 166 € aujourd'hui";
    } else {
      if (amountEl) amountEl.textContent = "497 €";
      if (orEl) orEl.textContent = "ou 3 × 166 € sans frais";
      if (submitLabel) submitLabel.textContent = "Payer 497 €";
    }
  }

  // ─── Init ou re-init du PaymentElement ─────────────────────────
  async function initPaymentElement(mode){
    hideError();
    setSubmitDisabled(true, "Chargement…");
    currentMode = mode;
    updatePriceUI(mode);

    try {
      var email = emailInput.value.trim();
      var res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode, email: email }),
      });
      if (!res.ok) {
        var txt = await res.text();
        throw new Error("Backend error: " + txt.slice(0, 200));
      }
      var data = await res.json();
      clientSecret = data.clientSecret;
    } catch (err) {
      console.error("[stripe] createPaymentIntent failed:", err);
      showError("Impossible d'initialiser le paiement. Réessaie dans quelques secondes.");
      setSubmitDisabled(true, mode === "3x" ? "Payer 166 € aujourd'hui" : "Payer 497 €");
      return;
    }

    // Destroy previous element if exists
    if (paymentElement) {
      try { paymentElement.destroy(); } catch {}
      paymentElement = null;
    }

    elements = stripe.elements({
      clientSecret: clientSecret,
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#0D0B08",
          colorText: "#0D0B08",
          colorBackground: "#F4EEE1",
          colorDanger: "#E63326",
          fontFamily: "DM Sans, system-ui, sans-serif",
          borderRadius: "8px",
        },
      },
    });
    paymentElement = elements.create("payment", {
      layout: "tabs",
      paymentMethodOrder: ["card", "apple_pay", "google_pay", "paypal"],
    });
    paymentElement.mount("#payment-element");
    setSubmitDisabled(false, mode === "3x" ? "Payer 166 € aujourd'hui" : "Payer 497 €");
  }

  // ─── Handlers ──────────────────────────────────────────────────
  modeInputs.forEach(function(input){
    input.addEventListener("change", function(){
      if (input.checked) initPaymentElement(input.value);
    });
  });

  // Debounce email change → reinit PI with receipt_email set
  var emailDebounce = null;
  emailInput.addEventListener("input", function(){
    clearTimeout(emailDebounce);
    emailDebounce = setTimeout(function(){
      if (emailInput.value.trim()) initPaymentElement(currentMode);
    }, 800);
  });

  form.addEventListener("submit", async function(e){
    e.preventDefault();
    if (!stripe || !elements || !clientSecret) return;
    hideError();
    setSubmitDisabled(true, "Traitement en cours…");

    try {
      var result = await stripe.confirmPayment({
        elements: elements,
        confirmParams: {
          return_url: CLAIM_REDIRECT_BASE + "?pi={PAYMENT_INTENT_ID}",
          receipt_email: emailInput.value.trim() || undefined,
        },
      });
      if (result.error) {
        showError(result.error.message || "Erreur de paiement");
        setSubmitDisabled(false, currentMode === "3x" ? "Payer 166 € aujourd'hui" : "Payer 497 €");
      }
      // En cas de succès, Stripe redirige via return_url
    } catch (err) {
      console.error("[stripe] confirmPayment failed:", err);
      showError("Erreur inattendue pendant le paiement.");
      setSubmitDisabled(false, currentMode === "3x" ? "Payer 166 € aujourd'hui" : "Payer 497 €");
    }
  });

  // Init au chargement avec mode 1× par défaut
  initPaymentElement("1x");
})();
</script>
```

- [ ] **Step 3 : Vérifier qu'il n'y a plus de références à l'ancien `cardElement`**

```bash
grep -n "cardElement\|card-element\|createToken" ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Attendu : aucun résultat. Si des refs trainent, les supprimer.

- [ ] **Step 4 : Tester localement (sans payer, juste le rendu)**

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Dev tools → Network. Attendu :
- Un appel POST à `frugal-curlew-831.convex.site/api/create-payment-intent` avec body `{"mode":"1x","email":""}`
- Réponse 200 avec `clientSecret`
- Le PaymentElement Stripe se charge dans `#payment-element`
- Méthodes visibles : Card + Apple Pay/Google Pay (si supporté par le navigateur) + PayPal. **PAS** de Bancontact, iDEAL, Klarna, Wero, EPS
- Cliquer sur l'onglet "3 × 166 €" → refetch vers l'API avec `mode: "3x"` → PaymentElement se rafraîchit (probablement carte seulement pour 3×)

- [ ] **Step 5 : Commit (optionnel)**

```bash
cd ~/Desktop/AMOURstudios_SITE
git add paiement/index.html 2>/dev/null
git commit -m "feat(paiement-js): PaymentElement + toggle 1x/3x wiring" 2>/dev/null || echo "Pas de git repo, skip commit"
```

---

## Task 6 : Frontend HTML — FAQ simplifiée (3 questions)

**Files:**
- Modify: `~/Desktop/AMOURstudios_SITE/paiement/index.html` (section `<section class="faq">`)

**But :** Retirer les questions liées à la garantie, garder/reformuler 3 questions : sécurité, 3×, accès après paiement.

- [ ] **Step 1 : Localiser la section FAQ**

```bash
grep -n "section class=\"faq\"\|</section>" ~/Desktop/AMOURstudios_SITE/paiement/index.html | head -6
```

- [ ] **Step 2 : Remplacer la `<section class="faq">…</section>` entière**

Par :

```html
<section class="faq">
  <h3 class="faq-title">Questions fréquentes</h3>
  <div class="faq-list">
    <div class="faq-item">
      <button class="faq-q">Comment fonctionne le paiement en 3× sans frais ?<span class="icon" aria-hidden="true"></span></button>
      <div class="faq-a"><div class="faq-a-inner">
        Première mensualité de 166 € aujourd'hui, puis deux prélèvements automatiques à J+30 et J+60. <em>Aucun intérêt, aucun frais supplémentaire.</em> L'accès à la formation est débloqué <strong>immédiatement</strong> dès le premier paiement.
      </div></div>
    </div>
    <div class="faq-item">
      <button class="faq-q">Quand aurai-je accès après paiement ?<span class="icon" aria-hidden="true"></span></button>
      <div class="faq-a"><div class="faq-a-inner">
        Immédiatement. Tu es redirigé vers la plateforme pour connecter ton Discord et activer ton accès VIP. Un email de confirmation avec ta facture et le lien d'accès t'est aussi envoyé dans la foulée.
      </div></div>
    </div>
    <div class="faq-item">
      <button class="faq-q">Comment rejoindre le Discord VIP ?<span class="icon" aria-hidden="true"></span></button>
      <div class="faq-a"><div class="faq-a-inner">
        Après paiement tu te connectes à la plateforme avec ton compte Discord. Le rôle VIP t'est attribué automatiquement (canaux privés, entraide, annonces). Pas besoin de code d'invitation.
      </div></div>
    </div>
  </div>
</section>
```

Notes :
- Les 3 questions sont fermées par défaut (pas de classe `open`)
- Le FAQ collapsing JS existant devrait déjà fonctionner (il écoute les clics sur `.faq-q`). Pas besoin de le modifier.

- [ ] **Step 3 : Vérifier le rendu**

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Attendu :
- 3 items FAQ, tous fermés par défaut
- Cliquer sur un item → il s'ouvre avec transition
- Plus aucune mention de "garantie" / "remboursement"

---

## Task 7 : Vérification finale + Upload FTP

**Files:** aucune modification. Vérification + déploiement manuel.

**But :** Smoke test complet du fichier local, puis instruction à l'utilisateur pour uploader via FTP OVH.

- [ ] **Step 1 : Grep final pour s'assurer qu'il n'y a plus de références obsolètes**

```bash
grep -n "garantie\|satisfait\|remboursé\|Bancontact\|iDEAL\|Klarna\|Wero\|strike\|sum-trust\|card-element\|cardElement\|pf-foot" ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Attendu : aucun résultat. Si des refs traînent, les supprimer manuellement.

- [ ] **Step 2 : Smoke test visuel desktop**

Ouvrir le fichier en desktop 1280px :

```bash
open ~/Desktop/AMOURstudios_SITE/paiement/index.html
```

Checklist :
- Topbar AMOURstudios logo + retour visible
- 2 colonnes : gauche sticky (offer), droite (form)
- Prix 497 € XXL tomato en colonne gauche
- Mention "ou 3 × 166 € sans frais" italique en dessous
- Value stack 5 items visibles
- Toggle 1×/3× en haut du form avec 1× sélectionné (fond ink)
- Stripe PaymentElement se charge dans `#payment-element`
- Méthodes : card (+ wallets) + PayPal. PAS de Bancontact, iDEAL, Klarna, Wero, EPS
- CTA "Payer 497 €"
- Trust strip sous le CTA : cadenas Stripe + 6 logos moyens de paiement
- FAQ 3 questions, fermées par défaut
- Cliquer sur onglet 3× → prix de gauche devient "3 × 166 €", sous-texte "première mensualité…", CTA "Payer 166 € aujourd'hui", PaymentElement se recharge (card uniquement attendu)

- [ ] **Step 3 : Smoke test responsive (mobile ~375px)**

Dans le navigateur, devtools → toggle device toolbar → iPhone 12 (390×844).

Checklist :
- Single column, pas d'overflow horizontal
- Touch targets ≥ 44px (CTA, toggle options)
- Logos de paiement wrap proprement
- FAQ cliquable en tactile

- [ ] **Step 4 : Instruction utilisateur pour l'upload FTP**

Inviter l'utilisateur à uploader `~/Desktop/AMOURstudios_SITE/paiement/index.html` vers le serveur OVH via son client FTP habituel (FileZilla / Cyberduck / Transmit) dans le dossier `/www/paiement/`.

Message à l'utilisateur :

```
Prêt à déployer. Upload via FTP OVH :
- Local : ~/Desktop/AMOURstudios_SITE/paiement/index.html
- Distant : /www/paiement/index.html (ou le chemin habituel de ta hiérarchie OVH)

Teste ensuite sur amourstudios.fr/paiement avec une CB Stripe test :
  Numéro : 4242 4242 4242 4242
  Exp : 12/34
  CVC : 123
```

- [ ] **Step 5 : (Après upload par l'utilisateur) Test end-to-end en prod**

Sur `https://amourstudios.fr/paiement` :

1. Remplir email test
2. Choisir 1× → sélectionner card
3. Payer avec 4242…
4. Attendu : redirect vers `amour-studios.vercel.app/claim?pi=pi_xxx`
5. Vérifier dans Stripe Dashboard qu'un PaymentIntent de 497€ a bien été créé en mode test avec status `succeeded`

Puis :

1. Relancer la page
2. Choisir 3× → sélectionner card
3. Payer avec 4242…
4. Attendu : PaymentIntent de 166€ + Subscription créée en Stripe (visible dashboard)

---

## Self-Review

**1. Spec coverage :**
- ✅ Layout 2 colonnes desktop / single col mobile → Tasks 3-4 + CSS existant
- ✅ Prix XXL tomato + 3× mention italique → Task 2 (CSS) + Task 3 (HTML)
- ✅ Value stack checklist → Task 3
- ✅ Toggle 1×/3× en évidence au-dessus du PaymentElement → Task 4 + Task 5
- ✅ Stripe PaymentElement restreint à card/apple/gpay/paypal → Task 1 (backend) + Task 5 (frontend paymentMethodOrder)
- ✅ CTA dynamique selon mode → Task 5 (updatePriceUI)
- ✅ Trust strip sous le CTA avec logos + Stripe badge → Task 4
- ✅ FAQ simplifiée 3 questions (pas de garantie) → Task 6
- ✅ Pas de témoignages, social proof, urgence → tous absents du design
- ✅ Pas de garantie → retirée en Task 3 + Task 6

**2. Placeholder scan :** aucun "TBD". Chaque step contient le code complet.

**3. Type consistency :**
- `#payment-element` utilisé en Task 4 (HTML) et Task 5 (JS mount) ✓
- `#sum-amount` / `#sum-or` utilisés en Task 3 (HTML) et Task 5 (JS updatePriceUI) ✓
- `CLAIM_REDIRECT_BASE` = `https://amour-studios.vercel.app/claim` correspond bien au setup actuel
- `API_ENDPOINT` = Convex prod URL correcte
- `payment_method_types` côté backend et `paymentMethodOrder` côté frontend cohérents sur `card/apple_pay/google_pay/paypal`
