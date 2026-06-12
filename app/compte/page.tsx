"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
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

// ============================================================================
// /compte — self-service abonnement membre (statut + annuler/réactiver/upgrade).
// Branché sur convex/subscriptions.ts. DA Glass C (couleurs via tokens `c.*`,
// jamais de noir/blanc hardcodé — sinon invisible en dark mode).
// ============================================================================

export default function ComptePage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const sub = useQuery(api.subscriptions.mySubscription);
  const cancelMut = useAction(api.subscriptions.cancelMySubscription);
  const reactivateMut = useAction(api.subscriptions.reactivateMySubscription);
  const upgradeMut = useAction(api.subscriptions.upgradeMySubscription);
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

  const shell = {
    background: c.bgGrad,
    color: c.text,
    minHeight: "100vh",
    display: "flex",
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
        <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 460 }}>
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
      </main>
    );

  const isCoaching = sub.tier === "coaching";
  const periodEnd = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR")
    : null;

  return (
    <main style={shell}>
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ padding: "40px 38px", display: "flex", flexDirection: "column", gap: 22 }}>
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

          {sub.canUpgrade && (
            <div
              style={{
                border: `1px solid ${c.line}`,
                background: c.chip,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ ...mono, fontSize: 10, color: ACCENT }}>PASSER AU COACHING</div>
              <p style={{ fontSize: 13.5, color: c.muted, margin: "8px 0 12px", lineHeight: 1.5 }}>
                Débloque le coaching 1:1 avec Walid (RDV + exos). Tu passes à 179€/mois, la
                différence au prorata est prélevée maintenant.
              </p>
              <button
                onClick={() => run("up", () => upgradeMut({}), "🎉 Coaching débloqué !")}
                disabled={!!busy}
                style={{ ...glassBtn(c, "solid"), width: "100%", opacity: busy ? 0.6 : 1 }}
              >
                {busy === "up" ? "Activation…" : "Passer au Coaching (179€/mois)"}
              </button>
            </div>
          )}

          {sub.cancelAtPeriodEnd ? (
            <button
              onClick={() => run("re", () => reactivateMut({}), "Abonnement réactivé.")}
              disabled={!!busy}
              style={{ ...glassBtn(c, "solid"), width: "100%", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "re" ? "…" : "Réactiver mon abonnement"}
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm("Annuler ton abonnement à la fin de la période en cours ?"))
                  run(
                    "ca",
                    () => cancelMut({}),
                    "Annulation programmée à la fin de la période."
                  );
              }}
              disabled={!!busy}
              style={{ ...glassBtn(c, "ghost"), width: "100%", opacity: busy ? 0.6 : 1 }}
            >
              {busy === "ca" ? "…" : "Annuler mon abonnement"}
            </button>
          )}

          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center" }}>
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
