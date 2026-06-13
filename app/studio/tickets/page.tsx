"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2 } from "lucide-react";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  Avatar,
  Pill,
  fmtDate,
  fmtTime,
  relativeFromNow,
  type C,
} from "../_components/glass";

// ============================================================================
// Tickets — api.tickets.listTickets. Suivi des tickets de support Discord.
// Le coach répond DANS Discord ; cette vue = visibilité (ouverts + fermés
// récents). Glass C, admin-gated côté serveur.
// ============================================================================

type Ticket = {
  id: string;
  discordId: string;
  username: string | null;
  channelId: string;
  status: "open" | "closed";
  openedAt: number;
  closedAt: number | null;
  closedBy: string | null;
  userId: string | null;
  name: string | null;
  email: string | null;
};

function displayName(t: Ticket): string {
  return t.name || t.username || `Discord ${t.discordId.slice(0, 6)}…`;
}

function TicketRow({
  c,
  dark,
  t,
  last,
}: {
  c: C;
  dark: boolean;
  t: Ticket;
  last: boolean;
}) {
  const who = displayName(t);
  const isOpen = t.status === "open";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.4fr) 120px minmax(160px, 1fr) 150px",
        gap: 14,
        padding: "14px 24px",
        borderBottom: last ? "none" : `1px solid ${c.hairline}`,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <Avatar name={who} size={30} dark={dark} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {who}
          </div>
          {t.email && (
            <div style={{ ...mono, color: c.faint, marginTop: 2 }}>{t.email}</div>
          )}
        </div>
      </div>

      <div>
        <Pill c={c} tone={isOpen ? "warn" : "outline"}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 5,
              background: isOpen ? "#0B0B0B" : c.faint,
            }}
          />
          {isOpen ? "Ouvert" : "Fermé"}
        </Pill>
      </div>

      <div style={{ ...mono, color: c.muted, minWidth: 0 }}>
        {isOpen ? (
          <span>ouvert {relativeFromNow(t.openedAt)}</span>
        ) : (
          <span>
            fermé {fmtDate(t.closedAt)} · {fmtTime(t.closedAt)}
          </span>
        )}
      </div>

      <div style={{ ...num, fontSize: 12.5, color: c.faint, textAlign: "right" }}>
        {fmtDate(t.openedAt)}
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const dark = useIsDark();
  const c = palette(dark, ACCENT);
  const data = useQuery(api.tickets.listTickets);

  if (data === undefined) {
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
  }

  const open = data.open as Ticket[];
  const closed = data.closed as Ticket[];

  return (
    <div
      style={{
        background: c.bgGrad,
        minHeight: "100vh",
        color: c.text,
        padding: 26,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div
              style={{
                flex: 1,
                padding: "26px 30px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minWidth: 240,
              }}
            >
              <div style={{ ...mono, color: c.muted }}>Support · Discord</div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>
                Tickets
              </div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                <span style={{ color: ACCENT, fontWeight: 500 }}>
                  {open.length} ouvert{open.length > 1 ? "s" : ""}
                </span>{" "}
                · <span>{closed.length} fermé{closed.length > 1 ? "s" : ""} récemment</span>
                <br />
                <span style={{ ...mono, color: c.faint, fontSize: 11 }}>
                  Le coach répond directement dans le salon Discord du ticket.
                </span>
              </div>
            </div>
          </div>
        </Glass>

        {/* Tickets ouverts */}
        <Glass c={c} dark={dark} pad={0} style={{ marginBottom: 16 }}>
          <div style={{ padding: "20px 24px 14px" }}>
            <div style={{ ...mono, color: c.muted }}>Tickets ouverts</div>
            <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 6 }}>
              {open.length} en cours
            </div>
          </div>
          {open.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1.4fr) 120px minmax(160px, 1fr) 150px",
                gap: 14,
                padding: "12px 24px",
                borderBottom: `1px solid ${c.line}`,
                borderTop: `1px solid ${c.line}`,
                ...mono,
                color: c.faint,
              }}
            >
              <div>Élève</div>
              <div>Statut</div>
              <div>Activité</div>
              <div style={{ textAlign: "right" }}>Ouvert le</div>
            </div>
          )}
          {open.map((t, i) => (
            <TicketRow key={t.id} c={c} dark={dark} t={t} last={i === open.length - 1} />
          ))}
          {open.length === 0 && (
            <div style={{ padding: "40px 22px", textAlign: "center", color: c.muted, fontSize: 14 }}>
              Aucun ticket ouvert. 🎉
            </div>
          )}
        </Glass>

        {/* Tickets fermés récents */}
        <Glass c={c} dark={dark} pad={0}>
          <div style={{ padding: "20px 24px 14px" }}>
            <div style={{ ...mono, color: c.muted }}>Fermés récemment</div>
            <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 6 }}>
              {closed.length} ticket{closed.length > 1 ? "s" : ""}
            </div>
          </div>
          {closed.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 1.4fr) 120px minmax(160px, 1fr) 150px",
                gap: 14,
                padding: "12px 24px",
                borderBottom: `1px solid ${c.line}`,
                borderTop: `1px solid ${c.line}`,
                ...mono,
                color: c.faint,
              }}
            >
              <div>Élève</div>
              <div>Statut</div>
              <div>Activité</div>
              <div style={{ textAlign: "right" }}>Ouvert le</div>
            </div>
          )}
          {closed.map((t, i) => (
            <TicketRow key={t.id} c={c} dark={dark} t={t} last={i === closed.length - 1} />
          ))}
          {closed.length === 0 && (
            <div style={{ padding: "40px 22px", textAlign: "center", color: c.muted, fontSize: 14 }}>
              Aucun ticket fermé pour l&apos;instant.
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}
