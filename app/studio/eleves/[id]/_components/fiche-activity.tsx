"use client";

import { Id } from "@/convex/_generated/dataModel";
import {
  Calendar,
  CreditCard,
  Flag,
  StickyNote,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  ACCENT,
  mono,
  relativeFromNow,
  type C,
} from "../../../_components/glass";

// ── Activité (trace CRM) ──────────────────────────────────────────────────
// Forme minimale commune au sandbox (selectEvents) et au backend
// (api.events.listForUser) : seuls ces champs servent au rendu de la timeline.
export type TimelineEvent = {
  _id: Id<"events">;
  type: string;
  title: string;
  actor?: string;
  at: number;
};

// Mapping type d'event → couleur + icône, cohérent avec le design Glass.
type EventVisual = {
  color: string;
  Icon: React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number | string }>;
};

// Jalons « validés » (étape franchie / succès) → VERT + ✓. Le reste : rouge pour
// les échecs, accent pour les RDV à venir, gris pour l'informatif.
const VALIDATED_EVENTS = new Set<string>([
  "onboarding.linked",
  "onboarding.presented",
  "onboarding.form_done",
  "onboarding.rdv_booked",
  "onboarding.force_complete",
  "rdv.booked",
  "payment.paid",
]);

function eventVisual(type: string, c: C): EventVisual {
  if (VALIDATED_EVENTS.has(type)) return { color: c.successFg, Icon: CheckCircle2 };
  if (
    type === "payment.failed" ||
    type === "subscription.canceled" ||
    type === "rdv.canceled"
  )
    return { color: "#E5484D", Icon: AlertTriangle };
  if (type.startsWith("rdv.")) return { color: ACCENT, Icon: Calendar };
  if (type === "payment.paid") return { color: c.successFg, Icon: CreditCard };
  if (type === "stage.changed") return { color: c.text, Icon: Flag };
  if (type === "note.added") return { color: c.muted, Icon: StickyNote };
  return { color: c.muted, Icon: Flag };
}

export function ActivityTimeline({
  c,
  events,
}: {
  c: C;
  events: TimelineEvent[];
}) {
  return (
    <>
      {events.length === 0 ? (
        <div style={{ ...mono, color: c.faint }}>Aucune activité pour l&apos;instant.</div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // Évite que le bloc s'étire à l'infini : au-delà de ~5-6 events on
            // scrolle à l'intérieur du bloc.
            maxHeight: 360,
            overflowY: "auto",
            marginRight: -6,
            paddingRight: 6,
          }}
        >
          {events.map((ev, i) => {
            const { color, Icon } = eventVisual(ev.type, c);
            const last = i === events.length - 1;
            return (
              <div key={ev._id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 12, position: "relative" }}>
                {/* Colonne point + trait vertical */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `${color}1A`,
                      border: `1px solid ${color}`,
                      color,
                    }}
                  >
                    <Icon size={13} color={color} strokeWidth={2} />
                  </div>
                  {!last && <div style={{ flex: 1, width: 2, background: c.line, marginTop: 2 }} />}
                </div>
                {/* Contenu */}
                <div style={{ paddingBottom: last ? 0 : 18, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: c.text }}>{ev.title}</span>
                    <span style={{ ...mono, color: c.faint, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>{relativeFromNow(ev.at)}</span>
                  </div>
                  {ev.actor && (
                    <span style={{ ...mono, color: c.muted, fontSize: 9, marginTop: 4, display: "inline-block", padding: "2px 7px", borderRadius: 999, background: c.chip, border: `1px solid ${c.line}` }}>
                      {ev.actor}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
