import {
  DEFAULT_ASSESSMENT_RATIO_FIELDS,
  DEFAULT_COUNTY_LOAN_LIMIT,
  DEFAULT_FALLBACK_FIELDS,
  DEFAULT_FLAT_RATE_FIELDS,
  DEFAULT_HOMESTEAD_EXEMPTION_FIELDS,
  DEFAULT_INSURANCE_MONTHLY_ESTIMATE,
} from "./constants";
import type { UnderwritingFormData } from "./types";

export function createDefaultFormData(initialTier?: UnderwritingFormData["tier"]): UnderwritingFormData {
  return {
    customer: {
      name: "",
      email: "",
      phone: "",
      dutyStation: "",
      targetPcsDate: "",
      vaDisabilityRating: false,
    },
    priorVaLoans: [],
    property: {
      address: "",
      city: "",
      state: "",
      zip: "",
      county: "",
      propertyType: "single_family",
      beds: "",
      baths: "",
      sqft: "",
      yearBuilt: "",
      purchasePrice: "",
      ownershipStatus: "evaluating_purchase",
    },
    financing: {
      interestRate: "",
      loanTermYears: 30,
      downPayment: 0,
      hoaMonthly: 0,
      countyLoanLimit: DEFAULT_COUNTY_LOAN_LIMIT,
      countyLoanLimitOverridden: false,
    },
    tax: {
      assessmentRatio: { ...DEFAULT_ASSESSMENT_RATIO_FIELDS },
      assessmentRatioTouched: {},
      homesteadExemption: { ...DEFAULT_HOMESTEAD_EXEMPTION_FIELDS },
      homesteadExemptionTouched: {},
      flatRate: { ...DEFAULT_FLAT_RATE_FIELDS },
      flatRateTouched: {},
      fallback: { ...DEFAULT_FALLBACK_FIELDS },
    },
    rentalIncomeForNextLoan: {
      currentRent: 0,
      hasSignedLease: false,
      currentMortgagePayment: 0,
      householdMonthlyIncome: 0,
      otherMonthlyDebts: 0,
    },
    occupancy: {
      moveInDate: "",
      moveOutDate: "",
    },
    expenses: {
      hasInsuranceQuote: false,
      insuranceAnnual: DEFAULT_INSURANCE_MONTHLY_ESTIMATE * 12,
      selfManaged: true,
      knownCapitalNeeds: "",
      vacancyPct: 5,
      reservePct: 5,
    },
    rentEstimate: {
      monthlyRent: "",
      confidence: "moderate",
    },
    tier: initialTier ?? "sentry",
  };
}
