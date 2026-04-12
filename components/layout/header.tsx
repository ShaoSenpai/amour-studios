"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Logo } from "./logo";

export function Header() {
  const user = useQuery(api.users.current);
  if (!user) return null;

  return (
    <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-lg border-b border-border px-4 py-3">
      <div className="flex items-center justify-center">
        <Logo size="sm" />
      </div>
    </header>
  );
}
