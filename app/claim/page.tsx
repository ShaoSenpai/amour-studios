"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  ArrowRight,
} from "lucide-react";

// Cookie helpers — le claim token doit survivre à l'OAuth Discord round-trip.
type ClaimKind = "session" | "pi" | "token";
const COOKIE_NAME = "amour_claim";
const COOKIE_MAX_AGE = 60 * 60; // 1h

function setClaimCookie(kind: ClaimKind, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    `${kind}:${value}`
  )}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
function getClaimCookie(): { kind: ClaimKind; value: string } | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const [kind, ...rest] = decoded.split(":");
  const value = rest.join(":");
  if ((kind === "session" || kind === "pi" || kind === "token") && value) return { kind, value };
  return null;
}
function clearClaimCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="animate-spin text-foreground/50" />
        </div>
      }
    >
      <ClaimInner />
    </Suspense>
  );
}

function ClaimInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuthActions();

  // Extract claim token from URL (supports ?t=, ?session=, ?pi=) or cookie
  const tokenFromUrl = search.get("t");
  const sessionFromUrl = search.get("session");
  const piFromUrl = search.get("pi") ?? search.get("payment_intent");
  const [claimRef, setClaimRef] = useState<
    { kind: ClaimKind; value: string } | null
  >(null);

  useEffect(() => {
    if (tokenFromUrl) {
      setClaimRef({ kind: "token", value: tokenFromUrl });
      setClaimCookie("token", tokenFromUrl);
    } else if (sessionFromUrl) {
      setClaimRef({ kind: "session", value: sessionFromUrl });
      setClaimCookie("session", sessionFromUrl);
    } else if (piFromUrl) {
      setClaimRef({ kind: "pi", value: piFromUrl });
      setClaimCookie("pi", piFromUrl);
    } else {
      const fromCookie = getClaimCookie();
      if (fromCookie) setClaimRef(fromCookie);
    }
  }, [tokenFromUrl, sessionFromUrl, piFromUrl]);

  const currentUser = useQuery(api.users.current);

  const purchaseFromSession = useQuery(
    api.users.purchaseForSession,
    claimRef?.kind === "session" ? { sessionId: claimRef.value } : "skip"
  );
  const purchaseFromPi = useQuery(
    api.users.purchaseForPaymentIntent,
    claimRef?.kind === "pi" ? { paymentIntentId: claimRef.value } : "skip"
  );
  const purchaseFromToken = useQuery(
    api.claimTokens.purchaseForToken,
    claimRef?.kind === "token" ? { token: claimRef.value } : "skip"
  );
  const tokenExpired =
    claimRef?.kind === "token" &&
    purchaseFromToken &&
    "expired" in purchaseFromToken
      ? true
      : false;
  const purchase =
    claimRef?.kind === "session"
      ? purchaseFromSession
      : claimRef?.kind === "token"
      ? tokenExpired
        ? null
        : (purchaseFromToken as Exclude<typeof purchaseFromToken, { expired: true }>)
      : purchaseFromPi;

  const claimBySession = useMutation(api.users.claimPurchaseBySession);
  const claimByPi = useMutation(api.users.claimPurchaseByPaymentIntent);
  const claimByToken = useMutation(api.claimTokens.claimByToken);

  const [claimState, setClaimState] = useState<
    "idle" | "claiming" | "done" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-claim once the user is authenticated AND the purchase is visible
  useEffect(() => {
    if (
      currentUser &&
      purchase &&
      purchase.status === "paid" &&
      claimRef &&
      claimState === "idle"
    ) {
      if (currentUser.purchaseId) {
        clearClaimCookie();
        setClaimState("done");
        toast.success("Bienvenue ! Tu es déjà VIP");
        setTimeout(() => router.push("/dashboard"), 800);
        return;
      }
      setClaimState("claiming");
      const promise =
        claimRef.kind === "session"
          ? claimBySession({ sessionId: claimRef.value })
          : claimRef.kind === "token"
          ? claimByToken({ token: claimRef.value })
          : claimByPi({ paymentIntentId: claimRef.value });
      promise
        .then(() => {
          clearClaimCookie();
          setClaimState("done");
          toast.success("Accès VIP débloqué 🎉");
          setTimeout(() => router.push("/dashboard"), 1200);
        })
        .catch((err) => {
          setClaimState("error");
          setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue");
        });
    }
  }, [currentUser, purchase, claimRef, claimBySession, claimByPi, claimByToken, claimState, router]);

  // ── Render states ──────────────────────────────────────

  // Pas de session dans l'URL
  if (!claimRef && currentUser !== undefined) {
    return (
      <Screen>
        <Header tag="◦ ACCÈS" title="Session introuvable" italicWord="introuvable" />
        <p className="mb-6 font-mono text-sm text-foreground/70" style={fontBody}>
          Aucune référence de paiement n&apos;a été trouvée dans l&apos;URL.
          Essaie d&apos;ouvrir le lien depuis ton email Stripe, ou contacte{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            className="text-[#FF6B1F] underline"
          >
            contact@amourstudios.fr
          </a>
          .
        </p>
        <Button onClick={() => router.push("/login")}>
          Se connecter manuellement
          <ArrowRight size={14} />
        </Button>
      </Screen>
    );
  }

  // Loading — attend la query Convex
  if (
    currentUser === undefined ||
    (claimRef && purchase === undefined)
  ) {
    return (
      <Screen>
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-[#FF6B1F]" />
          <span
            className="font-mono text-xs uppercase tracking-[2px] text-foreground/60"
            style={fontBody}
          >
            Chargement…
          </span>
        </div>
      </Screen>
    );
  }

  // Webhook pas encore reçu — retry automatique toutes les 2s
  if (claimRef && purchase === null) {
    return (
      <Screen>
        <Header
          tag="◦ PAIEMENT EN COURS DE TRAITEMENT"
          title="Ton paiement arrive."
          italicWord="arrive"
        />
        <p className="mb-6 font-mono text-sm text-foreground/70" style={fontBody}>
          Stripe nous a confirmé ton paiement, on finalise la création de ton
          accès (5-10 secondes max). Reste sur cette page — tu seras redirigé
          automatiquement.
        </p>
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-[#00FF85]" />
          <span
            className="font-mono text-xs uppercase tracking-[2px] text-foreground/60"
            style={fontBody}
          >
            Synchronisation en cours…
          </span>
        </div>
        <AutoRefresher />
        <ClaimingFallback
          onRetry={() => {
            // Force reload la query Convex
            window.location.reload();
          }}
        />
      </Screen>
    );
  }

  // User pas encore authentifié → Yes/No Discord
  if (!currentUser) {
    return <HasDiscordScreen claimRef={claimRef!} signIn={signIn} />;
  }

  // Claim en cours
  if (claimState === "claiming") {
    return (
      <Screen>
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-[#00FF85]" />
          <span
            className="font-mono text-xs uppercase tracking-[2px] text-foreground/60"
            style={fontBody}
          >
            Liaison de ton paiement…
          </span>
        </div>
        <ClaimingFallback
          onRetry={() => {
            setClaimState("idle");
            setErrorMsg(null);
          }}
        />
      </Screen>
    );
  }

  // Succès
  if (claimState === "done") {
    return (
      <Screen>
        <Header
          tag="◦ VIP ACTIF"
          title="Bienvenue dans Amour Studios."
          italicWord="Amour Studios"
        />
        <div className="mb-6 flex items-center gap-3 border border-[rgba(0,255,133,0.3)] bg-[rgba(0,255,133,0.05)] px-5 py-4">
          <CheckCircle2 className="text-[#00FF85]" size={20} />
          <p
            className="font-mono text-sm text-[#00FF85]"
            style={fontBody}
          >
            Ton accès VIP est activé. Rôle Discord attribué.
          </p>
        </div>
        <p
          className="font-mono text-xs text-foreground/50"
          style={fontBody}
        >
          ◦ Redirection automatique vers la formation…
        </p>
      </Screen>
    );
  }

  // Erreur
  if (claimState === "error") {
    return (
      <Screen>
        <Header
          tag="◦ PROBLÈME"
          title="On a un souci."
          italicWord="souci"
        />
        <div className="mb-6 flex items-start gap-3 border border-[rgba(230,51,38,0.3)] bg-[rgba(230,51,38,0.05)] px-5 py-4">
          <AlertCircle className="mt-0.5 text-[#E63326]" size={18} />
          <p
            className="font-mono text-sm text-[#E63326]"
            style={fontBody}
          >
            {errorMsg ?? "Erreur inconnue"}
          </p>
        </div>
        <p
          className="mb-4 font-mono text-xs text-foreground/60"
          style={fontBody}
        >
          Contacte-nous à{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            className="text-[#FF6B1F] underline"
          >
            contact@amourstudios.fr
          </a>{" "}
          avec ta référence de paiement, on débloque à la main en moins de 24h.
        </p>
        <Button onClick={() => router.push("/dashboard")}>
          Aller sur le dashboard
          <ArrowRight size={14} />
        </Button>
      </Screen>
    );
  }

  return null;
}

// ─── Sub-screens ──────────────────────────────────────

function HasDiscordScreen({
  claimRef,
  signIn,
}: {
  claimRef: { kind: ClaimKind; value: string };
  signIn: ReturnType<typeof useAuthActions>["signIn"];
}) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;

  const triggerSignIn = async () => {
    // Keep token dans le cookie — le callback reviendra sur /claim
    setClaimCookie(claimRef.kind, claimRef.value);
    const param = claimRef.kind === "session" ? "session" : "pi";
    try {
      await signIn("discord", {
        redirectTo: `/claim?${param}=${claimRef.value}`,
      });
    } catch {
      toast.error("Impossible de se connecter à Discord. Réessaie.");
    }
  };

  if (choice === null) {
    return (
      <Screen>
        <Header
          tag="◦ PAIEMENT VALIDÉ · ÉTAPE 2/2"
          title="Bienvenue. Tu as un compte Discord ?"
          italicWord="Discord"
        />
        <p
          className="mb-8 font-mono text-sm text-foreground/70"
          style={fontBody}
        >
          L&apos;accès à ta formation + la communauté VIP se fait via Discord.
          Choisis ton cas :
        </p>
        <div className="flex flex-col gap-3">
          <OptionCard
            title="Oui, j'ai déjà Discord"
            subtitle="Je me connecte en 2 clics"
            onClick={() => setChoice("yes")}
            accent="#00FF85"
          />
          <OptionCard
            title="Non, pas encore"
            subtitle="Tu m'accompagnes pour le créer (gratuit, 2 min)"
            onClick={() => setChoice("no")}
            accent="#FF6B1F"
          />
        </div>
      </Screen>
    );
  }

  if (choice === "yes") {
    return (
      <Screen>
        <Header
          tag="◦ ÉTAPE 2/2"
          title="Connecte ton Discord."
          italicWord="Discord"
        />
        <p
          className="mb-6 font-mono text-sm text-foreground/70"
          style={fontBody}
        >
          Un clic et on te lie automatiquement à ton paiement. Aucun email à
          entrer, aucune synchronisation à faire.
        </p>
        <DiscordBtn onClick={triggerSignIn} />
        <button
          onClick={() => setChoice(null)}
          className="mt-4 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 hover:text-foreground"
          style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        >
          ← Retour
        </button>
      </Screen>
    );
  }

  // choice === "no"
  return (
    <Screen>
      <Header
        tag="◦ ÉTAPE 2/2 · SANS DISCORD"
        title="Créons ton Discord en 2 minutes."
        italicWord="2 minutes"
      />
      <ol className="mb-6 flex flex-col gap-3">
        <Step
          n={1}
          title="Crée ton compte Discord (gratuit)"
          action={
            <a
              href="https://discord.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[2px] text-[#5865F2] hover:underline"
              style={fontBody}
            >
              Ouvrir discord.com <ExternalLink size={10} />
            </a>
          }
        />
        {discordInvite && (
          <Step
            n={2}
            title="Rejoins notre serveur VIP"
            action={
              <a
                href={discordInvite}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[2px] text-[#00FF85] hover:underline"
                style={fontBody}
              >
                Rejoindre <ExternalLink size={10} />
              </a>
            }
          />
        )}
        <Step
          n={discordInvite ? 3 : 2}
          title="Reviens ici et clique ci-dessous"
        />
      </ol>
      <DiscordBtn onClick={triggerSignIn} />
      <button
        onClick={() => setChoice(null)}
        className="mt-4 font-mono text-[10px] uppercase tracking-[1.5px] text-foreground/50 hover:text-foreground"
        style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
      >
        ← Retour
      </button>
    </Screen>
  );
}

// ─── UI helpers ───────────────────────────────────────

const fontBody: React.CSSProperties = { fontFamily: "var(--font-body)" };
const fontSerif: React.CSSProperties = { fontFamily: "var(--font-serif)" };

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="ds-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, rgba(0,255,133,0.06) 0%, transparent 70%)",
        }}
      />
      <div className="ds-reveal relative z-10 flex w-full max-w-xl flex-col gap-4">
        {children}
      </div>
    </main>
  );
}

