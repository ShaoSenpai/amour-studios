"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bell } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const unreadCount = useQuery(api.notifications.unreadCount);
  const notifications = useQuery(api.notifications.list);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const markRead = useMutation(api.notifications.markRead);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  const count = unreadCount ?? 0;

  const dropdown = open && pos ? (
    <div
      ref={dropdownRef}
      className="fixed z-[60] w-72 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ top: pos.top, right: pos.right }}
    >
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
      <div className="max-h-[min(60vh,26rem)] overflow-y-auto">
        {!notifications || notifications.length === 0 ? (
          <div className="py-8 text-center">
            <Bell size={16} className="mx-auto text-muted-foreground mb-1.5 opacity-30" />
            <p className="text-[10px] text-muted-foreground">Rien de nouveau</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const clickable = !!notif.lessonId;
            const handleClick = async () => {
              if (!notif.read) {
                markRead({ notificationId: notif._id }).catch(() => {});
              }
              if (clickable) {
                setOpen(false);
                router.push(`/lesson/${notif.lessonId}`);
              }
            };
            return (
              <button
                key={notif._id}
                onClick={handleClick}
                type="button"
                className={`block w-full text-left px-4 py-3 border-b border-border/30 last:border-0 transition-colors ${
                  notif.read ? "opacity-50" : ""
                } ${clickable ? "cursor-pointer hover:bg-foreground/[0.04]" : "cursor-default"}`}
                style={{ minHeight: 0 }}
              >
                <p className="text-[11px] leading-relaxed">{notif.message}</p>
                <p className="text-[9px] text-muted-foreground mt-1">{formatTime(notif.createdAt)}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="absolute top-1 right-1 size-2.5 rounded-full bg-[#E63326]" />
        )}
      </button>
      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </>
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
