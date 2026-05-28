"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ChevronRight, CalendarDays, AlertTriangle } from "lucide-react";

// ============================================================================
// Amour Studios — Calendrier coach /admin/calendar  (DA Swiss)
// Vue agenda : RDV à venir groupés par jour + élèves sans RDV + RDV manuel.
// ============================================================================

type Upcoming = NonNullable<
  ReturnType<typeof useQuery<typeof api.coaching.upcomingSessions>>
>[number];

// ── Helpers date FR ─────────────────────────────────────
const fmtDayHeading = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(ts);
const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(ts);

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function relativeDay(ts: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((ts - start.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "AUJOURD'HUI";
  if (diff === 1) return "DEMAIN";
  if (diff > 1 && diff < 7) return `DANS ${diff} JOURS`;
  return "";
}
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const user = useQuery(api.users.current);
  const upcoming = useQuery(api.coaching.upcomingSessions, {});
  const without = useQuery(api.coaching.studentsWithoutUpcoming);
  const [adding, setAdding] = useState(false);

  if (user === undefined) {
    return (
      <main className="ds-grid-bg flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-foreground/50" />
      </main>
    );
  }
  if (!user || user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="swiss-mono">◦ Accès refusé</p>
      </main>
    );
  }

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-6">
        {/* Hero */}
        <div className="ds-reveal mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="swiss-mono mb-2">
              — Calendrier · {upcoming?.length ?? 0} RDV à venir
            </p>
            <h1 className="text-[clamp(40px,5.5vw,64px)]">
              Mon <em>agenda</em>
            </h1>
          </div>
          <button
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-2 border-[1.5px] border-foreground bg-foreground px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-background transition-all hover:bg-[color:var(--orange)] hover:border-[color:var(--orange)] hover:text-white"
            style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
          >
            <Plus size={14} /> RDV manuel
          </button>
        </div>

        {adding && (
          <div className="mb-8">
            <ManualSessionForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
          </div>
        )}

        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          {/* Agenda */}
          <section>
            <div className="mb-4 border-b border-foreground/15 pb-3 swiss-mono">◦ RDV à venir</div>
            <Agenda upcoming={upcoming} />
          </section>

          {/* Relance */}
          <section>
            <div className="mb-4 border-b border-foreground/15 pb-3 swiss-mono">
              ◦ Élèves sans RDV à venir
            </div>
            <WithoutUpcoming list={without} />
          </section>
        </div>
      </div>
    </main>
  );
}

