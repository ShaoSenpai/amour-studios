"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bell } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function NotificationBell() {
  const unreadCount = useQuery(api.notifications.unreadCount);
  const notifications = useQuery(api.notifications.list);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const count = unreadCount ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="absolute top-1 right-1 size-2.5 rounded-full bg-[#E63326]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-xs font-medium">Notifications</p>
            {count > 0 && (
              <button
                onClick={async () => { await markAllRead(); }}
                className="text-[10px] text-primary hover:underline"
              >
                Tout lire
              </button>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={16} className="mx-auto text-muted-foreground mb-1.5 opacity-30" />
                <p className="text-[10px] text-muted-foreground">Rien de nouveau</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`px-4 py-3 border-b border-border/30 last:border-0 ${notif.read ? "opacity-40" : ""}`}
                >
                  <p className="text-[11px] leading-relaxed">{notif.message}</p>
                  <p className="text-[9px] text-muted-foreground mt-1">{formatTime(notif.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "maintenant";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}
