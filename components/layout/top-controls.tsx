"use client";

import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function TopControls() {
  const user = useQuery(api.users.current);
  if (!user) return null;

  return (
    <div className="hidden md:flex fixed top-4 right-4 z-50 items-center gap-2 bg-background/80 backdrop-blur-lg border border-border rounded-full px-2 py-1.5">
      <NotificationBell />
      <ThemeToggle />
    </div>
  );
}
