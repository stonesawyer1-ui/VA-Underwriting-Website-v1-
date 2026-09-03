import { describe, it, expect } from "vitest";
import { buildRentAccuracyNarrative } from "./rentAccuracyNarrative";
import type { RentResearchOutcome, RentEstimate } from "./researchRentEstimate";

function okRentResearch(overrides: Partial<RentEstimate> = {}): RentResearchOutcome {
  return {
    status: "ok",
    cached: false,
    result: {
      low: 2100,
      base: 2250,
      high: 2450,
      confidence: "high",
      confidenceNote: "3 close active comps found within 1 mile.",
      comps: [{ address: "123 Main St", rent: 2300, beds: 3, baths: 2, sqft: 1400, source: "Zillow" }],
      researchedAt: new Date().toISOString(),
      ...overrides,
    },
  };
}

describe("buildRentAccuracyNarrative", () => {
  it("supports the buyer's number when it falls within the researched range", () => {
    const text = buildRentAccuracyNarrative(2300, okRentResearch());
    expect(text).toContain("2,300");
    expect(text.toLowerCase()).toContain("supporting");
    expect(text).toContain("2,100");
    expect(text).toContain("2,450");
  });

  it("flags a discrepancy when the buyer's number is well outside the researched range", () => {
    const text = buildRentAccuracyNarrative(3500, okRentResearch());
    expect(text.toLowerCase()).toContain("discrepancy");
    expect(text.toLowerCase()).toContain("above");
  });

  it("does not fabricate comps when research genuinely found nothing (the real incident case)", () => {
    const noComps: RentResearchOutcome = {
      status: "ok",
      cached: false,
      result: {
        low: null,
        base: null,
        high: null,
        confidence: "low",
        confidenceNote: "Hit a tool usage limit before any comps could be found.",
        comps: [],
        researchedAt: new Date().toISOString(),
      },
    };
    const text = buildRentAccuracyNarrative(2300, noComps);
    expect(text.toLowerCase()).toContain("not available");
    expect(text).not.toMatch(/\$\d,\d{3}-\$\d,\d{3}/); // never invents a range
    expect(text).toContain("2,300");
  });

  it("says research was unavailable, honestly, when the research call itself failed — no explanation of why", () => {
    const text = buildRentAccuracyNarrative(2300, { status: "error", message: "boom" });
    expect(text.toLowerCase()).toContain("could not be independently verified");
    expect(text).toContain("2,300");
  });

  it("says research was unavailable when not configured — no explanation of why", () => {
    const text = buildRentAccuracyNarrative(2300, { status: "not_configured" });
    expect(text.toLowerCase()).toContain("could not be independently verified");
  });

  it("never claims corroboration it doesn't have — a genuinely empty research result never says 'supports'", () => {
    const noComps: RentResearchOutcome = {
      status: "ok",
      cached: false,
      result: {
        low: null,
        base: null,
        high: null,
        confidence: "low",
        confidenceNote: "No usable comps found after a full-radius search.",
        comps: [],
        researchedAt: new Date().toISOString(),
      },
    };
    const text = buildRentAccuracyNarrative(2300, noComps);
    expect(text.toLowerCase()).not.toContain("supports");
  });

  it("never narrates the research process itself — no mention of sessions, tools, or search mechanics in any branch, even when confidenceNote is process-flavored (owner feedback, 2026-09-03)", () => {
    const processFlavoredNote = "A web-search capacity limit was hit before comps could be gathered this session.";
    const scenarios: RentResearchOutcome[] = [
      { status: "error", message: "boom" },
      { status: "not_configured" },
      {
        status: "ok",
        cached: false,
        result: { low: null, base: null, high: null, confidence: "low", confidenceNote: processFlavoredNote, comps: [], researchedAt: new Date().toISOString() },
      },
      okRentResearch({ confidenceNote: processFlavoredNote }),
    ];
    for (const scenario of scenarios) {
      const text = buildRentAccuracyNarrative(2300, scenario);
      expect(text.toLowerCase()).not.toContain("session");
      expect(text.toLowerCase()).not.toContain("capacity");
      expect(text.toLowerCase()).not.toContain("tool");
      expect(text).not.toContain(processFlavoredNote);
    }
  });
});
