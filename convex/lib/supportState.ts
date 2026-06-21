// Transitions d'état pures du fil de support. AUCUNE dépendance au runtime
// Convex → testable en isolation. Le status est la source de vérité unique :
// le bot lit ce champ (via une query) pour décider s'il relaie un message à l'IA.

export type SupportStatus = "ai_active" | "muted" | "escalated" | "resolved";

export type SupportEvent =
  | "member_message"
  | "admin_message"
  | "escalate"
  | "member_resolved"
  | "admin_resume";

export function nextStatus(
  current: SupportStatus,
  event: SupportEvent,
): SupportStatus {
  switch (event) {
    case "admin_message":
      return current === "ai_active" ? "muted" : current;
    case "escalate":
      return "escalated";
    case "member_resolved":
      return current === "ai_active" ? "resolved" : current;
    case "admin_resume":
      return current === "muted" ? "ai_active" : current;
    case "member_message":
      return current;
    default:
      return current;
  }
}

// Le bot ne relaie à l'IA QUE si le fil est ai_active.
export function shouldRelayToAi(status: SupportStatus): boolean {
  return status === "ai_active";
}
