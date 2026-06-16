"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Racine du site — dispatcher tier-aware :
//   - non authentifié → /login
//   - admin           → /studio (back-office)
//   - membre coaching → /exos   (espace exercices)
//   - autre membre    → /compte (son espace utile : abonnement + upsell coaching)
export default function Home() {
  const me = useQuery(api.users.current);
  const sub = useQuery(api.subscriptions.mySubscription);
  const router = useRouter();

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) {
      router.replace("/login");
      return;
    }
    if (me.role === "admin") {
      router.replace("/studio");
      return;
    }
    if (sub === undefined) return; // attendre le tier avant de router
    const tier = sub.authed && sub.hasSubscription ? sub.tier : null;
    router.replace(tier === "coaching" ? "/exos" : "/compte");
  }, [me, sub, router]);

  return null;
}
