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
  // Gestion (factures, carte, résiliation) déléguée au Portail Client Stripe.
  // On garde seulement l'upsell custom (passer au coaching) côté /compte.
  const upgradeMut = useAction(api.subscriptions.upgradeMySubscription);
  const startBillingPortal = useAction(api.subscriptions.startBillingPortal);

  const [busy, setBusy] = useState<string | null>(null);

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

  // Ouvre le Portail Client Stripe (factures, carte, résiliation). Un seul point
  // de gestion : tout le reste de la gestion vit côté Stripe.
  const goPortal = async (key: string) => {
    setBusy(key);
    try {
      const res = await startBillingPortal({});
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

          {/* 4 — Passer au Coaching (Communauté uniquement). Offre UNIQUE :
              179€/mois pendant 3 mois puis arrêt automatique. */}
          {sub.canTakeCoaching && (
            <div style={boxStyle}>
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>PASSER AU COACHING</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 14px", lineHeight: 1.5 }}>
                Débloque le coaching 1:1 avec Walid (RDV + exos) :{" "}
                <strong style={{ color: c.text }}>179€/mois pendant 3 mois</strong>, prélevé
                aujourd&apos;hui (le cycle coaching démarre maintenant).
              </p>
              <GlassButton
                c={c}
                kind="solid"
                onClick={() =>
                  run("up", () => upgradeMut({}), "🎉 Coaching débloqué !").then(() =>
                    router.refresh()
                  )
                }
                disabled={!!busy}
                style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              >
                {busy === "up" ? "Activation…" : "Passer au Coaching · 179€/mois (3 mois)"}
              </GlassButton>
              <p style={{ ...mono, fontSize: 10, color: c.muted, margin: "8px 0 0", textAlign: "center" }}>
                Engagement 3 mois, puis arrêt automatique. Pour changer de carte, passe par
                « Gérer mon abonnement ».
              </p>
            </div>
          )}

          {/* 5 — Gestion de l'abonnement = Portail Client Stripe (factures + PDF,
              moyen de paiement, résiliation/renouvellement). Un seul point d'entrée. */}
          <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <GlassButton
              c={c}
              kind="solid"
              onClick={() => goPortal("portal")}
              disabled={!!busy}
              style={{ width: "100%", opacity: busy === "portal" ? 0.6 : 1 }}
            >
              {busy === "portal" ? "Redirection…" : "Gérer mon abonnement ↗"}
            </GlassButton>
            <p style={{ ...mono, fontSize: 9, color: c.faint, textAlign: "center", margin: 0 }}>
              Factures, moyen de paiement et résiliation sur ton espace sécurisé Stripe.
            </p>
          </div>

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
