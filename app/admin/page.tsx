"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { StatBlock } from "@/components/ds/stat-block";
import { Pill } from "@/components/ds/pill";
import {
  Trash2,
  Send,
  Megaphone,
  AlertTriangle,
  Clock,
  Users,
  UserX,
  Loader2,
} from "lucide-react";

export default function AdminCockpitPage() {
  const user = useQuery(api.users.current);
  const stats = useQuery(api.admin.dashboardStats);
  const activity = useQuery(api.admin.recentActivity, { limit: 15 });
  const watch = useQuery(api.admin.watchlist);
  const announcements = useQuery(api.announcements.listAll);

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
        <p className="font-mono text-xs uppercase tracking-[2px] text-foreground/60">
          ◦ Accès refusé
        </p>
      </main>
    );
  }

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        {/* Hero */}
        <div className="ds-reveal mb-8">
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
            style={{ fontFamily: "var(--font-body)" }}
          >
            — Cockpit · {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1
            className="text-[clamp(44px,6vw,72px)] font-normal leading-[0.95] tracking-[-1.5px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Vue d&apos;<em className="italic text-[#FF6B1F]">ensemble</em>
          </h1>
        </div>

        {/* Stats */}
        <section className="mb-10">
          <div
            className="mb-4 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Chiffres clés
          </div>
          {stats === undefined ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-32 rounded-none" />
              ))}
            </div>
          ) : (
            <div className="ds-cascade grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatBlock
                variant="filled"
                label="MEMBRES"
                value={stats.totalMembers}
                sub={`${stats.vipCount} VIP · ${stats.pendingCount} en attente`}
                accent="#00FF85"
              />
              <StatBlock
                variant="filled"
                label={`NOUVEAUX 7J ${stats.new7d >= stats.newPrev7d ? "↑" : "↓"}`}
                value={stats.new7d}
                sub={`${stats.new7d - stats.newPrev7d >= 0 ? "+" : ""}${stats.new7d - stats.newPrev7d} vs s-1`}
                accent="#FF6B1F"
              />
              <StatBlock
                variant="filled"
                label="ACTIFS 7J"
                value={stats.active7d}
                sub={
                  stats.totalMembers > 0
                    ? `${Math.round((stats.active7d / stats.totalMembers) * 100)}% du total`
                    : "—"
                }
                accent="#F5B820"
              />
              <StatBlock
                variant="filled"
                label="COMPLÉTION"
                value={stats.avgCompletionPercent}
                unit="%"
                sub={`moyenne VIP · ${stats.totalLessons} leçons`}
                accent="#F2B8A2"
              />
              <StatBlock
                variant="filled"
                label="⚠ INACTIFS 30J"
                value={stats.totalMembers - stats.active30d}
                sub="à relancer"
                accent="#E63326"
              />
            </div>
          )}
        </section>

        {/* 2 cols: Activity + Watchlist */}
        <section className="mb-10 grid gap-6 md:grid-cols-2">
          <ActivityStream activity={activity} />
          <Watchlist watch={watch} />
        </section>

        {/* Announcements */}
        <AnnouncementsSection announcements={announcements} />
      </div>
    </main>
  );
}

// ─── Activity ─────────────────────────────────────────

