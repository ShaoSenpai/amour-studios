"use client";

import { useQuery, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
  GlassButton,
  Avatar,
} from "../studio/_components/glass";

// ============================================================================
// /compte — vraie page de gestion d'abonnement (état des lieux + actions).
// Branché sur convex/subscriptions.ts. DA Glass C : couleurs via tokens `c.*`
// uniquement (jamais de noir/blanc hardcodé pour le texte — sinon invisible en
// dark mode). Le gate auth est dans layout.tsx (ne pas dupliquer ici).
// useSearchParams impose un <Suspense> en Next 16 → wrapper en bas de fichier.
// ============================================================================

const DISCORD_INVITE = "https://discord.gg/78v8PSgjxx";
// Lien Calendly du 1er RDV — MÊME source que le flow onboarding
// (app/onboarding/[token]/page.tsx). NEXT_PUBLIC_* est inliné au build Vercel,
// donc dispo côté client et garanti cohérent avec l'onboarding.
const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ?? "https://calendly.com/amourstudios/onboarding";

/** Date FR longue : « 12 juin 2026 ». */
function fmtDateFr(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ts);
}

/** Date + heure FR : « lun. 12 juin · 14:30 ». */
function fmtDateTimeFr(ts: number): string {
  const d = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(ts);
  const t = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
  return `${d} · ${t}`;
}

