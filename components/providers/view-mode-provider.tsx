"use client";

import * as React from "react";

// ============================================================================
// View-as mode (admin only)
// ----------------------------------------------------------------------------
// 3 états cycliques : admin → vip → preview → admin
//   - admin   : vue normale d'admin (toutes les pages, nav admin visible)
//   - vip     : simule un membre VIP (purchaseId lié) — voit la formation complète
//   - preview : simule un membre gratuit sans paiement — voit le dashboard
//                en mode upsell (modules verrouillés + bannière)
//
// Persisté en localStorage. Aucun effet pour les vrais membres (sécurité).
// ============================================================================

export type ViewMode = "admin" | "vip" | "preview";

type ViewModeContext = {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  cycle: () => void;
  // Convenience : true si on simule un membre (vip OU preview)
  viewAsMember: boolean;
  // Convenience : true si on simule spécifiquement le mode preview gratuit
  viewAsPreview: boolean;
};

const Ctx = React.createContext<ViewModeContext>({
  viewMode: "admin",
  setViewMode: () => {},
  cycle: () => {},
  viewAsMember: false,
  viewAsPreview: false,
});

const STORAGE_KEY = "amour-view-mode";

const NEXT: Record<ViewMode, ViewMode> = {
  admin: "vip",
  vip: "preview",
  preview: "admin",
};

export function ViewModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [viewMode, setViewMode] = React.useState<ViewMode>("admin");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "vip" || saved === "preview" || saved === "admin") {
        setViewMode(saved);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  return (
    <Ctx.Provider
      value={{
        viewMode,
        setViewMode,
        cycle: () => setViewMode((v) => NEXT[v]),
        viewAsMember: viewMode !== "admin",
        viewAsPreview: viewMode === "preview",
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useViewMode() {
  return React.useContext(Ctx);
}

/**
 * Hook combiné : retourne le rôle effectif (admin / member) en tenant compte
 * du toggle viewMode. Si le user n'est pas vraiment admin, le toggle n'a
 * aucun effet (sécurité).
 */
export function useEffectiveRole(realRole: string | undefined) {
  const { viewAsMember } = useViewMode();
  if (realRole === "admin" && viewAsMember) return "member";
  return realRole;
}
