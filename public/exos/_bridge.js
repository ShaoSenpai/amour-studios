/* ============================================================================
 * Amour Studios — Exo completion bridge
 * ----------------------------------------------------------------------------
 * Injecté dans chaque HTML exo (<script src="/exos/_bridge.js">).
 * Détecte l'action de complétion (jsPDF save OU download .ics/.pdf) et
 * postMessage au parent (ExerciseIframe) ou à l'opener (mode grande fenêtre).
 * ============================================================================ */
(function () {
  "use strict";

  var sent = false;
  var channel = null;
  try { channel = new BroadcastChannel("amour-exo"); } catch (e) {}

  function notifyComplete(kind) {
    if (sent) return;
    sent = true;
    var msg = {
      type: "amour:exercise-complete",
      kind: kind || "unknown",
      at: Date.now(),
      href: location.pathname,
    };
    // Iframe → parent (same-origin postMessage)
    try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*"); } catch (e) {}
    // Nouvel onglet → opener (si rel=noopener absent)
    try { if (window.opener) window.opener.postMessage(msg, "*"); } catch (e) {}
    // Cross-tab same-origin : fonctionne même avec rel=noopener
    try { if (channel) channel.postMessage(msg); } catch (e) {}
    // Reset après 3s — si le user regénère plusieurs fois, on en renvoie un
    setTimeout(function () { sent = false; }, 3000);
  }

  // ── Hook jsPDF.prototype.save ────────────────────────────────────────────
  function tryHookJsPDF() {
    var jspdf = window.jspdf || window.jsPDF;
    var Ctor = (jspdf && jspdf.jsPDF) || window.jsPDF;
    if (!Ctor || !Ctor.prototype || Ctor.prototype.__amourHooked) return false;
    var origSave = Ctor.prototype.save;
    Ctor.prototype.save = function () {
      try { return origSave.apply(this, arguments); }
      finally { notifyComplete("pdf"); }
    };
    Ctor.prototype.__amourHooked = true;
    return true;
  }
  if (!tryHookJsPDF()) {
    var tries = 0;
    var int = setInterval(function () {
      if (tryHookJsPDF() || ++tries > 50) clearInterval(int);
    }, 100);
  }

  // ── Hook téléchargements de fichiers .ics / .pdf ─────────────────────────
  // (cas Google Agenda qui crée un <a download> programmatiquement)
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var name = (this.download || "").toLowerCase();
      if (/\.(ics|pdf|csv)$/.test(name)) notifyComplete(name.split(".").pop());
    } catch (e) {}
    return origClick.apply(this, arguments);
  };

  // ── Bonus : permettre à l'HTML d'appeler explicitement si besoin ─────────
  window.AmourExoComplete = notifyComplete;
})();
