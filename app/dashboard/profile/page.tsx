"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRef, useState, useEffect, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Save,
  Loader2,
  Camera,
  LogOut,
  Check,
  RefreshCw,
} from "lucide-react";
import { StatBlock } from "@/components/ds/stat-block";
import { Pill } from "@/components/ds/pill";

const MODULE_ACCENTS = [
  "#F5B820",
  "#FF6B1F",
  "#E63326",
  "#F2B8A2",
  "#2B7A6F",
  "#0D4D35",
];

export default function ProfilePage() {
  const user = useQuery(api.users.current);
  const badges = useQuery(api.badges.myBadges);
  const globalProgress = useQuery(api.progress.globalProgress);
  const modules = useQuery(api.modules.list);
  const { signOut } = useAuthActions();

  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const saveProfileImage = useMutation(api.users.saveProfileImage);
  const requestDiscordRoleSync = useAction(api.users.requestDiscordRoleSync);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user && !initialized) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setInitialized(true);
    }
  }, [user, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      setDirty(false);
      setSaved(true);
      toast.success("Profil enregistré");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image trop lourde (max 5 Mo)");
        return;
      }
      try {
        setUploading(true);
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        await saveProfileImage({ storageId });
        toast.success("Photo de profil mise à jour");
      } catch {
        toast.error("Erreur lors de l'upload");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [generateUploadUrl, saveProfileImage]
  );

  if (
    user === undefined ||
    badges === undefined ||
    globalProgress === undefined ||
    modules === undefined
  ) {
    return (
      <main className="ds-grid-bg min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="skeleton mb-6 h-16 w-64 rounded-none" />
          <div className="skeleton mb-4 h-40 w-full rounded-none" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-32 rounded-none" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (user === null) return null;

  const firstName = user.name?.split(" ")[0] ?? "artiste";
  const xp = user.xp ?? 0;
  const level = Math.floor(xp / 500) + 1;
  const isVip = !!user.purchaseId || user.role === "admin";

  // Build a map moduleId → {title, order, color, badgeLabel}
  const moduleById = new Map(
    modules.map((m) => [
      m._id as string,
      {
        title: m.title,
        order: m.order,
        color: MODULE_ACCENTS[m.order % MODULE_ACCENTS.length],
        badgeLabel: m.badgeLabel,
      },
    ])
  );

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
        {/* Hero */}
        <div className="mb-10 ds-reveal">
          <p
            className="mb-3 font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            — Compte · NIV.{String(level).padStart(2, "0")} · {xp.toLocaleString("fr-FR")} XP
          </p>
          <h1
            className="text-[clamp(48px,7vw,96px)] font-normal leading-[0.92] tracking-[-2px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Mon profil, <em className="italic text-foreground">{firstName}</em>.
          </h1>
        </div>

        {/* Identity card — hero style */}
        <section className="mb-10 grid gap-4 md:grid-cols-[1fr_auto]">
          <div
            className="ds-reveal relative overflow-hidden border-l-4 bg-[#F0E9DB] p-6 text-[#0D0B08] md:p-8"
            style={{ borderLeftColor: "rgba(13,11,8,0.2)" }}
          >
            <div className="flex flex-wrap items-center gap-6">
              {/* Avatar */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative size-24 shrink-0 overflow-hidden border-2 border-[#0D0B08]/20 bg-[#0D0B08]/5 transition-all hover:border-foreground"
                aria-label="Changer la photo de profil"
                style={{ minHeight: 0 }}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={user.name ?? "Avatar"}
                    className="size-full object-cover"
                  />
                ) : (
                  <span
                    className="flex size-full items-center justify-center text-3xl italic text-[#0D0B08]/50"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {(user.name ?? "?")[0]?.toUpperCase()}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera size={20} className="text-white" />
                </div>
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 size={20} className="animate-spin text-white" />
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 flex-wrap">
                  <h2
                    className="text-3xl font-normal italic leading-tight"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {user.name ?? "—"}
                  </h2>
                  <Pill variant={isVip ? "success" : "alert"}>
                    ● {isVip ? "VIP ACTIF" : "EN ATTENTE"}
                  </Pill>
                </div>
                <p
                  className="font-mono text-xs text-[#0D0B08]/70"
                  style={{ fontFamily: "var(--font-body-legacy)" }}
                >
                  {user.email ?? "email non défini"}
                </p>
                {user.discordUsername && (
                  <p
                    className="mt-1 font-mono text-[11px] text-[#0D0B08]/60"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    ◦ Discord @{user.discordUsername}
                  </p>
                )}
              </div>
            </div>

            {/* Discord re-sync */}
            {isVip && user.discordId && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#0D0B08]/15 pt-4">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await requestDiscordRoleSync();
                      toast.success("Rôle VIP re-synchronisé sur Discord");
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : "Erreur";
                      toast.error(msg);
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="flex items-center gap-2 border border-[#0D0B08] bg-[#0D0B08] px-4 py-2 font-mono text-[10px] uppercase tracking-[1.5px] text-[#F0E9DB] transition-all hover:bg-[#0D0B08]/85 disabled:opacity-60"
                  style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
                >
                  {syncing ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      SYNCHRONISATION…
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} />
                      RE-SYNCHRONISER VIP
                    </>
                  )}
                </button>
                <p
                  className="font-mono text-[10px] text-[#0D0B08]/60"
                  style={{ fontFamily: "var(--font-body-legacy)" }}
                >
                  Utile si le rôle n&apos;apparaît pas sur le serveur Discord.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Stats */}
        <section className="mb-10">
          <div className="mb-5 flex items-baseline justify-between border-b border-foreground/15 pb-3">
            <h2 className="ds-section">
              Statistiques
            </h2>
            <span
              className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              ◦ VUE D&apos;ENSEMBLE
            </span>
          </div>

          <div className="ds-cascade grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatBlock
              variant="filled"
              label="XP TOTAL"
              value={xp.toLocaleString("fr-FR")}
              accent="#2B7A6F"
            />
            <StatBlock
              variant="filled"
              label="NIVEAU"
              value={level}
              accent="#FF6B1F"
            />
            <StatBlock
              variant="filled"
              label="STREAK"
              value={user.streakDays ?? 0}
              unit="j"
              accent="#F5B820"
            />
            <StatBlock
              variant="filled"
              label="LEÇONS"
              value={`${globalProgress.completed}/${globalProgress.total}`}
              accent="#F2B8A2"
            />
            <StatBlock
              variant="filled"
              label="BADGES"
              value={badges.length}
              sub={modules.length > 0 ? `${modules.length} au total` : undefined}
              accent="#E63326"
            />
          </div>
        </section>

        {/* Badges */}
        <section className="mb-10">
          <div className="mb-5 flex items-baseline justify-between border-b border-foreground/15 pb-3">
            <h2 className="ds-section">
              Badges
            </h2>
            <span
              className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              ◦ {badges.length} / {modules.length} DÉBLOQUÉS
            </span>
          </div>

          <div className="ds-cascade grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {modules.map((mod) => {
              const earned = badges.find((b) => b.moduleId === mod._id);
              const color = MODULE_ACCENTS[mod.order % MODULE_ACCENTS.length];
              return (
                <div
                  key={mod._id}
                  className="relative flex min-h-[160px] flex-col justify-between overflow-hidden p-5 transition-all duration-700 [transition-timing-function:var(--ease-reveal)]"
                  style={
                    earned
                      ? { background: color, color: "#0D0B08" }
                      : {
                          border: "1px dashed",
                          borderColor: "rgba(240,233,219,0.15)",
                          color: "rgba(240,233,219,0.35)",
                        }
                  }
                >
                  <div>
                    <div
                      className="text-2xl italic opacity-80"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {String(mod.order + 1).padStart(2, "0")}
                    </div>
                    <h3
                      className="mt-1 text-xl font-normal leading-tight"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {mod.badgeLabel}
                    </h3>
                  </div>
                  <div
                    className="mt-4 font-mono text-[9px] uppercase tracking-[1.5px]"
                    style={{ fontFamily: "var(--font-body-legacy)" }}
                  >
                    {earned
                      ? `✓ DÉBLOQUÉ LE ${new Date(
                          earned.unlockedAt
                        ).toLocaleDateString("fr-FR")}`
                      : "◉ À DÉBLOQUER"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Account form */}
        <section className="mb-10">
          <div className="mb-5 flex items-baseline justify-between border-b border-foreground/15 pb-3">
            <h2 className="ds-section">
              Compte
            </h2>
            <span
              className="font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              ◦ MODIFIABLE
            </span>
          </div>

          <div className="border border-foreground/15 bg-foreground/[0.04]">
            <div className="border-b border-foreground/10 p-4">
              <label
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                NOM
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
                className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                placeholder="Ton nom"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              />
            </div>
            <div className="p-4">
              <label
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
                className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                placeholder="ton@email.com"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              />
              <p
                className="mt-1.5 font-mono text-[10px] text-amber-500/70"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ⚠ Changer l&apos;email ici ne change pas ton email Discord
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!dirty || saving}
              className={`gap-2 rounded-none px-6 ${
                dirty
                  ? "bg-[color:var(--state-done-bg)] text-[#0D0B08] hover:bg-[#225f57]"
                  : saved
                  ? "bg-[rgba(0,255,133,0.2)] text-[color:var(--state-done)]"
                  : "bg-foreground/5 text-foreground/50"
              }`}
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> ENREGISTREMENT…
                </>
              ) : saved ? (
                <>
                  <Check size={14} /> ENREGISTRÉ
                </>
              ) : (
                <>
                  <Save size={14} /> ENREGISTRER
                </>
              )}
            </Button>
            {dirty && (
              <span
                className="font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50"
                style={{ fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ MODIFICATIONS NON SAUVEGARDÉES
              </span>
            )}
          </div>
        </section>

        {/* Logout */}
        <section className="mb-10">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center justify-center gap-2 border border-foreground/15 bg-foreground/[0.02] py-4 font-mono text-[11px] uppercase tracking-[2px] text-foreground/60 transition-all hover:border-[rgba(230,51,38,0.4)] hover:bg-[rgba(230,51,38,0.05)] hover:text-[#E63326]"
            style={{ fontFamily: "var(--font-body-legacy)", minHeight: 0 }}
          >
            <LogOut size={13} /> Se déconnecter
          </button>
        </section>
      </div>
    </main>
  );
}
