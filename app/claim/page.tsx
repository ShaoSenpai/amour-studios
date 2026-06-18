"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
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
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
  GlassButton,
  type C,
} from "../studio/_components/glass";

// Cookie helpers — le claim token doit survivre à l'OAuth Discord round-trip.
type ClaimKind = "session" | "pi" | "token";
const COOKIE_NAME = "amour_claim";
const COOKIE_MAX_AGE = 60 * 60; // 1h

function setClaimCookie(kind: ClaimKind, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    `${kind}:${value}`
  )}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax; Secure`;
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
  const { signIn, signOut } = useAuthActions();

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

  // Claim EXPLICITE — déclenché par le bouton « Lier ce compte » de l'écran de
  // confirmation. ⚠️ PLUS d'auto-claim silencieux : avant, dès qu'un user était
  // connecté dans l'app, on liait le paiement à CE compte sans rien demander →
  // catastrophe quand la session app ≠ le compte Discord voulu (plusieurs comptes,
  // session admin persistante…). On affiche d'abord le compte cible + « changer ».
  const doClaim = () => {
    if (!claimRef || claimState !== "idle") return;
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
        toast.success("Compte activé 🎉 Dernière étape : rejoins le serveur Discord");
      })
      .catch((err) => {
        setClaimState("error");
        setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue");
      });
  };

  // Si le compte connecté a DÉJÀ ce paiement lié → écran "done" direct.
  useEffect(() => {
    if (
      currentUser &&
      currentUser.purchaseId &&
      purchase &&
      (purchase.status === "paid" ||
        purchase.status === "active" ||
        purchase.status === "incomplete") &&
      claimRef &&
      claimState === "idle"
    ) {
      clearClaimCookie();
      setClaimState("done");
      toast.success("Bienvenue ! Dernière étape : rejoins le serveur Discord");
    }
  }, [currentUser, purchase, claimRef, claimState]);

  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  // ── Render states ──────────────────────────────────────

  // Pas de session dans l'URL
  if (!claimRef && currentUser !== undefined) {
    return (
      <Screen c={c} dark={dark}>
        <Header c={c} tag="ACCÈS" title="Session introuvable" />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Aucune référence de paiement n&apos;a été trouvée dans l&apos;URL.
          Essaie d&apos;ouvrir le lien depuis ton email Stripe, ou contacte{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            style={{ color: c.text, textDecoration: "underline" }}
          >
            contact@amourstudios.fr
          </a>
          .
        </p>
        <Button c={c} onClick={() => router.push("/login")}>
          Se connecter manuellement
          <ArrowRight size={14} />
        </Button>
      </Screen>
    );
  }

  // Token expiré — message dédié (pas la même UX que "en cours de traitement")
  if (claimRef?.kind === "token" && tokenExpired) {
    return (
      <Screen c={c} dark={dark}>
        <Header c={c} tag="LIEN EXPIRÉ" title="Ce lien a expiré." />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Les liens d&apos;activation sont valables{" "}
          <strong style={{ color: c.text }}>7 jours</strong>.
          Celui-ci n&apos;est plus valide. Contacte-nous pour débloquer ton accès manuellement.
        </p>
        <Button c={c} onClick={() => (window.location.href = "mailto:contact@amourstudios.fr?subject=Lien%20claim%20expir%C3%A9")}>
          Contacter le support
          <ArrowRight size={14} />
        </Button>
      </Screen>
    );
  }

  // Token invalide (pas expiré mais introuvable) — erreur explicite, pas de spinner fantôme
  if (
    claimRef?.kind === "token" &&
    purchaseFromToken === null
  ) {
    return (
      <Screen c={c} dark={dark}>
        <Header c={c} tag="LIEN INVALIDE" title="Lien d'activation non reconnu." />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Ce lien n&apos;existe pas ou a déjà été utilisé. Si tu viens de payer,
          vérifie ton email — le bon lien t&apos;a été envoyé.
        </p>
        <Button c={c} onClick={() => (window.location.href = "mailto:contact@amourstudios.fr")}>
          Contacter le support
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
      <Screen c={c} dark={dark}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Loader2 className="animate-spin" style={{ color: c.text }} />
          <span style={{ ...mono, fontSize: 11, color: c.muted }}>
            Chargement…
          </span>
        </div>
      </Screen>
    );
  }

  // Webhook pas encore reçu — retry automatique toutes les 2s
  if (claimRef && purchase === null) {
    return (
      <Screen c={c} dark={dark}>
        <Header
          c={c}
          tag="PAIEMENT EN COURS DE TRAITEMENT"
          title="Ton paiement arrive."
        />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Stripe nous a confirmé ton paiement, on finalise la création de ton
          accès (5-10 secondes max). Reste sur cette page — tu seras redirigé
          automatiquement.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Loader2 className="animate-spin" style={{ color: ACCENT }} />
          <span style={{ ...mono, fontSize: 11, color: c.muted }}>
            Synchronisation en cours…
          </span>
        </div>
        <AutoRefresher />
        <ClaimingFallback
          c={c}
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

  // User connecté, paiement prêt, PAS encore lié → CONFIRME le compte cible avant
  // de lier (anti mauvais-compte : montre à QUI on va lier + « changer de compte »).
  if (currentUser && purchase && !currentUser.purchaseId && claimState === "idle") {
    return (
      <ConfirmAccountScreen
        c={c}
        dark={dark}
        user={currentUser}
        onConfirm={doClaim}
        onSwitch={async () => {
          // On garde le cookie claim (1h) pour reprendre après re-login avec le
          // bon compte. signOut → currentUser devient null → écran « connexion ».
          try {
            await signOut();
          } catch {
            toast.error("Impossible de se déconnecter. Réessaie.");
          }
        }}
      />
    );
  }

  // Claim en cours
  if (claimState === "claiming") {
    return (
      <Screen c={c} dark={dark}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Loader2 className="animate-spin" style={{ color: ACCENT }} />
          <span style={{ ...mono, fontSize: 11, color: c.muted }}>
            Liaison de ton paiement…
          </span>
        </div>
        <ClaimingFallback
          c={c}
          onRetry={() => {
            setClaimState("idle");
            setErrorMsg(null);
          }}
        />
      </Screen>
    );
  }

  // Succès → guidage vers le serveur Discord (étape obligatoire d'activation).
  if (claimState === "done") {
    // Écran « done » : la liaison est faite et (en invitation-first) il a déjà
    // rejoint le serveur → lien DIRECT (pas d'invitation redondante).
    const discordInvite = "https://discord.com/channels/1474736345900388453";
    return (
      <Screen c={c} dark={dark}>
        <Header
          c={c}
          tag="PAIEMENT LIÉ · DERNIÈRE ÉTAPE"
          title="Dernière étape : rejoins le serveur"
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: `1px solid ${c.dark ? "rgba(34,99,64,0.5)" : "rgba(34,99,64,0.25)"}`,
            background: c.dark ? "rgba(34,99,64,0.18)" : "rgba(34,99,64,0.08)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
          }}
        >
          <CheckCircle2 style={{ color: c.successFg, flexShrink: 0 }} size={20} />
          <p style={{ fontSize: 14, color: c.successFg, fontWeight: 500 }}>
            Ton paiement est lié à ton compte.
          </p>
        </div>
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Rejoins maintenant le serveur Discord, puis{" "}
          <strong style={{ color: c.text }}>présente-toi dans #présente-toi</strong>{" "}
          pour activer ton accès. C&apos;est ce qui débloque tes channels et ton
          espace.
        </p>
        <a
          href={discordInvite}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "12px 16px",
            background: DISCORD,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
            fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
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
          Rejoindre le serveur Discord
        </a>
        <button
          onClick={() => router.push("/onboarding/welcome")}
          style={{
            ...mono,
            fontSize: 10,
            color: c.faint,
            background: "none",
            border: "none",
            cursor: "pointer",
            marginTop: 16,
            padding: 0,
            alignSelf: "center",
          }}
        >
          J&apos;ai déjà rejoint → continuer
        </button>
      </Screen>
    );
  }

  // Erreur
  if (claimState === "error") {
    return (
      <Screen c={c} dark={dark}>
        <Header c={c} tag="PROBLÈME" title="On a un souci." />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            border: "1px solid rgba(229,72,77,0.30)",
            background: "rgba(229,72,77,0.08)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 22,
          }}
        >
          <AlertCircle style={{ color: "#E5484D", flexShrink: 0, marginTop: 2 }} size={18} />
          <p style={{ fontSize: 14, color: "#E5484D" }}>
            {errorMsg ?? "Erreur inconnue"}
          </p>
        </div>
        <p style={{ fontSize: 13.5, color: c.muted, lineHeight: 1.55, marginBottom: 18 }}>
          Contacte-nous à{" "}
          <a
            href="mailto:contact@amourstudios.fr"
            style={{ color: c.text, textDecoration: "underline" }}
          >
            contact@amourstudios.fr
          </a>{" "}
          avec ta référence de paiement, on débloque à la main en moins de 24h.
        </p>
        <Button c={c} onClick={() => router.push("/onboarding/welcome")}>
          Aller sur le dashboard
          <ArrowRight size={14} />
        </Button>
      </Screen>
    );
  }

  // Filet anti-page-blanche : aucun état imprévu ne doit jamais rendre du vide.
  return (
    <Screen c={c} dark={dark}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Loader2 className="animate-spin" style={{ color: ACCENT }} />
        <span style={{ ...mono, fontSize: 11, color: c.muted }}>
          Finalisation de ton accès…
        </span>
      </div>
    </Screen>
  );
}

// ─── Sub-screens ──────────────────────────────────────

// Confirme à QUEL compte Discord on va lier le paiement (anti mauvais-compte :
// la session app peut être un autre compte que celui voulu). Bouton « changer ».
function ConfirmAccountScreen({
  c,
  dark,
  user,
  onConfirm,
  onSwitch,
}: {
  c: C;
  dark: boolean;
  user: {
    discordUsername?: string | null;
    name?: string | null;
    image?: string | null;
  };
  onConfirm: () => void;
  onSwitch: () => void;
}) {
  const name = user.discordUsername || user.name || "ton compte Discord";
  return (
    <Screen c={c} dark={dark}>
      <Header c={c} tag="DERNIÈRE VÉRIF · COMPTE" title="C'est bien ce compte ?" />
      <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 18 }}>
        Ton paiement va être lié au compte Discord ci-dessous. Vérifie que c&apos;est
        bien celui que tu utilises pour la communauté :
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          borderRadius: 14,
          background: c.chip,
          border: `1px solid ${c.line}`,
          marginBottom: 22,
        }}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={44}
            height={44}
            style={{ borderRadius: "50%", flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.line, flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              ...num,
              fontSize: 17,
              fontWeight: 600,
              color: c.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
          <div style={{ ...mono, fontSize: 10, color: c.faint }}>
            Compte Discord connecté
          </div>
        </div>
      </div>
      <Button c={c} onClick={onConfirm}>
        Oui, lier ce compte
        <ArrowRight size={14} />
      </Button>
      <button
        onClick={onSwitch}
        style={{
          ...mono,
          fontSize: 11,
          color: c.muted,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginTop: 16,
          padding: 0,
          alignSelf: "flex-start",
          textDecoration: "underline",
        }}
      >
        Ce n&apos;est pas le bon compte ? Changer de compte
      </button>
    </Screen>
  );
}

function HasDiscordScreen({
  claimRef,
  signIn,
}: {
  claimRef: { kind: ClaimKind; value: string };
  signIn: ReturnType<typeof useAuthActions>["signIn"];
}) {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const discordInvite =
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "https://discord.gg/x9humyUMnJ";
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const triggerSignIn = async () => {
    // Keep la référence dans le cookie — le callback reviendra sur /claim et,
    // si l'URL perd le paramètre, on rechargera depuis ce cookie.
    setClaimCookie(claimRef.kind, claimRef.value);
    // ⚠️ Map chaque kind vers SON paramètre d'URL. Avant, un claim par `token`
    // repartait en `?pi=<valeur-du-token>` : au retour OAuth la page lisait ce
    // token comme un paymentIntentId → purchase introuvable → claim cassé sur
    // le chemin « OAuth d'abord ». On garde donc le bon param (t/session/pi).
    const param =
      claimRef.kind === "token"
        ? "t"
        : claimRef.kind === "session"
        ? "session"
        : "pi";
    try {
      await signIn("discord", {
        redirectTo: `/claim?${param}=${encodeURIComponent(claimRef.value)}`,
      });
    } catch {
      toast.error("Impossible de se connecter à Discord. Réessaie.");
    }
  };

  if (choice === null) {
    return (
      <Screen c={c} dark={dark}>
        <Header
          c={c}
          tag="PAIEMENT VALIDÉ · ÉTAPE 2/2"
          title="Bienvenue. Tu as un compte Discord ?"
        />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 26 }}>
          L&apos;accès à ton espace + la communauté se fait via Discord.
          Choisis ton cas :
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <OptionCard
            c={c}
            title="Oui, j'ai déjà Discord"
            subtitle="Je me connecte en 2 clics"
            onClick={() => setChoice("yes")}
          />
          <OptionCard
            c={c}
            title="Non, pas encore"
            subtitle="Tu m'accompagnes pour le créer (gratuit, 2 min)"
            onClick={() => setChoice("no")}
          />
        </div>
      </Screen>
    );
  }

  if (choice === "yes") {
    return (
      <Screen c={c} dark={dark}>
        <Header c={c} tag="ÉTAPE 2/2" title="Connecte ton Discord." />
        <p style={{ fontSize: 14.5, color: c.muted, lineHeight: 1.55, marginBottom: 22 }}>
          Un clic et on te lie automatiquement à ton paiement. Aucun email à
          entrer, aucune synchronisation à faire.
        </p>
        <DiscordBtn onClick={triggerSignIn} />
        <button
          onClick={() => setChoice(null)}
          style={{
            ...mono,
            fontSize: 10,
            color: c.faint,
            background: "none",
            border: "none",
            cursor: "pointer",
            marginTop: 16,
            padding: 0,
            alignSelf: "flex-start",
          }}
        >
          ← Retour
        </button>
      </Screen>
    );
  }

  // choice === "no"
  return (
    <Screen c={c} dark={dark}>
      <Header
        c={c}
        tag="SANS COMPTE DISCORD"
        title="Rejoins le serveur en 1 clic."
      />
      <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.55, margin: "0 0 18px" }}>
        Pas encore de compte Discord ? Ce bouton le <strong style={{ color: c.text }}>crée</strong> et te fait
        {" "}<strong style={{ color: c.text }}>rejoindre le serveur</strong> directement — pas besoin de passer par discord.com.
      </p>
      {/* Étape 1 — primaire : rejoindre le serveur (crée le compte + join). */}
      <a
        href={discordInvite}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          boxSizing: "border-box",
          padding: "15px 20px",
          borderRadius: 12,
          background: ACCENT,
          color: "#fff",
          fontWeight: 600,
          fontSize: 15,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        Rejoindre le serveur AMOUR STUDIOS <ExternalLink size={15} />
      </a>
      <ol style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22, listStyle: "none", padding: 0 }}>
        <Step
          c={c}
          n={1}
          title="Clique le bouton ci-dessus → ton compte se crée (si besoin) et tu rejoins le serveur. Ton salon privé s'ouvre tout seul."
        />
        <Step
          c={c}
          n={2}
          title="Reviens sur cette page et clique « Continuer avec Discord » pour lier ton paiement."
        />
      </ol>
      <DiscordBtn onClick={triggerSignIn} />
      <button
        onClick={() => setChoice(null)}
        style={{
          ...mono,
          fontSize: 10,
          color: c.faint,
          background: "none",
          border: "none",
          cursor: "pointer",
          marginTop: 16,
          padding: 0,
          alignSelf: "flex-start",
        }}
      >
        ← Retour
      </button>
    </Screen>
  );
}

// ─── UI helpers (Glass C) ─────────────────────────────

const DISCORD = "#5865F2";

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
              <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>ACTIVATION DE TON ACCÈS</div>
            </div>
          </div>
          {children}
        </div>
      </Glass>
    </main>
  );
}

function Header({
  c,
  tag,
  title,
}: {
  c: C;
  tag: string;
  title: string;
}) {
  return (
    <>
      <div style={{ ...mono, color: c.muted }}>{tag}</div>
      <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 18px" }}>
        {title}
      </h1>
    </>
  );
}

function Button({
  c,
  onClick,
  children,
}: {
  c: C;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <GlassButton
      c={c}
      kind="solid"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        alignSelf: "flex-start",
      }}
    >
      {children}
    </GlassButton>
  );
}

function DiscordBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        padding: "12px 16px",
        background: DISCORD,
        color: "#fff",
        border: "none",
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
      }}
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
    </button>
  );
}

function OptionCard({
  c,
  title,
  subtitle,
  onClick,
}: {
  c: C;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        border: `1px solid ${c.line}`,
        background: c.chip,
        borderRadius: 14,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        transition: "border-color var(--dur-instant) var(--ease-snap), background var(--dur-instant) var(--ease-snap)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = c.line)}
    >
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 600, color: c.text }}>{title}</div>
        <div style={{ ...mono, fontSize: 10, color: c.muted, marginTop: 4, textTransform: "none", letterSpacing: "0.02em" }}>
          {subtitle}
        </div>
      </div>
      <ArrowRight size={18} style={{ color: ACCENT, flexShrink: 0 }} />
    </button>
  );
}

function Step({
  c,
  n,
  title,
  action,
}: {
  c: C;
  n: number;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        border: `1px solid ${c.line}`,
        background: c.chip,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <span
        style={{
          ...num,
          display: "flex",
          width: 28,
          height: 28,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          background: ACCENT,
          color: "#0B0B0B",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, color: c.text }}>{title}</div>
        {action && <div style={{ marginTop: 4 }}>{action}</div>}
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

function ClaimingFallback({ c, onRetry }: { c: C; onRetry: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(id);
  }, []);
  if (!visible) return null;
  return (
    <div style={{ marginTop: 28, borderTop: `1px solid ${c.line}`, paddingTop: 22 }}>
      <p style={{ ...mono, fontSize: 10, color: c.muted, marginBottom: 14 }}>
        Ça prend plus longtemps que d&apos;habitude
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <GlassButton c={c} kind="ghost" onClick={onRetry} style={{ width: "100%" }}>
          Réessayer
        </GlassButton>
        <a
          href="mailto:contact@amourstudios.fr?subject=Probl%C3%A8me%20claim%20paiement"
          className="glass-btn"
          style={{
            ...glassBtn(c, "ghost"),
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          Contacter le support
        </a>
      </div>
    </div>
  );
}
