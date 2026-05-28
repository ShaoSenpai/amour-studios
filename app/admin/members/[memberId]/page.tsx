"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useState, use } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  Check,
  X,
  Trash2,
  Loader2,
  CalendarDays,
  Pencil,
} from "lucide-react";

// ============================================================================
// Amour Studios — Fiche élève /admin/members/[memberId]  (DA Swiss)
// ============================================================================

type Detail = NonNullable<
  ReturnType<typeof useQuery<typeof api.coaching.getMemberDetail>>
>;
type Session = Detail["sessions"][number];

const STAGES = [
  { key: "onboarding", label: "Onboarding" },
  { key: "positionnement", label: "Positionnement" },
  { key: "contenu", label: "Contenu" },
  { key: "feedback_analyse", label: "Feedback & Analyse" },
  { key: "termine", label: "Terminé" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

// ── Helpers date FR ─────────────────────────────────────
const fmtDate = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ts);
const fmtDateShort = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(ts);
const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(ts);
const fmtDateTime = (ts: number) => `${fmtDate(ts)} · ${fmtTime(ts)}`;

// timestamp → valeur d'<input type="datetime-local"> (local, sans secondes)
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId: memberIdParam } = use(params);
  const memberId = memberIdParam as Id<"users">;
  const user = useQuery(api.users.current);
  const detail = useQuery(api.coaching.getMemberDetail, { userId: memberId });

  if (user === undefined || detail === undefined) {
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

  if (detail === null) {
    return (
      <main className="ds-grid-bg min-h-screen">
        <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-6">
          <BackLink />
          <p className="mt-8 swiss-mono">◦ Élève introuvable</p>
        </div>
      </main>
    );
  }

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-6">
        <BackLink />
        <Header detail={detail} />
        <StageTracker userId={memberId} current={detail.coachingStage as StageKey | null} />

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          {/* Colonne principale : RDV */}
          <div className="flex flex-col gap-10">
            <NextSession detail={detail} userId={memberId} />
            <SessionsHistory sessions={detail.sessions} />
          </div>

          {/* Colonne latérale : paiement / discord / onboarding / stats */}
          <div className="flex flex-col gap-10">
            <StatsBlock stats={detail.stats} />
            <PaymentBlock purchase={detail.purchase} />
            <DiscordBlock user={detail.user} />
            <OnboardingBlock onboarding={detail.onboarding} />
          </div>
        </div>
      </div>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/members"
      className="inline-flex items-center gap-1.5 swiss-mono hover:text-foreground transition-colors"
      style={{ minHeight: 0 }}
    >
      <ArrowLeft size={13} /> Retour aux membres
    </Link>
  );
}

// ── Section title (label mono + filet) ──────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 border-b border-foreground/15 pb-3 swiss-mono">
      ◦ {children}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────
