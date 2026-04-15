"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { X, Megaphone } from "lucide-react";

export function AnnouncementsBanner() {
  const announcements = useQuery(api.announcements.listActive);
  const dismiss = useMutation(api.announcements.dismiss);

  if (!announcements || announcements.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-2">
      {announcements.map((a) => {
        const accent = a.accent ?? "#FF6B1F";
        return (
          <div
            key={a._id}
            className="relative rounded-md border border-foreground/15 border-l-4 bg-foreground/[0.08] px-5 py-4 pr-10"
            style={{ borderLeftColor: accent }}
          >
            <button
              onClick={() => dismiss({ announcementId: a._id }).catch(() => {})}
              className="absolute right-3 top-3 text-foreground/40 transition-colors hover:text-foreground"
              aria-label="Masquer"
              style={{ minHeight: 0 }}
            >
              <X size={14} />
            </button>
            <div className="flex items-start gap-3">
              <Megaphone
                size={16}
                className="mt-1 shrink-0"
                style={{ color: accent }}
              />
              <div className="min-w-0 flex-1">
                <h3
                  className="text-xl italic leading-tight"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {a.title}
                </h3>
                <p
                  className="mt-1 font-mono text-xs text-foreground/70"
                  style={{ fontFamily: "var(--font-body-legacy)" }}
                >
                  {a.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
