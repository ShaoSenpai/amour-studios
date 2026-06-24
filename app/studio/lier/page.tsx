"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import {
  ACCENT,
  Glass,
  GlassButton,
  Pill,
  mono,
  num,
  palette,
  useIsDark,
  useIsMobile,
  type C,
} from "../_components/glass";
import type { Id } from "@/convex/_generated/dataModel";

// ============================================================================
// /studio/lier — SAV : relier un paiement à un compte Discord, sans OAuth.
// Refonte ergo : la tâche principale (trouver le paiement → le relier) est en
// haut et guidée par étapes ; 3 méthodes hiérarchisées (recommandée d'abord) ;
// le Discord ID est contextuel (inline) à la méthode « secours » ; « Offrir un
// accès » est démoté en bas (repliable). Backend inchangé. DA Glass C.
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

// Petit numéro d'étape (pastille ronde accent).
function StepDot({ n }: { n: number }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 11,
        width: 22,
        height: 22,
        borderRadius: 999,
        background: ACCENT,
        color: "#0B0B0B",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontWeight: 500,
      }}
    >
      {n}
    </span>
  );
}

export default function LierPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const isMobile = useIsMobile();

  const [email, setEmail] = useState("");
  // Email réellement cherché (déclenche la query). "" → 15 récents.
  const [searched, setSearched] = useState<string | undefined>(undefined);

  const rows = useQuery(
    api.admin.adminSearchPurchases,
    searched === undefined ? "skip" : { email: searched }
  ) as PurchaseRow[] | undefined;

  // Méthode recommandée : copier le lien/code d'activation (le client se relie seul).
  const getClaimLink = useMutation(api.admin.adminGetClaimLink);

  // Méthode 2 : lier à un membre déjà connecté (picker).
  const linkToMember = useMutation(api.admin.adminLinkPurchaseToUser);
  const [pickerFor, setPickerFor] = useState<Id<"purchases"> | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const members = useQuery(
    api.admin.searchLinkableMembers,
    pickerFor && memberQuery.trim().length >= 2 ? { q: memberQuery.trim() } : "skip"
  );

  // Méthode 3 (secours) : lier via un Discord ID brut, contextuel à la ligne.
  const linkMutation = useMutation(api.admin.adminLinkDiscordToPurchase);
  const [idFor, setIdFor] = useState<Id<"purchases"> | null>(null);
  const [idValue, setIdValue] = useState("");
  const [linkingId, setLinkingId] = useState<Id<"purchases"> | null>(null);

  // Offrir un accès gratuit (comp) — démoté, repliable.
  const giftMutation = useMutation(api.admin.grantCompAccess);
  const [showGift, setShowGift] = useState(false);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftDiscordId, setGiftDiscordId] = useState("");
  const [giftTier, setGiftTier] = useState<"communaute" | "coaching">("communaute");
  const [giftReason, setGiftReason] = useState("");
  const [giftUnlimited, setGiftUnlimited] = useState(false);
  const [giftEndDate, setGiftEndDate] = useState(""); // "YYYY-MM-DD" — date de fin
  const [gifting, setGifting] = useState(false);

  // Helpers période (accès offert) : début = aujourd'hui (figé), fin choisie au
  // calendrier ou via raccourcis. Format "YYYY-MM-DD".
  const fmtYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const minEndStr = fmtYMD(new Date(Date.now() + 86_400_000)); // demain au plus tôt
  const setEndInDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setGiftEndDate(fmtYMD(d));
    setGiftUnlimited(false);
  };
  const setEndInMonths = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setGiftEndDate(fmtYMD(d));
    setGiftUnlimited(false);
  };

  const handleSearch = () => {
    setSearched(email.trim().toLowerCase());
  };

  const handleCopyLink = async (row: PurchaseRow) => {
    try {
      const res = await getClaimLink({ purchaseId: row.purchaseId });
      try {
        await navigator.clipboard.writeText(res.claimUrl);
        toast.success(`Lien copié · code ${res.displayCode} — envoie-le au client`, {
          duration: 9000,
        });
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

  const handleLinkById = async (row: PurchaseRow) => {
    const id = idValue.trim();
    if (!id) {
      toast.error("Renseigne le Discord ID.");
      return;
    }
    if (linkingId) return;
    setLinkingId(row.purchaseId);
    try {
      const res = await linkMutation({ discordId: id, purchaseId: row.purchaseId });
      if (res?.ok) {
        toast.success("Compte lié — il sera adopté à la prochaine connexion Discord.", {
          duration: 6000,
        });
        setIdFor(null);
        setIdValue("");
      } else {
        toast.error("Liaison impossible.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de liaison.");
    } finally {
      setLinkingId(null);
    }
  };

  const handleGift = async () => {
    const e = giftEmail.trim().toLowerCase();
    if (!e) {
      toast.error("Renseigne l'email de la personne.");
      return;
    }
    // Date de fin obligatoire sauf accès illimité. expiresAt = fin de journée.
    let expiresAt: number | undefined;
    if (!giftUnlimited) {
      if (!giftEndDate) {
        toast.error("Choisis une date de fin (ou coche « Illimité »).");
        return;
      }
      const [y, m, d] = giftEndDate.split("-").map(Number);
      expiresAt = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      if (expiresAt <= Date.now()) {
        toast.error("La date de fin doit être dans le futur.");
        return;
      }
    }
    if (gifting) return;
    setGifting(true);
    try {
      const res = await giftMutation({
        email: e,
        discordId: giftDiscordId.trim() || undefined,
        tier: giftTier,
        reason: giftReason.trim() || undefined,
        expiresAt,
      });
      if (res?.ok) {
        const periodTxt = expiresAt
          ? ` jusqu'au ${new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
          : " (illimité)";
        toast.success(
          `Accès ${giftTier === "coaching" ? "Coaching" : "Communauté"} offert${periodTxt}${
            res.discordSynced
              ? " · rôles Discord en cours"
              : res.activationEmailSent
              ? " · email d'activation envoyé à la personne"
              : ""
          }.`,
          { duration: 6000 }
        );
        setGiftEmail("");
        setGiftDiscordId("");
        setGiftReason("");
        setGiftEndDate("");
        setGiftUnlimited(false);
      } else {
        toast.error("Échec.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur.");
    } finally {
      setGifting(false);
    }
  };

  const hasSearched = searched !== undefined;

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
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* En-tête */}
        <div>
          <div style={{ ...mono, color: ACCENT }}>◦ SAV · Liaison</div>
          <h1 style={{ ...num, fontSize: 32, fontWeight: 500, margin: "8px 0 0" }}>
            Relier un paiement à un compte
          </h1>
          <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 0", maxWidth: 580, lineHeight: 1.5 }}>
            Un client a payé mais n&apos;a pas (le bon) accès Discord ? Trouve son paiement,
            puis relie-le. Le plus simple : lui <strong>envoyer son lien</strong> pour qu&apos;il
            se relie seul.
          </p>
        </div>

        {/* ÉTAPE 1 — Trouver le paiement */}
        <Glass c={c} dark={dark}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <StepDot n={1} />
            <span style={{ ...num, fontSize: 17, fontWeight: 500 }}>Trouve le paiement</span>
          </div>
          <label htmlFor="email" style={labelStyle(c)}>
            Email du paiement <span style={{ textTransform: "none" }}>(laisse vide pour voir les 15 plus récents)</span>
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
            <GlassButton c={c} kind="solid" onClick={handleSearch} style={{ padding: "11px 22px", fontSize: 12, minHeight: 44 }}>
              Chercher
            </GlassButton>
          </div>
          {!hasSearched && (
            <p style={{ ...mono, fontSize: 9.5, color: c.faint, marginTop: 10 }}>
              Astuce : clique « Chercher » sans email pour lister les derniers paiements.
            </p>
          )}
        </Glass>

        {/* ÉTAPE 2 — Relier (résultats) */}
        {hasSearched && (
          <Glass c={c} dark={dark}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <StepDot n={2} />
              <span style={{ ...num, fontSize: 17, fontWeight: 500 }}>Choisis comment relier</span>
            </div>

            {/* Légende des 3 méthodes (une seule fois) */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "10px 12px",
                borderRadius: 12,
                background: c.chip,
                border: `1px solid ${c.line}`,
                margin: "6px 0 14px",
              }}
            >
              <span style={{ fontSize: 12.5, color: c.text }}>
                <strong>Recommandé</strong> — « Copier le lien + code » : tu l&apos;envoies au
                client, il clique et se relie seul (zéro risque d&apos;erreur).
              </span>
              <span style={{ fontSize: 12.5, color: c.muted }}>
                « Lier à un membre » : s&apos;il s&apos;est déjà connecté à l&apos;app avec Discord.
              </span>
              <span style={{ fontSize: 12.5, color: c.muted }}>
                « Discord ID (secours) » : seulement si tu as son ID Discord sous la main.
              </span>
            </div>

            {rows === undefined && (
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
                const idOpen = idFor === row.purchaseId;
                return (
                  <div
                    key={row.purchaseId}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      padding: "14px 4px",
                      borderTop: `1px solid ${c.hairline}`,
                    }}
                  >
                    {/* Ligne identité du paiement */}
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
                        <div style={{ ...mono, fontSize: 9.5, color: c.faint, marginTop: 4 }}>
                          {tierLabel(row.tier)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        {row.hasUser && <Pill c={c} tone="success">déjà lié</Pill>}
                        <Pill c={c} tone={live ? "accent" : "outline"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Pill>
                      </div>
                    </div>

                    {/* Actions hiérarchisées : recommandée d'abord */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <GlassButton
                        c={c}
                        kind="solid"
                        onClick={() => handleCopyLink(row)}
                        style={{ padding: "10px 16px", fontSize: 11, minHeight: 42 }}
                      >
                        Copier le lien + code
                      </GlassButton>
                      <GlassButton
                        c={c}
                        kind="ghost"
                        onClick={() => {
                          setPickerFor(picking ? null : row.purchaseId);
                          setMemberQuery("");
                          setIdFor(null);
                        }}
                        style={{ padding: "10px 14px", fontSize: 11, minHeight: 42 }}
                      >
                        {picking ? "Fermer" : "Lier à un membre"}
                      </GlassButton>
                      <button
                        type="button"
                        onClick={() => {
                          setIdFor(idOpen ? null : row.purchaseId);
                          setIdValue("");
                          setPickerFor(null);
                        }}
                        style={{
                          ...mono,
                          fontSize: 10,
                          color: c.faint,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "10px 6px",
                          minHeight: 42,
                          textDecoration: "underline",
                          textUnderlineOffset: 3,
                        }}
                      >
                        {idOpen ? "Annuler" : "Discord ID (secours)"}
                      </button>
                    </div>

                    {/* Reveal : picker membre */}
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

                    {/* Reveal : Discord ID (secours), contextuel à la ligne */}
                    {idOpen && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: isMobile ? "column" : "row",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 12,
                          background: c.chip,
                          border: `1px solid ${c.line}`,
                        }}
                      >
                        <input
                          value={idValue}
                          onChange={(e) => setIdValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleLinkById(row);
                          }}
                          placeholder="Discord ID (ex. 123456789012345678)"
                          inputMode="numeric"
                          autoFocus
                          style={{ ...inputStyle(c), flex: 1 }}
                        />
                        <GlassButton
                          c={c}
                          kind="ink"
                          onClick={() => handleLinkById(row)}
                          disabled={linking || !idValue.trim()}
                          style={{
                            padding: "10px 16px",
                            fontSize: 11,
                            minHeight: 44,
                            opacity: linking || !idValue.trim() ? 0.5 : 1,
                            cursor: linking || !idValue.trim() ? "not-allowed" : "pointer",
                          }}
                        >
                          {linking ? "Liaison…" : "Lier"}
                        </GlassButton>
                      </div>
                    )}
                  </div>
                );
              })}
          </Glass>
        )}

        {/* SECONDAIRE — Offrir un accès gratuit (démoté + repliable) */}
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowGift((s) => !s)}
            style={{
              ...mono,
              fontSize: 11,
              color: c.muted,
              background: "transparent",
              border: `1px dashed ${c.line}`,
              borderRadius: 12,
              padding: "12px 16px",
              width: "100%",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>◦ Offrir un accès gratuit (partenaire, cadeau, test)</span>
            <span style={{ color: c.faint }}>{showGift ? "−" : "+"}</span>
          </button>

          {showGift && (
            <Glass c={c} dark={dark} style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: c.muted, margin: "0 0 14px", lineHeight: 1.5, maxWidth: 560 }}>
                Donne un accès <strong>gratuit</strong> sans paiement. Débloque l&apos;accès + les
                rôles Discord (si tu mets le Discord ID). N&apos;impacte pas le MRR.
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

              {/* Période d'accès : début = aujourd'hui (figé) + date de fin
                  (calendrier) + raccourcis + option illimité. expiresAt → cron
                  expire-gift-access qui révoque et retire les rôles Discord. */}
              <div
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  border: `1px solid ${c.line}`,
                  borderRadius: 12,
                  background: c.chip,
                }}
              >
                <div style={{ ...mono, fontSize: 10, color: c.muted, letterSpacing: "0.06em", marginBottom: 10 }}>
                  PÉRIODE D&apos;ACCÈS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: c.muted }}>
                    Début : <strong style={{ color: c.text }}>aujourd&apos;hui</strong> · Fin :
                  </span>
                  <input
                    type="date"
                    value={giftEndDate}
                    min={minEndStr}
                    disabled={giftUnlimited}
                    onChange={(ev) => {
                      setGiftEndDate(ev.target.value);
                      setGiftUnlimited(false);
                    }}
                    style={{ ...inputStyle(c), flex: "0 1 180px", opacity: giftUnlimited ? 0.4 : 1 }}
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                  {[
                    { label: "7 jours", fn: () => setEndInDays(7) },
                    { label: "1 mois", fn: () => setEndInMonths(1) },
                    { label: "3 mois", fn: () => setEndInMonths(3) },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={p.fn}
                      style={{
                        ...mono,
                        fontSize: 10.5,
                        padding: "7px 12px",
                        borderRadius: 999,
                        cursor: "pointer",
                        border: `1px solid ${c.line}`,
                        background: "transparent",
                        color: c.text,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setGiftUnlimited((v) => !v)}
                    style={{
                      ...mono,
                      fontSize: 10.5,
                      padding: "7px 12px",
                      borderRadius: 999,
                      cursor: "pointer",
                      border: `1px solid ${giftUnlimited ? ACCENT : c.line}`,
                      background: giftUnlimited ? ACCENT : "transparent",
                      color: giftUnlimited ? "#0B0B0B" : c.muted,
                    }}
                  >
                    ∞ Illimité
                  </button>
                </div>
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
          )}
        </div>
      </div>
    </main>
  );
}
