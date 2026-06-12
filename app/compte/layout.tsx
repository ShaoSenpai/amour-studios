"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { palette, useIsDark, ACCENT } from "../studio/_components/glass";

// ============================================================================
// Gate auth de l'espace /compte (self-service abonnement membre).
// Non authentifié → /login. Pendant le chargement → loader Glass C.
// ============================================================================

export default function CompteLayout({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.current);
  const router = useRouter();
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  useEffect(() => {
    if (me === null) router.replace("/login");
  }, [me, router]);

  if (me === undefined)
    return (
      <main
        style={{
          background: c.bgGrad,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );

  if (me === null) return null;

  return <>{children}</>;
}
