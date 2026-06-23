import { describe, it, expect } from "vitest";
import { computeNextStep, type JourneyInput } from "./journey";

// Base : connecté, non admin, pas d'abo, pas d'onboarding. On surcharge au cas.
function input(over: Partial<JourneyInput> = {}): JourneyInput {
  return {
    authed: true,
    isAdmin: false,
    purchase: null,
    onboarding: null,
    onboardingToken: null,
    ...over,
  };
}

describe("computeNextStep — auth & admin", () => {
  it("non authentifié → not_authed, bloqué, CTA /login", () => {
    const r = computeNextStep(input({ authed: false }));
    expect(r.state).toBe("not_authed");
    expect(r.blocked).toBe(true);
    expect(r.primaryCta?.href).toBe("/login");
  });

  it("admin → active, non bloqué, CTA /studio", () => {
    const r = computeNextStep(input({ isAdmin: true }));
    expect(r.state).toBe("active");
    expect(r.blocked).toBe(false);
    expect(r.primaryCta?.href).toBe("/studio");
  });
});

describe("computeNextStep — pas d'abonnement / résilié", () => {
  it("aucun purchase → no_subscription + remedy lier/découvrir", () => {
    const r = computeNextStep(input({ purchase: null }));
    expect(r.state).toBe("no_subscription");
    expect(r.blocked).toBe(true);
    expect(r.reason).toBeTruthy();
    expect(r.remedy.length).toBeGreaterThanOrEqual(2);
  });

  it("purchase incomplete (jamais confirmé) → no_subscription", () => {
    const r = computeNextStep(
      input({ purchase: { status: "incomplete", tier: "communaute" } })
    );
    expect(r.state).toBe("no_subscription");
  });

  it("coaching canceled → canceled + reason 'engagement' + remedy /compte", () => {
    const r = computeNextStep(
      input({ purchase: { status: "canceled", tier: "coaching" } })
    );
    expect(r.state).toBe("canceled");
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain("coaching");
    expect(r.primaryCta?.href).toBe("/compte");
  });

  it("communauté canceled → canceled + reason résilié", () => {
    const r = computeNextStep(
      input({ purchase: { status: "canceled", tier: "communaute" } })
    );
    expect(r.state).toBe("canceled");
    expect(r.reason).toContain("résilié");
  });
});

describe("computeNextStep — onboarding en cours (coaching)", () => {
  const coaching = { status: "active" as const, tier: "coaching" as const };

  it("pas d'onboarding row → awaiting_onboarding (défaut awaiting_presentation)", () => {
    const r = computeNextStep(input({ purchase: coaching, onboarding: null }));
    expect(r.state).toBe("awaiting_onboarding");
    expect(r.blocked).toBe(true);
    expect(r.primaryCta?.href).toBe("/onboarding/welcome"); // pas de token
  });

  it("link_sent → onboarding_questionnaire + deep-link token", () => {
    const r = computeNextStep(
      input({
        purchase: coaching,
        onboarding: { step: "link_sent", tier: "coaching" },
        onboardingToken: "tok123",
      })
    );
    expect(r.state).toBe("onboarding_questionnaire");
    expect(r.primaryCta?.href).toBe("/onboarding/tok123");
  });

  it("consents → onboarding_consents", () => {
    const r = computeNextStep(
      input({
        purchase: coaching,
        onboarding: { step: "consents", tier: "coaching" },
        onboardingToken: "tok123",
      })
    );
    expect(r.state).toBe("onboarding_consents");
    expect(r.blocked).toBe(true);
  });

  it("form_done → onboarding_rdv (réserver le 1er RDV)", () => {
    const r = computeNextStep(
      input({
        purchase: coaching,
        onboarding: { step: "form_done", tier: "coaching" },
        onboardingToken: "tok123",
      })
    );
    expect(r.state).toBe("onboarding_rdv");
    expect(r.reason).toContain("RDV");
  });

  it("rdv_booked → active, CTA /exos", () => {
    const r = computeNextStep(
      input({
        purchase: coaching,
        onboarding: { step: "rdv_booked", tier: "coaching" },
      })
    );
    expect(r.state).toBe("active");
    expect(r.blocked).toBe(false);
    expect(r.primaryCta?.href).toBe("/exos");
  });
});

