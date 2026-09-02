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