function Header({ detail }: { detail: Detail }) {
  const u = detail.user;
  const p = detail.purchase;
  const tierLabel =
    p?.tier === "coaching" ? "COACHING" : p?.tier === "communaute" ? "COMMUNAUTÉ" : "SANS PALIER";
  const statusLabel = p?.status ? p.status.toUpperCase() : "AUCUN";
  const stage = STAGES.find((s) => s.key === detail.coachingStage);

  return (
    <div className="ds-reveal mt-6 flex flex-col gap-5 border-[1.5px] border-foreground p-6 md:flex-row md:items-center md:gap-6">
      {u.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={u.image}
          alt=""
          className="size-20 shrink-0 border-[1.5px] border-foreground object-cover"
        />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center border-[1.5px] border-foreground bg-paper text-3xl font-black">
          {(u.name ?? u.discordUsername ?? "?")[0]?.toUpperCase()}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="swiss-mono text-[color:var(--orange)]">
          {u.discordUsername ? `@${u.discordUsername}` : "PSEUDO DISCORD INCONNU"}
        </div>
        <h1 className="mt-1 text-[clamp(28px,4vw,44px)]">{u.name ?? "Sans nom"}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag>{tierLabel}</Tag>
          <Tag variant={p?.status === "active" || p?.status === "paid" ? "solid" : "muted"}>
            {statusLabel}
          </Tag>
          {stage && <Tag variant="orange">{stage.label.toUpperCase()}</Tag>}
        </div>
      </div>
    </div>
  );
}

function Tag({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "outline" | "solid" | "muted" | "orange";
}) {
  const cls =
    variant === "solid"
      ? "bg-foreground text-background border-foreground"
      : variant === "orange"
      ? "bg-[color:var(--orange)] text-white border-[color:var(--orange)]"
      : variant === "muted"
      ? "bg-transparent text-foreground/50 border-foreground/25"
      : "bg-transparent text-foreground border-foreground/40";
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[2px] ${cls}`}
      style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
    >
      {children}
    </span>
  );
}

// ── Stage tracker (les 5 étapes, changeable) ────────────
function StageTracker({
  userId,
  current,
}: {
  userId: Id<"users">;
  current: StageKey | null;
}) {
  const setStage = useMutation(api.coaching.setStage);
  const [saving, setSaving] = useState<StageKey | null>(null);
  const currentIdx = STAGES.findIndex((s) => s.key === current);

  return (
    <div className="mt-10">
      <SectionTitle>Étape du parcours</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {STAGES.map((s, i) => {
          const isCurrent = s.key === current;
          const isPast = currentIdx >= 0 && i < currentIdx;
          return (
            <button
              key={s.key}
              disabled={saving !== null}
              onClick={async () => {
                if (isCurrent) return;
                setSaving(s.key);
                try {
                  await setStage({ userId, stage: s.key });
                  toast.success(`Étape → ${s.label}`);
                } catch {
                  toast.error("Erreur");
                } finally {
                  setSaving(null);
                }
              }}
              className={`group flex flex-col gap-2 border-[1.5px] p-3 text-left transition-all ${
                isCurrent
                  ? "border-[color:var(--orange)] bg-[color:var(--orange)] text-white"
                  : isPast
                  ? "border-foreground/40 bg-foreground/[0.04] text-foreground"
                  : "border-foreground/20 bg-transparent text-foreground/45 hover:border-foreground hover:text-foreground"
              }`}
              style={{ minHeight: 0 }}
            >
              <span
                className="font-mono text-[10px] tracking-[2px]"
                style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
              >
                {String(i + 1).padStart(2, "0")} {isPast && <Check size={11} className="inline" />}
              </span>
              <span className="text-sm font-bold leading-tight">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Prochain RDV + bouton + RDV ─────────────────────────
function NextSession({ detail, userId }: { detail: Detail; userId: Id<"users"> }) {
  const next = detail.nextSession;
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-b border-foreground/15 pb-3">
        <span className="swiss-mono">◦ Prochain RDV</span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 border-[1.5px] border-foreground bg-foreground px-3 py-1.5 font-mono text-[10px] uppercase tracking-[2px] text-background transition-all hover:bg-[color:var(--orange)] hover:border-[color:var(--orange)] hover:text-white"
          style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          <Plus size={12} /> RDV
        </button>
      </div>

      {adding && (
        <div className="mb-4">
          <SessionForm userId={userId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {next ? (
        <div className="flex items-center gap-4 border-[1.5px] border-[color:var(--orange)] p-5">
          <CalendarDays size={28} className="shrink-0 text-[color:var(--orange)]" />
          <div className="min-w-0">
            <div className="swiss-num text-[clamp(20px,3vw,30px)]">{fmtDate(next.scheduledAt)}</div>
            <div className="mt-1 swiss-mono">
              {fmtTime(next.scheduledAt)}
              {next.endAt ? ` – ${fmtTime(next.endAt)}` : ""} · {next.type} · {next.source}
            </div>
          </div>
        </div>
      ) : (
        !adding && (
          <div className="border-[1.5px] border-dashed border-foreground/25 p-5 swiss-mono">
            ◦ Aucun RDV à venir — planifie le prochain call
          </div>
        )
      )}
    </div>
  );
}

// ── Historique RDV ──────────────────────────────────────
function SessionsHistory({ sessions }: { sessions: Session[] }) {
  return (
    <div>
      <SectionTitle>Historique des RDV · {sessions.length}</SectionTitle>
      {sessions.length === 0 ? (
        <p className="swiss-mono">◦ Aucune session enregistrée</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((s) => (
            <SessionRow key={s._id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_META: Record<
  Session["status"],
  { label: string; cls: string }
> = {
  scheduled: { label: "À VENIR", cls: "border-[color:var(--orange)] text-[color:var(--orange)]" },
  completed: { label: "FAIT", cls: "border-foreground bg-foreground text-background" },
  canceled: { label: "ANNULÉ", cls: "border-foreground/25 text-foreground/45" },
  no_show: { label: "NO-SHOW", cls: "border-[#E63326] text-[#E63326]" },
};

function SessionRow({ session }: { session: Session }) {
  const updateSession = useMutation(api.coaching.updateSession);
  const completeSession = useMutation(api.coaching.completeSession);
  const cancelSession = useMutation(api.coaching.cancelSession);
  const deleteSession = useMutation(api.coaching.deleteSession);

  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(session.summary ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");
  const [busy, setBusy] = useState(false);

  const meta = STATUS_META[session.status];

  const save = async () => {
    setBusy(true);
    try {
      await updateSession({ sessionId: session._id, summary, notes });
      toast.success("RDV mis à jour");
      setEditing(false);
    } catch {
      toast.error("Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-l-[3px] border-foreground/20 bg-foreground/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="swiss-num text-lg">{fmtDateShort(session.scheduledAt)}</span>
        <span className="swiss-mono" style={{ color: "var(--muted-foreground)" }}>
          {fmtTime(session.scheduledAt)} · {session.type}
        </span>
        <span
          className={`ml-auto inline-flex items-center border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[2px] ${meta.cls}`}
          style={{ fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          {meta.label}
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-foreground/40 transition-colors hover:text-foreground"
          aria-label="Éditer résumé / notes"
          style={{ minHeight: 0 }}
        >
          <Pencil size={13} />
        </button>
      </div>

      {/* Résumé + notes (lecture) */}
      {!editing && (session.summary || session.notes) && (
        <div className="mt-3 flex flex-col gap-2">
          {session.summary && (
            <p className="text-sm leading-relaxed">{session.summary}</p>
          )}
          {session.notes && (
            <p className="text-sm leading-relaxed text-foreground/60">
              <span className="swiss-mono mr-1">Notes ·</span>
              {session.notes}
            </p>
          )}
        </div>
      )}

      {/* Édition résumé + notes */}
      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="swiss-mono">Résumé du call</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Ce qui a été vu, décidé, livré…"
              className="resize-none border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="swiss-mono">Notes privées</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations, points de vigilance…"
              className="resize-none border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
            />
          </div>
          <div className="flex gap-2">
            <SwissBtn onClick={save} disabled={busy} variant="solid">
              {busy ? "…" : "Enregistrer"}
            </SwissBtn>
            <SwissBtn onClick={() => setEditing(false)} variant="ghost">
              Annuler
            </SwissBtn>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-3">
        {session.status === "scheduled" && (
          <>
            <SwissBtn
              variant="solid"
              onClick={async () => {
                setBusy(true);
                try {
                  await completeSession({ sessionId: session._id, summary, notes });
                  toast.success("RDV marqué fait");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={11} /> Marquer fait
            </SwissBtn>
            <SwissBtn
              variant="ghost"
              onClick={async () => {
                await cancelSession({ sessionId: session._id });
                toast.success("RDV annulé");
              }}
            >
              <X size={11} /> Annuler
            </SwissBtn>
            <SwissBtn
              variant="ghost"
              onClick={async () => {
                await cancelSession({ sessionId: session._id, noShow: true });
                toast.success("Marqué no-show");
              }}
            >
              No-show
            </SwissBtn>
          </>
        )}
        <button
          onClick={async () => {
            if (!confirm("Supprimer définitivement ce RDV ?")) return;
            await deleteSession({ sessionId: session._id });
            toast.success("RDV supprimé");
          }}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/40 transition-colors hover:text-[#E63326]"
          style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
        >
          <Trash2 size={11} /> Supprimer
        </button>
      </div>
    </div>
  );
}

// ── Formulaire de création de RDV ───────────────────────
function SessionForm({
  userId,
  onDone,
  onCancel,
}: {
  userId: Id<"users">;
  onDone: () => void;
  onCancel: () => void;
}) {
  const createSession = useMutation(api.coaching.createSession);
  const [when, setWhen] = useState(toLocalInput(Date.now() + 24 * 60 * 60 * 1000));
  const [type, setType] = useState<"onboarding" | "coaching" | "other">("coaching");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!when) return;
    const scheduledAt = new Date(when).getTime();
    if (Number.isNaN(scheduledAt)) {
      toast.error("Date invalide");
      return;
    }
    setSaving(true);
    try {
      await createSession({ userId, type, scheduledAt, notes: notes.trim() || undefined });
      toast.success("RDV créé");
      onDone();
    } catch {
      toast.error("Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-[1.5px] border-foreground/20 bg-foreground/[0.03] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
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
      <div className="flex flex-col gap-1">
        <span className="swiss-mono">Notes (optionnel)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Préparation, objectif du call…"
          className="resize-none border-[1.5px] border-foreground/20 bg-background px-3 py-2 text-sm outline-none focus:border-[color:var(--orange)]"
        />
      </div>
      <div className="flex gap-2">
        <SwissBtn type="submit" variant="solid" disabled={saving}>
          {saving ? "…" : "Créer le RDV"}
        </SwissBtn>
        <SwissBtn type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </SwissBtn>
      </div>
    </form>
  );
}

// ── Stats ───────────────────────────────────────────────
function StatsBlock({ stats }: { stats: Detail["stats"] }) {
  const items = [
    { label: "XP", value: stats.xp.toLocaleString("fr-FR") },
    { label: "Streak", value: `${stats.streakDays}j` },
    { label: "Badges", value: stats.badges },
    { label: "Leçons", value: `${stats.lessonsCompleted}/${stats.totalLessons}` },
  ];
  return (
    <div>
      <SectionTitle>Progression</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="border-[1.5px] border-foreground/15 p-4">
            <div className="swiss-mono">{it.label}</div>
            <div className="swiss-num mt-1 text-3xl">{it.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Paiement ────────────────────────────────────────────
function PaymentBlock({ purchase }: { purchase: Detail["purchase"] }) {
  return (
    <div>
      <SectionTitle>Paiement</SectionTitle>
      {!purchase ? (
        <p className="swiss-mono">◦ Aucun paiement rattaché</p>
      ) : (
        <dl className="flex flex-col">
          <Row label="Palier" value={purchase.tier ?? "—"} />
          <Row label="Statut" value={purchase.status} />
          <Row
            label="Prochaine échéance"
            value={purchase.currentPeriodEnd ? fmtDateShort(purchase.currentPeriodEnd) : "—"}
          />
          <Row
            label="Montant"
            value={`${(purchase.amount / 100).toLocaleString("fr-FR")} ${purchase.currency?.toUpperCase() ?? "EUR"}`}
          />
          <Row label="Durée" value={purchase.duree ?? "—"} />
          <Row label="Téléphone" value={purchase.phone ?? "—"} />
          <Row label="Source" value={purchase.source ?? "—"} />
        </dl>
      )}
    </div>
  );
}

// ── Discord ─────────────────────────────────────────────
function DiscordBlock({ user }: { user: Detail["user"] }) {
  return (
    <div>
      <SectionTitle>Discord</SectionTitle>
      <dl className="flex flex-col">
        <Row label="Pseudo" value={user.discordUsername ? `@${user.discordUsername}` : "—"} />
        <Row label="Email" value={user.email ?? "—"} />
        <Row
          label="Membre depuis"
          value={user.createdAt ? fmtDateShort(user.createdAt) : "—"}
        />
        <Row
          label="Dernière activité"
          value={user.lastActiveAt ? fmtDateTime(user.lastActiveAt) : "jamais"}
        />
      </dl>
    </div>
  );
}

// ── Onboarding ──────────────────────────────────────────
function OnboardingBlock({ onboarding }: { onboarding: Detail["onboarding"] }) {
  return (
    <div>
      <SectionTitle>Onboarding</SectionTitle>
      {!onboarding ? (
        <p className="swiss-mono">◦ Pas encore complété</p>
      ) : (
        <div className="flex flex-col gap-3 border-[1.5px] border-foreground/15 p-4 text-sm leading-relaxed">
          <OnboardingFields onboarding={onboarding} />
        </div>
      )}
    </div>
  );
}

function OnboardingFields({ onboarding }: { onboarding: NonNullable<Detail["onboarding"]> }) {
  // onboardingNotes : on affiche les champs texte non-système présents.
  const entries = Object.entries(onboarding).filter(
    ([k, v]) =>
      !["_id", "_creationTime", "userId", "createdAt", "updatedAt"].includes(k) &&
      v != null &&
      v !== ""
  );
  if (entries.length === 0) {
    return <p className="swiss-mono">◦ Notes vides</p>;
  }
  return (
    <>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="swiss-mono">{k}</div>
          <p className="mt-0.5 whitespace-pre-wrap">{String(v)}</p>
        </div>
      ))}
    </>
  );
}

// ── Petites primitives ──────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-foreground/10 py-2.5 last:border-0">
      <dt className="swiss-mono shrink-0">{label}</dt>
      <dd className="text-right text-sm font-medium">{value}</dd>
    </div>
  );
}

function SwissBtn({
  children,
  variant = "ghost",
  type = "button",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "solid" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls =
    variant === "solid"
      ? "border-foreground bg-foreground text-background hover:bg-[color:var(--orange)] hover:border-[color:var(--orange)] hover:text-white"
      : "border-foreground/25 bg-transparent text-foreground/70 hover:border-foreground hover:text-foreground";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-[1.5px] px-3 py-2 font-mono text-[10px] uppercase tracking-[2px] transition-all disabled:opacity-50 ${cls}`}
      style={{ minHeight: 0, fontFamily: "var(--font-mono-swiss), ui-monospace, monospace" }}
    >
      {children}
    </button>
  );
}