describe("computeNextStep — communauté", () => {
  const communaute = { status: "active" as const, tier: "communaute" as const };

  it("link_sent → questionnaire (~2 min, infos)", () => {
    const r = computeNextStep(
      input({
        purchase: communaute,
        onboarding: { step: "link_sent", tier: "communaute" },
        onboardingToken: "tokC",
      })
    );
    expect(r.state).toBe("onboarding_questionnaire");
    expect(r.body).toContain("infos");
    expect(r.primaryCta?.href).toBe("/onboarding/tokC");
  });

  it("community_ready → active, CTA /compte", () => {
    const r = computeNextStep(
      input({
        purchase: communaute,
        onboarding: { step: "community_ready", tier: "communaute" },
      })
    );
    expect(r.state).toBe("active");
    expect(r.blocked).toBe(false);
    expect(r.primaryCta?.href).toBe("/compte");
  });
});

describe("computeNextStep — past_due (overlay paiement en retard)", () => {
  it("onboardé + past_due → active mais paymentLate + remedy carte EN TÊTE", () => {
    const r = computeNextStep(
      input({
        purchase: { status: "past_due", tier: "coaching" },
        onboarding: { step: "rdv_booked", tier: "coaching" },
      })
    );
    expect(r.state).toBe("active");
    expect(r.blocked).toBe(false); // accès conservé
    expect(r.paymentLate).toBe(true);
    expect(r.reason).toContain("carte");
    expect(r.remedy[0]?.href).toBe("/compte"); // carte en 1er
  });

  it("past_due pendant l'onboarding → état onboarding + paymentLate", () => {
    const r = computeNextStep(
      input({
        purchase: { status: "past_due", tier: "coaching" },
        onboarding: { step: "link_sent", tier: "coaching" },
        onboardingToken: "tok123",
      })
    );
    expect(r.state).toBe("onboarding_questionnaire");
    expect(r.paymentLate).toBe(true);
    // le CTA onboarding reste accessible (remedy contient carte + reprendre)
    expect(r.remedy.some((x) => x.href === "/onboarding/tok123")).toBe(true);
  });
});

describe("computeNextStep — invariants", () => {
  it("tout état a un titre ET un primaryCta (jamais de cul-de-sac)", () => {
    const scenarios: JourneyInput[] = [
      input({ authed: false }),
      input({ isAdmin: true }),
      input({ purchase: null }),
      input({ purchase: { status: "canceled", tier: "coaching" } }),
      input({ purchase: { status: "active", tier: "coaching" } }),
      input({
        purchase: { status: "active", tier: "coaching" },
        onboarding: { step: "link_sent", tier: "coaching" },
      }),
      input({
        purchase: { status: "active", tier: "communaute" },
        onboarding: { step: "community_ready", tier: "communaute" },
      }),
    ];
    for (const s of scenarios) {
      const r = computeNextStep(s);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.primaryCta, JSON.stringify(s)).not.toBeNull();
      expect(r.primaryCta?.href.length).toBeGreaterThan(0);
    }
  });

  it("tout état bloqué fournit une raison ET au moins un remedy (pourquoi + comment)", () => {
    const blocked: JourneyInput[] = [
      input({ authed: false }),
      input({ purchase: null }),
      input({ purchase: { status: "canceled", tier: "communaute" } }),
      input({ purchase: { status: "active", tier: "coaching" } }), // awaiting
    ];
    for (const s of blocked) {
      const r = computeNextStep(s);
      expect(r.blocked).toBe(true);
      expect(r.reason, JSON.stringify(s)).toBeTruthy();
      expect(r.remedy.length, JSON.stringify(s)).toBeGreaterThanOrEqual(1);
    }
  });
});
