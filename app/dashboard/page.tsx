"use client";

import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/ds/hero";
import { StatBlock } from "@/components/ds/stat-block";
import { ProgressStrip } from "@/components/ds/progress-strip";
import { BentoGrid } from "@/components/ds/bento-grid";
import { ModuleCard, type ModuleCardState } from "@/components/ds/module-card";
import { ActivityCard } from "@/components/ds/activity-card";

export default function DashboardPage() {
  const user = useQuery(api.users.current);
  const purchase = useQuery(api.purchases.current);
  const modules = useQuery(api.modules.list);
  const progress = useQuery(api.progress.myProgress);
  const globalProgress = useQuery(api.progress.globalProgress);
  const badges = useQuery(api.badges.myBadges);
  const { signOut } = useAuthActions();
  const updateStreak = useMutation(api.streaks.updateStreak);

  useEffect(() => {
    if (user) updateStreak().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const firstModuleId = modules?.[0]?._id;

  const resumeHref = useMemo(() => {
    if (!firstModuleId) return null;
    return `/dashboard#module-${firstModuleId}`;
  }, [firstModuleId]);

  if (
    user === undefined || purchase === undefined || modules === undefined ||
    progress === undefined || globalProgress === undefined || badges === undefined
  ) {
    return (
      <main className="ds-grid-bg min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="skeleton mb-4 h-40 w-full rounded-none" />
          <div className="skeleton mb-6 h-16 w-full rounded-none" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-40 rounded-none md:col-span-2" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (user === null) return null;
  const isAdmin = user.role === "admin";

  if (!purchase && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>
            Accès en{" "}
            <span className="italic text-primary" style={{ fontFamily: "var(--font-serif)" }}>
              attente
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Ton compte est connecté, mais aucun achat n&apos;est lié à{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </p>
          <a
            href="https://www.amourstudios.fr/paiement"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full max-w-xs items-center justify-center bg-primary text-primary-foreground font-medium"
          >
            Acheter la formation — 497 €
          </a>
          <p className="text-xs text-muted-foreground">
            Déjà payé ?{" "}
            <a href="mailto:contact@amourstudios.fr" className="text-primary hover:underline">
              contact@amourstudios.fr
            </a>
          </p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Se déconnecter
          </Button>
        </div>
      </main>
    );
  }

  if (!user.onboardingCompletedAt && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>
            Onboarding{" "}
            <span className="italic text-primary" style={{ fontFamily: "var(--font-serif)" }}>
              en cours
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Paiement confirmé ! Appel d&apos;onboarding nécessaire.
          </p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>
            Se déconnecter
          </Button>
        </div>
      </main>
    );
  }

  const firstName = user.name?.split(" ")[0] ?? "artiste";
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateLabel = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
        <Hero
          caption={`Salut ${firstName} · ${dateLabel}`}
          title="Ton univers se construit."
          italicWord="univers"
          ctaLabel={resumeHref ? "Reprendre la formation" : "Explorer les modules"}
          ctaHref={resumeHref ?? "#modules"}
          aside={
            <>
              <StatBlock
                label="PROGRESSION"
                value={globalProgress.percent}
                unit="%"
                sub={`${globalProgress.completed} / ${globalProgress.total} leçons`}
                accent="#00FF85"
              />
              <StatBlock
                label="STREAK"
                value={user.streakDays ?? 0}
                unit="j"
                sub="Garde le rythme"
                accent="#FF6B1F"
              />
            </>
          }
          className="mb-4"
        />

        <ProgressStrip
          percent={globalProgress.percent}
          fraction={`${globalProgress.completed}/${globalProgress.total}`}
          className="mb-8"
        />

        <section id="modules" className="mb-10">
          <div className="mb-6 flex items-baseline justify-between border-b border-foreground/15 pb-4">
            <h2
              className="text-3xl italic"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Modules
            </h2>
            <div
              className="hidden gap-4 font-mono text-[10px] uppercase tracking-[2px] md:flex"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span className="border-b border-[#00FF85] pb-1">◦ Tous</span>
              <span className="opacity-40">◦ En cours</span>
              <span className="opacity-40">◦ Complétés</span>
              <span className="opacity-40">◦ À venir</span>
            </div>
          </div>

          <ModulesBento modules={modules} progress={progress} isAdmin={isAdmin} />
        </section>

        <section className="mb-10 grid gap-3 md:grid-cols-3">
          <ActivityCard
            label={`NOUVEAU · ${modules.length} MODULES`}
            title="Nouvelle leçon publiée"
            italicWord="publiée"
            body={`Module ${modules[0]?.title ?? "—"} — check les dernières leçons ajoutées.`}
            live
          />
          <ActivityCard
            label={badges.length > 0 ? `BADGE · ${badges.length} DÉBLOQUÉS` : "BADGE · À GAGNER"}
            title={
              badges.length > 0
                ? `${badges[badges.length - 1].label} débloqué`
                : "Ton premier badge t'attend"
            }
            italicWord={badges.length > 0 ? "débloqué" : "attend"}
            body={
              badges.length > 0
                ? "Continue pour en débloquer d'autres — chaque module = 1 badge."
                : "Complète toutes les leçons d'un module pour gagner son badge."
            }
          />
          <ActivityCard
            label="COMMUNAUTÉ"
            title="Rejoins la conversation"
            italicWord="conversation"
            body={
              process.env.NEXT_PUBLIC_DISCORD_INVITE_URL
                ? "Les autres artistes sont sur Discord — #entraide & #nouveautés."
                : "Discord arrive bientôt."
            }
          />
        </section>
      </div>
    </main>
  );
}

function ModulesBento({
  modules,
  progress,
  isAdmin,
}: {
  modules: {
    _id: Id<"modules">;
    title: string;
    description: string;
    order: number;
    badgeLabel: string;
  }[];
  progress: Record<string, { lessonCompletedAt?: number }>;
  isAdmin: boolean;
}) {
  return (
    <BentoGrid>
      {modules.map((mod, idx) => (
        <ModuleCardBound
          key={mod._id}
          mod={mod}
          progress={progress}
          idx={idx}
          isAdmin={isAdmin}
          modules={modules}
        />
      ))}
    </BentoGrid>
  );
}

function ModuleCardBound({
  mod,
  progress,
  idx,
  isAdmin,
  modules,
}: {
  mod: {
    _id: Id<"modules">;
    title: string;
    description: string;
    order: number;
    badgeLabel: string;
  };
  progress: Record<string, { lessonCompletedAt?: number }>;
  idx: number;
  isAdmin: boolean;
  modules: { _id: Id<"modules"> }[];
}) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId: mod._id });
  const prevLessons = useQuery(
    api.lessons.listByModule,
    idx > 0 ? { moduleId: modules[idx - 1]._id } : "skip"
  );

  if (lessons === undefined) {
    return <div className="skeleton h-[200px] rounded-none md:col-span-2" />;
  }

  const completed = lessons.filter((l) => progress[l._id]?.lessonCompletedAt).length;
  const total = lessons.length;

  let state: ModuleCardState;
  if (total > 0 && completed === total) state = "completed";
  else if (completed > 0) state = "in-progress";
  else {
    const prevUnlocked =
      idx === 0 ||
      isAdmin ||
      (prevLessons && prevLessons.every((l) => progress[l._id]?.lessonCompletedAt));
    state = prevUnlocked ? "upcoming" : "locked";
  }

  const span: 2 | 4 = state === "in-progress" ? 4 : 2;

  const words = mod.title.split(" ");
  const italicWord = words.length > 1 ? words[words.length - 1] : undefined;

  const firstLessonId = lessons[0]?._id;

  return (
    <ModuleCard
      href={firstLessonId ? `/lesson/${firstLessonId}` : "#"}
      order={mod.order}
      title={mod.title}
      italicWord={italicWord}
      description={mod.description}
      badgeLabel={mod.badgeLabel}
      state={state}
      completed={completed}
      total={total}
      span={span}
    />
  );
}
