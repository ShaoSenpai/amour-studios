"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, Loader2, ArrowRight, Mail } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  GlassButton,
  type C,
} from "../studio/_components/glass";

// ============================================================================
// /lier — récupération self-service « compte Discord non lié à un paiement ».
// Le client a payé mais s'est présenté avec un compte Discord non lié (compte
// recréé, mauvais compte à l'OAuth, email différent). Il entre ici l'email de
// son paiement → on lui renvoie son lien d'activation par email (réponse
// TOUJOURS neutre, anti-leak : on ne révèle jamais si l'email a un paiement).
// Page PUBLIQUE (pas d'auth) — c'est un point d'entrée de récupération.
// DA Glass C (tokens c.*), inline styles.
// ============================================================================

export default function LierPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const resend = useAction(api.claimTokens.resendActivationByEmail);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@") || state === "sending") return;
    setState("sending");
    try {
      await resend({ email: trimmed });
      setState("sent");
    } catch {
      // L'action répond toujours { ok: true } ; une erreur ici = réseau/serveur.
      setState("error");
    }
  };

  return (
    <Screen c={c} dark={dark}>
      {state === "sent" ? (
        <>
          <Header c={c} tag="LIEN ENVOYÉ" title="C'est parti." />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: `1px solid ${dark ? "rgba(34,99,64,0.5)" : "rgba(34,99,64,0.25)"}`,
              background: dark ? "rgba(34,99,64,0.18)" : "rgba(34,99,64,0.08)",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <CheckCircle2 style={{ color: c.successFg, flexShrink: 0 }} size={20} />
            <p style={{ fontSize: 14, color: c.successFg, fontWeight: 500 }}>
              Si un paiement est associé à cet email, ton lien part maintenant.
            </p>
          </div>
          <p
            style={{
              fontSize: 14.5,
              color: c.muted,
              lineHeight: 1.55,
              marginBottom: 14,
            }}
          >
            Pense à vérifier tes <strong style={{ color: c.text }}>spams</strong>.
            Quand tu cliques sur le lien, reconnecte-toi avec{" "}
            <strong style={{ color: c.text }}>
              le compte Discord que tu utilises sur le serveur
            </strong>{" "}
            — c&apos;est ce qui relie ton paiement à ton accès.
          </p>
          <SupportLine c={c} />
          <div style={{ marginTop: 18 }}>
            <GlassButton
              c={c}
              kind="ghost"
              onClick={() => {
                setState("idle");
                setEmail("");
              }}
              style={{ alignSelf: "flex-start" }}
            >
              Renvoyer pour un autre email
            </GlassButton>
          </div>
        </>
      ) : (
        <>
          <Header
            c={c}
            tag="RÉCUPÉRATION D'ACCÈS"
            title="Récupère ton accès."
          />
          <p
            style={{
              fontSize: 14.5,
              color: c.muted,
              lineHeight: 1.55,
              marginBottom: 22,
            }}
          >
            Tu as payé mais ton compte Discord n&apos;est relié à aucun paiement ?
            Entre l&apos;email de ton paiement, on te renvoie ton lien
            d&apos;activation.
          </p>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ ...mono, fontSize: 10, color: c.muted }}>
              EMAIL DE TON PAIEMENT
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: c.faint,
                  pointerEvents: "none",
                }}
              />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="ton@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "12px 14px 12px 40px",
                  borderRadius: 12,
                  border: `1px solid ${c.line}`,
                  background: c.chip,
                  color: c.text,
                  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
                  fontSize: 15,
                  outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={(e) => (e.currentTarget.style.borderColor = c.line)}
              />
            </div>

            {state === "error" && (
              <p style={{ fontSize: 13, color: "#E5484D", lineHeight: 1.5 }}>
                Un souci réseau est survenu. Réessaie dans un instant.
              </p>
            )}

            <GlassButton
              c={c}
              kind="solid"
              type="submit"
              disabled={state === "sending"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 4,
                opacity: state === "sending" ? 0.7 : 1,
              }}
            >
              {state === "sending" ? (
                <>
                  <Loader2 className="animate-spin" size={15} />
                  Envoi…
                </>
              ) : (
                <>
                  Recevoir mon lien d&apos;activation
                  <ArrowRight size={14} />
                </>
              )}
            </GlassButton>
          </form>

          <div style={{ marginTop: 20 }}>
            <SupportLine c={c} />
          </div>
        </>
      )}
    </Screen>
  );
}

// ─── UI helpers (Glass C) — calqués sur /claim ────────────────────────────

const shell: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  padding: 24,
  overflow: "hidden",
};

function Screen({
  c,
  dark,
  children,
}: {
  c: C;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <main style={{ ...shell, background: c.bgGrad, color: c.text }}>
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 480, overflow: "hidden" }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: ACCENT,
                color: "#0B0B0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 20,
                borderRadius: 10,
                letterSpacing: "-0.02em",
                flexShrink: 0,
              }}
            >
              A
            </div>
            <div>
              <div style={{ ...mono, fontSize: 11, letterSpacing: "0.06em" }}>AMOUR STUDIOS</div>
              <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>RÉCUPÉRATION D&apos;ACCÈS</div>
            </div>
          </div>
          {children}
        </div>
      </Glass>
    </main>
  );
}

function Header({ c, tag, title }: { c: C; tag: string; title: string }) {
  return (
    <>
      <div style={{ ...mono, color: c.muted }}>{tag}</div>
      <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 18px" }}>
        {title}
      </h1>
    </>
  );
}

function SupportLine({ c }: { c: C }) {
  return (
    <p style={{ fontSize: 13, color: c.muted, lineHeight: 1.55 }}>
      Toujours bloqué ? Écris-nous à{" "}
      <a
        href="mailto:contact@amourstudios.fr?subject=Probl%C3%A8me%20liaison%20compte"
        style={{ color: c.text, textDecoration: "underline" }}
      >
        contact@amourstudios.fr
      </a>
      , on débloque à la main.
    </p>
  );
}
