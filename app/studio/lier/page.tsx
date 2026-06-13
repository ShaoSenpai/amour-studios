"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  ACCENT,
  Glass,
  GlassButton,
  mono,
  num,
  palette,
  useIsDark,
  type C,
} from "../_components/glass";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// /studio/lier — SAV : « Lier un compte Discord ↔ paiement », sans OAuth.
// Le coach saisit un Discord ID, cherche un paiement par email (ou voit les
// récents), et le lie. Backend : api.admin.adminLinkDiscordToPurchase. Sert
// aussi à tester le flux sans jongler avec les comptes Discord. DA Glass C.
// ============================================================================

type PurchaseRow = {
  purchaseId: Id<"purchases">;
  email: string;
  tier: "coaching" | "communaute" | null;
  status: string;
  hasUser: boolean;
  pi: string;
  createdAt: number;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  past_due: "Impayé",
  paid: "Payé",
  pending: "En attente",
  incomplete: "Incomplet",
  canceled: "Résilié",
  refunded: "Remboursé",
  failed: "Échec",
};

function isLive(status: string) {
  return status === "active" || status === "past_due" || status === "paid";
}

function tierLabel(tier: PurchaseRow["tier"]) {
  if (tier === "coaching") return "Coaching 179€";
  if (tier === "communaute") return "Communauté 79€";
  return "—";
}

function inputStyle(c: C): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 12,
    padding: "11px 14px",
    color: c.text,
    fontSize: 14,
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    outline: "none",
  };
}

function labelStyle(c: C): CSSProperties {
  return { ...mono, fontSize: 10, color: c.muted, marginBottom: 7, display: "block" };
}

export default function LierPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const [discordId, setDiscordId] = useState("");
  const [email, setEmail] = useState("");
  // Email réellement cherché (déclenche la query). "" → 15 récents.
  const [searched, setSearched] = useState<string | undefined>(undefined);
  const [linkingId, setLinkingId] = useState<Id<"purchases"> | null>(null);

  const rows = useQuery(
    api.admin.adminSearchPurchases,
    searched === undefined ? "skip" : { email: searched }
  ) as PurchaseRow[] | undefined;

  const linkMutation = useMutation(api.admin.adminLinkDiscordToPurchase);

  const trimmedDiscordId = discordId.trim();
  const canLink = trimmedDiscordId.length > 0;

  const handleSearch = () => {
    setSearched(email.trim().toLowerCase());
  };

  const handleLink = async (row: PurchaseRow) => {
    if (!canLink) {
      toast.error("Renseigne d'abord un Discord ID.");
      return;
    }
    if (linkingId) return;
    setLinkingId(row.purchaseId);
    try {
      const res = await linkMutation({
        discordId: trimmedDiscordId,
        purchaseId: row.purchaseId,
      });
      if (res?.ok) {
        toast.success(
          "Compte lié — le membre peut se présenter, ou clique Relancer pour lui envoyer le lien.",
          { duration: 6000 }
        );
        setDiscordId("");
        // Rafraîchit la liste (hasUser passe à vrai).
        setSearched((s) => (s === undefined ? s : s));
      } else {
        toast.error("Liaison impossible.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de liaison.");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <main
      style={{
        background: c.bgGrad,
        minHeight: "100vh",
        color: c.text,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: "32px 28px 64px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* En-tête */}
        <div>
          <div style={{ ...mono, color: ACCENT }}>◦ SAV · Liaison manuelle</div>
          <h1
            style={{
              ...num,
              fontSize: 32,
              fontWeight: 500,
              margin: "8px 0 0",
            }}
          >
            Lier un compte Discord ↔ paiement
          </h1>
          <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 0", maxWidth: 560, lineHeight: 1.5 }}>
            Quand un client se présente avec un compte non lié à son paiement
            (mauvais compte à l&apos;OAuth, compte recréé…), lie son Discord ID
            au bon paiement. Sans OAuth — le compte sera adopté automatiquement
            à sa prochaine connexion Discord.
          </p>
        </div>

        {/* Discord ID */}
        <Glass c={c} dark={dark}>
          <label htmlFor="discordId" style={labelStyle(c)}>
            Discord ID du membre
          </label>
          <input
            id="discordId"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="ex. 123456789012345678"
            inputMode="numeric"
            style={inputStyle(c)}
          />
          <p style={{ ...mono, fontSize: 9.5, color: c.faint, marginTop: 8 }}>
            {canLink
              ? "✓ Prêt — choisis le paiement à lier ci-dessous"
              : "Renseigne le Discord ID pour activer la liaison"}
          </p>
        </Glass>

        {/* Recherche paiement */}
        <Glass c={c} dark={dark}>
          <label htmlFor="email" style={labelStyle(c)}>
            Email du paiement (laisse vide pour les 15 plus récents)
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="client@email.com"
              type="email"
              style={{ ...inputStyle(c), flex: "1 1 240px" }}
            />
            <GlassButton c={c} kind="solid" onClick={handleSearch} style={{ padding: "11px 20px", fontSize: 12 }}>
              Chercher
            </GlassButton>
          </div>

          {/* Résultats */}
          <div style={{ marginTop: 16 }}>
            {searched === undefined && (
              <div style={{ ...mono, color: c.faint, padding: "8px 2px", fontSize: 10 }}>
                Lance une recherche, ou liste les paiements récents.
              </div>
            )}
            {searched !== undefined && rows === undefined && (
              <div style={{ ...mono, color: c.faint, padding: "8px 2px", fontSize: 10 }}>
                Chargement…
              </div>
            )}
            {rows && rows.length === 0 && (
              <div style={{ ...mono, color: c.faint, padding: "8px 2px", fontSize: 10 }}>
                Aucun paiement trouvé{searched ? ` pour « ${searched} »` : ""}.
              </div>
            )}
            {rows &&
              rows.map((row) => {
                const live = isLive(row.status);
                const linking = linkingId === row.purchaseId;
                return (
                  <div
                    key={row.purchaseId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 4px",
                      borderTop: `1px solid ${c.hairline}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                      <div
                        style={{
                          ...num,
                          fontSize: 15,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.email}
                      </div>
                      <div style={{ ...mono, fontSize: 9.5, color: c.faint, marginTop: 3 }}>
                        {tierLabel(row.tier)} · {STATUS_LABEL[row.status] ?? row.status}
                        {row.hasUser ? " · déjà lié" : ""}
                      </div>
                    </div>

                    {/* Statut chip */}
                    <span
                      style={{
                        ...mono,
                        fontSize: 9.5,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: live ? ACCENT : c.chip,
                        color: live ? "#0B0B0B" : c.muted,
                        border: live ? "none" : `1px solid ${c.line}`,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>

                    <GlassButton
                      c={c}
                      kind={canLink ? "ink" : "ghost"}
                      onClick={() => handleLink(row)}
                      disabled={!canLink || linking}
                      style={{
                        padding: "9px 14px",
                        fontSize: 11,
                        opacity: !canLink || linking ? 0.5 : 1,
                        cursor: !canLink || linking ? "not-allowed" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {linking ? "Liaison…" : "Lier à ce Discord ID"}
                    </GlassButton>
                  </div>
                );
              })}
          </div>
        </Glass>
      </div>
    </main>
  );
}
