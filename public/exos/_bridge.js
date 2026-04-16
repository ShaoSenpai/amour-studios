/* ============================================================================
 * Amour Studios — Exo completion bridge
 * ----------------------------------------------------------------------------
 * Injecté dans chaque HTML exo (<script src="/exos/_bridge.js">).
 *
 * 1. Détecte l'action de complétion :
 *    - jsPDF.prototype.save (11/12 exos)
 *    - <a download="*.ics|pdf|csv"> click (1 exo Google Agenda)
 *    - window.AmourExoComplete() manuel
 *
 * 2. Poste l'event sur 3 canaux (redondance selon le contexte) :
 *    - window.parent.postMessage (cas iframe dans le panneau Exos)
 *    - window.opener.postMessage (cas nouvel onglet, rel sans noopener)
 *    - BroadcastChannel "amour-exo" (cas rel=noopener, cross-tab same-origin)
 *
 * 3. Affiche un bandeau "Retour à la leçon" en top de la page exo
 *    (mode standalone/nouvel onglet uniquement — caché en iframe).
 * ============================================================================ */
(function () {
  "use strict";

  var LOG_PREFIX = "[amour-exo]";
  function log() {
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }
  log("bridge loaded · v2 · inIframe=" + (window.self !== window.top));

  var sent = false;
  var channel = null;
  try { channel = new BroadcastChannel("amour-exo"); log("BroadcastChannel ok"); } catch (e) { log("BroadcastChannel unavailable"); }

  function isInIframe() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function notifyComplete(kind) {
    if (sent) { log("notifyComplete skipped (already sent)"); return; }
    sent = true;
    var msg = {
      type: "amour:exercise-complete",
      kind: kind || "unknown",
      at: Date.now(),
      href: location.pathname,
    };
    log("notifyComplete", msg);
    try { if (window.parent && window.parent !== window) { window.parent.postMessage(msg, "*"); log("→ parent"); } } catch (e) { log("parent err", e); }
    try { if (window.opener) { window.opener.postMessage(msg, "*"); log("→ opener"); } } catch (e) { log("opener err", e); }
    try { if (channel) { channel.postMessage(msg); log("→ BroadcastChannel"); } } catch (e) { log("channel err", e); }

    // Bandeau visible uniquement en mode standalone (nouvel onglet)
    if (!isInIframe()) {
      log("showing return banner");
      try { showReturnBanner(); } catch (e) { log("banner err", e); }
    }

    setTimeout(function () { sent = false; }, 3000);
  }

  // ── Hook jsPDF.prototype.save ────────────────────────────────────────────
  function tryHookJsPDF() {
    var jspdf = window.jspdf || window.jsPDF;
    var Ctor = (jspdf && jspdf.jsPDF) || window.jsPDF;
    if (!Ctor || !Ctor.prototype || Ctor.prototype.__amourHooked) return false;
    var origSave = Ctor.prototype.save;
    Ctor.prototype.save = function () {
      log("jsPDF.save intercepted");
      try { return origSave.apply(this, arguments); }
      finally { notifyComplete("pdf"); }
    };
    Ctor.prototype.__amourHooked = true;
    log("jsPDF hooked");
    return true;
  }
  if (!tryHookJsPDF()) {
    var tries = 0;
    var int = setInterval(function () {
      if (tryHookJsPDF() || ++tries > 50) { clearInterval(int); if (tries > 50) log("jsPDF never loaded"); }
    }, 100);
  }

  // ── Hook téléchargements de fichiers (.ics .pdf .csv) ────────────────────
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var name = (this.download || "").toLowerCase();
      if (/\.(ics|pdf|csv)$/.test(name)) {
        log("anchor.click intercepted (" + name + ")");
        notifyComplete(name.split(".").pop());
      }
    } catch (e) {}
    return origClick.apply(this, arguments);
  };

  // ── Belt-and-suspenders : hook click sur boutons à texte "PDF"/"Générer" ─
  // Si jsPDF save n'est pas interceptée (autre méthode), on déclenche quand
  // même notifyComplete après 300ms (le téléchargement s'est probablement lancé)
  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== document.body) {
      if (t.tagName === "BUTTON" || t.tagName === "A") {
        var txt = (t.innerText || t.textContent || "").toUpperCase();
        if (/GÉNÉRER|GENERER|TÉLÉCHARGER|TELECHARGER|PDF|EXPORTER/.test(txt) &&
            !/ANNULER|RETOUR/.test(txt)) {
          log("completion button clicked, arming fallback: " + txt.substring(0, 40));
          setTimeout(function () {
            if (!sent) { log("fallback notify (button-click)"); notifyComplete("button"); }
          }, 800);
          return;
        }
      }
      t = t.parentNode;
    }
  }, true);

  // ── Banner retour à la leçon (standalone mode) ────────────────────────────
  function getReturnUrl() {
    try {
      var p = new URLSearchParams(location.search).get("return");
      if (p && p.charAt(0) === "/") return p; // only same-origin pathnames
    } catch (e) {}
    return "/dashboard";
  }

  function goBackToLesson() {
    var returnUrl = getReturnUrl();
    try { window.close(); } catch (e) {}
    setTimeout(function () {
      if (!window.closed) location.href = returnUrl;
    }, 150);
  }

  function injectBannerStyles() {
    if (document.getElementById("amour-return-style")) return;
    var style = document.createElement("style");
    style.id = "amour-return-style";
    style.textContent = [
      "@keyframes amour-slide-in{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}",
      "#amour-return-banner{position:fixed;top:0;left:0;right:0;z-index:2147483647;",
      "background:linear-gradient(180deg,#1EA574,#0D4D35);color:#F0E9DB;",
      "padding:14px 20px;display:flex;align-items:center;justify-content:center;gap:16px;",
      "font-family:'DM Sans','Helvetica Neue',system-ui,sans-serif;",
      "box-shadow:0 12px 40px rgba(0,0,0,0.35);",
      "animation:amour-slide-in 500ms cubic-bezier(.34,1.56,.64,1);}",
      "#amour-return-banner .check{display:inline-flex;align-items:center;justify-content:center;",
      "width:28px;height:28px;border-radius:50%;background:rgba(240,233,219,.18);",
      "font-weight:700;font-size:15px;}",
      "#amour-return-banner .text{font-size:13px;letter-spacing:.3px;flex:1;max-width:520px;text-align:center}",
      "#amour-return-banner .text strong{font-weight:700}",
      "#amour-return-banner button{background:#0D0B08;color:#F0E9DB;border:none;",
      "padding:9px 18px;border-radius:999px;font-family:inherit;font-size:11px;",
      "font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;",
      "transition:all 250ms;display:inline-flex;align-items:center;gap:6px;}",
      "#amour-return-banner button:hover{padding-right:22px;letter-spacing:2.5px}",
      "#amour-return-banner .dismiss{background:transparent;padding:6px 10px;",
      "color:rgba(240,233,219,.7);font-size:18px;letter-spacing:0}",
      "#amour-return-banner .dismiss:hover{padding-right:10px;letter-spacing:0;color:#F0E9DB}",
      "@media(max-width:640px){#amour-return-banner{flex-direction:column;gap:10px;padding:14px}",
      "#amour-return-banner .text{font-size:12px}}",
    ].join("");
    document.head.appendChild(style);
  }

  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) e[k] = props[k];
    if (children) for (var i = 0; i < children.length; i++) {
      var c = children[i];
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }

  function showReturnBanner() {
    if (document.getElementById("amour-return-banner")) return;
    injectBannerStyles();

    var checkSpan = el("span", { className: "check" }, ["✓"]);
    var textSpan = el("span", { className: "text" }, [
      el("strong", null, ["Exercice validé"]),
      " — XP enregistrés sur ta leçon",
    ]);
    var returnBtn = el("button", { type: "button", id: "amour-return-btn" }, [
      "Retour à la leçon →",
    ]);
    var dismissBtn = el("button", {
      type: "button",
      id: "amour-dismiss-btn",
      className: "dismiss",
      ariaLabel: "Fermer",
    }, ["×"]);

    var bar = el("div", { id: "amour-return-banner" }, [
      checkSpan, textSpan, returnBtn, dismissBtn,
    ]);
    document.body.insertBefore(bar, document.body.firstChild);

    returnBtn.addEventListener("click", goBackToLesson);
    dismissBtn.addEventListener("click", function () {
      bar.style.transition = "opacity 300ms, transform 300ms";
      bar.style.opacity = "0";
      bar.style.transform = "translateY(-100%)";
      setTimeout(function () { bar.remove(); }, 320);
    });
  }

  // ── Bonus : permettre à l'HTML d'appeler explicitement si besoin ─────────
  window.AmourExoComplete = notifyComplete;
})();
