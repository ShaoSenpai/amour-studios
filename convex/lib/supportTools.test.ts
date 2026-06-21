import { describe, it, expect } from "vitest";
import { TOOL_DEFS, TOOL_NAMES } from "./supportTools";

describe("supportTools", () => {
  it("expose la whitelist exacte", () => {
    expect(new Set(TOOL_NAMES)).toEqual(
      new Set([
        "lookupMemberState",
        "resendActivationLink",
        "getLinkCode",
        "resendDiscordInvite",
        "getOnboardingLink",
        "getCalendlyLink",
        "getAccountLink",
        "reply",
        "escalate",
      ]),
    );
  });
  it("chaque outil a name + description + input_schema objet", () => {
    for (const t of TOOL_DEFS) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(t.input_schema.type).toBe("object");
    }
  });
  it("reply exige un champ message ; escalate un champ reason", () => {
    const reply = TOOL_DEFS.find((t) => t.name === "reply")!;
    expect(reply.input_schema.required).toContain("message");
    const esc = TOOL_DEFS.find((t) => t.name === "escalate")!;
    expect(esc.input_schema.required).toContain("reason");
  });
  it("aucun outil n'accepte un identifiant de membre cible (anti-usurpation)", () => {
    for (const t of TOOL_DEFS) {
      const props = Object.keys(t.input_schema.properties ?? {});
      expect(props).not.toContain("discordId");
      expect(props).not.toContain("targetUser");
      expect(props).not.toContain("email");
    }
  });
});
