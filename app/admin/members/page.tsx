"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";

// ============================================================================
// Amour Studios — /admin/members
// ============================================================================

export default function AdminMembersPage() {
  const user = useQuery(api.users.current);
  const members = useQuery(api.admin.listMembers);
  const [filter, setFilter] = useState<"all" | "admin" | "member" | "pending">("all");

  if (user === undefined || members === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="skeleton h-8 w-48" />
      </main>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Accès refusé — admin uniquement</p>
      </main>
    );
  }

  const admins = members.filter((m) => m.role === "admin");
  const activeMembers = members.filter((m) => m.role !== "admin" && m.purchaseId);
  const pending = members.filter((m) => m.role !== "admin" && !m.purchaseId);

  const filtered = filter === "all" ? members
    : filter === "admin" ? admins
    : filter === "member" ? activeMembers
    : pending;

  return (
    <main className="ds-grid-bg min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        {/* Hero */}
        <div className="ds-reveal mb-8">
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            — Admin · {members.length} total · {admins.length} admin · {activeMembers.length} VIP · {pending.length} prospects
          </p>
          <h1
            className="text-[clamp(40px,5.5vw,64px)] font-normal leading-[0.95] tracking-[-1.5px]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Les <em className="italic text-foreground">membres</em>
          </h1>
        </div>

        <div className="mb-6">
          <AddMemberForm />
        </div>

        {/* Filters — DS mono tabs */}
        <div
          className="mb-6 flex flex-wrap gap-4 border-b border-foreground/15 pb-3 font-mono text-[10px] uppercase tracking-[2px]"
          style={{ fontFamily: "var(--font-body-legacy)" }}
        >
          {(["all", "admin", "member", "pending"] as const).map((f) => {
            const label = f === "all" ? "Tous" : f === "admin" ? "Admins" : f === "member" ? "VIP" : "Prospects";
            const count = f === "all" ? members.length : f === "admin" ? admins.length : f === "member" ? activeMembers.length : pending.length;
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`pb-1 transition-colors ${
                  isActive
                    ? "border-b-2 border-foreground text-foreground"
                    : "text-foreground/40 hover:text-foreground"
                }`}
                style={{ minHeight: 0, fontFamily: "var(--font-body-legacy)" }}
              >
                ◦ {label} ({count})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="border border-dashed border-foreground/15 py-12 text-center">
            <p
              className="font-mono text-xs uppercase tracking-[1.5px] text-foreground/50"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              ◦ Aucun membre dans cette catégorie
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((member) => (
              <MemberCard key={member._id} member={member} currentUserId={user._id} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────
function AddMemberForm() {
  const addMember = useMutation(api.admin.addMember);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"email" | "discordId">("email");
  const [email, setEmail] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [reason, setReason] = useState("");
  const [expiresDate, setExpiresDate] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setEmail(""); setDiscordId(""); setName(""); setRole("member");
    setReason(""); setExpiresDate(""); setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "email" && !email.trim()) return;
    if (mode === "discordId" && !discordId.trim()) return;
    setLoading(true);
    try {
      // Date choisie dans le calendrier → timestamp fin de journée 23:59:59 local
      const expiresAt = expiresDate
        ? new Date(`${expiresDate}T23:59:59`).getTime()
        : undefined;

      await addMember({
        mode,
        email: mode === "email" ? email.trim() : undefined,
        discordId: mode === "discordId" ? discordId.trim() : undefined,
        name: name.trim() || undefined,
        role,
        reason: reason.trim() || undefined,
        expiresAt,
      });
      toast.success(`Accès offert à ${name || email || discordId}`);
      reset();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="mb-6 reveal reveal-delay-1">
        <Button variant="outline" className="rounded-full text-xs" onClick={() => setOpen(true)}>
          + Offrir un accès
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl border-[1.5px] border-border bg-card p-5 flex flex-col gap-3 reveal">
      <h3 className="ds-section">Offrir un accès</h3>

      {/* Mode */}
      <div className="flex items-center gap-3">
        <p className="ds-label text-foreground/60">Identifier par :</p>
        <div className="flex gap-2">
          {(["email", "discordId"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "email" ? "Email" : "Discord ID"}
            </button>
          ))}
        </div>
      </div>

      {/* Identifiant + nom */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mode === "email" ? (
          <input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-9 rounded-full border border-border bg-background px-4 text-sm"
            autoFocus
          />
        ) : (
          <input
            type="text"
            placeholder="Discord ID (18-19 chiffres) *"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            required
            className="h-9 rounded-full border border-border bg-background px-4 text-sm"
            autoFocus
          />
        )}
        <input
          type="text"
          placeholder="Nom (optionnel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-4 text-sm"
        />
      </div>

      {/* Rôle */}
      <div className="flex items-center gap-3">
        <p className="ds-label text-foreground/60">Rôle :</p>
        <div className="flex gap-2">
          {(["member", "admin"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                role === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "member" ? "Membre" : "Admin"}
            </button>
          ))}
        </div>
      </div>

      {/* Raison + expiration */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Raison (optionnel — ex: concours, ambassadeur…)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-4 text-sm"
        />
        <div className="relative">
          <input
            type="date"
            value={expiresDate}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setExpiresDate(e.target.value)}
            className="h-9 w-full rounded-full border border-border bg-background px-4 text-sm"
          />
          {!expiresDate && (
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              Expire le… (vide = illimité)
            </span>
          )}
        </div>
      </div>

      <p className="ds-label text-foreground/50">
        {mode === "email"
          ? "Le membre pourra se connecter via Discord (même email). Rejoindre le serveur Discord est obligatoire."
          : "Le membre doit être dans le serveur Discord Amour Studios. Accès auto au prochain login."}
      </p>

      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={loading}>
          {loading ? "Ajout..." : "Offrir l'accès"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────
type Member = NonNullable<ReturnType<typeof useQuery<typeof api.admin.listMembers>>>[number];

function MemberCard({ member, currentUserId }: { member: Member; currentUserId: Id<"users"> }) {
  const setRole = useMutation(api.admin.setRole);
  const removeMember = useMutation(api.admin.removeMember);
  const [showActions, setShowActions] = useState(false);

  const hasPurchase = !!member.purchase;
  const isAdmin = member.role === "admin";
  const isSelf = member._id === currentUserId;

  // Statut unique par priorité : Admin > VIP payé > Prospect
  const status = isAdmin
    ? { label: "Admin", color: "border-foreground/30 text-foreground" }
    : hasPurchase
    ? { label: "VIP", color: "border-[#2B7A6F]/30 text-[#2B7A6F]" }
    : { label: "Prospect", color: "border-foreground/20 text-foreground/60" };

  return (
    <div className="rounded-xl border-[1.5px] border-border bg-card p-4 flex flex-col gap-3 transition-all hover:border-border/80">
      {/* Header row */}
      <div className="flex items-center gap-3">
        {member.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.image}
            alt={member.name ?? "avatar"}
            className="size-10 rounded-full border border-border"
          />
        ) : (
          <div className="size-10 rounded-full bg-muted flex items-center justify-center text-sm">
            {member.name?.[0] ?? "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{member.name ?? "Sans nom"}</p>
            {isSelf && <span className="text-xs text-muted-foreground">(toi)</span>}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {member.email ?? "—"}
            {member.discordUsername && (
              <span className="ml-1 opacity-60">@{member.discordUsername}</span>
            )}
          </p>
        </div>

        {/* Status unique par priorité */}
        <div className="shrink-0">
          <Badge variant="outline" className={`${status.color} text-xs`}>
            {status.label}
          </Badge>
        </div>

        {/* Actions menu toggle */}
        <button
          onClick={() => setShowActions(!showActions)}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg px-1"
        >
          ⋯
        </button>
      </div>

      {/* Actions panel */}
      {showActions && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
          {/* Role toggle */}
          {!isSelf && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs"
              onClick={async () => {
                const newRole = isAdmin ? "member" : "admin";
                await setRole({ userId: member._id as Id<"users">, role: newRole });
                toast.success(`${member.name} → ${newRole}`);
              }}
            >
              {isAdmin ? "Retirer admin" : "Passer admin"}
            </Button>
          )}

          {/* Remove member */}
          {!isSelf && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm(`Supprimer ${member.name ?? "ce membre"} ? Il perdra l'accès à la formation.`)) return;
                await removeMember({ userId: member._id as Id<"users"> });
                toast.success(`${member.name} supprimé`);
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      )}

    </div>
  );
}
