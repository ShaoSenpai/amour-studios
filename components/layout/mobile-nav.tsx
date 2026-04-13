"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Home, Pencil, MessageCircle } from "lucide-react";

export function MobileNav() {
  const user = useQuery(api.users.current);
  const pathname = usePathname();

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;

  const items = [
    { href: "/dashboard", label: "Formation", icon: <Home size={20} />, active: pathname === "/dashboard" },
    ...(isAdmin
      ? [{ href: "/admin", label: "Cockpit", icon: <Pencil size={20} />, active: pathname.startsWith("/admin") }]
      : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border z-40 safe-area-bottom">
      <div className="flex items-center justify-around px-4 py-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              item.active
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
        {discordInvite && (
          <a
            href={discordInvite}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground"
          >
            <MessageCircle size={20} />
            <span>Discord</span>
          </a>
        )}
        {/* Profile */}
        <Link href="/dashboard/profile" className="flex flex-col items-center gap-0.5 px-3 py-1.5">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="size-5 rounded-full border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px]">
              {user.name?.[0] ?? "?"}
            </div>
          )}
          <span className="text-xs text-muted-foreground">Profil</span>
        </Link>
      </div>
    </nav>
  );
}
