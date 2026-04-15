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
            — Admin · {members.length} total · {admins.length} admin · {activeMembers.length} VIP · {pending.length} en attente
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
            const label = f === "all" ? "Tous" : f === "admin" ? "Admins" : f === "member" ? "VIP" : "En attente";
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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await addMember({ email: email.trim(), name: name.trim() || undefined, role });
      toast.success(`${name || email} ajouté en tant que ${role}`);
      setEmail("");
      setName("");
      setRole("member");
      setOpen(false);
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
          + Ajouter un membre
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-xl border-[1.5px] border-border bg-card p-5 flex flex-col gap-3 reveal">
      <h3>Ajouter un membre</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="email"
          placeholder="Email *"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-9 rounded-full border border-border bg-background px-4 text-sm"
          autoFocus
        />
        <input
          type="text"
          placeholder="Nom (optionnel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-4 text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <p className="label-caps">Rôle :</p>
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
      <p className="text-xs text-muted-foreground">
        Le membre pourra se connecter avec Discord (même email). L&apos;onboarding et le paiement seront bypassés.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="rounded-full" disabled={loading}>
          {loading ? "Ajout..." : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────
type Member = NonNullable<ReturnType<typeof useQuery<typeof api.admin.listMembers>>>[number];

function MemberCard({ member, currentUserId }: { member: Member; currentUserId: Id<"users"> }) {
  const completeOnboarding = useMutation(api.onboarding.complete);
  const setRole = useMutation(api.admin.setRole);
  const removeMember = useMutation(api.admin.removeMember);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const hasPurchase = !!member.purchase;
  const isOnboarded = !!member.onboardingCompletedAt;
  const isAdmin = member.role === "admin";
  const isSelf = member._id === currentUserId;

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

        {/* Status badges */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {isAdmin && (
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">Admin</Badge>
          )}
          {hasPurchase ? (
            <Badge variant="outline" className="border-[#2B7A6F]/30 text-[#2B7A6F] text-xs">Payé</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs">Non payé</Badge>
          )}
          {isOnboarded ? (
            <Badge variant="outline" className="border-[#2B7A6F]/30 text-[#2B7A6F] text-xs">Onboardé</Badge>
          ) : member.onboarding?.scheduledAt ? (
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 text-xs">RDV</Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground text-xs">Attente</Badge>
          )}
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
          {/* Onboarding */}
          {!isOnboarded && hasPurchase && !showNotes && (
            <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => setShowNotes(true)}>
              Valider onboarding
            </Button>
          )}

          {showNotes && (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="Notes (optionnel)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex-1 h-8 rounded-full border border-border bg-background px-3 text-sm"
              />
              <Button size="sm" className="rounded-full text-xs" onClick={async () => {
                await completeOnboarding({ userId: member._id as Id<"users">, notes: notes || undefined });
                toast.success(`Onboarding validé pour ${member.name}`);
                setShowNotes(false);
                setShowActions(false);
              }}>
                Confirmer
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowNotes(false)}>
                ×
              </Button>
            </div>
          )}

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

      {/* Onboarding notes */}
      {isOnboarded && member.onboarding?.notes && (
        <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
          Note : {member.onboarding.notes}
        </p>
      )}
    </div>
  );
}
