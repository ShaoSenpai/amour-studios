"use client";

import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/ds/hero";
import { StatBlock } from "@/components/ds/stat-block";
import { ProgressStrip } from "@/components/ds/progress-strip";
import type { ModuleCardState } from "@/components/ds/module-card";
import { ChevronDown, Lock, Zap, Check } from "lucide-react";
import { ActivityCard } from "@/components/ds/activity-card";
import { AnnouncementsBanner } from "@/components/ds/announcements-banner";

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
    return <PendingGate email={user.email} onSignOut={() => signOut()} />;
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
        <AnnouncementsBanner />
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

// ─── Pending gate (user connecté mais pas de purchase lié) ────────
function PendingGate({
  email,
  onSignOut,
}: {
  email?: string;
  onSignOut: () => void;
}) {
  const claimByEmail = useMutation(api.users.claimPurchaseByEmail);
  const [altEmail, setAltEmail] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main className="ds-grid-bg flex min-h-screen flex-col items-center justify-center px-6 py-16 bg-background text-foreground">
      <div className="ds-reveal flex w-full max-w-lg flex-col gap-4">
        <p
          className="font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
          style={{ fontFamily: "var(--font-body)" }}
        >
          — Compte connecté · Aucun paiement détecté
        </p>
        <h1
          className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Accès en <em className="italic text-[#FF6B1F]">attente</em>
        </h1>
        <p
          className="font-mono text-sm text-foreground/70"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Ton compte Discord ({email ?? "—"}) n&apos;est lié à aucun paiement.
          3 solutions :
        </p>

        {/* 1. Auto-claim by email */}
        <div className="border border-foreground/15 bg-foreground/[0.04] p-5">
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ 1. J&apos;ai payé avec un autre email
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="email utilisé au paiement"
              value={altEmail}
              onChange={(e) => setAltEmail(e.target.value)}
              className="flex-1 border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#FF6B1F]"
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            />
            <button
              disabled={!altEmail.trim() || loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await claimByEmail({ email: altEmail });
                  toast.success("Accès VIP débloqué 🎉");
                  setTimeout(() => window.location.reload(), 800);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Erreur"
                  );
                } finally {
                  setLoading(false);
                }
              }}
              className="bg-[#00FF85] px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08] disabled:opacity-50"
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              {loading ? "…" : "LIER MON COMPTE"}
            </button>
          </div>
        </div>

        {/* 2. Buy */}
        <a
          href="https://www.amourstudios.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between border border-foreground/15 bg-foreground/[0.04] px-5 py-5 transition-all hover:bg-foreground/[0.08]"
        >
          <div>
            <p
              className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
              style={{ fontFamily: "var(--font-body)" }}
            >
              ◦ 2. Pas encore acheté la formation
            </p>
            <p
              className="text-xl italic"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Rejoindre Amour Studios — 497 €
            </p>
          </div>
          <span
            className="text-3xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
            style={{ color: "#FF6B1F", fontFamily: "var(--font-serif)" }}
          >
            →
          </span>
        </a>

        {/* 3. SAV */}
        <p
          className="font-mono text-xs text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          ◦ 3. Besoin d&apos;aide ?{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            className="text-[#FF6B1F] underline-offset-2 hover:underline"
          >
            contact@amourstudios.fr
          </a>{" "}
          — réponse sous 24h.
        </p>

        <button
          onClick={onSignOut}
          className="mt-4 self-start font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 hover:text-foreground"
          style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
        >
          ← Se déconnecter
        </button>
      </div>
    </main>
  );
}

const MODULE_ACCENTS = [
  "#F5B820",
  "#FF6B1F",
  "#E63326",
  "#F2B8A2",
  "#2B7A6F",
  "#0D4D35",
];

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
    <div className="ds-cascade flex flex-col gap-3">
      {modules.map((mod, idx) => (
        <ModuleRow
          key={mod._id}
          mod={mod}
          progress={progress}
          idx={idx}
          isAdmin={isAdmin}
          modules={modules}
        />
      ))}
    </div>
  );
}

