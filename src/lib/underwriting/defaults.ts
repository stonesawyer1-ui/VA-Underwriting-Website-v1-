import {
  DEFAULT_ASSESSMENT_RATIO_FIELDS,
  DEFAULT_COUNTY_LOAN_LIMIT,
  DEFAULT_FALLBACK_FIELDS,
  DEFAULT_FLAT_RATE_FIELDS,
  DEFAULT_HOMESTEAD_EXEMPTION_FIELDS,
  DEFAULT_INSURANCE_MONTHLY_ESTIMATE,
} from "./constants";
import type { PropertyType, UnderwritingFormData, UnitBedBath } from "./types";

/** How many genuinely separate rentable units a property type has on its own, before an ADU is factored in — single_family and condo are 1 (no breakdown needed on their own), duplex/triplex/fourplex are their obvious count. */
function baseUnitCount(type: PropertyType): number {
  switch (type) {
    case "duplex":
      return 2;
    case "triplex":
      return 3;
    case "fourplex":
      return 4;
    default:
      return 1;
  }
}

/**
 * How many per-unit bed/bath rows the property gets, given its type AND
 * whether it has an ADU — an ADU is an extra rentable unit that can sit on
 * ANY property type (a single-family home, a duplex, even a fourplex can
 * all have one), not just single-family, so this isn't baked into
 * PropertyType itself. Returns 0 (no breakdown row shown at all) only for
 * a plain single unit (single_family/condo with no ADU) — everything else
 * gets one row per rentable unit, main structure plus the ADU if present.
 */
export function unitCountForPropertyType(type: PropertyType, hasAdu: boolean): number {
  const total = baseUnitCount(type) + (hasAdu ? 1 : 0);
  return total > 1 ? total : 0;
}

/** Human-readable label for a property type — a plain underscore-replace reads fine for "single family" but not for "ADU", since it's an acronym and should stay capitalized. */
export function propertyTypeLabel(type: PropertyType, hasAdu: boolean): string {
  const base = (() => {
    switch (type) {
      case "single_family":
        return "single family";
      case "duplex":
        return "duplex";
      case "triplex":
        return "triplex";
      case "fourplex":
        return "fourplex";
      case "condo":
        return "condo";
    }
  })();
  return hasAdu ? `${base} + ADU` : base;
}

/** Resizes a units array to match a property's total rentable-unit count (base type plus ADU, if any), preserving existing rows where possible instead of wiping user input on every keystroke-adjacent re-render. */
export function resizeUnitsForPropertyType(units: UnitBedBath[], type: PropertyType, hasAdu: boolean): UnitBedBath[] {
  const count = unitCountForPropertyType(type, hasAdu);
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
      hasAdu: false,
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
