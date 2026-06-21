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
      // Un membre qui ré-écrit dans un fil RÉSOLU rouvre la conversation avec l'IA
      // (évite qu'il reste sans réponse). escalated reste escalated (suivi = ticket).
      return current === "resolved" ? "ai_active" : current;
    default:
      return current;
  }
}

// Le bot ne relaie à l'IA QUE si le fil est ai_active.
export function shouldRelayToAi(status: SupportStatus): boolean {
  return status === "ai_active";
}
