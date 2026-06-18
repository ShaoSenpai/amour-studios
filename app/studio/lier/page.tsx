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
  useIsMobile,
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
  const isMobile = useIsMobile();

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

  // Voies fiables : copier le lien/code d'activation, ou lier à un membre existant.
  const getClaimLink = useMutation(api.admin.adminGetClaimLink);
  const linkToMember = useMutation(api.admin.adminLinkPurchaseToUser);
  const [pickerFor, setPickerFor] = useState<Id<"purchases"> | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const members = useQuery(
    api.admin.searchLinkableMembers,
    pickerFor && memberQuery.trim().length >= 2 ? { q: memberQuery.trim() } : "skip"
  );

  // Offrir un accès gratuit (comp).
  const giftMutation = useMutation(api.admin.grantCompAccess);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftDiscordId, setGiftDiscordId] = useState("");
  const [giftTier, setGiftTier] = useState<"communaute" | "coaching">("coaching");
  const [giftReason, setGiftReason] = useState("");
  const [gifting, setGifting] = useState(false);

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

  const handleCopyLink = async (row: PurchaseRow) => {
    try {
      const res = await getClaimLink({ purchaseId: row.purchaseId });
      try {
        await navigator.clipboard.writeText(res.claimUrl);
        toast.success(`Lien copié · code ${res.displayCode}`, { duration: 9000 });
      } catch {
        // Clipboard refusé → on affiche au moins le lien + code.
        toast.success(`Code ${res.displayCode} · ${res.claimUrl}`, { duration: 12000 });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur.");
    }
  };

  const handleLinkMember = async (row: PurchaseRow, userId: Id<"users">) => {
    try {
      const res = await linkToMember({ purchaseId: row.purchaseId, userId });
      if (res?.ok) {
        toast.success(
          res.transferred ? "Paiement transféré au membre." : "Paiement lié au membre.",
          { duration: 6000 }
        );
        setPickerFor(null);
        setMemberQuery("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur.");
    }
  };

  const handleGift = async () => {
    const e = giftEmail.trim().toLowerCase();
    if (!e) {
      toast.error("Renseigne l'email de la personne.");
      return;
    }
    if (gifting) return;
    setGifting(true);
    try {
      const res = await giftMutation({
        email: e,
        discordId: giftDiscordId.trim() || undefined,
        tier: giftTier,
        reason: giftReason.trim() || undefined,
      });
      if (res?.ok) {
        toast.success(
          `Accès ${giftTier === "coaching" ? "Coaching" : "Communauté"} offert${res.discordSynced ? " (rôles Discord en cours)" : " — ajoute le Discord ID pour donner aussi les rôles"}.`,
          { duration: 6000 }
        );
        setGiftEmail("");
        setGiftDiscordId("");
        setGiftReason("");
      } else {
        toast.error("Échec.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setGifting(false);
    }
  };

  return (
    <main
      style={{
        background: c.bgGrad,
        minHeight: "100vh",
        color: c.text,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: isMobile ? "20px 16px 48px" : "32px 28px 64px",
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

        {/* Offrir un accès gratuit (comp) */}
        <Glass c={c} dark={dark}>
          <div style={{ ...mono, color: ACCENT, marginBottom: 4 }}>◦ Offrir un accès</div>
          <p style={{ fontSize: 13, color: c.muted, margin: "0 0 14px", lineHeight: 1.5, maxWidth: 560 }}>
            Donne un accès <strong>gratuit</strong> (partenaire, cadeau, test) sans paiement.
            Débloque l&apos;accès + les rôles Discord (si tu mets le Discord ID).
            N&apos;impacte pas le MRR.
          </p>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            <input
              value={giftEmail}
              onChange={(ev) => setGiftEmail(ev.target.value)}
              placeholder="Email de la personne"
              type="email"
              style={inputStyle(c)}
            />
            <input
              value={giftDiscordId}
              onChange={(ev) => setGiftDiscordId(ev.target.value)}
              placeholder="Discord ID (optionnel, pour les rôles)"
              inputMode="numeric"
              style={inputStyle(c)}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
            {(["communaute", "coaching"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setGiftTier(t)}
                style={{
                  ...mono,
                  fontSize: 11,
                  padding: "9px 16px",
                  minHeight: 40,
                  borderRadius: 999,
                  cursor: "pointer",
                  border: `1px solid ${giftTier === t ? ACCENT : c.line}`,
                  background: giftTier === t ? ACCENT : c.chip,
                  color: giftTier === t ? "#0B0B0B" : c.muted,
                }}
              >
                {t === "coaching" ? "Coaching (exos + RDV)" : "Communauté"}
              </button>
            ))}
            <input
              value={giftReason}
              onChange={(ev) => setGiftReason(ev.target.value)}
              placeholder="Raison (optionnel)"
              style={{ ...inputStyle(c), flex: 1, minWidth: 160 }}
            />
          </div>
          <GlassButton
            c={c}
            kind="solid"
            onClick={handleGift}
            style={{ marginTop: 14, padding: "11px 20px", fontSize: 12, minHeight: 44, opacity: gifting ? 0.6 : 1 }}
          >
            {gifting ? "…" : "Offrir l'accès →"}
          </GlassButton>
        </Glass>

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
              style={{ ...inputStyle(c), flex: isMobile ? "1 1 100%" : "1 1 240px" }}
            />
            <GlassButton c={c} kind="solid" onClick={handleSearch} style={{ padding: "11px 20px", fontSize: 12, minHeight: 44 }}>
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
                const picking = pickerFor === row.purchaseId;
                return (
                  <div
                    key={row.purchaseId}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: "12px 4px",
                      borderTop: `1px solid ${c.hairline}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
                      <span
                        style={{
                          ...mono,
                          fontSize: isMobile ? 11 : 9.5,
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
                    </div>

                    {/* Actions FIABLES : code/lien + picker membre. (ID Discord = secours) */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <GlassButton
                        c={c}
                        kind="solid"
                        onClick={() => handleCopyLink(row)}
                        style={{ padding: "9px 14px", fontSize: 11, minHeight: 40 }}
                      >
                        Copier le lien + code
                      </GlassButton>
                      <GlassButton
                        c={c}
                        kind="ink"
                        onClick={() => {
                          setPickerFor(picking ? null : row.purchaseId);
                          setMemberQuery("");
                        }}
                        style={{ padding: "9px 14px", fontSize: 11, minHeight: 40 }}
                      >
                        {picking ? "Fermer" : "Lier à un membre…"}
                      </GlassButton>
                      <GlassButton
                        c={c}
                        kind="ghost"
                        onClick={() => handleLink(row)}
                        disabled={!canLink || linking}
                        style={{
                          padding: "9px 14px",
                          fontSize: 11,
                          minHeight: 40,
                          opacity: !canLink || linking ? 0.5 : 1,
                          cursor: !canLink || linking ? "not-allowed" : "pointer",
                      }}
                    >
                        {linking ? "Liaison…" : "Lier à ce Discord ID"}
                      </GlassButton>
                    </div>

                    {/* Picker membre (recommandé) */}
                    {picking && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: c.chip,
                          border: `1px solid ${c.line}`,
                        }}
                      >
                        <input
                          value={memberQuery}
                          onChange={(e) => setMemberQuery(e.target.value)}
                          placeholder="Chercher un membre (pseudo Discord, nom, email)…"
                          autoFocus
                          style={inputStyle(c)}
                        />
                        {memberQuery.trim().length < 2 && (
                          <div style={{ ...mono, fontSize: 9.5, color: c.faint }}>
                            Tape au moins 2 caractères.
                          </div>
                        )}
                        {members && members.length === 0 && memberQuery.trim().length >= 2 && (
                          <div style={{ ...mono, fontSize: 9.5, color: c.faint }}>
                            Aucun membre. (Il doit s&apos;être déjà connecté avec Discord.)
                          </div>
                        )}
                        {members &&
                          members.map((m) => (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() => handleLinkMember(row, m.userId)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                padding: "9px 11px",
                                borderRadius: 10,
                                border: `1px solid ${c.line}`,
                                background: "transparent",
                                color: c.text,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <span style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>
                                  {m.discordUsername ?? m.name ?? "—"}
                                </span>
                                <span style={{ ...mono, fontSize: 9, color: c.faint, display: "block", marginTop: 2 }}>
                                  {m.email ?? "sans email"}
                                  {m.hasPurchase ? " · a déjà un paiement" : ""}
                                  {!m.hasDiscord ? " · ⚠ pas d'ID Discord" : ""}
                                </span>
                              </span>
                              <span style={{ ...mono, fontSize: 10, color: ACCENT, flexShrink: 0 }}>
                                Lier →
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Glass>
      </div>
    </main>
  );
}
