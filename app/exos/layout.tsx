"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
} from "../studio/_components/glass";
import { MemberShell } from "@/app/_components/member-shell";

// ============================================================================
// Layout de l'espace élève /exos.
//
// 3 états :
//   1. Pas authed → on s'attend à ce que proxy.ts ait déjà redirigé vers
//      /login, mais filet de sécurité : on redirige.
//   2. Authed sans coaching actif (commu seul OU rien) → écran « Active ton
//      coaching » + CTA paiement (TODO : brancher sur le checkout existant).
//   3. Authed avec coaching OU admin → render children (catalogue / détail).
// ============================================================================

export default function ExosLayout({ children }: { children: ReactNode }) {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const router = useRouter();
  const summary = useQuery(api.exercises.accessSummary);

  useEffect(() => {
    if (summary && !summary.isAuthed) router.replace("/login");
  }, [summary, router]);

  // Loader
  if (summary === undefined) {
    return (
      <main
        style={{
          background: c.bgGrad,
          color: c.text,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  // Pas authed (filet)
  if (!summary.isAuthed) return null;

  // Pas d'accès coaching (et pas admin) → écran "active ton coaching"
  if (!summary.isAdmin && summary.tier !== "coaching") {
    return (
      <MemberShell>
      <main
        style={{
          background: c.bgGrad,
          color: c.text,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 520, overflow: "hidden" }}>
          <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 18 }}>
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
                <div style={{ ...mono, fontSize: 9.5, color: c.muted, marginTop: 2 }}>EXOS · COACHING</div>
              </div>
            </div>
            <div>
              <div style={{ ...mono, color: c.muted }}>Accès réservé</div>
              <h1 style={{ ...num, fontSize: 36, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
                Active ton coaching.
              </h1>
              <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
                Les exercices sont réservés aux clients <strong style={{ color: c.text }}>coaching 179€</strong>.
                Tu rejoins le coaching ? Tu pourras dérouler les modules à ton rythme,
                directement depuis cet espace.
              </p>
            </div>
            {summary.tier === "communaute" ? (
              <>
                {/* Déjà membre Communauté → upgrade 1-clic (prorata) + gestion, sans re-payer dehors */}
                <a
                  href="/compte"
                  className="glass-btn"
                  style={{ ...glassBtn(c, "solid"), textAlign: "center", textDecoration: "none" }}
                >
                  Passer au Coaching →
                </a>
                <a
                  href="/compte"
                  style={{
                    ...mono,
                    fontSize: 10.5,
                    color: c.muted,
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  Gérer mon abonnement (annuler / facturation)
                </a>
              </>
            ) : (
              <a
                href="https://amourstudios.fr/coaching"
                className="glass-btn"
                style={{ ...glassBtn(c, "solid"), textAlign: "center", textDecoration: "none" }}
              >
                Voir l&apos;offre coaching →
              </a>
            )}
            <a
              href="/studio"
              style={{
                ...mono,
                fontSize: 10.5,
                color: c.muted,
                textAlign: "center",
                textDecoration: "none",
                marginTop: 4,
              }}
            >
              Tu es coach ? Accéder au back-office.
            </a>
          </div>
        </Glass>
      </main>
      </MemberShell>
    );
  }

  // Coaching OU admin → on rend la page
  return <MemberShell>{children}</MemberShell>;
}
