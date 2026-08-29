import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";
import type { InsuranceSource, RentSource } from "@/lib/pipeline/buildEngineInputs";

export type ConfidenceGateResult = {
  /** True only when every material number is Confirmed (customer-supplied or sourced research) — otherwise this holds for manual review rather than auto-sending. */
  passed: boolean;
  reasons: string[];
};

/**
 * Tax uses the same "never block on a missing number" rule as rent and
 * insurance: an unmapped/fallback tax model, or a field neither the buyer
 * nor research confirmed, still computes off the state's default rate
 * (constants.ts) rather than holding for a human to fill in.
 */
export function evaluateConfidenceGate(
  research: ResearchOutcome,
  rentResearch: RentResearchOutcome,
  customerRentConfidence: "low" | "moderate" | "high",
  insuranceSource: InsuranceSource,
  rentSource: RentSource,
): ConfidenceGateResult {
  const reasons: string[] = [];

  if (research.status === "not_configured") {
    reasons.push("Property research is not configured (no ANTHROPIC_API_KEY) — tax rate and rent comps are unverified.");
    return { passed: false, reasons };
  }

  if (research.status === "error") {
    reasons.push(`Property research failed: ${research.message}`);
    return { passed: false, reasons };
  }

  // A research-backed market-rate estimate is accepted on its own — only a
  // bare, no-data-at-all placeholder (no buyer quote AND no research result)
  // holds for review.
  if (insuranceSource === "default_estimate") {
    reasons.push(
      "No insurance figure available from the buyer or research — the memo would use a generic placeholder rather than a market-rate estimate.",
    );
  }

  // A regional-average estimate is an intentional, disclosed fallback (tied
  // to this property's own purchase price) for when neither the buyer nor
  // research can supply a number — it's accepted on its own so a data gap
  // never blocks the submission; only "unavailable" (no purchase price to
  // even scale from) still holds for review.
  if (rentSource === "unavailable") {
    reasons.push("No rent figure available from the buyer, research, or a regional estimate.");
  } else if (rentSource === "customer" && customerRentConfidence !== "high" && customerRentConfidence !== "moderate") {
    reasons.push("Rent estimate is not backed by at least moderate confidence from the buyer.");
  } else if (rentSource === "research" && rentResearch.status === "ok") {
    if (rentResearch.result.confidence !== "high" && rentResearch.result.confidence !== "moderate") {
      reasons.push(
        `Rent estimate is not backed by at least moderate-confidence comps from research (rated "${rentResearch.result.confidence}": ${rentResearch.result.confidenceNote}).`,
      );
    }
  }

  return { passed: reasons.length === 0, reasons };
}
