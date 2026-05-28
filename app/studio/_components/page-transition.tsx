"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, usePresence, useReducedMotion } from "framer-motion";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

// ============================================================================
// Transition de page « push » iOS du back-office /studio.
//
// Deux couches visibles pendant la navigation : l'ANCIENNE page (contenu déjà
// chargé) glisse de côté pendant que la NOUVELLE entre. C'est l'ancienne page
// qu'on veut voir bouger (la nouvelle affiche d'abord un spinner Convex).
//
//  - `AnimatePresence` + `usePresence` gèrent la PRÉSENCE (garder l'ancienne
//    couche montée le temps de l'animation), mais l'animation elle-même est en
//    CSS (transform/opacity) → thread compositeur → JAMAIS gelée par le montage
//    de la nouvelle page (queries Convex, etc.). C'est ce qui réglait le « gel
//    à mi-chemin » d'une animation JS.
//  - `FrozenRouter` fige le contexte du routeur sur chaque couche : la couche
//    sortante continue d'afficher SON ancienne route.
//
// Direction selon la profondeur d'URL :
//  - plus profond (Élèves → fiche)  = AVANT  → nouvelle de droite, ancienne à gauche
//  - moins profond (fiche → Élèves) = RETOUR → l'inverse
//  - même niveau (section ↔ section) = fondu
// ============================================================================

// Direction courante partagée aux couches (la couche sortante doit connaître la
// direction de LA navigation en cours, pas celle de son entrée).
const DirContext = createContext(0);

function dirName(d: number) {
  return d > 0 ? "fwd" : d < 0 ? "back" : "fade";
}

function FrozenRouter({ children }: { children: ReactNode }) {
  const context = useContext(LayoutRouterContext);
  const [frozen] = useState(context);
  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

function PageLayer({ children }: { children: ReactNode }) {
  const dir = useContext(DirContext);
  const [isPresent, safeToRemove] = usePresence();

  // Filet de sécurité : retire la couche sortante même si `animationend` ne se
  // déclenche pas (ex. reduced-motion → animation: none).
  useEffect(() => {
    if (isPresent) return;
    const t = setTimeout(() => safeToRemove?.(), 600);
    return () => clearTimeout(t);
  }, [isPresent, safeToRemove]);

  const name = dirName(dir);
  const className = isPresent
    ? `studio-layer studio-in-${name}`
    : `studio-layer studio-out studio-out-${name}`;

  return (
    <div
      className={className}
      onAnimationEnd={() => {
        if (!isPresent) safeToRemove?.();
      }}
    >
      <FrozenRouter>{children}</FrozenRouter>
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const reduce = useReducedMotion();
  const depth = (p: string) => p.split("/").filter(Boolean).length;

  // Direction via le pattern « ajuster l'état pendant le render » (react.dev).
  const [prev, setPrev] = useState(pathname);
  const [dir, setDir] = useState(0);
  if (prev !== pathname) {
    setDir(depth(pathname) > depth(prev) ? 1 : depth(pathname) < depth(prev) ? -1 : 0);
    setPrev(pathname);
  }

  if (reduce) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: "relative", width: "100%", minWidth: 0, overflowX: "clip" }}>
      <DirContext.Provider value={dir}>
        <AnimatePresence initial={false}>
          <PageLayer key={pathname}>{children}</PageLayer>
        </AnimatePresence>
      </DirContext.Provider>
    </div>
  );
}
