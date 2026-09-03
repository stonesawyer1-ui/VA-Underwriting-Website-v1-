import { describe, it, expect } from "vitest";
import { resolveMonthlyRent } from "./buildEngineInputs";
import type { UnderwritingFormData, RentConfidence } from "@/lib/underwriting/types";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";

/** Minimal-but-complete UnderwritingFormData — only rentEstimate varies per test. */
function formDataWith(monthlyRent: number | "", confidence: RentConfidence): UnderwritingFormData {
  return {
    customer: {
      name: "Test Buyer",
      email: "buyer@example.com",
      phone: "",
      dutyStation: "",
      targetPcsDate: "",
      vaDisabilityRating: false,
    },
    priorVaLoans: [],
    property: {
      address: "123 Main St",
      city: "Anytown",
      state: "NC",
      zip: "28301",
      county: "Cumberland",
      propertyType: "single_family",
      hasAdu: false,
      beds: 3,
      baths: 2,
      units: [],
      sqft: 1500,
      yearBuilt: 2000,
      purchasePrice: 300000,
      ownershipStatus: "evaluating_purchase",
    },
    financing: {
      interestRate: 6.5,
      loanTermYears: 30,
      downPayment: 0,
      hoaMonthly: 0,
      countyLoanLimit: 0,
      countyLoanLimitOverridden: false,
    },
    tax: {
      assessmentRatio: {
        totalMillageRate: "",
        schoolOperatingMillage: "",
        schoolBondMillage: "",
        ownerAssessmentRatioPct: "",
        investorAssessmentRatioPct: "",
      },
      assessmentRatioTouched: {},
      homesteadExemption: {
        cityRatePct: "",
        schoolIsdRatePct: "",
        countyRatePct: "",
        schoolHomesteadExemption: "",
      },
      homesteadExemptionTouched: {},
      flatRate: { combinedTaxRatePct: "" },
      flatRateTouched: {},
      fallback: { estimatedEffectiveTaxRatePct: "" },
    },
    rentalIncomeForNextLoan: {
      currentRent: "",
      hasSignedLease: false,
      currentMortgagePayment: "",
      householdMonthlyIncome: "",
      otherMonthlyDebts: "",
    },
    occupancy: { moveInDate: "", moveOutDate: "" },
    expenses: {
      hasInsuranceQuote: false,
      insuranceAnnual: "",
      selfManaged: true,
      knownCapitalNeeds: "",
      vacancyPct: 5,
      reservePct: 5,
    },
    rentEstimate: { monthlyRent, confidence },
    tier: "recon",
  };
}

function rentResearchWith(monthly: number, confidence: "low" | "moderate" | "high"): RentResearchOutcome {
  return {
    status: "ok",
    cached: false,
    result: {
      low: monthly - 100,
      base: monthly,
      high: monthly + 100,
      confidence,
      confidenceNote: "test",
      comps: [],
      researchedAt: new Date().toISOString(),
    },
  };
}

const notConfigured: RentResearchOutcome = { status: "not_configured" };

describe("resolveMonthlyRent — buyer vs. research override (GRR-MTKIHYO2 follow-up)", () => {
  it("BUG SCENARIO: buyer='low', research='moderate' keeps the buyer's number (source stays 'customer', never gated)", () => {
    // Under the old rank-comparison rule, research's rank (2, moderate) beat
    // the buyer's rank (1, low), so the source flipped to "research" — but
    // "moderate" isn't "high", so that now-research-sourced number would
    // fail confidenceGate.ts and trigger a wasteful retry that a
    // buyer-sourced number (never gated at all) would never have hit. This
    // test fails on the old rank-comparison code and passes on the fix.
    const data = formDataWith(1500, "low");
    const research = rentResearchWith(1600, "moderate");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("customer");
    expect(result.monthly).toBe(1500);
  });

  it("buyer='low', research='high' switches to research (genuinely good enough to stand on its own)", () => {
    const data = formDataWith(1500, "low");
    const research = rentResearchWith(1600, "high");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("research");
    expect(result.monthly).toBe(1600);
  });

  it("buyer='moderate', research='high' switches to research", () => {
    const data = formDataWith(1500, "moderate");
    const research = rentResearchWith(1600, "high");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("research");
    expect(result.monthly).toBe(1600);
  });

  it("buyer='high', research='high' (tie) keeps the buyer's number", () => {
    const data = formDataWith(1500, "high");
    const research = rentResearchWith(1600, "high");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("customer");
    expect(result.monthly).toBe(1500);
  });

  it("buyer='high', research='moderate' keeps the buyer's number (research isn't high enough to override)", () => {
    const data = formDataWith(1500, "high");
    const research = rentResearchWith(1600, "moderate");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("customer");
    expect(result.monthly).toBe(1500);
  });

  it("buyer='moderate', research='low' keeps the buyer's number", () => {
    const data = formDataWith(1500, "moderate");
    const research = rentResearchWith(1600, "low");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("customer");
    expect(result.monthly).toBe(1500);
  });

  it("both estimates are still carried in `comparison` for report display regardless of which one wins", () => {
    const data = formDataWith(1500, "low");
    const research = rentResearchWith(1600, "moderate");
    const result = resolveMonthlyRent(data, research);
    expect(result.comparison.buyerEstimate).toEqual({ monthly: 1500, confidence: "low" });
    expect(result.comparison.researchEstimate?.monthly).toBe(1600);
    expect(result.comparison.researchEstimate?.confidence).toBe("moderate");
  });
});

describe("resolveMonthlyRent — single-source and no-data behavior (unaffected by the fix)", () => {
  it("uses the buyer's number when research has no usable result", () => {
    const data = formDataWith(1500, "low");
    const result = resolveMonthlyRent(data, notConfigured);
    expect(result.source).toBe("customer");
    expect(result.monthly).toBe(1500);
  });

  it("uses research's number when the buyer supplied none", () => {
    const data = formDataWith("", "low");
    const research = rentResearchWith(1600, "moderate");
    const result = resolveMonthlyRent(data, research);
    expect(result.source).toBe("research");
    expect(result.monthly).toBe(1600);
  });

  it("falls back to a regional average when neither buyer nor research has a number", () => {
    const data = formDataWith("", "low");
    const result = resolveMonthlyRent(data, notConfigured);
    expect(["regional_average", "unavailable"]).toContain(result.source);
  });
});
