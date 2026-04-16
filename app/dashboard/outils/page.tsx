"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Hero } from "@/components/ds/hero";
import { ExosGrid } from "@/components/outils/exos-grid";
import { ToolsSection } from "@/components/outils/tools-section";

type Tab = "exos" | "tools";

export default function OutilsPage() {
  const user = useQuery(api.users.current);
  const exos = useQuery(api.exercises.listAllWithState);
  const tools = useQuery(api.tools.list);

  const [tab, setTab] = React.useState<Tab>("exos");

  if (user === undefined || exos === undefined || tools === undefined) {
    return (
      <main className="ds-grid-bg min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="skeleton mb-6 h-28 w-full rounded-none" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton h-40 rounded-none" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (user === null) return null;

  const completed = exos.filter((e) => e.state === "completed").length;
  const total = exos.length;
  const available = exos.filter((e) => e.state === "available").length;

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
        <Hero
          caption="— Tes exos & outils"
          title="Ton atelier personnel."
          italicWord="atelier"
          progress={{
            completed,
            total,
            percent: total ? Math.round((completed / total) * 100) : 0,
          }}
          className="mb-8"
        />

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-foreground/10">
          {([
            { key: "exos" as Tab, label: "Exercices", count: total, badge: `${available} à faire` },
            { key: "tools" as Tab, label: "Outils", count: tools.length, badge: tools.length === 0 ? "À venir" : undefined },
          ]).map(({ key, label, count, badge }) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`relative flex items-center gap-2 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-foreground/45 hover:text-foreground/80"
                }`}
                style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
              >
                <span>{label}</span>
                <span className="font-normal text-foreground/40">· {count}</span>
                {badge && (
                  <span
                    className="ml-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-[2px] text-[9px] font-normal tracking-[1.5px] text-foreground/60"
                  >
                    {badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-foreground" />
                )}
              </button>
            );
          })}
        </div>

        {tab === "exos" ? (
          <ExosGrid exos={exos} />
        ) : (
          <ToolsSection tools={tools} />
        )}
      </div>
    </main>
  );
}
