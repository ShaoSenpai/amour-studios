"use client";

import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/ds/hero";
import type { ModuleCardState } from "@/components/ds/module-card";
import { ChevronDown, Lock, Check } from "lucide-react";
import { useViewMode } from "@/components/providers/view-mode-provider";
import { UpsellBanner } from "@/components/ds/upsell-banner";
import { UpsellModal } from "@/components/ds/upsell-modal";

// Couleurs indicatrices (sémantiques, theme-aware via CSS vars)
const STATE_COLOR = {
  done: "var(--state-done)",
  active: "var(--state-active)",
  pending: "var(--state-pending)",
  locked: "var(--state-locked)",
  doneBg: "var(--state-done-bg)",
  doneFg: "var(--state-done-fg)",
  activeBg: "var(--state-active-bg)",
  activeFg: "var(--state-active-fg)",
  lockedBorder: "var(--state-locked-border)",
};
import { ActivityCard } from "@/components/ds/activity-card";
import { AnnouncementsBanner } from "@/components/ds/announcements-banner";
import { UnlockOverlay } from "@/components/payment/unlock-overlay";

export default function DashboardPage() {
  const user = useQuery(api.users.current);
  const purchase = useQuery(api.purchases.current);
  const modules = useQuery(api.modules.list);
  const progress = useQuery(api.progress.myProgress);
  const globalProgress = useQuery(api.progress.globalProgress);
  const badges = useQuery(api.badges.myBadges);
  const { signOut } = useAuthActions();
  const updateStreak = useMutation(api.streaks.updateStreak);
  const { viewAsMember, viewAsPreview } = useViewMode();
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellModuleTitle, setUpsellModuleTitle] = useState<string | undefined>();

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
  const isAdmin = user.role === "admin" && !viewAsMember;
  // Preview mode = user loggué Discord mais sans paiement (et pas admin)
  // OU : admin en mode "vue preview" pour tester l'expérience freemium
  const previewMode = (!purchase && !isAdmin) || viewAsPreview;

  // Note (TODO-finitions) : gate onboarding désactivé pour le moment.
  // À réactiver plus tard si on remet en place l'appel d'onboarding manuel.

  const firstName = user.name?.split(" ")[0] ?? "artiste";
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateLabel = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <UnlockOverlay />
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
        <AnnouncementsBanner />

        {previewMode && (
          <UpsellBanner onClick={() => setUpsellOpen(true)} />
        )}

        <Hero
          caption={`Salut ${firstName} · ${dateLabel}`}
          title="Ton univers se construit."
          italicWord="univers"
          ctaLabel={resumeHref ? "Reprendre la formation" : "Explorer les modules"}
          ctaHref={resumeHref ?? "#modules"}
          progress={{
            percent: globalProgress.percent,
            completed: globalProgress.completed,
            total: globalProgress.total,
          }}
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
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              <span className="border-b border-[color:var(--state-done)] pb-1">◦ Tous</span>
              <span className="opacity-40">◦ En cours</span>
              <span className="opacity-40">◦ Complétés</span>
              <span className="opacity-40">◦ À venir</span>
            </div>
          </div>

          <ModulesBento
            modules={modules}
            progress={progress}
            isAdmin={isAdmin}
            previewMode={previewMode}
            onLockedClick={(modTitle) => {
              setUpsellModuleTitle(modTitle);
              setUpsellOpen(true);
            }}
          />
        </section>

        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between border-b border-foreground/15 pb-2">
            <h2 className="ds-section">Actu Amour Studios</h2>
            <span className="ds-label text-foreground/50">Feed · 3 items</span>
          </div>
          <div className="border border-foreground/10 bg-foreground/[0.02]">
            <ActivityCard
              kind="lesson"
              label={`Nouveau · ${modules.length} modules`}
              title="Nouvelle leçon publiée"
              body={`Module ${modules[0]?.title ?? "—"} — check les dernières leçons ajoutées.`}
              live
            />
            <ActivityCard
              kind="badge"
              label={badges.length > 0 ? `Badge · ${badges.length} débloqués` : "Badge · À gagner"}
              title={
                badges.length > 0
                  ? `${badges[badges.length - 1].label} débloqué`
                  : "Ton premier badge t'attend"
              }
              body={
                badges.length > 0
                  ? "Continue pour en débloquer d'autres — chaque module = 1 badge."
                  : "Complète toutes les leçons d'un module pour gagner son badge."
              }
            />
            <ActivityCard
              kind="community"
              label="Communauté"
              title="Rejoins la conversation"
              href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL}
              ctaLabel="Ouvrir"
              body={
                process.env.NEXT_PUBLIC_DISCORD_INVITE_URL
                  ? "Les autres artistes sont sur Discord — #entraide & #nouveautés."
                  : "Discord arrive bientôt."
              }
            />
          </div>
        </section>
      </div>

      <UpsellModal
        open={upsellOpen}
        onClose={() => {
          setUpsellOpen(false);
          setUpsellModuleTitle(undefined);
        }}
        moduleTitle={upsellModuleTitle}
      />
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
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          — Compte connecté · Aucun paiement détecté
        </p>
        <h1
          className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Accès en <em className="italic text-foreground">attente</em>
        </h1>
        <p
          className="font-mono text-sm text-foreground/70"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          Ton compte Discord ({email ?? "—"}) n&apos;est lié à aucun paiement.
          3 solutions :
        </p>

        {/* 1. Auto-claim by email */}
        <div className="border border-foreground/15 bg-foreground/[0.04] p-5">
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/60"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ 1. J&apos;ai payé avec un autre email
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              placeholder="email utilisé au paiement"
              value={altEmail}
              onChange={(e) => setAltEmail(e.target.value)}
              className="flex-1 border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-foreground"
              style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
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
              className="bg-[color:var(--state-done-bg)] px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-[#0D0B08] disabled:opacity-50"
              style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
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
              style={{ fontFamily: "var(--font-body-legacy)" }}
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
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          ◦ 3. Besoin d&apos;aide ?{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            className="text-foreground underline-offset-2 hover:underline"
          >
            contact@amourstudios.fr
          </a>{" "}
          — réponse sous 24h.
        </p>

        <button
          onClick={onSignOut}
          className="mt-4 self-start font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 hover:text-foreground"
          style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
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
  previewMode,
  onLockedClick,
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
  previewMode: boolean;
  onLockedClick: (moduleTitle: string) => void;
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
          previewMode={previewMode}
          onLockedClick={onLockedClick}
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
  previewMode,
  onLockedClick,
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
  previewMode: boolean;
  onLockedClick: (moduleTitle: string) => void;
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

  // Le module a au moins une leçon en preview-access (gratuite) ?
  const hasPreviewLesson = lessons.some((l) => l.previewAccess);

  let state: ModuleCardState;
  if (previewMode && !hasPreviewLesson) {
    // En mode preview, tout module sans lesson preview est VERROUILLÉ —
    // peu importe la progression passée (cas admin en VUE PREVIEW).
    state = "locked";
  } else if (total > 0 && completed === total) {
    state = "completed";
  } else if (completed > 0) {
    state = "in-progress";
  } else {
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
      previewMode={previewMode}
      onLockedClick={() => onLockedClick(mod.title)}
      hasPreviewLesson={hasPreviewLesson}
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
  previewMode,
  onLockedClick,
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
    previewAccess?: boolean;
  }>;
  progress: Record<string, { lessonCompletedAt?: number; videoWatchedAt?: number }>;
  completed: number;
  total: number;
  totalXp: number;
  earnedXp: number;
  percent: number;
  isAdmin: boolean;
  previewMode: boolean;
  onLockedClick: () => void;
  hasPreviewLesson: boolean;
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
      className="group/module relative overflow-hidden rounded-md border border-foreground/20 bg-[color:var(--paper-2,var(--card))] transition-[border-color] duration-300 hover:border-foreground/40"
      style={{
        opacity: locked ? 0.75 : 1,
        boxShadow: `inset 4px 0 0 0 ${locked ? "var(--state-locked-border)" : accent}`,
      }}
    >
      {/* Fill accent plein bas→haut au hover */}
      {!locked && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-0 origin-bottom transition-[height] duration-400 ease-[cubic-bezier(.22,1,.36,1)] group-hover/module:h-full"
          style={{ background: `${accent}28` }}
        />
      )}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="relative z-10 grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-5 px-5 py-5 pl-7 text-left md:px-8 md:pl-10"
        style={{ minHeight: 0 }}
      >
        {/* Numéro module */}
        <div
          className="text-[28px] italic leading-none tracking-tight md:text-[34px]"
          style={{
            fontFamily: "var(--font-serif)",
            color: locked ? "var(--state-locked)" : accent,
          }}
        >
          {String(order + 1).padStart(2, "0")}
        </div>

        {/* Centre : titre + description (uniquement) */}
        <div className="min-w-0">
          <h3
            className="text-[clamp(20px,2.8vw,28px)] font-normal leading-[1.1] tracking-[-0.5px] text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h3>
          {description && (
            <p
              className="mt-2.5 max-w-[52ch] font-mono text-[12px] leading-[1.55] text-foreground/55 md:text-[13px]"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              {description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {/* Compteur leçons — avec check vert si complet */}
          <div
            className="hidden items-center gap-2 font-mono text-[11px] tracking-[1px] md:flex"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            <span style={{ color: state === "completed" ? STATE_COLOR.done : "var(--foreground)" }}>
              {String(completed).padStart(2, "0")}
            </span>
            <span className="opacity-40">/</span>
            <span className="opacity-60">{String(total).padStart(2, "0")}</span>
            {state === "completed" && (
              <Check size={14} style={{ color: STATE_COLOR.done }} />
            )}
          </div>

          {/* Chevron / cadenas — petit et discret */}
          <div
            className="flex size-8 items-center justify-center border transition-transform duration-300"
            style={{
              borderColor: locked
                ? "var(--fg-faint)"
                : "var(--state-locked-border)",
              color: locked ? "var(--state-locked)" : "var(--foreground)",
              transform: expanded ? "rotate(180deg)" : "rotate(0)",
            }}
            aria-hidden
          >
            {locked ? <Lock size={13} /> : <ChevronDown size={14} />}
          </div>
        </div>
      </button>

      {/* Expandable : list of lessons (toujours dépliable, même verrouillé) */}
      <div
        className={`ds-collapse-wrap ${expanded ? "open" : ""}`}
      >
        <div className="ds-collapse-inner">
          <div className="border-t border-foreground/10 px-6 py-2 md:px-10 md:pl-12">
            {lessons.length === 0 ? (
              <p
                className="py-4 font-mono text-xs text-foreground/50"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ Aucune leçon disponible pour le moment
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-foreground/10">
                {lessons.map((lesson, i) => {
                  const isCompleted =
                    !!progress[lesson._id]?.lessonCompletedAt;
                  // En preview mode : seules les leçons previewAccess=true sont accessibles
                  // (peu importe la progress passée du compte admin)
                  // Un module verrouillé (prev module pas fini) verrouille TOUTES ses leçons.
                  // Sinon : séquentiel intra-module (la précédente doit être complétée).
                  const unlocked = previewMode
                    ? lesson.previewAccess === true
                    : isAdmin ||
                      (!locked && (
                        i === 0 ||
                        !!progress[lessons[i - 1]._id]?.lessonCompletedAt
                      ));
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
                      onLockedClick={
                        !unlocked && previewMode ? onLockedClick : undefined
                      }
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
  onLockedClick,
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
  onLockedClick?: () => void;
}) {
  // ─── Pastille sémantique ───────────────────────────────
  const pillBg = completed
    ? STATE_COLOR.doneBg
    : videoSeen && unlocked
    ? STATE_COLOR.activeBg
    : "transparent";
  const pillBorder = completed || (videoSeen && unlocked)
    ? "transparent"
    : unlocked
    ? "var(--fg-faint)"
    : "var(--fg-line)";
  const pillColor = completed
    ? STATE_COLOR.doneFg
    : videoSeen && unlocked
    ? STATE_COLOR.activeFg
    : unlocked
    ? "var(--foreground)"
    : STATE_COLOR.locked;

  const content = (
    <div
      className={`group/lesson relative flex items-center gap-4 overflow-hidden py-3 px-2 ${
        unlocked ? "" : "cursor-not-allowed"
      }`}
    >
      {unlocked && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-0 origin-bottom transition-[height] duration-300 ease-[cubic-bezier(.22,1,.36,1)] group-hover/lesson:h-full"
          style={{ background: `${accent}40` }}
        />
      )}
      <div className="relative z-10 flex flex-1 items-center gap-4">
      <div
        className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold"
        style={{
          background: pillBg,
          borderColor: pillBorder,
          color: pillColor,
          fontFamily: "var(--font-body-legacy)",
        }}
      >
        {completed ? (
          <Check size={11} />
        ) : !unlocked ? (
          <Lock size={10} />
        ) : (
          String(order + 1).padStart(2, "0")
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="truncate font-normal leading-snug"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "16px",
            color: completed
              ? "var(--fg-soft)"
              : unlocked
              ? "var(--foreground)"
              : "var(--state-locked)",
          }}
        >
          {title}
        </div>
        <div
          className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {duration > 0 && <span>{Math.floor(duration / 60)} min</span>}
          {duration > 0 && <span className="opacity-30">·</span>}
          <span
            className="font-bold"
            style={{ color: completed ? STATE_COLOR.done : "var(--fg-soft)" }}
          >
            {completed ? "+" : ""}
            {xpReward} XP
          </span>
        </div>
      </div>

      <div className="shrink-0">
        {completed ? (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
            style={{ background: STATE_COLOR.doneBg, color: STATE_COLOR.doneFg, fontFamily: "var(--font-body-legacy)" }}
          >
            ✓ FAIT
          </span>
        ) : videoSeen ? (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] px-2 py-1"
            style={{ background: STATE_COLOR.activeBg, color: STATE_COLOR.activeFg, fontFamily: "var(--font-body-legacy)" }}
          >
            ● ACTIF
          </span>
        ) : !unlocked ? (
          <span
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] px-2 py-1 border border-dashed"
            style={{ color: STATE_COLOR.locked, borderColor: STATE_COLOR.lockedBorder, fontFamily: "var(--font-body-legacy)" }}
          >
            <Lock size={10} aria-hidden />
            BLOQUÉ
          </span>
        ) : placeholder ? (
          <span
            className="font-mono text-[10px] uppercase tracking-[1.5px] px-2 py-1 border"
            style={{ color: STATE_COLOR.pending, borderColor: STATE_COLOR.lockedBorder, fontFamily: "var(--font-body-legacy)" }}
          >
            BIENTÔT
          </span>
        ) : (
          <span
            className="text-lg italic text-foreground/30 group-hover/lesson:text-foreground/70 transition-colors"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            →
          </span>
        )}
      </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  if (onLockedClick) {
    return (
      <button
        type="button"
        onClick={onLockedClick}
        className="block w-full text-left"
        style={{ minHeight: 0 }}
      >
        {content}
      </button>
    );
  }
  return content;
}
