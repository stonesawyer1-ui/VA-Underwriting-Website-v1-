import { describe, it, expect } from "vitest";
import { lookupTaxRate } from "./taxRateDatabase";

/**
 * Coverage for the completeness guard added 2026-09-02 alongside the
 * NC/SC/TX tax-rate-database entries: an entry missing a value for a field
 * its own taxModel actually requires must never be returned by
 * lookupTaxRate — it should behave exactly like a cache miss (fall through
 * to live research) rather than letting computeUnderwriting.ts silently
 * leave a workbook input cell unset (see isEntryComplete's own comment in
 * taxRateDatabase.ts for the concrete "near-$0 tax on a real customer
 * report" failure mode this prevents).
 */
describe("lookupTaxRate — completeness guard", () => {
  it("returns the NC entry: flat_rate with its one required field populated", () => {
    const entry = lookupTaxRate("NC", "28387");
    expect(entry).not.toBeNull();
    expect(entry?.taxModel).toBe("flat_rate");
    expect(entry?.taxFields.combinedTaxRatePct.value).toBe(0.29);
  });

  it("refuses the SC entry: assessment_ratio is missing totalMillageRate/schoolOperatingMillage/schoolBondMillage", () => {
    expect(lookupTaxRate("SC", "29401")).toBeNull();
  });

  it("refuses the TX entry: homestead_exemption is missing cityTaxRatePct/schoolIsdTaxRatePct/countyTaxRatePct", () => {
    expect(lookupTaxRate("TX", "77002")).toBeNull();
  });

  it("returns null for a ZIP with no entry at all (ordinary cache-miss path, unaffected by the guard)", () => {
    expect(lookupTaxRate("CA", "90001")).toBeNull();
  });
});

/**
 * Coverage for the 2026-09-03 expansion (military-installation-adjacent
 * counties, GRR follow-up task 3): every new entry that left its required
 * rate field(s) null must be refused by the completeness guard, exactly
 * like the existing SC/TX entries above — an incomplete entry is inert by
 * construction, never a source of an unverified number in a real report.
 */
describe("lookupTaxRate — 2026-09-03 military-installation entries", () => {
  it("refuses the new NC entries (Cumberland/Hoke) pending a verified combined rate", () => {
    expect(lookupTaxRate("NC", "28303")).toBeNull();
    expect(lookupTaxRate("NC", "28376")).toBeNull();
  });

  it("refuses the new TX entries (Bell/Coryell/El Paso) pending verified city/ISD/county rates", () => {
    expect(lookupTaxRate("TX", "76542")).toBeNull();
    expect(lookupTaxRate("TX", "76522")).toBeNull();
    expect(lookupTaxRate("TX", "79924")).toBeNull();
  });

  it("refuses the new SC entry (Richland) pending a verified millage", () => {
    expect(lookupTaxRate("SC", "29209")).toBeNull();
  });

  it("refuses every new fallback-model entry pending a verified effective rate", () => {
    expect(lookupTaxRate("GA", "31907")).toBeNull();
    expect(lookupTaxRate("GA", "31313")).toBeNull();
    expect(lookupTaxRate("WA", "98499")).toBeNull();
    expect(lookupTaxRate("CO", "80911")).toBeNull();
    expect(lookupTaxRate("CA", "92057")).toBeNull();
    expect(lookupTaxRate("VA", "23452")).toBeNull();
    expect(lookupTaxRate("VA", "23502")).toBeNull();
    expect(lookupTaxRate("KY", "42240")).toBeNull();
    expect(lookupTaxRate("TN", "37042")).toBeNull();
  });
});
