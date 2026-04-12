export function SectionNumber({
  number,
  color = "rgba(255,255,255,0.08)",
}: {
  number: number;
  color?: string;
}) {
  return (
    <span
      className="font-display text-[80px] sm:text-[90px] leading-none block -mb-5 select-none transition-colors duration-400"
      style={{ color }}
    >
      {String(number).padStart(2, "0")}
    </span>
  );
}
