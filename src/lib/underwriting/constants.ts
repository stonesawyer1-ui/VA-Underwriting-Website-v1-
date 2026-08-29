import type {
  AssessmentRatioFields,
  FallbackFields,
  FlatRateFields,
  HomesteadExemptionFields,
  StateModelId,
} from "./types";

/**
 * Illustrative default baseline county conforming loan limit. Always
 * editable in the form — this is a starting point, not a live FHFA/VA
 * lookup.
 */
export const DEFAULT_COUNTY_LOAN_LIMIT = 806_500;

export const RENT_RANGE_BY_CONFIDENCE: Record<"low" | "moderate" | "high", number> = {
  high: 0.05,
  moderate: 0.1,
  low: 0.15,
};

export const CASH_FLOW_BREAKEVEN_TOLERANCE = 25;

export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export const STATE_MODEL_MAP: Record<string, StateModelId> = {
  SC: "assessment_ratio",
  TX: "homestead_exemption",
  NC: "flat_rate",
};

export function getStateModelId(state: string): StateModelId {
  return STATE_MODEL_MAP[state] ?? "fallback";
}

/** Unconfirmed example defaults — every field here must be visibly flagged as an estimate until the customer overrides it. */
export const DEFAULT_ASSESSMENT_RATIO_FIELDS: AssessmentRatioFields = {
  totalMillageRate: 250,
  schoolOperatingMillage: 120,
  schoolBondMillage: 20,
  ownerAssessmentRatioPct: 4,
  investorAssessmentRatioPct: 6,
};

export const DEFAULT_HOMESTEAD_EXEMPTION_FIELDS: HomesteadExemptionFields = {
  cityRatePct: 0.55,
  schoolIsdRatePct: 1.0,
  countyRatePct: 0.4,
  schoolHomesteadExemption: 140_000,
};

export const DEFAULT_FLAT_RATE_FIELDS: FlatRateFields = {
  combinedTaxRatePct: 1.0,
};

export const DEFAULT_FALLBACK_FIELDS: FallbackFields = {
  estimatedEffectiveTaxRatePct: 1.1,
};

export const DEFAULT_INSURANCE_MONTHLY_ESTIMATE = 150;
