import taxRateData from "./taxRateDatabase.json";
import type { PropertyResearch, ResearchOutcome, ResearchedField, TaxInsight } from "./researchProperty";

export type TaxRateEntry = {
  county: string;
  taxModel: PropertyResearch["taxModel"];
  taxFields: Record<string, ResearchedField>;
  taxInsights: TaxInsight[];
  /** ISO date the rate was last verified against the county's own published schedule. */
  verifiedAt: string;
  /** URL or description of where the rate was verified — carried through so the memo can still cite a source. */
  source: string;
};

// County/municipal tax rates are republished on an annual cycle, not
// continuously — a year-old verified entry is still far more trustworthy
// than a fresh AI guess, but an entry older than this falls back to live
// research rather than risk shipping a rate the county has since changed.
const FRESHNESS_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeKey(state: string, zip: string): string {
  return `${state.trim().toUpperCase()}|${zip.trim()}`;
}

/**
 * Looks up a verified tax rate by state + ZIP, keyed on ZIP (rather than the
 * county name Claude would determine) because ZIP is known before any
 * research runs — that's what lets researchProperty() skip the Anthropic
 * call entirely on a hit instead of only saving part of the work.
 */
export function lookupTaxRate(state: string, zip: string): TaxRateEntry | null {
  const entries = (taxRateData as { entries: Record<string, TaxRateEntry> }).entries;
  const entry = entries[normalizeKey(state, zip)];
  if (!entry) return null;

  const verifiedAt = new Date(entry.verifiedAt).getTime();
  if (!Number.isFinite(verifiedAt)) return null;
  const age = Date.now() - verifiedAt;
  if (age < 0 || age > FRESHNESS_MS) return null;

  return entry;
}

/**
 * Wraps a database entry in the same ResearchOutcome shape researchProperty()
 * would have returned from a live call, so every downstream consumer
 * (resolveTaxInputs, the confidence gate, the PDF/workbook) works identically
 * regardless of which path supplied the tax data. Insurance and property
 * facts aren't part of what this database verifies, so they're left null —
 * resolveYearlyInsurance() already falls back to a regional-average estimate
 * when research doesn't supply a premium, and property facts come from the
 * customer's own form fields, not from research, everywhere they're used.
 */
export function taxRateEntryToResearchOutcome(entry: TaxRateEntry): ResearchOutcome {
  const result: PropertyResearch = {
    taxModel: entry.taxModel,
    taxFields: entry.taxFields,
    taxInsights: entry.taxInsights,
    insuranceEstimate: {
      annualPremium: null,
      confidence: "Estimated",
      source: null,
      note: "Not covered by the verified tax-rate database — falls back to a regional market-rate estimate.",
    },
    propertyFacts: { sqft: null, beds: null, baths: null, yearBuilt: null, confidence: "unknown" },
    researchedAt: new Date().toISOString(),
    rawResponse: { source: "tax-rate-database", county: entry.county, verifiedAt: entry.verifiedAt, verifiedSource: entry.source },
  };
  return { status: "ok", result, cached: true };
}