// ── Agenda groupé par jour ──────────────────────────────
function Agenda({ upcoming }: { upcoming: Upcoming[] | undefined }) {
  const groups = useMemo(() => {
    if (!upcoming) return [];
    const map = new Map<string, Upcoming[]>();
    for (const s of upcoming) {
      const k = dayKey(s.scheduledAt);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return Array.from(map.values()).sort(
      (a, b) => a[0].scheduledAt - b[0].scheduledAt
    );
  }, [upcoming]);

  if (upcoming === undefined) {
    return <div className="skeleton h-60" />;
  }
  if (groups.length === 0) {
    return (
      <div className="border-[1.5px] border-dashed border-foreground/25 p-6 swiss-mono">
        ◦ Aucun RDV planifié sur les 60 prochains jours
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((day) => {
        const rel = relativeDay(day[0].scheduledAt);
        return (
          <div key={dayKey(day[0].scheduledAt)}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-xl capitalize">{fmtDayHeading(day[0].scheduledAt)}</h2>
              {rel && (
                <span
                  className="font-mono text-[10px] uppercase tracking-[2px] text-[color:var(--orange)]"
                  style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
                >
                  {rel}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {day.map((s) => (
                <SessionLine key={s._id} session={s} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SessionLine({ session }: { session: Upcoming }) {
  const student = session.student;
  const name = student?.discordUsername
    ? `@${student.discordUsername}`
    : student?.name ?? "Élève inconnu";

  const inner = (
    <div className="group flex items-center gap-4 border-l-[3px] border-foreground/20 bg-foreground/[0.02] p-4 transition-all hover:border-[color:var(--orange)] hover:bg-foreground/[0.05]">
      <div className="swiss-num text-2xl text-[color:var(--orange)]">{fmtTime(session.scheduledAt)}</div>
      {student?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={student.image} alt="" className="size-9 border border-foreground/20 object-cover" />
      ) : (
        <div className="flex size-9 items-center justify-center border border-foreground/20 bg-paper text-sm font-bold">
          {name[1]?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{name}</div>
        <div
          className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
          style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          {session.type} · {session.source}
          {session.endAt ? ` · jusqu'à ${fmtTime(session.endAt)}` : ""}
        </div>
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 text-foreground/25 group-hover:text-[color:var(--orange)] group-hover:translate-x-0.5 transition-all"
      />
    </div>
  );

  if (!student) return inner;
  return <Link href={`/admin/members/${student._id}`}>{inner}</Link>;
}

// ── Élèves sans RDV à venir ─────────────────────────────
function WithoutUpcoming({
  list,
}: {
  list:
    | {
        _id: Id<"users">;
        name: string | null;
        discordUsername: string | null;
        image: string | null;
        coachingStage: string | null;
      }[]
    | undefined;
}) {
  if (list === undefined) return <div className="skeleton h-40" />;
  if (list.length === 0) {
    return (
      <div className="border-[1.5px] border-foreground/15 p-5 swiss-mono">
        ◦ Tous les élèves coaching ont un RDV planifié
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="mb-1 flex items-center gap-2 text-[color:var(--orange)]">
        <AlertTriangle size={13} />
        <span
          className="font-mono text-[10px] uppercase tracking-[2px]"
          style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          {list.length} à relancer
        </span>
      </div>
      {list.map((s) => {
        const name = s.discordUsername ? `@${s.discordUsername}` : s.name ?? "Élève inconnu";
        return (
          <Link
            key={s._id}
            href={`/admin/members/${s._id}`}
            className="group flex items-center gap-3 border-[1.5px] border-foreground/15 p-3 transition-all hover:border-[color:var(--orange)]"
          >
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" className="size-8 border border-foreground/20 object-cover" />
            ) : (
              <div className="flex size-8 items-center justify-center border border-foreground/20 bg-paper text-xs font-bold">
                {name[1]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{name}</div>
              {s.coachingStage && (
                <div
                  className="font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/45"
                  style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
                >
                  {s.coachingStage}
                </div>
              )}
            </div>
            <ChevronRight
              size={14}
              className="shrink-0 text-foreground/25 group-hover:text-[color:var(--orange)] transition-colors"
            />
          </Link>
        );
      })}
    </div>
  );
}

// ── RDV manuel (choix élève + date) ─────────────────────
function ManualSessionForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const members = useQuery(api.admin.listMembers);
  const createSession = useMutation(api.coaching.createSession);

  const [userId, setUserId] = useState<string>("");
  const [when, setWhen] = useState(toLocalInput(Date.now() + 24 * 60 * 60 * 1000));
  const [type, setType] = useState<"onboarding" | "coaching" | "other">("coaching");
  const [saving, setSaving] = useState(false);

  // Élèves payants en priorité, puis le reste, triés par pseudo/nom.
  const students = useMemo(() => {
    if (!members) return [];
    return [...members]
      .filter((m) => !m.deletedAt && m.role !== "admin")
      .sort((a, b) => {
        const ap = a.purchase?.tier === "coaching" ? 0 : 1;
        const bp = b.purchase?.tier === "coaching" ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.discordUsername ?? a.name ?? "").localeCompare(b.discordUsername ?? b.name ?? "");
      });
  }, [members]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error("Choisis un élève");
      return;
    }
    const scheduledAt = new Date(when).getTime();
    if (Number.isNaN(scheduledAt)) {
      toast.error("Date invalide");
      return;
    }
    setSaving(true);
    try {
      await createSession({ userId: userId as Id<"users">, type, scheduledAt });
      toast.success("RDV manuel créé");
      onDone();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-[1.5px] border-foreground p-5">
      <div className="swiss-mono">◦ Nouveau RDV manuel</div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1 md:col-span-1">
          <span className="swiss-mono">Élève</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            className="border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
            style={{ minHeight: 0 }}
          >
            <option value="">— choisir —</option>
            {students.map((m) => (
              <option key={m._id} value={m._id}>
                {m.discordUsername ? `@${m.discordUsername}` : m.name ?? m.email ?? m._id}
                {m.purchase?.tier === "coaching" ? " · coaching" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="swiss-mono">Date & heure</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
            className="border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="swiss-mono">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
            style={{ minHeight: 0 }}
          >
            <option value="coaching">Coaching (hebdo)</option>
            <option value="onboarding">Onboarding</option>
            <option value="other">Autre</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 border-[1.5px] border-foreground bg-foreground px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-background transition-all hover:bg-[color:var(--orange)] hover:border-[color:var(--orange)] hover:text-white disabled:opacity-50"
          style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          <CalendarDays size={12} /> {saving ? "…" : "Créer le RDV"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border-[1.5px] border-foreground/25 px-4 py-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/70 transition-colors hover:border-foreground hover:text-foreground"
          style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
