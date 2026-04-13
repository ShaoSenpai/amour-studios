"use client";

import * as React from "react";

// ============================================================================
// View-as-member mode (admin only)
// ----------------------------------------------------------------------------
// Permet à un admin de simuler la vue d'un membre normal sans modifier son
// rôle en DB. Persisté en localStorage. Aucun effet pour les vrais membres.
// ============================================================================

type ViewModeContext = {
  viewAsMember: boolean;
  setViewAsMember: (v: boolean) => void;
  toggle: () => void;
};

const Ctx = React.createContext<ViewModeContext>({
  viewAsMember: false,
  setViewAsMember: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "amour-view-as-member";

export function ViewModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [viewAsMember, setViewAsMember] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setViewAsMember(true);
    } catch {}
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(viewAsMember));
    } catch {}
  }, [viewAsMember]);

  return (
    <Ctx.Provider
      value={{
        viewAsMember,
        setViewAsMember,
        toggle: () => setViewAsMember((v) => !v),
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
 * du toggle viewAsMember. Si le user n'est pas vraiment admin, le toggle n'a
 * aucun effet (sécurité).
 */
export function useEffectiveRole(realRole: string | undefined) {
  const { viewAsMember } = useViewMode();
  if (realRole === "admin" && viewAsMember) return "member";
  return realRole;
}
