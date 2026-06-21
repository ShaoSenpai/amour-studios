"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ACCENT,
  mono,
  glassBtn,
  useIsMobile,
  type C,
} from "../../../_components/glass";
import { Field, fieldInput, TAP } from "./fiche-shared";

// Bloc Onboarding (fiche élève) : statut + coordonnées + dates + réponses
// + note libre admin éditable.
const ONB_STEP_LABEL: Record<string, { label: string; color: string }> = {
  awaiting_presentation: { label: "En attente présentation", color: "#F97316" },
  link_sent: { label: "Lien envoyé", color: "#3B82F6" },
  form_done: { label: "Formulaire rempli", color: "#3B82F6" },
  consents: { label: "Consentements", color: "#3B82F6" },
  rdv_booked: { label: "1er RDV réservé", color: "#1FA463" },
  community_ready: { label: "Communauté prête", color: "#1FA463" },
};

type OnboardingData = {
  _id?: Id<"onboardings">;
  tier?: "coaching" | "communaute";
  step?: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  answers?: Array<{ key: string; label: string; value: string }> | null;
  presentedAt?: number | null;
  linkSentAt?: number | null;
  formCompletedAt?: number | null;
  rdvBookedAt?: number | null;
  notes?: string | null;
} | null;

export function OnboardingBlock({
  c,
  dark,
  ob,
  editingOnb,
  draftOnb,
  setDraftOnb,
  onSave,
  onCancel,
}: {
  c: C;
  dark: boolean;
  ob: OnboardingData;
  editingOnb: boolean;
  draftOnb: string;
  setDraftOnb: (s: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isMobile = useIsMobile();
  const stepMeta = ob?.step ? ONB_STEP_LABEL[ob.step] : null;
  const fullName =
    ob?.firstName || ob?.lastName
      ? `${ob?.firstName ?? ""} ${ob?.lastName ?? ""}`.trim()
      : null;

  const forceComplete = useMutation(api.onboardings.forceCompleteOnboarding);
  const [forcing, setForcing] = useState(false);
  const isFinal = ob?.step === "rdv_booked" || ob?.step === "community_ready";
  const canForce = !!ob?._id && !isFinal;

  const handleForceComplete = async () => {
    if (!ob?._id) return;
    const label =
      ob.tier === "coaching"
        ? "Marquer le 1er RDV comme pris et débloquer l'accès complet (rôle Onboardé) ?"
        : "Marquer la communauté comme prête et débloquer l'accès (rôle Onboardé) ?";
    if (!window.confirm(label)) return;
    setForcing(true);
    try {
      const res = await forceComplete({ onboardingId: ob._id });
      if (res.ok) toast.success("Onboarding débloqué. Rôle Onboardé en cours d'attribution.");
      else toast.message("Onboarding déjà finalisé.");
    } catch (e) {
      toast.error((e as Error).message ?? "Erreur");
    } finally {
      setForcing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Statut */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {stepMeta ? (
          <span
            style={{
              ...mono,
              fontSize: 10,
              padding: "5px 10px",
              borderRadius: 999,
              background: `${stepMeta.color}1F`,
              border: `1px solid ${stepMeta.color}66`,
              color: dark ? "#FFFFFF" : stepMeta.color,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 6, background: stepMeta.color }} />
            {stepMeta.label}
          </span>
        ) : (
          <span style={{ ...mono, color: c.faint }}>Pas d&apos;onboarding</span>
        )}
        {ob?.tier && (
          <span style={{ ...mono, fontSize: 9.5, color: c.muted }}>
            · {ob.tier === "coaching" ? "Coaching 179€" : "Communauté 79€"}
          </span>
        )}
        {canForce && (
          <motion.button
            {...TAP}
            onClick={handleForceComplete}
            disabled={forcing}
            style={{ ...glassBtn(c, "ghost"), marginLeft: "auto", opacity: forcing ? 0.6 : 1 }}
            title="Débloquer manuellement : Walid a calé le RDV à la main, ou le client est coincé."
          >
            {forcing ? "…" : "Débloquer l'accès"}
          </motion.button>
        )}
      </div>

      {/* Réponses du questionnaire — EN TÊTE (carte orange) pour que Walid
          prépare son RDV d'un coup d'œil. */}
      {ob?.answers && ob.answers.length > 0 && (
        <div
          style={{
            padding: 14,
            background: `${ACCENT}0D`,
            border: `1px solid ${ACCENT}33`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              ...mono,
              color: ACCENT,
              fontSize: 10,
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}
          >
            📋 QUESTIONNAIRE · POUR PRÉPARER LE RDV
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {ob.answers.map((a) => (
              <div key={a.key}>
                <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginBottom: 3 }}>
                  {a.label}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.text, whiteSpace: "pre-wrap" }}>
                  {a.value || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coordonnées */}
      {(fullName || ob?.phone) && (
        <div
          style={{
            padding: 14,
            background: c.chip,
            border: `1px solid ${c.line}`,
            borderRadius: 12,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 12,
          }}
        >
          <Field c={c} label="Nom complet" value={fullName || "—"} />
          <Field c={c} label="Téléphone" value={ob?.phone || "—"} mono />
        </div>
      )}


      {/* Note libre admin */}
      <div>
        <div style={{ ...mono, color: c.muted, fontSize: 9.5, marginBottom: 8 }}>Note libre</div>
        {editingOnb ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={draftOnb}
              onChange={(e) => setDraftOnb(e.target.value)}
              rows={3}
              placeholder="Note libre…"
              style={{ ...fieldInput(c), resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <motion.button {...TAP} onClick={onSave} style={glassBtn(c, "solid")}>
                Enregistrer
              </motion.button>
              <motion.button {...TAP} onClick={onCancel} style={glassBtn(c, "ghost")}>
                Annuler
              </motion.button>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: c.chip,
              border: `1px solid ${c.line}`,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: ob?.notes ? c.text : c.faint,
              minHeight: 60,
              whiteSpace: "pre-wrap",
            }}
          >
            {ob?.notes || "Aucune note."}
          </div>
        )}
      </div>
    </div>
  );
}
