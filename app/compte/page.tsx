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
  glassBtn,
  GlassButton,
  Avatar,
} from "../studio/_components/glass";
import { Kicker, BigTitle, EditorialBlock } from "@/app/_components/editorial";
import { LinkPayment } from "@/app/_components/link-payment";

// ============================================================================
// /compte — vraie page de gestion d'abonnement (état des lieux + actions).
// Branché sur convex/subscriptions.ts. DA Glass C : couleurs via tokens `c.*`
// uniquement (jamais de noir/blanc hardcodé pour le texte — sinon invisible en
// dark mode). Le gate auth est dans layout.tsx (ne pas dupliquer ici).
// useSearchParams impose un <Suspense> en Next 16 → wrapper en bas de fichier.
// ============================================================================

// Lien DIRECT vers le serveur (membre déjà dans le serveur → pas d'écran
// d'invitation redondant). L'invitation discord.gg/… est réservée aux non-membres.
const DISCORD_INVITE = "https://discord.com/channels/1474736345900388453";
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
  const resumeMut = useAction(api.subscriptions.resumeCoachingMonthly);
  const resumeCommunityMut = useAction(api.subscriptions.resumeCommunityMonthly);

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
          {/* Hero éditorial */}
          <div style={{ marginBottom: 8 }}>
            <Kicker>Mon compte</Kicker>
            <BigTitle w1="Mon" w2="Compte" />
          </div>
          {/* Bloc identité + déconnexion (toujours visible) */}
          <EditorialBlock c={c} style={{ marginBottom: 2 }}>
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
          </EditorialBlock>
          <EditorialBlock c={c}>
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
            {/* Repli : tu as payé mais le compte n'est pas lié → coller le code AMR
                (ou renvoi par email). Réutilise le composant partagé LinkPayment. */}
            <div style={{ borderTop: `1px solid ${c.line}`, marginTop: 18, paddingTop: 16 }}>
              <LinkPayment />
            </div>
          </EditorialBlock>
        </div>
      </main>
    );

  const isCoaching = sub.tier === "coaching";
  const periodEnd = sub.currentPeriodEnd ? fmtDateFr(sub.currentPeriodEnd) : null;
  const discordRole = isCoaching ? "Coaching" : "Communauté";

  // Hiérarchie « une seule action orange à la fois » : on détermine l'action
  // mise en avant ; tout le reste (gestion) reste discret (ghost).
  const showRdv = isCoaching && !!sub.needsFirstRdv;
  const showUpsell = !!sub.canTakeCoaching;
  const showResumeCoaching = !!sub.canResumeCoaching;
  const showResumeCommunity = !!sub.canResumeCommunity;
  const hasPrimary = showRdv || showUpsell || showResumeCoaching || showResumeCommunity;

  // Badge de statut (point coloré).
  const canceling = !!sub.cancelAtPeriodEnd;
  const statusActive = sub.status === "active";
  const statusColor = canceling ? "#E8A33D" : statusActive ? c.successFg : c.muted;
  const statusLabel =
    canceling && periodEnd
      ? `Se termine le ${periodEnd}`
      : statusActive
      ? "Actif"
      : sub.status;

  // Carte « offre » : accent léger pour ressortir SANS 2e bouton orange.
  const offerCard = {
    border: `1px solid ${ACCENT}40`,
    background: `${ACCENT}0A`,
    borderRadius: 14,
    padding: "18px 20px",
  } as const;
  const plainCard = {
    border: `1px solid ${c.line}`,
    background: "transparent",
    borderRadius: 14,
    padding: "16px 18px",
  } as const;
  const offerKicker = { ...mono, fontSize: 10, color: ACCENT, letterSpacing: "0.06em" } as const;
  const offerTitle = { ...num, fontSize: 19, fontWeight: 600 as const, color: c.text, margin: "8px 0 6px" };
  const finePrint = { ...mono, fontSize: 9.5, color: c.faint, margin: "8px 0 0", textAlign: "center" as const };

  return (
    <main style={shell}>
      <div style={{ width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Hero éditorial */}
        <div>
          <Kicker>Mon compte</Kicker>
          <BigTitle w1="Mon" w2="Compte" />
        </div>

        {/* Identité + déconnexion */}
        <EditorialBlock c={c}>
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
        </EditorialBlock>

        {/* Carte 1 — Ton plan (état des lieux scannable) */}
        <EditorialBlock c={c}>
          <div style={{ ...mono, fontSize: 10, color: c.muted, letterSpacing: "0.08em" }}>
            TON ABONNEMENT
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ ...num, fontSize: 27, fontWeight: 600, color: c.text }}>
              {isCoaching ? "Coaching" : "Communauté"}
            </span>
            <span style={{ ...num, fontSize: 17, color: c.muted }}>· {sub.amountEur}€/mois</span>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: c.muted }}>
              {statusLabel}
              {!canceling && statusActive && periodEnd ? ` · prochain prélèvement le ${periodEnd}` : ""}
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${c.line}`, marginTop: 16, paddingTop: 14, fontSize: 13.5, color: c.muted }}>
            Accès Discord · {discordRole} ·{" "}
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: "none" }}>
              Ouvrir le serveur ↗
            </a>
          </div>
        </EditorialBlock>

        {/* RDV à réserver (coaching, 1re fois) — action mise en avant */}
        {showRdv ? (
          <div style={offerCard}>
            <div style={offerKicker}>DERNIÈRE ÉTAPE</div>
            <h2 style={offerTitle}>Réserve ton 1er appel avec Walid</h2>
            <p style={{ fontSize: 13.5, color: c.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
              C&apos;est ce qui débloque ton accès complet (exercices + feedback).
            </p>
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-btn"
              style={{ ...glassBtn(c, "solid"), display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Réserver mon 1er RDV →
            </a>
          </div>
        ) : isCoaching && sub.nextRdvAt ? (
          <div style={plainCard}>
            <span style={{ fontSize: 13.5, color: c.muted }}>
              Prochain RDV · {fmtDateTimeFr(sub.nextRdvAt)}
            </span>
          </div>
        ) : null}

        {/* Upsell coaching (le centre commercial) — bénéfices d'abord */}
        {showUpsell && (
          <div style={offerCard}>
            <div style={offerKicker}>PASSE AU NIVEAU SUPÉRIEUR</div>
            <h2 style={{ ...offerTitle, fontSize: 20 }}>Travaille en 1:1 avec Walid</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: "2px 0 14px", display: "flex", flexDirection: "column", gap: 9 }}>
              <li style={{ display: "flex", gap: 10, fontSize: 14, color: c.text, lineHeight: 1.45 }}>
                <span style={{ color: ACCENT, fontWeight: 700 }}>✓</span>
                <span>Des <strong style={{ color: c.text }}>RDV privés</strong> réguliers avec Walid</span>
              </li>
              <li style={{ display: "flex", gap: 10, fontSize: 14, color: c.text, lineHeight: 1.45 }}>
                <span style={{ color: ACCENT, fontWeight: 700 }}>✓</span>
                <span>Tes <strong style={{ color: c.text }}>exercices personnalisés</strong> (les modules s&apos;ouvrent)</span>
              </li>
              <li style={{ display: "flex", gap: 10, fontSize: 14, color: c.text, lineHeight: 1.45 }}>
                <span style={{ color: ACCENT, fontWeight: 700 }}>✓</span>
                <span>Du <strong style={{ color: c.text }}>feedback sur tes sons</strong> et ton positionnement</span>
              </li>
            </ul>
            <div style={{ fontSize: 13.5, color: c.muted, marginBottom: 12, lineHeight: 1.5 }}>
              <strong style={{ color: c.text }}>179€/mois</strong> · 3 mois, prélevé aujourd&apos;hui, puis arrêt automatique.
            </div>
            <GlassButton
              c={c}
              kind="solid"
              onClick={() => run("up", () => upgradeMut({}), "🎉 Coaching débloqué !").then(() => router.refresh())}
              disabled={!!busy}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "up" ? "Activation…" : "Passer au coaching"}
            </GlassButton>
            <p style={finePrint}>Pour changer de carte, passe par « Gérer mon abonnement ».</p>
          </div>
        )}

        {/* Continuer le coaching en mensuel (cycle 3 mois terminé) */}
        {showResumeCoaching && (
          <div style={offerCard}>
            <div style={offerKicker}>CONTINUER LE COACHING</div>
            <h2 style={offerTitle}>Reprends ton accompagnement</h2>
            <p style={{ fontSize: 13.5, color: c.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
              Ton cycle de 3 mois est terminé. Continue en{" "}
              <strong style={{ color: c.text }}>mensuel · 179€/mois</strong>, sans engagement, résiliable quand tu veux.
            </p>
            <GlassButton
              c={c}
              kind="solid"
              disabled={!!busy}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              onClick={async () => {
                setBusy("resume");
                try {
                  const r = await resumeMut({});
                  if ("error" in r) {
                    toast.error(
                      r.error === "payment_failed"
                        ? "Paiement refusé. Mets à jour ta carte via « Gérer mon abonnement », puis réessaie."
                        : "Impossible de reprendre pour l'instant. Réessaie ou contacte le support."
                    );
                    setBusy(null);
                  } else {
                    toast.success("🧡 Coaching réactivé !");
                    setTimeout(() => window.location.reload(), 800);
                  }
                } catch {
                  toast.error("Erreur. Réessaie.");
                  setBusy(null);
                }
              }}
            >
              {busy === "resume" ? "Réactivation…" : "Continuer mon coaching · 179€/mois"}
            </GlassButton>
            <p style={finePrint}>Mensuel récurrent, sans engagement. Résiliable via « Gérer mon abonnement ».</p>
          </div>
        )}

        {/* Rejoindre / reprendre la Communauté 79€ (win-back). Secondaire si le
            coaching est aussi proposé (une seule action orange à la fois). */}
        {showResumeCommunity && (
          <div style={showResumeCoaching ? plainCard : offerCard}>
            <div style={{ ...offerKicker, color: showResumeCoaching ? c.muted : ACCENT }}>
              {showResumeCoaching ? "OU REJOINDRE LA COMMUNAUTÉ" : "REJOINDRE LA COMMUNAUTÉ"}
            </div>
            <h2 style={offerTitle}>Garde ta place dans la communauté</h2>
            <p style={{ fontSize: 13.5, color: c.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
              Discord, ressources et groupe d&apos;artistes pour{" "}
              <strong style={{ color: c.text }}>79€/mois</strong> — sans engagement, résiliable quand tu veux.
            </p>
            <GlassButton
              c={c}
              kind={showResumeCoaching ? "ghost" : "solid"}
              disabled={!!busy}
              style={{ width: "100%", opacity: busy ? 0.6 : 1 }}
              onClick={async () => {
                setBusy("resumeCommu");
                try {
                  const r = await resumeCommunityMut({});
                  if ("error" in r) {
                    toast.error(
                      r.error === "payment_failed"
                        ? "Paiement refusé. Mets à jour ta carte via « Gérer mon abonnement », puis réessaie."
                        : "Impossible de rejoindre pour l'instant. Réessaie ou contacte le support."
                    );
                    setBusy(null);
                  } else {
                    toast.success("🧡 Bienvenue dans la Communauté !");
                    setTimeout(() => window.location.reload(), 800);
                  }
                } catch {
                  toast.error("Erreur. Réessaie.");
                  setBusy(null);
                }
              }}
            >
              {busy === "resumeCommu" ? "Activation…" : "Rejoindre la communauté · 79€/mois"}
            </GlassButton>
            <p style={finePrint}>Mensuel récurrent, sans engagement. Carte enregistrée réutilisée.</p>
          </div>
        )}

        {/* Gestion — discret (ghost) si une offre est mise en avant, sinon principal */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <GlassButton
            c={c}
            kind={hasPrimary ? "ghost" : "solid"}
            onClick={() => goPortal("portal")}
            disabled={!!busy}
            style={{ width: "100%", opacity: busy === "portal" ? 0.6 : 1 }}
          >
            {busy === "portal" ? "Redirection…" : "Gérer mon abonnement ↗"}
          </GlassButton>
          <p style={{ ...mono, fontSize: 9, color: c.faint, textAlign: "center", margin: 0 }}>
            {isCoaching
              ? "Factures et moyen de paiement sur ton espace sécurisé Stripe. Engagement 3 mois : pour toute question, écris-nous."
              : "Factures, moyen de paiement et résiliation sur ton espace sécurisé Stripe."}
          </p>
        </div>

        {/* Pied */}
        <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center", margin: "2px 0 0" }}>
          Besoin d&apos;aide ?{" "}
          <a href="mailto:contact@amourstudios.fr" style={{ color: c.muted }}>
            contact@amourstudios.fr
          </a>
        </p>
      </div>
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
