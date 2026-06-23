"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useState, Suspense, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  GlassButton,
} from "../studio/_components/glass";

// ============================================================================
// Login élève /login — connexion Discord, DA Glass C (cohérente avec /exos et
// le login coach). Stratégie Discord-first : être membre du serveur PUIS se
// connecter. 2 états : gate erreur (pas membre) + état par défaut (2 étapes).
// ============================================================================

const DISCORD = "#5865F2";

const discordBtn: CSSProperties = {
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
  textDecoration: "none",
  fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 600,
};

function LoginInner() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  // ⚠️ Anti-double-boucle : on redirige sur l'état d'auth RÉEL (useConvexAuth),
  // PAS via le middleware seul. Au retour de l'OAuth, le cookie est posé mais le
  // middleware côté serveur a un temps de retard → l'utilisateur restait sur
  // /login et devait re-cliquer. Dès que le client est authentifié, on part.
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const [isLoading, setIsLoading] = useState(false);
  // Navigateur intégré (webview Gmail/Discord/Insta…) : l'OAuth y réussit côté
  // serveur mais le cookie de session cross-site ne persiste pas → boucle de
  // login. On le détecte pour guider l'utilisateur vers un vrai navigateur.
  const [inApp, setInApp] = useState(false);
  const searchParams = useSearchParams();
  const hasError = searchParams.has("error");
  const rawReturn = searchParams.get("returnTo") || "";
  // Sécurité : uniquement un chemin interne ("/..."), jamais une URL externe ni protocole-relatif ("//evil").
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const discordInvite =
    process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "https://discord.gg/x9humyUMnJ";

  useEffect(() => {
    if (hasError) {
      toast.error("Connexion refusée — ton Discord n'est pas dans le serveur Amour Studios.");
    }
  }, [hasError]);

  // Déjà authentifié (ou dès que l'OAuth a établi la session côté client) →
  // on part vers returnTo. Évite le « clique 2 fois » : plus besoin d'attendre
  // que le middleware serveur rattrape l'état d'auth.
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(returnTo);
    }
  }, [authLoading, isAuthenticated, returnTo, router]);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    // Marqueurs explicites d'un navigateur intégré à une app.
    const explicit =
      /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|Snapchat|TikTok|Discord|MicroMessenger|Pinterest|; wv\)|GSA\//i.test(ua);
    // Heuristique iOS : un VRAI navigateur a CriOS (Chrome), FxiOS (Firefox),
    // EdgiOS (Edge), ou Safari avec un tag "Version/". Un WKWebView intégré n'a
    // typiquement PAS "Version/" → on le considère comme webview.
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const iosWebview =
      isIOS &&
      !/CriOS|FxiOS|EdgiOS/i.test(ua) &&
      !/Version\/[\d.]+ .*Safari/i.test(ua);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (explicit || iosWebview) setInApp(true);
  }, []);

  const handleDiscordSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("discord", { redirectTo: returnTo });
    } catch (error) {
      console.error("Discord sign-in failed:", error);
      toast.error("Impossible de se connecter à Discord. Réessaie.");
      setIsLoading(false);
    }
  };

  const copyCurrentLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié — colle-le dans Safari ou Chrome.");
    } catch {
      toast.error("Copie impossible. Copie l'adresse en haut de l'écran à la main.");
    }
  };

  const shell: CSSProperties = {
    background: c.bgGrad,
    color: c.text,
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    padding: 24,
    overflow: "hidden",
  };

  const brandRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
        }}
      >
        A
      </div>
      <div>
        <div style={{ ...mono, fontSize: 11, letterSpacing: "0.06em" }}>AMOUR STUDIOS</div>
        <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>ESPACE MEMBRE</div>
      </div>
    </div>
  );

  // En navigateur intégré (webview), la connexion Discord ne peut pas aboutir
  // (cookie de session non gardé) → au lieu d'un mur de login qui boucle, écran
  // rassurant : pas besoin de se connecter ici, tout se passe sur Discord.
  // Filet « me connecter ici quand même » si la détection est un faux positif.
  const inAppScreen = (
    <>
      {brandRow}
      <div>
        <div style={{ ...mono, color: c.muted }}>Tu es au bon endroit</div>
        <h1 style={{ ...num, fontSize: 32, fontWeight: 500, lineHeight: 1.1, margin: "10px 0 0" }}>
          Ton accès se passe sur Discord 🧡
        </h1>
        <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
          Pas besoin de te connecter ici. Ton accès AMOUR STUDIOS se débloque
          directement sur Discord : ton rôle s&apos;active et ton lien
          d&apos;onboarding t&apos;attend en <strong>DM + email</strong>.
          Clique-le pour finaliser.
        </p>
      </div>
      <a href={discordInvite} target="_blank" rel="noopener noreferrer" style={discordBtn}>
        <DiscordIcon size={20} /> Retour sur Discord
      </a>
      <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center", lineHeight: 1.5, textTransform: "none", letterSpacing: "0.02em" }}>
          Gérer ton abonnement ? Copie le lien et ouvre-le dans ton navigateur.
        </p>
        <GlassButton c={c} kind="ghost" onClick={copyCurrentLink} style={{ width: "100%" }}>
          Copier le lien
        </GlassButton>
        <button
          onClick={() => setInApp(false)}
          style={{ ...mono, fontSize: 9, color: c.faint, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, padding: 0, alignSelf: "center", textTransform: "none", letterSpacing: "0.02em" }}
        >
          Me connecter ici quand même
        </button>
      </div>
    </>
  );

  // ── État erreur : gate Discord ──────────────────────────────────────
  if (hasError) {
    return (
      <main style={shell}>
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
          <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 20 }}>
            {brandRow}
            <div>
              <div style={{ ...mono, color: ACCENT }}>Accès refusé</div>
              <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
                Rejoins le Discord d&apos;abord.
              </h1>
              <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
                Ton compte Discord n&apos;est pas encore membre du serveur{" "}
                <strong style={{ color: c.text }}>Amour Studios</strong>. L&apos;accès à l&apos;app est
                réservé aux membres — c&apos;est gratuit, il suffit de rejoindre.
              </p>
            </div>
            <a href={discordInvite} target="_blank" rel="noopener noreferrer" style={discordBtn}>
              <DiscordIcon size={20} /> Rejoindre le serveur
            </a>
            <GlassButton
              c={c}
              kind="ghost"
              onClick={handleDiscordSignIn}
              disabled={isLoading}
              style={{ width: "100%", opacity: isLoading ? 0.6 : 1 }}
            >
              {isLoading ? "Redirection…" : "J'ai rejoint — réessayer"}
            </GlassButton>
            <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center" }}>
              L&apos;inscription au Discord est gratuite et prend 10 secondes.
            </p>
          </div>
        </Glass>
      </main>
    );
  }

  // ── État webview : la connexion ne peut pas aboutir ici → écran d'info
  // rassurant (renvoi vers Discord, où vit le lien d'onboarding), PAS un mur de
  // login qui boucle. (Filet « me connecter ici quand même » dans l'écran.)
  if (inApp) {
    return (
      <main style={shell}>
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
          <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
            {inAppScreen}
          </div>
        </Glass>
      </main>
    );
  }

  // ── État par défaut : connexion directe (1 action) ──────────────────
  return (
    <main style={shell}>
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460, overflow: "hidden" }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
          {brandRow}

          <div>
            <div style={{ ...mono, color: c.muted }}>Accès réservé aux membres</div>
            <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.1, margin: "10px 0 0" }}>
              Connexion
            </h1>
          </div>

          {/* Connexion Discord — action unique */}
          <GlassButton
            c={c}
            kind="solid"
            onClick={handleDiscordSignIn}
            disabled={isLoading}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <DiscordIcon /> {isLoading ? "Redirection…" : "Se connecter avec Discord"}
          </GlassButton>

          {/* Filet anti-blocage : certains navigateurs intégrés aux apps ne
              gardent pas la session (la connexion « boucle »). Toujours visible
              (la détection d'UA ne capte pas tous les cas), discret. */}
          <button
            onClick={copyCurrentLink}
            style={{
              ...mono,
              fontSize: 9.5,
              color: c.faint,
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textTransform: "none",
              letterSpacing: "0.02em",
              lineHeight: 1.5,
              padding: 0,
              textAlign: "center",
              alignSelf: "center",
            }}
          >
            La connexion reste bloquée sur cette page ? Copie le lien et ouvre-le dans Safari / Chrome.
          </button>

          <div style={{ borderTop: `1px solid ${c.line}`, paddingTop: 16 }}>
            <p style={{ ...mono, fontSize: 10.5, color: c.muted, textAlign: "center" }}>
              Pas encore membre ?{" "}
              <Link
                href="https://www.amourstudios.fr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: ACCENT, textDecoration: "none" }}
              >
                Découvrir Amour Studios ↗
              </Link>
            </p>
          </div>
        </div>
      </Glass>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
