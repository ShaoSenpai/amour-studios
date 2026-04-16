"use client";

// ============================================================================
// Amour Studios — XP Flyover
// ----------------------------------------------------------------------------
// Affiche un chip "+N XP" au point source (ex: rect du bouton cliqué) qui
// s'envole vers la cible marquée [data-xp-target]. Fallback si aucune cible
// visible : arc court vers le haut-droite puis fade-out.
//
// Usage :
//   fireXpFlyover(sourceRect, xpAmount);
//
// Au moment de l'arrivée, dispatch un CustomEvent "xp-gained" — la XpBar
// s'abonne et déclenche un glow pulse.
// ============================================================================

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes xp-fly-spin {
      from { transform: rotate(-6deg) scale(0.9); }
      40% { transform: rotate(4deg) scale(1.08); }
      to { transform: rotate(0deg) scale(1); }
    }
    .xp-chip {
      position: fixed;
      z-index: 70;
      pointer-events: none;
      padding: 5px 10px;
      border-radius: 999px;
      font-family: var(--font-body-legacy, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      background: var(--state-done-bg, #1EA574);
      color: var(--state-done-fg, #0D0B08);
      box-shadow: 0 6px 20px rgba(30, 165, 116, 0.45), 0 0 0 1px rgba(255,255,255,0.1) inset;
      white-space: nowrap;
      will-change: transform, opacity;
      animation: xp-fly-spin 480ms cubic-bezier(.34,1.56,.64,1);
    }
  `;
  document.head.appendChild(style);
}

function findTargetRect(): DOMRect | null {
  if (typeof document === "undefined") return null;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("[data-xp-target]")
  );
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      getComputedStyle(el).visibility !== "hidden";
    if (visible) return rect;
  }
  return null;
}

export function fireXpFlyover(sourceRect: DOMRect, xp: number) {
  if (typeof window === "undefined") return;
  injectStyles();

  const target = findTargetRect();
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = target ? target.left + target.width / 2 : window.innerWidth - 80;
  const endY = target ? target.top + target.height / 2 : 40;

  const chip = document.createElement("div");
  chip.className = "xp-chip";
  chip.textContent = `+${xp} XP`;
  chip.style.left = `${startX}px`;
  chip.style.top = `${startY}px`;
  chip.style.transform = "translate(-50%, -50%)";
  document.body.appendChild(chip);

  // Mesure la largeur pour bien centrer
  const chipRect = chip.getBoundingClientRect();
  const dx = endX - startX;
  const dy = endY - startY;

  // Arc control point : légèrement au-dessus du trajet, biaisé vers la source
  const midX = startX + dx * 0.5;
  const midY = startY + dy * 0.5 - Math.min(120, Math.abs(dx) * 0.3 + 60);

  const duration = 900;
  const start = performance.now();

  function frame(now: number) {
    const t = Math.min(1, (now - start) / duration);
    // Bezier quadratique pour l'arc
    const it = 1 - t;
    const x = it * it * startX + 2 * it * t * midX + t * t * endX;
    const y = it * it * startY + 2 * it * t * midY + t * t * endY;
    // Easing easeOutCubic sur la fin (scale/opacity)
    const e = 1 - Math.pow(1 - t, 3);
    const scale = t < 0.3 ? 1 + t * 0.5 : 1.15 - (t - 0.3) * 0.25;
    const opacity = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;

    chip.style.left = `${x}px`;
    chip.style.top = `${y}px`;
    chip.style.transform = `translate(-50%, -50%) scale(${scale})`;
    chip.style.opacity = String(opacity);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      chip.remove();
      window.dispatchEvent(
        new CustomEvent("xp-gained", { detail: { xp, hadTarget: !!target } })
      );
    }
    // Silence unused warning
    void e;
  }
  requestAnimationFrame(frame);
}
