import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const textSize = size === "sm" ? "text-base" : "text-xl";

  return (
    <Link href="/dashboard" className={`font-display ${textSize} tracking-tight leading-none`}>
      <span className="text-foreground">AMOUR</span>
      <span className="text-orange">s</span>
      <span className="text-foreground">tu</span>
      <span className="text-mustard">d</span>
      <span className="text-[#E63326]">i</span>
      <span className="text-foreground">o</span>
      <span className="text-foreground">s</span>
      <sup className="text-[0.4em] ml-0.5 text-muted-foreground">®</sup>
    </Link>
  );
}
