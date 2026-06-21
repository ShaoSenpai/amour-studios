import { describe, it, expect } from "vitest";
import { buildSystemPrompt, FAQ } from "./supportFaq";

describe("buildSystemPrompt", () => {
  const sys = buildSystemPrompt({ mode: "assisted" });

  it("inclut l'identité assistant + tutoiement", () => {
    expect(sys).toMatch(/assistant/i);
    expect(sys).toMatch(/AMOUR STUDIOS/);
  });
  it("inclut le périmètre fermé (n'invente pas → escalade)", () => {
    expect(sys).toMatch(/escalad/i);
    expect(sys).toMatch(/n['']invente/i);
  });
  it("inclut la liste des sujets sensibles", () => {
    expect(sys).toMatch(/remboursement/i);
    expect(sys).toMatch(/litige/i);
  });
  it("injecte la FAQ (prix Communauté 79 et Coaching 179)", () => {
    expect(sys).toContain("79");
    expect(sys).toContain("179");
  });
  it("la FAQ contient au moins 10 entrées", () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(10);
  });
  it("le mode shadow est signalé dans le prompt", () => {
    const shadow = buildSystemPrompt({ mode: "shadow" });
    expect(shadow).toMatch(/shadow|suggestion/i);
  });
});
