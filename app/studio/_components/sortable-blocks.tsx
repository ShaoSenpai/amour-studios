"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Reorder,
  AnimatePresence,
  motion,
  useDragControls,
} from "framer-motion";
import { GripVertical, ChevronDown } from "lucide-react";
import { Glass, mono, type C } from "./glass";
import { SPRING } from "@/lib/motion";
import { useAppSpring } from "@/lib/use-app-spring";

// ============================================================================
// Blocs repliables + réordonnables (Framer Motion).
//  - accordéon avec ressort « façon Apple » à l'ouverture / fermeture
//  - glisser-déposer pour réordonner DANS chaque colonne (poignée dédiée)
//  - ordre + état replié mémorisés en localStorage (hook useLayoutPrefs)
// ============================================================================

export type LayoutPrefs = {
  orders: Record<string, string[]>;
  collapsed: Record<string, boolean>;
};

/** Réconcilie l'ordre mémorisé avec les ids par défaut (ajoute les nouveaux,
 *  retire les inconnus) pour rester robuste si la liste des blocs évolue. */
function reconcile(saved: string[] | undefined, def: string[]): string[] {
  if (!saved) return def;
  const known = new Set(def);
  const kept = saved.filter((id) => known.has(id));
  const missing = def.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

/** Persiste ordre des colonnes + blocs repliés sur cet appareil. */
export function useLayoutPrefs(
  storageKey: string,
  defaultOrders: Record<string, string[]>
) {
  const [orders, setOrders] = useState<Record<string, string[]>>(defaultOrders);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw) as Partial<LayoutPrefs>;
        const next: Record<string, string[]> = {};
        for (const col of Object.keys(defaultOrders)) {
          next[col] = reconcile(p.orders?.[col], defaultOrders[col]);
        }
        setOrders(next);
        if (p.collapsed) setCollapsed(p.collapsed);
      }
    } catch {
      /* localStorage indispo / JSON corrompu → on garde les défauts */
    }
    loaded.current = true;
    // defaultOrders est stable (défini au rendu) ; on ne dépend que de la clé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ orders, collapsed }));
    } catch {
      /* quota / mode privé → on ignore */
    }
  }, [orders, collapsed, storageKey]);

  const setOrder = useCallback(
    (col: string, ids: string[]) =>
      setOrders((o) => ({ ...o, [col]: ids })),
    []
  );
  const toggle = useCallback(
    (id: string) => setCollapsed((s) => ({ ...s, [id]: !s[id] })),
    []
  );
  const reset = useCallback(() => {
    setOrders(defaultOrders);
    setCollapsed({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { orders, collapsed, setOrder, toggle, reset };
}

/** Conteneur d'une colonne réordonnable (axe vertical). */
export function SortableColumn({
  ids,
  onReorder,
  children,
}: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={ids}
      onReorder={onReorder}
      style={{ display: "flex", flexDirection: "column", gap: 16, listStyle: "none", margin: 0, padding: 0 }}
    >
      {children}
    </Reorder.Group>
  );
}

/** Un bloc : poignée de drag + titre cliquable (replie) + contenu animé. */
export function CollapsibleBlock({
  value,
  c,
  dark,
  title,
  count,
  headerRight,
  collapsed,
  onToggle,
  children,
}: {
  value: string;
  c: C;
  dark: boolean;
  title: string;
  count?: number;
  headerRight?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const spring = useAppSpring(SPRING);
  return (
    <Reorder.Item
      as="div"
      value={value}
      dragListener={false}
      dragControls={controls}
      layout
      whileDrag={{ scale: 1.02, zIndex: 50, cursor: "grabbing" }}
      transition={spring}
      style={{ listStyle: "none" }}
    >
      <Glass c={c} dark={dark} pad={0} style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 18px",
          }}
        >
          {/* Poignée de déplacement */}
          <button
            type="button"
            title="Déplacer le bloc"
            aria-label="Déplacer le bloc"
            onPointerDown={(e) => controls.start(e)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: c.faint,
              cursor: "grab",
              padding: 2,
              touchAction: "none",
            }}
          >
            <GripVertical size={16} />
          </button>

          {/* Titre + compteur (toute la zone replie au clic) */}
          <button
            type="button"
            onClick={onToggle}
            style={{
              ...mono,
              flex: 1,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "none",
              color: c.muted,
              cursor: "pointer",
              padding: 0,
              textAlign: "left",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{title}</span>
            {count != null && (
              <span style={{ color: c.faint }}>{count}</span>
            )}
            <motion.span
              animate={{ rotate: collapsed ? -90 : 0 }}
              transition={spring}
              style={{ display: "inline-flex", color: c.faint, marginLeft: 2 }}
            >
              <ChevronDown size={15} />
            </motion.span>
          </button>

          {headerRight}
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "0 18px 18px" }}>{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>
    </Reorder.Item>
  );
}
