"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  glassBtn,
  type C,
} from "../studio/_components/glass";

// ============================================================================
// « Lier mon paiement » — pour un membre CONNECTÉ (Discord OAuth) qui a payé
// mais n'a pas d'accès (typiquement : email du paiement ≠ email Discord).
//
// Voie sûre : l'identité = le compte connecté ; la preuve = un CODE court
// (api.claimTokens.linkByCode) → écrit user.purchaseId → accès débloqué (la
// query réactive accessSummary repasse au vert toute seule).
// Voie de secours : « j'ai payé avec une autre adresse » → on envoie un lien
// magique à l'email du paiement (resendActivationByEmail, anti-leak).
// ============================================================================

function inputStyle(c: C): CSSProperties {
  return {
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    padding: "12px 13px",
    color: c.text,
    outline: "none",
    fontFamily: "inherit",
    fontSize: 15,
    width: "100%",
    boxSizing: "border-box",
    colorScheme: c.dark ? "dark" : "light",
  };
}

export function LinkPayment() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"code" | "email">("code");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const linkByCode = useMutation(api.claimTokens.linkByCode);
  const resend = useAction(api.claimTokens.resendActivationByEmail);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    try {
      await linkByCode({ code });
      toast.success("Paiement lié ! Ton accès est débloqué.");
      // accessSummary (useQuery) se met à jour → l'écran se débloque seul.
    } catch (err) {
      toast.error((err as Error).message ?? "Code invalide");
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !email.includes("@")) return;
    setBusy(true);
    try {
      await resend({ email: email.trim() });
      toast.success(
        "Si un paiement existe pour cet email, un lien d'activation vient d'être envoyé. Ouvre-le depuis CE navigateur."
      );
      setEmail("");
    } catch {
      toast.error("Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          ...mono,
          fontSize: 10.5,
          color: c.muted,
          background: "none",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          padding: "4px 0",
          alignSelf: "center",
        }}
      >
        J&apos;ai payé mais pas d&apos;accès ? Lier mon paiement
      </button>
    );
  }

  const tabBtn = (key: "code" | "email", label: string): CSSProperties => ({
    ...mono,
    flex: 1,
    padding: "9px 0",
    fontSize: 10,
    textAlign: "center",
    cursor: "pointer",
    border: "none",
    borderRadius: 8,
    background: tab === key ? ACCENT : "transparent",
    color: tab === key ? "#0B0B0B" : c.muted,
    transition: "background 150ms ease",
  });

  return (
    <div
      style={{
        border: `1px solid ${c.line}`,
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        background: `${ACCENT}08`,
      }}
    >
      <div style={{ ...mono, fontSize: 10, color: ACCENT, letterSpacing: "0.06em" }}>
        ◦ LIER MON PAIEMENT
      </div>

      <div style={{ display: "flex", gap: 4, background: c.chip, padding: 4, borderRadius: 10 }}>
        <button type="button" style={tabBtn("code", "AVEC UN CODE")} onClick={() => setTab("code")}>
          AVEC UN CODE
        </button>
        <button type="button" style={tabBtn("email", "PAR EMAIL")} onClick={() => setTab("email")}>
          PAR EMAIL
        </button>
      </div>

      {tab === "code" ? (
        <form onSubmit={submitCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5, margin: 0 }}>
            Entre le code de liaison (fourni par l&apos;équipe ou dans ton email de confirmation).
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="AMR-XXXXXX"
            autoCapitalize="characters"
            spellCheck={false}
            style={{ ...inputStyle(c), letterSpacing: "0.12em", textTransform: "uppercase" }}
          />
          <button
            type="submit"
            disabled={busy}
            className="glass-btn"
            style={{ ...glassBtn(c, "solid"), opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "Liaison…" : "Lier mon paiement"}
          </button>
        </form>
      ) : (
        <form onSubmit={submitEmail} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 12.5, color: c.muted, lineHeight: 1.5, margin: 0 }}>
            Tu as payé avec une autre adresse ? Entre l&apos;email du paiement, on
            t&apos;envoie un lien d&apos;activation.
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email-du-paiement@exemple.com"
            type="email"
            spellCheck={false}
            style={inputStyle(c)}
          />
          <button
            type="submit"
            disabled={busy}
            className="glass-btn"
            style={{ ...glassBtn(c, "solid"), opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          >
            {busy ? "Envoi…" : "Recevoir le lien"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        style={{ ...mono, fontSize: 9.5, color: c.faint, background: "none", border: "none", cursor: "pointer", alignSelf: "center" }}
      >
        Annuler
      </button>
    </div>
  );
}
