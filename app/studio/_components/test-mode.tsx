"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { mono, type C } from "./glass";

// ============================================================================
// MODE TEST — switch d'affichage côté client uniquement (aucune écriture en
// base). Quand actif, chaque écran /studio utilise les données de démo (cf.
// demo-data.ts) au lieu des queries Convex. Persisté en localStorage.
// Défaut : activé (true), pour que l'admin voie tout peuplé immédiatement.
// ============================================================================

const STORAGE_KEY = "studio-test-mode";

type TestModeCtx = { testMode: boolean; toggle: () => void };

const Ctx = createContext<TestModeCtx>({ testMode: true, toggle: () => {} });

// ── Store externe (localStorage) lu via useSyncExternalStore ────────────────
// Évite le setState-in-effect (cascading renders) et le mismatch d'hydratation :
// le snapshot serveur renvoie toujours le défaut (true), le client lit le vrai
// état après hydratation. Défaut : true.
const listeners = new Set<() => void>();

function readStore(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true; // défaut activé
    return stored === "true";
  } catch {
    return true;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setStore(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* ignore */
  }
  listeners.forEach((cb) => cb());
}

export function TestModeProvider({ children }: { children: ReactNode }) {
  const testMode = useSyncExternalStore(
    subscribe,
    readStore,
    () => true // snapshot serveur : défaut activé
  );

  const toggle = useCallback(() => {
    setStore(!readStore());
  }, []);

  return <Ctx.Provider value={{ testMode, toggle }}>{children}</Ctx.Provider>;
}

export function useTestMode(): TestModeCtx {
  return useContext(Ctx);
}

/** Bouton toggle Glass, cohérent avec le toggle thème de la sidebar. */
export function TestModeToggle({
  collapsed,
  sideText,
  sideLine,
  accent,
}: {
  collapsed: boolean;
  sideText: string;
  sideLine: string;
  accent: string;
}) {
  const { testMode, toggle } = useTestMode();
  return (
    <button
      onClick={toggle}
      title={testMode ? "Mode test activé" : "Mode test désactivé"}
      style={{
        ...mono,
        fontSize: 10,
        padding: collapsed ? "8px 0" : "8px 12px",
        background: testMode ? accent : "transparent",
        border: `1px solid ${testMode ? "transparent" : sideLine}`,
        color: testMode ? "#0B0B0B" : sideText,
        cursor: "pointer",
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontWeight: 500,
      }}
    >
      <span>{testMode ? "●" : "○"}</span>
      {!collapsed && <span>{testMode ? "Mode test" : "Données réelles"}</span>}
    </button>
  );
}

/** Petit badge « MODE TEST » affiché quand le mode est actif. */
export function TestModeBadge({ c }: { c: C }) {
  const { testMode } = useTestMode();
  if (!testMode) return null;
  return (
    <div
      style={{
        ...mono,
        fontSize: 10,
        background: c.accent,
        color: "#0B0B0B",
        padding: "5px 11px",
        borderRadius: 999,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        boxShadow: `0 6px 18px -6px ${c.accent}80`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 6,
          background: "#0B0B0B",
        }}
      />
      Mode test
    </div>
  );
}
