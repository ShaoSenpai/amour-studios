// Définitions des outils exposés à Claude (schémas JSON Anthropic). Whitelist
// FIGÉE. Aucun outil ne prend de cible en paramètre : l'agent agit toujours sur
// l'auteur du message Discord vérifié (anti-usurpation). Pur (testable).

export type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export const TOOL_DEFS: readonly ToolDef[] = [
  {
    name: "lookupMemberState",
    description:
      "Lit l'état du membre courant (palier, paiement lié ou non, étape d'onboarding). Lecture seule. Utilise-le pour personnaliser une réponse quand c'est pertinent.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "resendActivationLink",
    description:
      "Renvoie au membre courant son lien d'activation/onboarding par email (et DM). Idempotent. Utilise-le quand le membre n'a pas reçu son lien.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getLinkCode",
    description:
      "Redonne au membre courant son code de liaison AMR-XXXXXX. Utilise-le quand il l'a perdu.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "resendDiscordInvite",
    description:
      "Donne le lien d'invitation du serveur Discord (discord.gg/x9humyUMnJ).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getOnboardingLink",
    description:
      "Renvoie au membre courant le lien de son questionnaire d'onboarding.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getCalendlyLink",
    description:
      "Donne le lien Calendly du 1er RDV (réservé aux membres coaching).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "getAccountLink",
    description: "Donne le lien vers /compte (factures, portail Stripe, upgrade).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "reply",
    description:
      "Poste ta réponse finale au membre dans le thread. Termine TOUJOURS par reply ou escalate.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "La réponse à afficher au membre." },
        confidence: {
          type: "number",
          description: "Ta confiance 0..1 dans cette réponse.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate",
    description:
      "Passe le relais à l'équipe humaine (ouvre un ticket privé). Utilise-le pour tout sujet sensible, hors-cadre, technique non résolu, ou si tu n'es pas sûr.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Pourquoi tu escalades (1 phrase, pour l'équipe).",
        },
        memberMessage: {
          type: "string",
          description: "Message à afficher au membre en passant le relais.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

// Outils qui déclenchent un effet de bord côté Convex (lecture/action). reply et
// escalate sont des outils de contrôle, gérés à part dans la boucle de l'agent.
export const ACTION_TOOL_NAMES = [
  "lookupMemberState",
  "resendActivationLink",
  "getLinkCode",
  "resendDiscordInvite",
  "getOnboardingLink",
  "getCalendlyLink",
  "getAccountLink",
] as const;
