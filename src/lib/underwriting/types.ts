export type LoanStatus = "open" | "paid_off" | "sold";

export type PriorVaLoan = {
  id: string;
  nickname: string;
  /** number | "" so the field can be cleared and retyped naturally — see hoaMonthly below for the pattern this follows. Coerced to 0 wherever it's actually consumed downstream. */
  originalLoanAmount: number | "";
  status: LoanStatus;
};

export type PropertyType = "single_family" | "single_family_adu" | "duplex" | "triplex" | "fourplex" | "condo";
export type OwnershipStatus = "evaluating_purchase" | "already_owned";

export type UnitBedBath = {
  beds: number | "";
  baths: number | "";
};

export type RentConfidence = "low" | "moderate" | "high";

export type StateModelId = "assessment_ratio" | "homestead_exemption" | "flat_rate" | "fallback";

// All fields below are number | "" so each can be cleared and retyped
// naturally instead of snapping back to 0 on every keystroke (the
// hoaMonthly pattern, see below). Coerced to 0 wherever actually consumed
// downstream (buildEngineInputs.ts, calculations.ts).
export type AssessmentRatioFields = {
  totalMillageRate: number | "";
  schoolOperatingMillage: number | "";
  schoolBondMillage: number | "";
  ownerAssessmentRatioPct: number | "";
  investorAssessmentRatioPct: number | "";
};

export type HomesteadExemptionFields = {
  cityRatePct: number | "";
  schoolIsdRatePct: number | "";
  countyRatePct: number | "";
  schoolHomesteadExemption: number | "";
};

export type FlatRateFields = {
  combinedTaxRatePct: number | "";
};

export type FallbackFields = {
  estimatedEffectiveTaxRatePct: number | "";
};

export type UnderwritingFormData = {
  customer: {
    name: string;
    email: string;
    phone: string;
    dutyStation: string;
    targetPcsDate: string;
    vaDisabilityRating: boolean;
  };
  priorVaLoans: PriorVaLoan[];
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    county: string;
    propertyType: PropertyType;
    beds: number | "";
    baths: number | "";
    /** Per-unit bed/bath breakdown for duplex/triplex/fourplex — optional, one entry per unit. Purely descriptive: it feeds the PDF's property line and gives research a per-unit-type target for rent comps, but the cash-flow engine still uses one blended monthly rent, unaffected by this. */
    units: UnitBedBath[];
    sqft: number | "";
    yearBuilt: number | "";
    purchasePrice: number | "";
    ownershipStatus: OwnershipStatus;
  };
  financing: {
    interestRate: number | "";
    loanTermYears: number;
    /**
     * number | "" so the field can be cleared and retyped naturally — the
     * onChange handler used to snap "" back to 0 on every keystroke, which
     * made it feel stuck at 0 (caught 2026-09-01 for hoaMonthly, same fix
     * applied here and to every other field below carrying this comment).
     * Coerced to 0 wherever it's actually consumed downstream.
     */
    downPayment: number | "";
    hoaMonthly: number | "";
    countyLoanLimit: number | "";
    countyLoanLimitOverridden: boolean;
  };
  tax: {
    assessmentRatio: AssessmentRatioFields;
    assessmentRatioTouched: Partial<Record<keyof AssessmentRatioFields, boolean>>;
    homesteadExemption: HomesteadExemptionFields;
    homesteadExemptionTouched: Partial<Record<keyof HomesteadExemptionFields, boolean>>;
    flatRate: FlatRateFields;
    flatRateTouched: Partial<Record<keyof FlatRateFields, boolean>>;
    fallback: FallbackFields;
  };
  // See the number | "" comment on financing.downPayment above — same
  // clear-and-retype fix applied to every numeric field below.
  rentalIncomeForNextLoan: {
    currentRent: number | "";
    hasSignedLease: boolean;
    currentMortgagePayment: number | "";
    householdMonthlyIncome: number | "";
    otherMonthlyDebts: number | "";
  };
  occupancy: {
    moveInDate: string;
    moveOutDate: string;
  };
  expenses: {
    hasInsuranceQuote: boolean;
    insuranceAnnual: number | "";
    selfManaged: boolean;
    knownCapitalNeeds: string;
    vacancyPct: number | "";
    reservePct: number | "";
  };
  rentEstimate: {
    monthlyRent: number | "";
    confidence: RentConfidence;
  };
  tier: "recon" | "sentry";
};