function Header({
  tag,
  title,
  italicWord,
}: {
  tag: string;
  title: string;
  italicWord?: string;
}) {
  const before =
    italicWord && title.includes(italicWord)
      ? title.substring(0, title.lastIndexOf(italicWord))
      : title;
  const after =
    italicWord && title.includes(italicWord)
      ? title.substring(title.lastIndexOf(italicWord) + italicWord.length)
      : "";

  return (
    <>
      <p
        className="font-mono text-[10px] uppercase tracking-[3px] text-foreground/55"
        style={fontBody}
      >
        — {tag}
      </p>
      <h1
        className="mb-2 text-[clamp(36px,5vw,56px)] font-normal leading-[0.95] tracking-[-1.5px]"
        style={fontSerif}
      >
        {before}
        {italicWord && (
          <em className="italic text-[#FF6B1F]">{italicWord}</em>
        )}
        {after}
      </h1>
    </>
  );
}

function Button({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2.5 bg-[#00FF85] px-5 py-3 font-mono text-[11px] uppercase tracking-[2px] text-[#0D0B08] transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:pr-7"
      style={{ minHeight: 0, ...fontBody }}
    >
      {children}
    </button>
  );
}

function DiscordBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-center gap-3 bg-[#5865F2] px-6 py-4 font-mono text-[11px] uppercase tracking-[2px] text-white transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:tracking-[3px] hover:bg-[#4752C4]"
      style={{ minHeight: 0, ...fontBody }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
      Continuer avec Discord
      <span
        className="text-xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
        style={fontSerif}
      >
        →
      </span>
    </button>
  );
}

function OptionCard({
  title,
  subtitle,
  onClick,
  accent,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-between gap-4 border border-foreground/15 bg-foreground/[0.04] px-6 py-5 text-left transition-all duration-700 [transition-timing-function:var(--ease-reveal)] hover:bg-foreground/[0.08]"
      style={{ minHeight: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      <div>
        <div
          className="text-xl italic"
          style={fontSerif}
        >
          {title}
        </div>
        <div
          className="mt-1 font-mono text-[11px] text-foreground/60"
          style={fontBody}
        >
          {subtitle}
        </div>
      </div>
      <span
        className="text-2xl italic transition-transform duration-700 [transition-timing-function:var(--ease-reveal)] group-hover:translate-x-1"
        style={{ color: accent, ...fontSerif }}
      >
        →
      </span>
    </button>
  );
}

function Step({
  n,
  title,
  action,
}: {
  n: number;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 border-l-2 border-foreground/15 bg-foreground/[0.03] px-4 py-3">
      <span
        className="flex size-7 shrink-0 items-center justify-center bg-foreground text-sm italic text-background"
        style={fontSerif}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm" style={fontBody}>
          {title}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </li>
  );
}

// Polls the query every 2s by forcing re-renders. Convex query is reactive
// anyway but purchases may insert slightly after auth; this is a safety belt.
function AutoRefresher({ onStuck }: { onStuck?: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    const stuckId = onStuck ? setTimeout(() => onStuck(), 12000) : null;
    return () => {
      clearInterval(id);
      if (stuckId) clearTimeout(stuckId);
    };
  }, [onStuck]);
  return null;
}

function ClaimingFallback({ onRetry }: { onRetry: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(id);
  }, []);
  if (!visible) return null;
  return (
    <div className="mt-8 border-t border-foreground/15 pt-6">
      <p
        className="mb-4 font-mono text-xs uppercase tracking-[1.5px] text-foreground/55"
        style={{ fontFamily: "var(--font-body)" }}
      >
        — Ça prend plus longtemps que d&apos;habitude
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/25 bg-foreground/[0.04] px-5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-foreground/80 transition-all hover:border-foreground/50 hover:bg-foreground/[0.08] hover:text-foreground"
          style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        >
          Réessayer
        </button>
        <a
          href="mailto:contact@amourstudios.fr?subject=Probl%C3%A8me%20claim%20paiement"
          className="inline-flex h-10 items-center gap-2 rounded-full px-5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-[#FF6B1F] transition-opacity hover:opacity-80"
          style={{ fontFamily: "var(--font-body)", minHeight: 0 }}
        >
          Contacter le support
        </a>
      </div>
    </div>
  );
}
