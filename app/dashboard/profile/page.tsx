"use client";

import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRef, useState, useEffect, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Loader2, Camera, LogOut, Check } from "lucide-react";

// ============================================================================
// Amour Studios — /dashboard/profile
// ============================================================================

export default function ProfilePage() {
  const user = useQuery(api.users.current);
  const badges = useQuery(api.badges.myBadges);
  const globalProgress = useQuery(api.progress.globalProgress);
  const { signOut } = useAuthActions();

  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const saveProfileImage = useMutation(api.users.saveProfileImage);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Seed from user data
  useEffect(() => {
    if (user && !initialized) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setInitialized(true);
    }
  }, [user, initialized]);

  // Track changes
  const handleNameChange = (val: string) => {
    setName(val);
    setDirty(true);
    setSaved(false);
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    setDirty(true);
    setSaved(false);
  };

  // Save button handler
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
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
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

  // Loading
  if (user === undefined || badges === undefined || globalProgress === undefined) {
    return (
      <main className="px-6 py-8 max-w-2xl mx-auto">
        <div className="skeleton h-10 w-48 mb-8" />
        <div className="skeleton h-20 w-20 rounded-full mb-8" />
        <div className="skeleton h-32 w-full rounded-xl mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </main>
    );
  }

  if (user === null) return null;

  const xp = user.xp ?? 0;
  const level = Math.floor(xp / 500) + 1;

  return (
    <main className="px-6 py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 reveal">
        <h1 className="mb-1">
          Mon <span className="font-serif-accent text-primary">profil</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Gère ton compte et suis ta progression.
        </p>
      </div>

      {/* Avatar */}
      <div className="mb-8 reveal reveal-delay-1">
        <p className="label-caps mb-3">Photo de profil</p>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group relative size-20 rounded-full overflow-hidden border-2 border-foreground/10 bg-foreground/5 shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all hover:border-primary/30"
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={user.name ?? "Avatar"} className="size-full object-cover" />
            ) : (
              <span className="flex items-center justify-center size-full text-2xl text-muted-foreground">
                {(user.name ?? "?")[0]?.toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={18} className="text-white" />
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 size={18} className="text-white animate-spin" />
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
          <div className="text-sm text-muted-foreground">
            <p>Clique sur l&apos;image pour changer ta photo.</p>
            <p className="text-xs mt-0.5 text-muted-foreground/60">JPG, PNG ou WebP — max 5 Mo</p>
          </div>
        </div>
      </div>

      {/* Info fields */}
      <div className="mb-8 reveal reveal-delay-2">
        <p className="label-caps mb-3">Informations</p>
        <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
          <div className="p-4 border-b border-foreground/[0.06]">
            <label className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground mb-1.5 block">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none placeholder:text-muted-foreground/60"
              placeholder="Ton nom"
            />
          </div>
          <div className="p-4">
            <label className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              className="w-full bg-transparent text-sm font-medium text-foreground focus:outline-none placeholder:text-muted-foreground/60"
              placeholder="ton@email.com"
            />
            <p className="text-[10px] text-amber-500/70 mt-1.5">
              ⚠ Changer l&apos;email ici ne change pas ton email Discord
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`rounded-full gap-2 h-11 px-6 transition-all ${
              dirty
                ? "bg-primary text-primary-foreground hover:shadow-[0_0_24px_rgba(16,185,129,0.3)]"
                : saved
                  ? "bg-primary/20 text-primary"
                  : "bg-foreground/5 text-muted-foreground"
            }`}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> Enregistrement...</>
            ) : saved ? (
              <><Check size={14} /> Enregistré</>
            ) : (
              <><Save size={14} /> Enregistrer</>
            )}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Modifications non sauvegardées</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 reveal reveal-delay-3">
        <p className="label-caps mb-3">Statistiques</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="XP total" value={xp.toLocaleString("fr-FR")} />
          <StatCard label="Niveau" value={`${level}`} />
          <StatCard label="Streak" value={`${user.streakDays ?? 0}j`} />
          <StatCard label="Badges" value={`${badges.length}`} />
          <StatCard label="Leçons" value={`${globalProgress.completed}/${globalProgress.total}`} />
        </div>
      </div>

      {/* Disconnect */}
      <div className="reveal reveal-delay-4">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-full border border-foreground/[0.08] text-muted-foreground hover:text-red-400/80 hover:border-red-400/20 hover:bg-red-400/5 transition-all text-sm"
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-4 hover:bg-foreground/[0.04] transition-colors">
      <p className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-display tracking-tight">{value}</p>
    </div>
  );
}