function CompteInner() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const router = useRouter();
  const params = useSearchParams();
  const { signOut } = useAuthActions();

  const sub = useQuery(api.subscriptions.mySubscription);
  const cancelMut = useAction(api.subscriptions.cancelMySubscription);
  const reactivateMut = useAction(api.subscriptions.reactivateMySubscription);
  const upgradeMut = useAction(api.subscriptions.upgradeMySubscription);
  const startCardUpdate = useAction(api.subscriptions.startCardUpdate);
  const myInvoices = useAction(api.subscriptions.myInvoices);
  const startBillingPortal = useAction(api.subscriptions.startBillingPortal);

  const [busy, setBusy] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Array<{
    id: string;
    amountCents: number;
    currency: string;
    created: number;
    status: string | null;
    pdfUrl: string | null;
    hostedUrl: string | null;
  }>>([]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  // Redirige vers Stripe Checkout (mode setup) pour ajouter/changer la carte.
  // On garde `busy` posé jusqu'à la redirection (le bouton reste désactivé).
  const goCardUpdate = async (key: string) => {
    setBusy(key);
    try {
      const res = await startCardUpdate({});
      window.location.href = res.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      setBusy(null);
    }
  };

  // Retour de Stripe (?card=updated) → toast une seule fois (anti-rejeu).
  const cardToastShown = useRef(false);
  useEffect(() => {
    if (params.get("card") === "updated" && !cardToastShown.current) {
      cardToastShown.current = true;
      toast.success("Carte enregistrée ✓");
    }
  }, [params]);

  // Charge les factures si l'utilisateur a un abonnement actif.
  useEffect(() => {
    if (sub && "hasSubscription" in sub && sub.hasSubscription) {
      myInvoices({}).then(setInvoices).catch(() => {});
    }
  }, [sub, myInvoices]);

  const shell = {
    background: c.bgGrad,
    color: c.text,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    padding: 24,
  } as const;

  if (sub === undefined)
    return (
      <main style={shell}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );

  if (!sub.authed || !("hasSubscription" in sub) || !sub.hasSubscription)
    return (
      <main style={shell}>
        <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Bloc identité + déconnexion (toujours visible) */}
          <Glass c={c} dark={dark} style={{ marginBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar
                name={sub?.discordUsername || sub?.name || sub?.email || "?"}
                size={40}
                dark={dark}
                image={("image" in sub && sub.image) ? sub.image : undefined}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {("discordUsername" in sub && sub.discordUsername) || ("name" in sub && sub.name) || "Mon compte"}
                </div>
                <div style={{ ...mono, fontSize: 11, color: c.muted }}>
                  {("email" in sub && sub.email) ?? "—"}
                </div>
              </div>
              <GlassButton c={c} kind="ghost" onClick={() => void signOut().then(() => router.replace("/login?returnTo=%2Fcompte"))}>
                Se déconnecter
              </GlassButton>
            </div>
          </Glass>
          <Glass c={c} dark={dark} strong pad={0}>
            <div style={{ padding: "40px 38px" }}>
              <div style={{ ...mono, color: c.muted }}>Mon compte</div>
              <h1 style={{ ...num, fontSize: 30, fontWeight: 500, margin: "10px 0 0" }}>
                Aucun abonnement actif.
              </h1>
              <p style={{ fontSize: 14, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
                Tu n&apos;as pas d&apos;abonnement en cours.{" "}
                <a href="https://amourstudios.fr" style={{ color: ACCENT, textDecoration: "none" }}>
                  Découvrir les offres ↗
                </a>
              </p>
            </div>
          </Glass>
        </div>
      </main>
    );

  const isCoaching = sub.tier === "coaching";
  const periodEnd = sub.currentPeriodEnd ? fmtDateFr(sub.currentPeriodEnd) : null;
  const discordRole = isCoaching ? "Coaching" : "Communauté";

  // Encadré réutilisable (border + chip) pour les blocs RDV / upgrade.
  const boxStyle = {
    border: `1px solid ${c.line}`,
    background: c.chip,
    borderRadius: 12,
    padding: "16px 18px",
  } as const;

  const subLinkStyle = {
    ...mono,
    fontSize: 10,
    color: c.muted,
    background: "none",
    border: "none",
    cursor: busy ? "default" : "pointer",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    opacity: busy ? 0.6 : 1,
  } as const;

  return (
    <main style={shell}>
      {/* Bloc identité + déconnexion (toujours en haut) */}
      <Glass c={c} dark={dark} style={{ width: "100%", maxWidth: 480, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar
            name={sub.discordUsername || sub.name || sub.email || "?"}
            size={40}
            dark={dark}
            image={sub.image ?? undefined}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sub.discordUsername || sub.name || "Mon compte"}
            </div>
            <div style={{ ...mono, fontSize: 11, color: c.muted }}>{sub.email ?? "—"}</div>
          </div>
          <GlassButton c={c} kind="ghost" onClick={() => void signOut().then(() => router.replace("/login?returnTo=%2Fcompte"))}>
            Se déconnecter
          </GlassButton>
        </div>
      </Glass>

      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* 1 — En-tête état des lieux */}
          <div>
            <div style={{ ...mono, color: c.muted }}>Mon abonnement</div>
            <h1 style={{ ...num, fontSize: 32, fontWeight: 500, margin: "10px 0 0" }}>
              {isCoaching ? "Coaching" : "Communauté"} · {sub.amountEur}€/mois
            </h1>
            <p style={{ fontSize: 13.5, color: c.muted, marginTop: 10 }}>
              Statut : {sub.status}
              {sub.cancelAtPeriodEnd && periodEnd
                ? ` · se termine le ${periodEnd}`
                : periodEnd
                ? ` · prochain prélèvement le ${periodEnd}`
                : ""}
            </p>
          </div>

          {/* 2 — Accès Discord (toujours) */}
          <p style={{ fontSize: 13, color: c.muted, margin: 0 }}>
            Accès Discord : {discordRole} ·{" "}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: ACCENT, textDecoration: "none" }}
            >
              Ouvrir le serveur ↗
            </a>
          </p>

          {/* 3 — Bloc RDV (coaching uniquement) */}
          {isCoaching && sub.needsFirstRdv ? (
            <div style={boxStyle}>
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>Active ton coaching</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 12px", lineHeight: 1.5 }}>
                Dernière étape pour démarrer : réserve ton 1er appel avec Walid. C&apos;est
                ce qui débloque ton accès complet.
              </p>
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-btn"
                style={{
                  ...glassBtn(c, "solid"),
                  display: "block",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Réserve ton 1er RDV →
              </a>
            </div>
          ) : isCoaching && sub.nextRdvAt ? (
            <p style={{ fontSize: 13, color: c.muted, margin: 0 }}>
              Prochain RDV : {fmtDateTimeFr(sub.nextRdvAt)}
            </p>
          ) : null}

          {/* 4a — Bloc upgrade Communauté → Coaching (2 offres : 1 mois / 3 mois) */}
          {sub.canTakeCoaching && (
            <div style={boxStyle}>
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>PASSER AU COACHING</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 14px", lineHeight: 1.5 }}>
                Débloque le coaching 1:1 avec Walid (RDV + exos),{" "}
                <strong style={{ color: c.text }}>prélevés aujourd&apos;hui</strong> (cycle
                coaching démarre maintenant).
              </p>
              {/* Coaching 1 mois */}
              <GlassButton
                c={c}
                kind="solid"
                onClick={() =>
                  run("up1", () => upgradeMut({ plan: "coaching_1m" }), "🎉 Coaching débloqué !").then(() =>
                    router.refresh()
                  )
                }
                disabled={!!busy}
                style={{ width: "100%", opacity: busy ? 0.6 : 1, marginBottom: 8 }}
              >
                {busy === "up1" ? "Activation…" : "Coaching 1 mois · 179€"}
              </GlassButton>
              <p style={{ ...mono, fontSize: 10, color: c.muted, margin: "0 0 14px", textAlign: "center" }}>
                Un seul prélèvement, sans engagement.
              </p>
              {/* Coaching 3 mois */}
              <GlassButton
                c={c}
                kind="solid"
                onClick={() =>
                  run("up3", () => upgradeMut({ plan: "coaching_3m" }), "🎉 Coaching débloqué !").then(() =>
                    router.refresh()
                  )
                }
                disabled={!!busy}
                style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              >
                {busy === "up3" ? "Activation…" : "Coaching 3 mois · 179€/mois"}
              </GlassButton>
              <p style={{ ...mono, fontSize: 10, color: c.muted, margin: "8px 0 4px", textAlign: "center" }}>
                Abonnement récurrent, annulable à tout moment.
              </p>
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <button
                  onClick={() => goCardUpdate("up-card")}
                  disabled={!!busy}
                  style={subLinkStyle}
                >
                  {busy === "up-card" ? "Redirection…" : "Payer avec une autre carte"}
                </button>
              </div>
            </div>
          )}

          {/* 4b — Continuer le coaching (coaching en annulation programmée) */}
          {sub.canContinueCoaching && (
            <div style={boxStyle}>
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>TON COACHING S&apos;ARRÊTE BIENTÔT</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 12px", lineHeight: 1.5 }}>
                Ton coaching est programmé pour se terminer en fin de période. Clique ci-dessous
                pour annuler la résiliation et continuer.
              </p>
              <GlassButton
                c={c}
                kind="solid"
                onClick={() => run("cont", () => reactivateMut({}), "Coaching prolongé.")}
                disabled={!!busy}
                style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              >
                {busy === "cont" ? "…" : "Continuer mon coaching"}
              </GlassButton>
            </div>
          )}

          {/* 5 — Actions abonnement */}
          {sub.cancelAtPeriodEnd ? (
            <GlassButton
              c={c}
              kind="solid"
              onClick={() => run("re", () => reactivateMut({}), "Abonnement réactivé.")}
              disabled={!!busy}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "re" ? "…" : "Réactiver mon abonnement"}
            </GlassButton>
          ) : (
            <GlassButton
              c={c}
              kind="ghost"
              onClick={() => {
                if (confirm("Résilier ton abonnement à la fin de la période en cours ?"))
                  run("ca", () => cancelMut({}), "Résiliation programmée à la fin de la période.");
              }}
              disabled={!!busy}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "ca" ? "…" : "Résilier mon abonnement"}
            </GlassButton>
          )}

          <div style={{ textAlign: "center", display: "flex", gap: 16, justifyContent: "center" }}>
            <button onClick={() => goCardUpdate("card")} disabled={!!busy} style={subLinkStyle}>
              {busy === "card" ? "Redirection…" : "Gérer ma carte"}
            </button>
          </div>

          {/* 6 — Historique factures */}
          <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 18 }}>
            <div style={{ ...mono, fontSize: 10, color: c.muted, marginBottom: 10 }}>◦ Factures</div>
            {invoices.length === 0 ? (
              <p style={{ fontSize: 13, color: c.muted, margin: 0 }}>
                Aucune facture pour le moment.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: c.muted, flex: 1, minWidth: 0 }}>
                      {new Date(inv.created).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span style={{ ...mono, fontSize: 12, color: c.text, whiteSpace: "nowrap" }}>
                      {(inv.amountCents / 100).toFixed(2).replace(".", ",")} €
                    </span>
                    {inv.status && (
                      <span style={{ ...mono, fontSize: 10, color: c.muted, whiteSpace: "nowrap" }}>
                        {inv.status}
                      </span>
                    )}
                    {(inv.pdfUrl ?? inv.hostedUrl) && (
                      <a
                        href={(inv.pdfUrl ?? inv.hostedUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...mono,
                          fontSize: 10,
                          color: ACCENT,
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Reçu PDF ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6b — Portail de facturation Stripe */}
          <GlassButton
            c={c}
            kind="ghost"
            onClick={() =>
              startBillingPortal({})
                .then((r) => { window.location.href = r.url; })
                .catch((e) => toast.error((e as Error).message))
            }
            style={{ width: "100%" }}
          >
            Gérer ma facturation ↗
          </GlassButton>

          {/* 7 — Pied */}
          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center", margin: 0 }}>
            Besoin d&apos;aide ?{" "}
            <a href="mailto:contact@amourstudios.fr" style={{ color: c.muted }}>
              contact@amourstudios.fr
            </a>
          </p>
        </div>
      </Glass>
    </main>
  );
}

export default function ComptePage() {
  // Loader neutre pendant la résolution de useSearchParams (Suspense Next 16).
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Loader2 className="animate-spin" />
        </main>
      }
    >
      <CompteInner />
    </Suspense>
  );
}
