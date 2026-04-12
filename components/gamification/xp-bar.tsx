"use client";

// ============================================================================
// Amour Studios — XP Progress Bar
// ----------------------------------------------------------------------------
// Levels : chaque level = 500 XP.
// Affiche le level actuel + barre de progression vers le prochain.
// ============================================================================

const XP_PER_LEVEL = 500;

export function XpBar({ xp }: { xp: number }) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const progressPct = (xpInLevel / XP_PER_LEVEL) * 100;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-accent">Nv.{level}</span>
      <div className="w-28 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 shadow-[0_0_8px_var(--brand-glow)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {xpInLevel}/{XP_PER_LEVEL}
      </span>
    </div>
  );
}
