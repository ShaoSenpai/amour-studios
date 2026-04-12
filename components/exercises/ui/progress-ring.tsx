"use client";

const CIRCUMFERENCE = 2 * Math.PI * 16; // r=16

export function ProgressRing({
  percent,
  size = 44,
}: {
  percent: number;
  size?: number;
}) {
  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="-rotate-90" style={{ width: size, height: size }}>
        <circle
          cx="18" cy="18" r="16"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="3"
        />
        <circle
          cx="18" cy="18" r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="text-primary transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-mono font-semibold">{percent}%</span>
      </div>
    </div>
  );
}
