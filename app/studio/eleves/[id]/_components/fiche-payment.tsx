"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  mono,
  GlassButton,
  useIsDark,
  useIsMobile,
  type C,
} from "../../../_components/glass";
import { MobileSheet } from "../../../_components/mobile-sheet";
import { fieldInput } from "./fiche-shared";

// ============================================================================
// PaymentSavSection — actions Stripe SAV (admin) sur la fiche élève.
//  • Customer Portal • Changer plan • Annuler • Refund • Force re-sync
// Toutes destructives passent par une confirmation modale.
// ============================================================================

type SavModal =
  | { kind: "changeTier" }
  | { kind: "cancel" }
  | { kind: "refund" }
  | { kind: "forceSync" }
  | null;

export function PaymentSavSection({
  c,
  testMode,
  purchaseId,
  currentTier,
  hasSubscription,
  hasCustomer,
  cancelAtPeriodEnd,
  status,
  amountCents,
}: {
  c: C;
  testMode: boolean;
  purchaseId: Id<"purchases"> | null;
  currentTier: "communaute" | "coaching" | null;
  hasSubscription: boolean;
  hasCustomer: boolean;
  cancelAtPeriodEnd: boolean;
  status: string | null;
  amountCents: number;
}) {
  const dark = useIsDark();
  const isMobile = useIsMobile();

  const cancelSub = useAction(api.stripe.cancelSubscription);
  const refundInvoice = useAction(api.stripe.refundLastInvoice);
  const portal = useAction(api.stripe.createCustomerPortalLink);
  const changeTier = useAction(api.stripe.changeTier);
  const forceSync = useAction(api.stripe.forceSyncFromStripe);

  const [modal, setModal] = useState<SavModal>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // États propres aux modals.
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<
    "" | "duplicate" | "fraudulent" | "requested_by_customer"
  >("");
  const [tierProrate, setTierProrate] = useState(true);

  const closeModal = () => {
    setModal(null);
    setCancelImmediate(false);
    setCancelReason("");
    setRefundAmount("");
    setRefundReason("");
    setTierProrate(true);
  };

  const guardTest = () => {
    if (testMode) {
      toast.success("✓ Action SAV simulée (mode test)");
      return true;
    }
    return false;
  };

  const handlePortal = async () => {
    if (guardTest()) return;
    if (!purchaseId) return toast.error("Pas d'achat lié.");
    if (!hasCustomer) return toast.error("Pas de customer Stripe sur cet achat.");
    setBusy("portal");
    try {
      const { url } = await portal({ purchaseId });
      window.open(url, "_blank", "noopener");
      toast.success("Customer Portal ouvert.");
    } catch (e) {
      toast.error(`Échec ouverture portal : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("cancel");
    try {
      await cancelSub({
        purchaseId,
        immediate: cancelImmediate,
        reason: cancelReason.trim() || undefined,
      });
      toast.success(
        cancelImmediate
          ? "Abonnement annulé immédiatement."
          : "Annulation programmée à la fin de la période."
      );
      closeModal();
    } catch (e) {
      toast.error(`Échec annulation : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRefund = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("refund");
    try {
      const amount =
        refundAmount.trim()
          ? Math.round(parseFloat(refundAmount.replace(",", ".")) * 100)
          : undefined;
      if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
        toast.error("Montant invalide (€).");
        setBusy(null);
        return;
      }
      const res = await refundInvoice({
        purchaseId,
        amount,
        reason: refundReason || undefined,
      });
      toast.success(`Remboursement émis (${(res.amount / 100).toFixed(2)}€).`);
      closeModal();
    } catch (e) {
      toast.error(`Échec remboursement : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleChangeTier = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId || !currentTier) return;
    const next = currentTier === "coaching" ? "communaute" : "coaching";
    setBusy("changeTier");
    try {
      await changeTier({ purchaseId, newTier: next, prorate: tierProrate });
      toast.success(`Palier passé à « ${next} ».`);
      closeModal();
    } catch (e) {
      toast.error(`Échec changement plan : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleForceSync = async () => {
    if (guardTest()) return closeModal();
    if (!purchaseId) return;
    setBusy("forceSync");
    try {
      const res = await forceSync({ purchaseId });
      toast.success(`Sync Stripe OK (${res.oldStatus} → ${res.newStatus}).`);
      closeModal();
    } catch (e) {
      toast.error(`Échec sync : ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const disabled = !purchaseId;
  const noSub = !hasSubscription;
  const tierOther = currentTier === "coaching" ? "communauté" : "coaching";

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.hairline}` }}>
      <div style={{ ...mono, fontSize: 9.5, color: c.faint, marginBottom: 10 }}>
        Actions SAV
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <GlassButton
          c={c}
          disabled={disabled || !hasCustomer || busy !== null}
          onClick={() => void handlePortal()}
          style={{
            opacity: disabled || !hasCustomer || busy !== null ? 0.55 : 1,
            cursor: disabled || !hasCustomer || busy !== null ? "default" : "pointer",
          }}
          title={!hasCustomer ? "Pas de customer Stripe" : "Customer Portal (auto-gestion)"}
        >
          {busy === "portal" ? "…" : "Customer Portal ↗"}
        </GlassButton>
        <GlassButton
          c={c}
          disabled={disabled || noSub || !currentTier || busy !== null}
          onClick={() => setModal({ kind: "changeTier" })}
          style={{
            opacity: disabled || noSub || !currentTier || busy !== null ? 0.55 : 1,
            cursor: disabled || noSub || !currentTier || busy !== null ? "default" : "pointer",
          }}
          title={noSub ? "Pas d'abonnement Stripe" : `Passer en ${tierOther}`}
        >
          Changer plan
        </GlassButton>
        <GlassButton
          c={c}
          disabled={
            disabled ||
            noSub ||
            busy !== null ||
            status === "canceled"
          }
          onClick={() => setModal({ kind: "cancel" })}
          style={{
            opacity:
              disabled || noSub || busy !== null || status === "canceled" ? 0.55 : 1,
            cursor:
              disabled || noSub || busy !== null || status === "canceled"
                ? "default"
                : "pointer",
            color: "#F97316",
            borderColor: "rgba(249,115,22,0.35)",
          }}
          title={
            status === "canceled"
              ? "Déjà annulé"
              : cancelAtPeriodEnd
              ? "Annulation déjà programmée — reconfigurable"
              : "Annuler l'abonnement"
          }
        >
          Annuler abonnement
        </GlassButton>
        <GlassButton
          c={c}
          disabled={disabled || !hasCustomer || busy !== null}
          onClick={() => setModal({ kind: "refund" })}
          style={{
            opacity: disabled || !hasCustomer || busy !== null ? 0.55 : 1,
            cursor: disabled || !hasCustomer || busy !== null ? "default" : "pointer",
            color: "#E03131",
            borderColor: "rgba(224,49,49,0.35)",
          }}
          title={!hasCustomer ? "Pas de customer Stripe" : "Rembourser la dernière facture"}
        >
          Refund
        </GlassButton>
        <GlassButton
          c={c}
          disabled={disabled || noSub || busy !== null}
          onClick={() => setModal({ kind: "forceSync" })}
          style={{
            opacity: disabled || noSub || busy !== null ? 0.55 : 1,
            cursor: disabled || noSub || busy !== null ? "default" : "pointer",
          }}
          title={noSub ? "Pas d'abonnement Stripe" : "Forcer la re-sync depuis Stripe"}
        >
          {busy === "forceSync" ? "…" : "Re-sync Stripe"}
        </GlassButton>
      </div>

      {modal?.kind === "changeTier" && (
        <SavModalShell
          c={c}
          dark={dark}
          isMobile={isMobile}
          title="Changer le plan"
          onClose={closeModal}
          footer={
            <SavActions
              c={c}
              isMobile={isMobile}
              onCancel={closeModal}
              onConfirm={() => void handleChangeTier()}
              confirming={busy === "changeTier"}
              confirmLabel={`Passer en ${tierOther}`}
            />
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Faire passer cet abonnement de{" "}
            <strong style={{ color: c.text }}>{currentTier}</strong> à{" "}
            <strong style={{ color: c.text }}>{tierOther}</strong>.
          </div>
          <label
            style={{
              ...mono,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              fontSize: 11,
              color: c.muted,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={tierProrate}
              onChange={(e) => setTierProrate(e.target.checked)}
            />
            Appliquer un prorata (recommandé)
          </label>
        </SavModalShell>
      )}

      {modal?.kind === "cancel" && (
        <SavModalShell
          c={c}
          dark={dark}
          isMobile={isMobile}
          title="Annuler l'abonnement"
          onClose={closeModal}
          footer={
            <SavActions
              c={c}
              isMobile={isMobile}
              onCancel={closeModal}
              onConfirm={() => void handleCancel()}
              confirming={busy === "cancel"}
              confirmLabel={cancelImmediate ? "Annuler maintenant" : "Programmer l'annulation"}
              danger={cancelImmediate}
            />
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Choisis le mode d'annulation. La version « fin de période » laisse
            l'accès jusqu'à l'échéance courante.
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 14,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: `1px solid ${!cancelImmediate ? c.line : c.hairline}`,
                background: !cancelImmediate ? c.chip : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="cancelMode"
                checked={!cancelImmediate}
                onChange={() => setCancelImmediate(false)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  À la fin de la période (safe)
                </div>
                <div style={{ ...mono, fontSize: 10, color: c.muted, marginTop: 2 }}>
                  Accès maintenu, pas de prélèvement au prochain cycle.
                </div>
              </div>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: `1px solid ${cancelImmediate ? "rgba(249,115,22,0.4)" : c.hairline}`,
                background: cancelImmediate ? "rgba(249,115,22,0.06)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="cancelMode"
                checked={cancelImmediate}
                onChange={() => setCancelImmediate(true)}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "#F97316" }}>
                  Immédiatement (retire les accès)
                </div>
                <div style={{ ...mono, fontSize: 10, color: c.muted, marginTop: 2 }}>
                  Coupe l'abonnement maintenant. Rôles Discord coaching retirés.
                </div>
              </div>
            </label>
          </div>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Raison (optionnel — utile pour le CRM)"
            rows={2}
            style={{ ...fieldInput(c), resize: "vertical", marginTop: 12 }}
          />
        </SavModalShell>
      )}

      {modal?.kind === "refund" && (
        <SavModalShell
          c={c}
          dark={dark}
          isMobile={isMobile}
          title="Rembourser la dernière facture"
          onClose={closeModal}
          footer={
            <SavActions
              c={c}
              isMobile={isMobile}
              onCancel={closeModal}
              onConfirm={() => void handleRefund()}
              confirming={busy === "refund"}
              confirmLabel="Rembourser"
              danger
            />
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Laisse le montant vide pour un remboursement intégral.
            Dernier débit connu : <strong style={{ color: c.text }}>{(amountCents / 100).toFixed(2)} €</strong>.
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ ...mono, fontSize: 10, color: c.faint, marginBottom: 6 }}>
              Montant (€)
            </div>
            <input
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="ex : 79.00 (vide = intégral)"
              inputMode="decimal"
              style={fieldInput(c)}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 10, color: c.faint, marginBottom: 6 }}>
              Raison (Stripe)
            </div>
            <select
              value={refundReason}
              onChange={(e) =>
                setRefundReason(
                  e.target.value as "" | "duplicate" | "fraudulent" | "requested_by_customer"
                )
              }
              style={fieldInput(c)}
            >
              <option value="">— Aucune —</option>
              <option value="requested_by_customer">Demande du client</option>
              <option value="duplicate">Doublon</option>
              <option value="fraudulent">Frauduleux</option>
            </select>
          </div>
        </SavModalShell>
      )}

      {modal?.kind === "forceSync" && (
        <SavModalShell
          c={c}
          dark={dark}
          isMobile={isMobile}
          title="Forcer la re-sync Stripe"
          onClose={closeModal}
          footer={
            <SavActions
              c={c}
              isMobile={isMobile}
              onCancel={closeModal}
              onConfirm={() => void handleForceSync()}
              confirming={busy === "forceSync"}
              confirmLabel="Re-sync maintenant"
            />
          }
        >
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.muted }}>
            Récupère l'état actuel côté Stripe et écrase les champs locaux
            (status, période, palier, rôles Discord). À utiliser si un webhook
            a été raté.
          </div>
        </SavModalShell>
      )}
    </div>
  );
}

function SavModalShell({
  c,
  dark,
  isMobile,
  title,
  onClose,
  children,
  footer,
}: {
  c: C;
  dark: boolean;
  isMobile: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Mobile : bottom-sheet (MobileSheet). Desktop : modale d'origine verbatim.
  if (isMobile) {
    return (
      <MobileSheet
        c={c}
        dark={dark}
        isMobile={isMobile}
        onClose={onClose}
        title={title}
        footer={footer}
      >
        {children}
      </MobileSheet>
    );
  }

  // --- Desktop : SavModalShell d'origine (overlay full-screen + Glass C inline). ---
  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: c.glass,
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          borderRadius: 18,
          border: `1px solid ${c.line}`,
          boxShadow: `inset 0 1px 0 ${c.inner}, ${c.shadow}`,
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, color: c.text }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...mono,
              fontSize: 10,
              color: c.faint,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕ Fermer
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>,
    document.body
  );
}

function SavActions({
  c,
  isMobile,
  onCancel,
  onConfirm,
  confirming,
  confirmLabel,
  danger = false,
}: {
  c: C;
  isMobile: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmLabel: string;
  danger?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column-reverse" : "row",
        gap: 8,
        ...(isMobile
          ? { width: "100%" }
          : { marginTop: 18 }),
        justifyContent: "flex-end",
      }}
    >
      <GlassButton
        c={c}
        onClick={onCancel}
        disabled={confirming}
        style={{
          cursor: confirming ? "default" : "pointer",
          opacity: confirming ? 0.6 : 1,
          flex: isMobile ? 1 : undefined,
        }}
      >
        Annuler
      </GlassButton>
      <GlassButton
        c={c}
        kind="solid"
        onClick={onConfirm}
        disabled={confirming}
        style={{
          cursor: confirming ? "default" : "pointer",
          opacity: confirming ? 0.7 : 1,
          flex: isMobile ? 1 : undefined,
          ...(danger
            ? {
                background: "#E03131",
                color: "#FFFFFF",
                boxShadow:
                  "0 8px 24px -8px rgba(224,49,49,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
              }
            : {}),
        }}
      >
        {confirming ? "…" : confirmLabel}
      </GlassButton>
    </div>
  );
}
