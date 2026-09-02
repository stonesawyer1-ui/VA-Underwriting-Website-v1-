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

describe("evaluateConfidenceGate — 90% (high-only) bar", () => {
  it("passes when rent research is high confidence", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("high"), "high", "research_estimate", "research");
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("no longer passes on moderate rent-research confidence (the old ~80% bar)", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("moderate"), "high", "research_estimate", "research");
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("fails on low rent-research confidence", () => {
    const result = evaluateConfidenceGate(okResearch, rentResearchWith("low"), "high", "research_estimate", "research");
    expect(result.passed).toBe(false);
  });

  it("requires high (not moderate) buyer-supplied rent confidence too", () => {
    const result = evaluateConfidenceGate(okResearch, { status: "not_configured" }, "moderate", "research_estimate", "customer");
    expect(result.passed).toBe(false);
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
