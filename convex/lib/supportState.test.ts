import { describe, it, expect } from "vitest";
import { nextStatus, type SupportStatus, type SupportEvent } from "./supportState";

describe("nextStatus", () => {
  it("reste ai_active quand un membre poste", () => {
    expect(nextStatus("ai_active", "member_message")).toBe("ai_active");
  });
  it("passe à muted quand un admin écrit", () => {
    expect(nextStatus("ai_active", "admin_message")).toBe("muted");
  });
  it("passe à escalated sur escalade IA", () => {
    expect(nextStatus("ai_active", "escalate")).toBe("escalated");
  });
  it("passe à resolved sur clic C'est réglé", () => {
    expect(nextStatus("ai_active", "member_resolved")).toBe("resolved");
  });
  it("réactive l'IA depuis muted", () => {
    expect(nextStatus("muted", "admin_resume")).toBe("ai_active");
  });
  it("ne relaie plus à l'IA quand muted et un membre poste (reste muted)", () => {
    expect(nextStatus("muted", "member_message")).toBe("muted");
  });
  it("escalated est terminal pour l'IA (un message membre n'y change rien)", () => {
    expect(nextStatus("escalated", "member_message")).toBe("escalated");
  });
});
