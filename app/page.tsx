"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Racine du site — dispatcher piloté par le CERVEAU (résolveur d'état unique,
// cf. convex/lib/journey.ts). On route vers next.primaryCta.href = « le vrai
// prochain pas du client » :
//   - non connecté          → /login
//   - admin                 → /studio (back-office)
//   - coaching actif onboardé → /exos
//   - communauté / sans abo / résilié → /compte
//   - onboarding pas fini   → /onboarding/{token} (au lieu d'une page verrouillée)
//
// ⚠️ Anti double-boucle (cf. /login ↔ /) : la décision /login s'appuie sur
// useConvexAuth (isAuthenticated), JAMAIS sur le verdict cerveau — car juste
// après l'OAuth, getAuthUserId côté serveur peut encore renvoyer null → le
// cerveau renverrait not_authed (primaryCta /login) transitoirement. On ignore
// donc toute destination /login issue du cerveau pour éviter le ping-pong.
export default function Home() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const next = useQuery(api.journey.nextStep);
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; // attendre la stabilisation de l'état d'auth
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (next === undefined) return; // authentifié : attendre le verdict cerveau
    const dest = next.primaryCta?.href ?? "/compte";
    // Ne jamais router vers /login via le cerveau (fenêtre d'hydratation auth).
    if (dest !== "/login") router.replace(dest);
  }, [isLoading, isAuthenticated, next, router]);

  return null;
}