function ModuleRow({
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

  const accent = MODULE_ACCENTS[mod.order % MODULE_ACCENTS.length];

  if (lessons === undefined) {
    return <div className="skeleton h-[140px] rounded-none" />;
  }

  const completed = lessons.filter(
    (l) => progress[l._id]?.lessonCompletedAt
  ).length;
  const total = lessons.length;
  const totalXp = lessons.reduce((sum, l) => sum + (l.xpReward ?? 0), 0);
  const earnedXp = lessons
    .filter((l) => progress[l._id]?.lessonCompletedAt)
    .reduce((sum, l) => sum + (l.xpReward ?? 0), 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

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

  const locked = state === "locked";

  const words = mod.title.split(" ");
  const italicWord = words.length > 1 ? words[words.length - 1] : undefined;
  let titleNode: React.ReactNode = mod.title;
  if (italicWord && mod.title.includes(italicWord)) {
    const before = mod.title.substring(
      0,
      mod.title.lastIndexOf(italicWord)
    );
    titleNode = (
      <>
        {before}
        <em className="italic">{italicWord}</em>
      </>
    );
  }

  return (
    <ModuleRowView
      modId={mod._id}
      accent={accent}
      locked={locked}
      state={state}
      order={mod.order}
      title={titleNode}
      description={mod.description}
      lessons={lessons}
      progress={progress}
      completed={completed}
      total={total}
      totalXp={totalXp}
      earnedXp={earnedXp}
      percent={percent}
      isAdmin={isAdmin}
    />
  );
}

function ModuleRowView({
  modId,
  accent,
  locked,
  state,
  order,
  title,
  description,
  lessons,
  progress,
  completed,
  total,
  totalXp,
  earnedXp,
  percent,
  isAdmin,
}: {
  modId: Id<"modules">;
  accent: string;
  locked: boolean;
  state: ModuleCardState;
  order: number;
  title: React.ReactNode;
  description: string;
  lessons: Array<{
    _id: Id<"lessons">;
    title: string;
    order: number;
    xpReward: number;
    durationSeconds: number;
    muxPlaybackId: string;
  }>;
  progress: Record<string, { lessonCompletedAt?: number; videoWatchedAt?: number }>;
  completed: number;
  total: number;
  totalXp: number;
  earnedXp: number;
  percent: number;
  isAdmin: boolean;
}) {
  // Default: in-progress module is expanded, others collapsed
  const [expanded, setExpanded] = useState(state === "in-progress");

  const statePill =
    state === "completed"
      ? "✓ COMPLÉTÉ"
      : state === "in-progress"
      ? "EN COURS"
      : state === "upcoming"
      ? "À VENIR"
      : "VERROUILLÉ";

  return (
    <div
      id={`module-${modId}`}
      className="group/module relative overflow-hidden border border-foreground/10 bg-foreground/[0.02] transition-all duration-500 [transition-timing-function:var(--ease-reveal)] hover:border-foreground/25 hover:bg-foreground/[0.045]"
      style={{
        opacity: locked ? 0.55 : 1,
        // Wide accent stripe on the left — the only place the bright color shows
        boxShadow: `inset 5px 0 0 0 ${locked ? "rgba(240,233,219,0.15)" : accent}`,
      }}
    >
      <button
        type="button"
        onClick={() => !locked && setExpanded(!expanded)}
        disabled={locked}
        className={`relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-6 pl-8 text-left transition-all duration-500 [transition-timing-function:var(--ease-reveal)] md:px-10 md:py-8 md:pl-14 ${
          locked
            ? "cursor-not-allowed"
            : "cursor-pointer group-hover/module:pl-9 md:group-hover/module:pl-16"
        }`}
        style={{ minHeight: 0 }}
      >
        {/* Numéro module */}
        <div
          className="text-3xl italic leading-none tracking-tight transition-colors duration-500 md:text-4xl"
          style={{
            fontFamily: "var(--font-serif)",
            color: locked ? "rgba(240,233,219,0.35)" : accent,
          }}
        >
          {String(order + 1).padStart(2, "0")}
        </div>

        {/* Centre : titre + description (uniquement) */}
        <div className="min-w-0">
          <h3
            className="text-[clamp(22px,3.5vw,38px)] font-normal leading-[1.02] tracking-[-1px] text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h3>
          {description && (
            <p
              className="mt-2.5 max-w-[52ch] font-mono text-[12px] leading-[1.55] text-foreground/55 md:text-[13px]"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Right : statut compact + chevron */}
        <div className="flex shrink-0 items-center gap-4">
          {/* Statut compact en mono — disparait quand row hover ouvert */}
          <div
            className="hidden flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[1.5px] md:flex"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <span style={{ color: locked ? "rgba(240,233,219,0.4)" : accent }}>
              {statePill}
            </span>
            <span className="text-foreground/40">
              {String(completed).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>

          {/* Chevron / cadenas */}
          <div
            className="flex size-10 items-center justify-center border transition-all duration-500 [transition-timing-function:var(--ease-reveal)]"
            style={{
              borderColor: locked
                ? "rgba(240,233,219,0.2)"
                : `${accent}50`,
              background: locked
                ? "transparent"
                : expanded
                ? accent
                : "transparent",
              color: locked
                ? "rgba(240,233,219,0.4)"
                : expanded
                ? "#0D0B08"
                : accent,
              transform:
                expanded && !locked ? "rotate(180deg)" : "rotate(0)",
            }}
            aria-hidden
          >
            {locked ? <Lock size={15} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {/* Progress bar — fine ligne en bas du row, seulement si en cours */}
      {!locked && state === "in-progress" && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground/[0.06]">
          <div
            className="h-full transition-[width] duration-1000 [transition-timing-function:var(--ease-reveal)]"
            style={{
              width: `${percent}%`,
              background: accent,
            }}
          />
        </div>
      )}
      {!locked && state === "completed" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: accent }}
        />
      )}

      {/* Expandable : list of lessons */}
      <div
        className={`ds-collapse-wrap ${expanded && !locked ? "open" : ""}`}
      >
        <div className="ds-collapse-inner">
          <div className="border-t border-foreground/10 px-6 py-2 md:px-10 md:pl-12">
            {lessons.length === 0 ? (
              <p
                className="py-4 font-mono text-xs text-foreground/50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                ◦ Aucune leçon disponible pour le moment
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-foreground/10">
                {lessons.map((lesson, i) => {
                  const isCompleted =
                    !!progress[lesson._id]?.lessonCompletedAt;
                  const unlocked =
                    isAdmin ||
                    i === 0 ||
                    !!progress[lessons[i - 1]._id]?.lessonCompletedAt;
                  const videoSeen = !!progress[lesson._id]?.videoWatchedAt;
                  const placeholder = lesson.muxPlaybackId === "placeholder";

                  return (
                    <LessonLine
                      key={lesson._id}
                      href={unlocked ? `/lesson/${lesson._id}` : undefined}
                      order={i}
                      title={lesson.title}
                      xpReward={lesson.xpReward}
                      duration={lesson.durationSeconds}
                      completed={isCompleted}
                      unlocked={unlocked}
                      videoSeen={videoSeen}
                      placeholder={placeholder}
                      accent={accent}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonLine({
  href,
  order,
  title,
  xpReward,
  duration,
  completed,
  unlocked,
  videoSeen,
  placeholder,
  accent,
}: {
  href?: string;
  order: number;
  title: string;
  xpReward: number;
  duration: number;
  completed: boolean;
  unlocked: boolean;
  videoSeen: boolean;
  placeholder: boolean;
  accent: string;
}) {
  const content = (
    <div
      className={`group/lesson flex items-center gap-4 py-3.5 pl-1 pr-2 transition-all duration-400 [transition-timing-function:var(--ease-reveal)] ${
        unlocked
          ? "hover:pl-3 hover:bg-foreground/[0.035]"
          : "cursor-not-allowed"
      }`}
    >
      <div
        className="flex size-7 shrink-0 items-center justify-center border font-mono text-[11px] transition-colors duration-400"
        style={{
          background: completed
            ? accent
            : "transparent",
          borderColor: completed
            ? "transparent"
            : unlocked
            ? "rgba(240,233,219,0.2)"
            : "rgba(240,233,219,0.1)",
          color: completed
            ? "#0D0B08"
            : unlocked
            ? "rgba(240,233,219,0.7)"
            : "rgba(240,233,219,0.35)",
          fontFamily: "var(--font-body)",
        }}
      >
        {completed ? (
          <Check size={12} />
        ) : unlocked ? (
          String(order + 1).padStart(2, "0")
        ) : (
          <Lock size={11} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="truncate font-normal leading-snug transition-colors"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "17px",
            color: unlocked
              ? "var(--foreground)"
              : "rgba(240,233,219,0.45)",
          }}
        >
          {title}
        </div>
        <div
          className="mt-1 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[1.5px] text-foreground/45"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <span className="flex items-center gap-1">
            <Zap size={9} />
            {xpReward} XP
          </span>
          {duration > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span>{Math.floor(duration / 60)} min</span>
            </>
          )}
          {placeholder && (
            <>
              <span className="opacity-40">·</span>
              <span>◉ VIDÉO À VENIR</span>
            </>
          )}
          {!unlocked && (
            <>
              <span className="opacity-40">·</span>
              <span>INACCESSIBLE</span>
            </>
          )}
          {videoSeen && !completed && (
            <>
              <span className="opacity-40">·</span>
              <span style={{ color: accent }}>◦ VIDÉO VUE</span>
            </>
          )}
        </div>
      </div>

      {unlocked && (
        <span
          className="text-xl italic text-foreground/25 transition-all duration-500 [transition-timing-function:var(--ease-reveal)] group-hover/lesson:translate-x-1 group-hover/lesson:text-foreground/60"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          →
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}
