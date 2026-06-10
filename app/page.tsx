"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Racine du site — dispatcher selon le rôle :
//   - non authentifié → /login
//   - admin           → /studio (back-office)
//   - membre coaching → /exos   (espace exercices)
//   - autre membre    → /exos   (qui affichera l'écran « active ton coaching »)
export default function Home() {
  const me = useQuery(api.users.current);
  const router = useRouter();

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) {
      router.replace("/login");
      return;
    }
    if (me.role === "admin") {
      router.replace("/studio");
    } else {
      router.replace("/exos");
    }
  }, [me, router]);

  return null;
}
