"use client";

import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Lock, Check, ChevronDown, Search, X, Trophy } from "lucide-react";

export default function DashboardPage() {
  const user = useQuery(api.users.current);
  const purchase = useQuery(api.purchases.current);
  const modules = useQuery(api.modules.list);
  const progress = useQuery(api.progress.myProgress);
  const globalProgress = useQuery(api.progress.globalProgress);
  const { signOut } = useAuthActions();
  const updateStreak = useMutation(api.streaks.updateStreak);

  useEffect(() => {
    if (user) updateStreak().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  if (
    user === undefined || purchase === undefined || modules === undefined ||
    progress === undefined || globalProgress === undefined
  ) {
    return (
      <main className="px-6 py-8 max-w-4xl mx-auto">
        <div className="skeleton h-12 w-64 mb-3" />
        <div className="skeleton h-4 w-48 mb-3" />
        <div className="skeleton h-2 w-full mb-8" />
        <div className="flex flex-col gap-5">
          {[1,2,3].map((i) => <div key={i} className="skeleton h-40 w-full rounded-xl" />)}
        </div>
      </main>
    );
  }

  if (user === null) return null;
  const isAdmin = user.role === "admin";

  // Gate 1
  if (!purchase && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>Accès en <span className="font-serif-accent text-primary">attente</span></h1>
          <p className="text-sm text-muted-foreground">
            Ton compte est connecté, mais aucun achat n&apos;est lié à <span className="font-medium text-foreground">{user.email}</span>.
          </p>
          <a href="https://www.amourstudios.fr/paiement" target="_blank" rel="noopener noreferrer"
            className="inline-flex h-12 w-full max-w-xs items-center justify-center rounded-full bg-primary text-primary-foreground font-medium">
            Acheter la formation — 497 €
          </a>
          <p className="text-xs text-muted-foreground">Déjà payé ? <a href="mailto:contact@amourstudios.fr" className="text-primary hover:underline">contact@amourstudios.fr</a></p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>Se déconnecter</Button>
        </div>
      </main>
    );
  }

  // Gate 2
  if (!user.onboardingCompletedAt && !isAdmin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
          <h1>Onboarding <span className="font-serif-accent text-primary">en cours</span></h1>
          <p className="text-sm text-muted-foreground">Paiement confirmé ! Appel d&apos;onboarding nécessaire.</p>
          <Button variant="ghost" size="sm" onClick={() => signOut()}>Se déconnecter</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-6 py-8 max-w-4xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="mb-2">
          Salut, <span className="font-serif-accent text-primary">{user.name?.split(" ")[0] ?? "artiste"}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {globalProgress.completed}/{globalProgress.total} leçons · {globalProgress.percent}%
        </p>
        <div className="mt-3 w-full h-2.5 rounded-full bg-muted/50 overflow-hidden shadow-inner">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-[#2B7A6F] to-primary transition-all duration-700"
            style={{ width: `${globalProgress.percent}%`, boxShadow: '0 0 12px -2px rgba(16,185,129,0.3)' }}
          />
        </div>
      </div>

      {/* Search */}
      <SearchBar />

      {/* Badges */}
      <BadgesSection />

      {/* Admin link */}
      {isAdmin && (
        <div className="mb-6 flex gap-2">
          <Link href="/admin/content" className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2">Contenu</Link>
          <Link href="/admin/members" className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2">Membres</Link>
          <Link href="/dashboard/profile" className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2">Profil</Link>
        </div>
      )}

      {/* Modules */}
      <div className="flex flex-col gap-5">
        {modules.map((mod, moduleIndex) => (
          <ModuleSection key={mod._id} module={mod} moduleIndex={moduleIndex} modules={modules} progress={progress} isAdmin={isAdmin} />
        ))}
      </div>

      {/* Logout */}
      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={() => signOut()}>Se déconnecter</Button>
      </div>
    </main>
  );
}

function ModuleSection({
  module: mod, moduleIndex, modules, progress, isAdmin,
}: {
  module: { _id: Id<"modules">; title: string; description: string; order: number; badgeLabel: string };
  moduleIndex: number;
  modules: { _id: Id<"modules"> }[];
  progress: Record<string, { lessonCompletedAt?: number }>;
  isAdmin: boolean;
}) {
  const lessons = useQuery(api.lessons.listByModule, { moduleId: mod._id });
  const prevModuleLessons = useQuery(
    api.lessons.listByModule,
    moduleIndex > 0 ? { moduleId: modules[moduleIndex - 1]._id } : "skip"
  );
  const [expanded, setExpanded] = useState(moduleIndex === 0);

  if (lessons === undefined) return null;

  let moduleUnlocked = isAdmin || moduleIndex === 0;
  if (!moduleUnlocked && prevModuleLessons) {
    moduleUnlocked = prevModuleLessons.every((l) => progress[l._id]?.lessonCompletedAt);
  }

  const completedCount = lessons.filter((l) => progress[l._id]?.lessonCompletedAt).length;

  const moduleAccentColors = ['#F5B820', '#FF6B1F', '#E63326', '#F2B8A2', '#2B7A6F', '#0D4D35'];

  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:shadow-lg ${!moduleUnlocked ? "opacity-40 pointer-events-none" : ""}`} style={{ borderLeft: `3px solid ${moduleAccentColors[moduleIndex] ?? moduleAccentColors[0]}` }}>
      {/* Header */}
      <button onClick={() => moduleUnlocked && setExpanded(!expanded)} aria-label={expanded ? "Réduire le module" : "Ouvrir le module"} className="w-full p-5 text-left flex items-center justify-between hover:bg-muted/20 transition-colors active:scale-[0.99]">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">{mod.badgeLabel}</Badge>
          <div>
            <h2 className="text-lg">{mod.title}</h2>
            <p className="text-xs text-muted-foreground">{mod.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg width="28" height="28" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
            <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
              className="text-primary"
              strokeDasharray={`${2 * Math.PI * 14}`}
              strokeDashoffset={`${2 * Math.PI * 14 * (1 - completedCount / Math.max(lessons.length, 1))}`}
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          <span className="text-xs text-muted-foreground">{completedCount}/{lessons.length}</span>
          {!moduleUnlocked ? <Lock size={14} /> : (
            <div className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
              <ChevronDown size={16} className="text-muted-foreground" />
            </div>
          )}
        </div>
      </button>

      {/* Lessons */}
      {expanded && (
        <div className="border-t border-border p-2">
          {lessons.map((lesson, lessonIndex) => {
            let lessonUnlocked = isAdmin;
            if (!lessonUnlocked && moduleUnlocked) {
              lessonUnlocked = lessonIndex === 0 || !!progress[lessons[lessonIndex - 1]._id]?.lessonCompletedAt;
            }
            const isCompleted = !!progress[lesson._id]?.lessonCompletedAt;

            return (
              <Link
                key={lesson._id}
                href={lessonUnlocked ? `/lesson/${lesson._id}` : "#"}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${lessonUnlocked ? "hover:bg-muted/30 active:scale-[0.98]" : "cursor-not-allowed opacity-50"}`}
                onClick={(e) => { if (!lessonUnlocked) e.preventDefault(); }}
              >
                <div className={`size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : lessonUnlocked
                      ? "bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-[0_0_12px_-2px_rgba(16,185,129,0.3)]"
                      : "bg-muted/50 text-muted-foreground"
                }`}>
                  {isCompleted ? <Check size={14} /> : lessonUnlocked ? lessonIndex + 1 : <Lock size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${!lessonUnlocked ? "text-muted-foreground" : ""}`}>{lesson.title}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{lesson.xpReward} XP</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
function SearchBar() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useQuery(
    api.lessons.search,
    query.length >= 2 ? { query } : "skip"
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="mb-6 relative z-50">
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Rechercher une leçon... ⌘K"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              inputRef.current?.blur();
            }
          }}
          className="w-full h-11 rounded-full border border-border bg-card pl-10 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-all"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      {results !== undefined && query.length >= 2 && (
        <div className="absolute top-13 left-0 right-0 bg-card border border-border rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun résultat</p>
          ) : (
            results.map((result) => (
              <Link
                key={result._id}
                href={`/lesson/${result._id}`}
                onClick={() => setQuery("")}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0"
              >
                <Badge variant="outline" className="text-[10px] shrink-0">{result.moduleBadgeLabel}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{result.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────
function BadgesSection() {
  const badges = useQuery(api.badges.myBadges);
  if (!badges || badges.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-muted-foreground mb-2">Badges débloqués</p>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <div key={badge._id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Trophy size={12} className="text-primary" />
            <span className="text-xs font-medium text-primary">{badge.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
