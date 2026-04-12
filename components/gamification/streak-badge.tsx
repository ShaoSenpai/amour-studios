"use client";

export function StreakBadge({ days }: { days: number }) {
  if (days <= 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-amber-400">🔥</span>
      <span className="font-medium text-amber-400">{days}j</span>
    </div>
  );
}
