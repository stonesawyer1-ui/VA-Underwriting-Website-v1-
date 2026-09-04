import { describe, it, expect } from "vitest";
import { evaluateConfidenceGate } from "./confidenceGate";
import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";

const okResearch: ResearchOutcome = {
  status: "ok",
  cached: false,
  result: {
    taxModel: "flat_rate",
    taxFields: {},
    taxInsights: [],
    insuranceEstimate: { annualPremium: null, confidence: "Estimated", source: null, note: "" },
    propertyFacts: { sqft: null, beds: null, baths: null, yearBuilt: null, confidence: "unknown" },
    researchedAt: new Date().toISOString(),
    rawResponse: null,
  },
};

function rentResearchWith(confidence: "low" | "moderate" | "high"): RentResearchOutcome {
  return {
    status: "ok",
    cached: false,
    result: {
      low: 1000,
      base: 1200,
      high: 1400,
      confidence,
      confidenceNote: "test",
      comps: [],
      researchedAt: new Date().toISOString(),
    },
  };
}

describe("evaluateConfidenceGate — rent research: high and moderate pass, low still holds (2026-09-04 policy)", () => {
  it("passes when rent research is high confidence", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("high"), "high", "research_estimate", "research");
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("now passes on moderate rent-research confidence, as long as it ships with a disclosure note (2026-09-04 policy change, GRR-MTM4KYH7)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("moderate"), "high", "research_estimate", "research");
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("still fails on low rent-research confidence (a real data gap, unchanged by the 2026-09-04 policy change)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("low"), "high", "research_estimate", "research");
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("still sets needsRentRefinement on low rent-research confidence (still worth a broadened retry)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("low"), "high", "research_estimate", "research");
    expect(result.passed).toBe(false);
    expect(result.needsRentRefinement).toBe(true);
  });

  it("still fails on a bare default insurance estimate regardless of rent confidence", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("high"), "high", "default_estimate", "research");
    expect(result.passed).toBe(false);
  });

  it("still accepts a regional-average rent estimate on its own (never blocks on a data gap)", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "low", "research_estimate", "regional_average");
    expect(result.passed).toBe(true);
  });
});

describe("evaluateConfidenceGate — buyer-supplied rent (2026-09-03, GRR-MTKIHYO2 policy change)", () => {
  it("passes on a buyer-supplied rent number even when the buyer self-rated it 'moderate'", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "moderate", "research_estimate", "customer");
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("passes on a buyer-supplied rent number even when the buyer self-rated it 'low'", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "low", "research_estimate", "customer");
    expect(result.passed).toBe(true);
  });

  it("passes on a buyer-supplied rent number even when research's own comp search came back low confidence", () => {
    // The real incident (GRR-MTKIHYO2): research's rent-comp search failed
    // entirely and came back null/low, but the buyer supplied their own
    // number — the gate must not hold on either signal.
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("low"), "moderate", "research_estimate", "customer");
    expect(result.passed).toBe(true);
  });

  it("never sets needsRentRefinement for a buyer-supplied rent number (nothing for research to retry)", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "low", "research_estimate", "customer");
    expect(result.needsRentRefinement).toBe(false);
  });

  it("a buyer-supplied rent number doesn't mask an unrelated genuine finding (insurance placeholder)", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "low", "default_estimate", "customer");
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes("insurance"))).toBe(true);
  });
});

describe("evaluateConfidenceGate — retryability flags (2026-09-03 audit: which failures are worth burning a round on)", () => {
  it("a bare default insurance placeholder does NOT set needsPropertyRefinement (buyer-input gap, not fixable by research)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("high"), "high", "default_estimate", "research");
    expect(result.passed).toBe(false);
    expect(result.needsPropertyRefinement).toBe(false);
  });

  it("moderate research-sourced rent confidence no longer sets needsRentRefinement (2026-09-04: it's no longer a gate finding at all, so there's nothing to refine)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("moderate"), "high", "research_estimate", "research");
    expect(result.passed).toBe(true);
    expect(result.needsRentRefinement).toBe(false);
  });

  it("rentSource 'unavailable' sets needsRentRefinement (a successful broadened search would flip the source away from 'unavailable')", () => {
    const result = evaluateConfidenceGate(
      okResearch,
      { status: "ok", cached: false, result: { low: null, base: null, high: null, confidence: "low", confidenceNote: "no comps found", comps: [], researchedAt: new Date().toISOString() } },
      "high",
      "research_estimate",
      "unavailable",
    );
    expect(result.passed).toBe(false);
    expect(result.needsRentRefinement).toBe(true);
  });

  it("a genuine no-data-at-all rent gap (no buyer number, no usable research, no regional fallback) still holds — this change is scoped to buyer-supplied rent only", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "high", "research_estimate", "unavailable");
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes("no rent figure"))).toBe(true);
  });
});