function ActivityStream({
  activity,
}: {
  activity:
    | {
        type: "payment" | "lesson_completed" | "badge" | "comment" | "new_member";
        at: number;
        userId?: string;
        userName?: string;
        label: string;
      }[]
    | undefined;
}) {
  const iconByType = {
    payment: "€",
    lesson_completed: "✓",
    badge: "◉",
    comment: "◌",
    new_member: "+",
  };
  const colorByType = {
    payment: "#00FF85",
    lesson_completed: "#FF6B1F",
    badge: "#F5B820",
    comment: "#F2B8A2",
    new_member: "#E63326",
  };

  return (
    <div>
      <div
        className="mb-4 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ Activité récente · 30 derniers jours
      </div>
      {activity === undefined ? (
        <div className="skeleton h-60 rounded-none" />
      ) : activity.length === 0 ? (
        <p
          className="font-mono text-xs text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          ◦ Aucune activité récente
        </p>
      ) : (
        <ul className="flex flex-col">
          {activity.map((ev, i) => (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-foreground/10 py-3 last:border-0"
            >
              <span
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center font-mono text-[11px] font-bold"
                style={{ background: colorByType[ev.type], color: "#0D0B08" }}
              >
                {iconByType[ev.type]}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  <span
                    className="italic text-foreground"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {ev.userName}
                  </span>
                  <span className="text-foreground/60"> — {ev.label}</span>
                </div>
                <div
                  className="font-mono text-[10px] text-foreground/40"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {new Date(ev.at).toLocaleString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Watchlist ────────────────────────────────────────

type WatchUser = {
  _id: Id<"users">;
  name: string;
  email?: string;
  lastActiveAt?: number;
  completed: number;
  totalLessons: number;
  discordUsername?: string;
};

function Watchlist({
  watch,
}: {
  watch:
    | {
        inactive14: WatchUser[];
        neverActive: WatchUser[];
        noOnboarding: WatchUser[];
        vipNoDiscord: WatchUser[];
      }
    | undefined;
}) {
  const [section, setSection] = useState<
    "inactive14" | "neverActive" | "noOnboarding" | "vipNoDiscord"
  >("inactive14");

  const sections = [
    {
      key: "inactive14" as const,
      label: "Inactifs 14j+",
      icon: Clock,
    },
    {
      key: "neverActive" as const,
      label: "Jamais actifs",
      icon: UserX,
    },
    {
      key: "noOnboarding" as const,
      label: "Sans onboarding",
      icon: AlertTriangle,
    },
    {
      key: "vipNoDiscord" as const,
      label: "VIP sans Discord",
      icon: Users,
    },
  ];

  return (
    <div>
      <div
        className="mb-4 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ À surveiller
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {sections.map((s) => {
          const count = watch?.[s.key].length ?? 0;
          const isActive = section === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[1.5px] transition-all ${
                isActive
                  ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                  : "border-foreground/15 bg-foreground/[0.04] text-foreground/60 hover:text-foreground"
              }`}
              style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
            >
              <s.icon size={11} />
              {s.label} · {count}
            </button>
          );
        })}
      </div>

      {watch === undefined ? (
        <div className="skeleton h-40 rounded-none" />
      ) : watch[section].length === 0 ? (
        <p
          className="font-mono text-xs text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          ◦ Personne dans cette catégorie
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watch[section].map((u) => (
            <WatchlistRow key={u._id} u={u} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WatchlistRow({ u }: { u: WatchUser }) {
  const broadcast = useMutation(api.admin.broadcastNotification);
  const [loading, setLoading] = useState(false);
  const pct =
    u.totalLessons > 0 ? Math.round((u.completed / u.totalLessons) * 100) : 0;
  const lastAt =
    u.lastActiveAt && u.lastActiveAt > 0
      ? new Date(u.lastActiveAt).toLocaleDateString("fr-FR")
      : "jamais";

  return (
    <li className="flex items-center gap-3 border-l-2 border-foreground/15 bg-foreground/[0.03] px-3 py-2.5 hover:bg-foreground/[0.06]">
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm italic"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {u.name}
        </div>
        <div
          className="font-mono text-[10px] text-foreground/50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {pct}% · dernière connexion {lastAt}
        </div>
      </div>
      <button
        disabled={loading}
        onClick={async () => {
          const msg = prompt(`Message personnalisé pour ${u.name} ?`);
          if (!msg) return;
          setLoading(true);
          try {
            // Note: broadcast envoie à un segment, pas à un user seul.
            // Pour rester simple en phase 2, on envoie à "all" avec un message
            // ciblé. Upgrade futur : notif ciblée par userId.
            await broadcast({ scope: "all", message: `@${u.name} — ${msg}` });
            toast.success(`Notif envoyée (mentionne ${u.name})`);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Erreur"
            );
          } finally {
            setLoading(false);
          }
        }}
        className="flex items-center gap-1 border border-foreground/20 bg-foreground/[0.04] px-2 py-1 font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/70 transition-colors hover:bg-foreground/[0.08]"
        style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
      >
        <Send size={10} />
        Relancer
      </button>
    </li>
  );
}

// ─── Announcements ────────────────────────────────────

function AnnouncementsSection({
  announcements,
}: {
  announcements:
    | {
        _id: Id<"announcements">;
        title: string;
        body: string;
        scope: "all" | "vip" | "pending";
        accent?: string;
        createdAt: number;
        deletedAt?: number;
      }[]
    | undefined;
}) {
  const create = useMutation(api.announcements.create);
  const remove = useMutation(api.announcements.remove);
  const broadcast = useMutation(api.admin.broadcastNotification);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"all" | "vip" | "pending">("all");
  const [accent, setAccent] = useState("#FF6B1F");
  const [creating, setCreating] = useState(false);

  const [notifMessage, setNotifMessage] = useState("");
  const [notifScope, setNotifScope] = useState<"all" | "vip" | "pending">("all");
  const [sending, setSending] = useState(false);

  const active = (announcements ?? []).filter((a) => !a.deletedAt);

  return (
    <section className="mb-10">
      <div
        className="mb-4 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        ◦ Communication
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Poster une news */}
        <div className="border border-foreground/15 bg-foreground/[0.03] p-5">
          <h3
            className="mb-3 text-2xl italic"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <Megaphone
              size={18}
              className="mr-2 inline text-[#FF6B1F]"
            />
            Poster une <em>news</em>
          </h3>
          <p
            className="mb-4 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Affichée en banner sur la formation des users
          </p>

          <input
            type="text"
            placeholder="Titre — ex: Nouveau module disponible"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-2 w-full border border-foreground/15 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-[#FF6B1F]"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          />
          <textarea
            placeholder="Corps — max ~200 caractères"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="mb-3 w-full resize-none border border-foreground/15 bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-[#FF6B1F]"
            style={{ fontFamily: "var(--font-body)" }}
          />

          <div
            className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Destinataire
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", "vip", "pending"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[1.5px] ${
                  scope === s
                    ? "border-[#FF6B1F] bg-[#FF6B1F] text-[#0D0B08]"
                    : "border-foreground/15 bg-foreground/[0.04] text-foreground/60"
                }`}
                style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
              >
                {s === "all" ? "Tous" : s === "vip" ? "VIP" : "En attente"}
              </button>
            ))}
          </div>

          <div
            className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Couleur
          </div>
          <div className="mb-4 flex gap-2">
            {["#F5B820", "#FF6B1F", "#E63326", "#2B7A6F", "#00FF85"].map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                aria-label={`couleur ${c}`}
                className={`size-7 ${accent === c ? "ring-2 ring-offset-2 ring-offset-background" : ""}`}
                style={{ background: c, minHeight: 0 }}
              />
            ))}
          </div>

          <button
            disabled={!title.trim() || !body.trim() || creating}
            onClick={async () => {
              setCreating(true);
              try {
                await create({ title, body, scope, accent });
                toast.success("News publiée");
                setTitle("");
                setBody("");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erreur");
              } finally {
                setCreating(false);
              }
            }}
            className="w-full bg-[#00FF85] px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all hover:tracking-[3px] disabled:opacity-50"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            {creating ? "PUBLICATION…" : "PUBLIER"}
          </button>
        </div>

        {/* Notif in-app */}
        <div className="border border-foreground/15 bg-foreground/[0.03] p-5">
          <h3
            className="mb-3 text-2xl italic"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            <Send size={18} className="mr-2 inline text-[#00FF85]" />
            Broadcast <em>notif</em>
          </h3>
          <p
            className="mb-4 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Notification in-app envoyée à un segment
          </p>
          <textarea
            placeholder="Message — court, direct"
            value={notifMessage}
            onChange={(e) => setNotifMessage(e.target.value)}
            rows={3}
            className="mb-3 w-full resize-none border border-foreground/15 bg-background px-3 py-2 font-mono text-xs outline-none focus:border-[#00FF85]"
            style={{ fontFamily: "var(--font-body)" }}
          />

          <div
            className="mb-2 font-mono text-[9px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ Segment
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "vip", "pending"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setNotifScope(s)}
                className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[1.5px] ${
                  notifScope === s
                    ? "border-[#00FF85] bg-[#00FF85] text-[#0D0B08]"
                    : "border-foreground/15 bg-foreground/[0.04] text-foreground/60"
                }`}
                style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
              >
                {s === "all" ? "Tous" : s === "vip" ? "VIP" : "En attente"}
              </button>
            ))}
          </div>

          <button
            disabled={!notifMessage.trim() || sending}
            onClick={async () => {
              setSending(true);
              try {
                const res = await broadcast({
                  scope: notifScope,
                  message: notifMessage,
                });
                toast.success(`Notif envoyée à ${res.sent} membre(s)`);
                setNotifMessage("");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Erreur");
              } finally {
                setSending(false);
              }
            }}
            className="w-full bg-foreground px-4 py-3 font-mono text-[11px] uppercase tracking-[2px] text-background transition-all hover:tracking-[3px] disabled:opacity-50"
            style={{ minHeight: 0, fontFamily: "var(--font-body)" }}
          >
            {sending ? "ENVOI…" : "ENVOYER"}
          </button>
        </div>
      </div>

      {/* Active announcements list */}
      {active.length > 0 && (
        <div className="mt-6">
          <div
            className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            ◦ News actives · {active.length}
          </div>
          <ul className="flex flex-col gap-2">
            {active.map((a) => (
              <li
                key={a._id}
                className="flex items-start gap-3 border-l-2 bg-foreground/[0.03] px-4 py-3"
                style={{ borderLeftColor: a.accent ?? "#FF6B1F" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4
                      className="text-lg italic"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {a.title}
                    </h4>
                    <Pill variant="neutral">{a.scope.toUpperCase()}</Pill>
                  </div>
                  <p
                    className="mt-1 font-mono text-xs text-foreground/65"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    {a.body}
                  </p>
                  <p
                    className="mt-1 font-mono text-[9px] uppercase tracking-[1.5px] text-foreground/40"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    Publié le{" "}
                    {new Date(a.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("Supprimer cette news ?")) return;
                    try {
                      await remove({ announcementId: a._id });
                      toast.success("News supprimée");
                    } catch {
                      toast.error("Erreur");
                    }
                  }}
                  className="text-foreground/40 transition-colors hover:text-[#E63326]"
                  aria-label="Supprimer"
                  style={{ minHeight: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
