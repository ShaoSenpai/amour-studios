"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Hero } from "@/components/ds/hero";
import { ExosGrid } from "@/components/outils/exos-grid";
import { ToolsSection } from "@/components/outils/tools-section";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UpsellBanner } from "@/components/ds/upsell-banner";
import { UpsellModal } from "@/components/ds/upsell-modal";
import { useViewMode } from "@/components/providers/view-mode-provider";
import { UnlockOverlay } from "@/components/payment/unlock-overlay";

type Tab = "exos" | "tools";

export default function OutilsPage() {
  const user = useQuery(api.users.current);
  const purchase = useQuery(api.purchases.current);
  const modules = useQuery(api.modules.list);
  const exos = useQuery(api.exercises.listAllWithState);
  const tools = useQuery(api.tools.list);

  const [tab, setTab] = React.useState<Tab>("exos");
  const [upsellOpen, setUpsellOpen] = React.useState(false);
  const { viewAsMember, viewAsPreview } = useViewMode();

  if (
    user === undefined ||
    purchase === undefined ||
    modules === undefined ||
    exos === undefined ||
    tools === undefined
  ) {
    return (
      <main className="ds-grid-bg min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="skeleton mb-6 h-28 w-full rounded-none" />
          <div className="skeleton mb-6 h-10 w-[280px] rounded-none" />
          <div className="skeleton mb-6 h-14 w-full rounded-none" />
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-[60px] rounded-none" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (user === null) return null;

  const isAdmin = user.role === "admin" && !viewAsMember;
  const previewMode = (!purchase && !isAdmin) || viewAsPreview;

  const completed = exos.filter((e) => e.state === "completed").length;
  const total = exos.length;
  const available = exos.filter((e) => e.state === "available").length;
  const firstAvailable = exos.find((e) => e.state === "available") ?? null;

  // Masquer l'onglet "Outils" pour les non-admins quand vide
  const showToolsTab = isAdmin || tools.length > 0;

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <UnlockOverlay />
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
        {previewMode && <UpsellBanner onClick={() => setUpsellOpen(true)} />}

        <Hero
          caption="— Tes exos & outils"
          title="Ton atelier personnel."
          italicWord="atelier"
          ctaLabel={firstAvailable ? "Continuer l'exo" : undefined}
          ctaHref={firstAvailable ? `/lesson/${firstAvailable.lessonId}` : undefined}
          progress={{
            completed,
            total,
            percent: total ? Math.round((completed / total) * 100) : 0,
          }}
          className="mb-8"
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
          <TabsList
            variant="line"
            className="mb-6 h-auto w-full justify-start rounded-none border-b border-foreground/10 bg-transparent p-0"
          >
            <TabsTrigger
              value="exos"
              className="relative h-auto flex-initial gap-2 rounded-none border-transparent px-4 py-3 text-[11px] font-bold uppercase tracking-[1.5px] text-foreground/45 hover:text-foreground/80 data-active:text-foreground after:bottom-[-1px] after:h-[2px]"
              style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
            >
              <span>Exercices</span>
              <span className="font-normal text-foreground/40">· {total}</span>
              <span className="ml-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-[2px] text-[9px] font-normal tracking-[1.5px] text-foreground/60">
                {available} à faire
              </span>
            </TabsTrigger>
            {showToolsTab && (
              <TabsTrigger
                value="tools"
                className="relative h-auto flex-initial gap-2 rounded-none border-transparent px-4 py-3 text-[11px] font-bold uppercase tracking-[1.5px] text-foreground/45 hover:text-foreground/80 data-active:text-foreground after:bottom-[-1px] after:h-[2px]"
                style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
              >
                <span>Outils</span>
                <span className="font-normal text-foreground/40">· {tools.length}</span>
                {tools.length === 0 && (
                  <span className="ml-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2 py-[2px] text-[9px] font-normal tracking-[1.5px] text-foreground/60">
                    À venir
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="exos" className="mt-0">
            <ExosGrid
              exos={exos}
              modules={modules}
              firstAvailableId={firstAvailable ? (firstAvailable._id as string) : null}
            />
          </TabsContent>
          {showToolsTab && (
            <TabsContent value="tools" className="mt-0">
              <ToolsSection tools={tools} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <UpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </main>
  );
}
