import {
  DEFAULT_ASSESSMENT_RATIO_FIELDS,
  DEFAULT_COUNTY_LOAN_LIMIT,
  DEFAULT_FALLBACK_FIELDS,
  DEFAULT_FLAT_RATE_FIELDS,
  DEFAULT_HOMESTEAD_EXEMPTION_FIELDS,
  DEFAULT_INSURANCE_MONTHLY_ESTIMATE,
} from "./constants";
import type { PropertyType, UnderwritingFormData, UnitBedBath } from "./types";

/** How many per-unit bed/bath rows a multi-unit property type gets — single_family and condo get none, since there's only one unit. An ADU counts as a second unit (main house + the accessory unit), same treatment as a duplex. */
export function unitCountForPropertyType(type: PropertyType): number {
  switch (type) {
    case "single_family_adu":
    case "duplex":
      return 2;
    case "triplex":
      return 3;
    case "fourplex":
      return 4;
    default:
      return 0;
  }
}

/** Human-readable label for a property type — a plain underscore-replace reads fine for "single family" but not for "single family adu", since ADU is an acronym and should stay capitalized. */
export function propertyTypeLabel(type: PropertyType): string {
  switch (type) {
    case "single_family":
      return "single family";
    case "single_family_adu":
      return "single family + ADU";
    case "duplex":
      return "duplex";
    case "triplex":
      return "triplex";
    case "fourplex":
      return "fourplex";
    case "condo":
      return "condo";
  }
}

/** Resizes a units array to match a property type's unit count, preserving existing rows where possible instead of wiping user input on every keystroke-adjacent re-render. */
export function resizeUnitsForPropertyType(units: UnitBedBath[], type: PropertyType): UnitBedBath[] {
  const count = unitCountForPropertyType(type);
  if (count === 0) return [];
  const next = units.slice(0, count);
  while (next.length < count) next.push({ beds: "", baths: "" });
  return next;
}

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
      units: [],
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
