export type LoanStatus = "open" | "paid_off" | "sold";

export type PriorVaLoan = {
  id: string;
  nickname: string;
  originalLoanAmount: number;
  status: LoanStatus;
};

export type PropertyType = "single_family" | "duplex" | "triplex" | "fourplex" | "condo";
export type OwnershipStatus = "evaluating_purchase" | "already_owned";

export type UnitBedBath = {
  beds: number | "";
  baths: number | "";
};

export type RentConfidence = "low" | "moderate" | "high";

export type StateModelId = "assessment_ratio" | "homestead_exemption" | "flat_rate" | "fallback";

export type AssessmentRatioFields = {
  totalMillageRate: number;
  schoolOperatingMillage: number;
  schoolBondMillage: number;
  ownerAssessmentRatioPct: number;
  investorAssessmentRatioPct: number;
};

export type HomesteadExemptionFields = {
  cityRatePct: number;
  schoolIsdRatePct: number;
  countyRatePct: number;
  schoolHomesteadExemption: number;
};

export type FlatRateFields = {
  combinedTaxRatePct: number;
};

export type FallbackFields = {
  estimatedEffectiveTaxRatePct: number;
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
    downPayment: number;
    hoaMonthly: number;
    countyLoanLimit: number;
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
  rentalIncomeForNextLoan: {
    currentRent: number;
    hasSignedLease: boolean;
    currentMortgagePayment: number;
    householdMonthlyIncome: number;
    otherMonthlyDebts: number;
  };
  occupancy: {
    moveInDate: string;
    moveOutDate: string;
  };
  expenses: {
    hasInsuranceQuote: boolean;
    insuranceAnnual: number;
    selfManaged: boolean;
    knownCapitalNeeds: string;
    vacancyPct: number;
    reservePct: number;
  };
  rentEstimate: {
    monthlyRent: number | "";
    confidence: RentConfidence;
  };
  tier: "recon" | "sentry";
};
