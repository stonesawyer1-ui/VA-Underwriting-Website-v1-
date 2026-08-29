import type { TaxModelId } from "@/lib/workbook/cellMap";

/**
 * Fixed statutory disclaimers per tax model — described, never calculated
 * into the underwriting numbers, matching how the reference risk memos
 * handle them. These are stable legal facts (not property-specific research
 * findings), so they're hardcoded here rather than left to a live research
 * call to remember to mention every time.
 */
export function getTaxDisclaimer(taxModel: TaxModelId, state: string): string | null {
  const upperState = state.trim().toUpperCase();

  if (taxModel === "assessment_ratio" && upperState === "SC") {
    return "South Carolina's Assessable Transfer of Interest (ATI) exemption can reduce the taxable-value increase triggered by a change in ownership by up to 25%, if the buyer applies for it. This memorandum does not calculate or assume any benefit from this exemption in the figures above; it's flagged here only as a factor that could soften the tax increase, and eligibility should be confirmed with the county Assessor.";
  }

  if (taxModel === "homestead_exemption" && upperState === "TX") {
    return 'Texas currently has a temporary 20% "circuit breaker" appraisal cap (Tax Code §23.231, from 2023\'s SB 2) that limits how much a non-homestead property\'s appraised value can rise in a single year, for properties valued under roughly $5.3 million. It applies automatically — no application needed — but only after the owner has held the property through a full prior tax year. This cap is currently set to expire after tax year 2026 unless the Texas Legislature and voters renew it. This memorandum does not calculate or assume any benefit from this cap in the figures above; it is flagged here only as a factor that could slow future tax growth on this property as a rental, and its status beyond 2026 should be verified with the county Appraisal District closer to the time.';
  }

  if (taxModel === "flat_rate" && upperState === "NC") {
    return "North Carolina's homestead property tax relief only applies to seniors (65+, income-qualified) or 100%-disabled veterans — it doesn't apply to a typical buyer converting a home to a rental, which is why owner-occupied and rental tax are the same figure above. If the buyer later obtains a 100% VA disability rating, the Disabled Veteran Exclusion (N.C.G.S. §105-277.1C) would exclude the first $45,000 of the home's appraised value from tax regardless of occupancy — described here as a future possibility, not calculated into the numbers above.";
  }

  return null;
}
