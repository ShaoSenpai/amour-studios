import Link from "next/link";

export default function Home() {
  return (
    <main className="ds-grid-bg relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Minimal top meta */}
      <nav className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-5">
        <span
          className="flex items-center gap-2 text-xl italic"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <span className="h-2 w-2 rounded-full bg-[#2B7A6F] ds-pulse" aria-hidden />
          Amour Studios
        </span>
        <Link
          href="/login"
          className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/60 transition-colors hover:text-foreground"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          ◦ Se connecter →
        </Link>
      </nav>

      {/* Hero */}
      <section className="ds-reveal mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center gap-10 px-6 py-16">
        <p
          className="font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          — Formation privée · Artistes musique · Communauté Discord
        </p>

        <h1
          className="text-[clamp(56px,9vw,128px)] font-normal leading-[0.88] tracking-[-3px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Construis<br />
          ton <em className="italic text-foreground">univers</em><br />
          d&apos;artiste.
        </h1>

        <p
          className="max-w-xl font-mono text-base text-foreground/70"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          La formation qui aide les artistes musicaux à maîtriser la création
          de contenu pour devenir visibles. Accès privé, accompagnement sur-mesure,
          communauté Discord active.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="https://www.amourstudios.fr"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 bg-[#2B7A6F] px-6 py-4 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-[#225f57]"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Rejoindre la formation
            <span
              className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              →
            </span>
          </Link>
          <Link
            href="/login"
            className="group flex items-center gap-2.5 border border-foreground/20 bg-foreground/[0.04] px-6 py-4 font-mono text-[11px] uppercase tracking-[2px] text-foreground transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-foreground/[0.08]"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Accéder à l&apos;app
            <span
              className="text-xl italic"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              ↗
            </span>
          </Link>
        </div>
      </section>

      {/* Stats strip */}
      <section className="mx-auto grid w-full max-w-[1200px] grid-cols-2 gap-3 px-6 pb-16 md:grid-cols-4">
        {[
          { label: "MODULES", value: "06", accent: "#F5B820" },
          { label: "LEÇONS", value: "20+", accent: "#FF6B1F" },
          { label: "COMMUNAUTÉ", value: "VIP", accent: "#E63326" },
          { label: "ACCÈS", value: "À VIE", accent: "#2B7A6F" },
        ].map((s) => (
          <div
            key={s.label}
            className="flex min-h-[120px] flex-col justify-between overflow-hidden p-5 transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] hover:-translate-y-1"
            style={{ background: s.accent, color: "#0D0B08" }}
          >
            <div
              className="font-mono text-[9px] uppercase tracking-[2.5px] opacity-70"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              ◦ {s.label}
            </div>
            <div
              className="text-4xl italic leading-none"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </section>

      {/* Footer meta */}
      <footer
        className="mx-auto w-full max-w-[1200px] border-t border-foreground/15 px-6 py-6 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
        style={{ fontFamily: "var(--font-body-legacy)" }}
      >
        ◦ amourstudios.fr · connexion = discord OAuth uniquement
      </footer>
    </main>
  );
}
