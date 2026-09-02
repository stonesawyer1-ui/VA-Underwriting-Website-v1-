import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";
import type { InsuranceSource, RentSource } from "@/lib/pipeline/buildEngineInputs";

export type ConfidenceGateResult = {
  /** True only when every material number clears the 90% confidence bar (customer-supplied or sourced research) — otherwise this holds for manual review rather than auto-sending. */
  passed: boolean;
  reasons: string[];
};

/**
 * Confidence -> percentage mapping (2026-09-02 bar raise).
 *
 * Nothing in this codebase produces a numeric confidence score — every
 * signal that feeds the gate (research's own self-rating, the buyer's own
 * rating) is the categorical "low" | "moderate" | "high" scale defined in
 * researchRentEstimate.ts and the intake form. Rather than inventing a
 * numeric score with false precision, the owner's "raise the bar to 90%" is
 * applied as a mapping onto that existing scale:
 *   - "high"     ~= 90%+  (several close, well-matched comps/sources —
 *                  genuinely confident, not just "found something")
 *   - "moderate" ~= 60-75% (usable but compromised — wider radius, a
 *                  bed/bath mismatch, fewer comps, cross-referenced sources)
 *   - "low"      ~= <40%  (a real gap — comps/sources not found even after
 *                  a genuine multi-platform, full-radius search)
 * A 90% bar therefore means: only "high" passes. The gate previously
 * accepted "moderate" as well, which is why a submission with real but
 * imperfect comps (a wider radius, a one-bedroom mismatch) used to sail
 * through — that's a ~65% answer being treated as good enough, which is
 * exactly the gap the owner flagged. Under the new bar, that same submission
 * now fails the gate and goes through the confidence-seeking refinement loop
 * in processSubmission.ts instead of auto-sending on a "good enough" comp
 * set.
 */
const CONFIDENCE_PASS_BAR = "high" as const;

/**
 * Tax uses the same "never block on a missing number" rule as rent and
 * insurance: an unmapped/fallback tax model, or a field neither the buyer
 * nor research confirmed, still computes off the state's default rate
 * (constants.ts) rather than holding for a human to fill in.
 *
 * Note: research.status of "not_configured"/"error" is deliberately NOT
 * handled here — processSubmission.ts checks for that (isInfrastructureFault)
 * before this gate ever runs, and treats it as Path B (infra fault, retry
 * with backoff) rather than a confidence-gate finding. This function only
 * ever sees a research outcome that already succeeded, so it exclusively
 * answers "is the data we got good enough", which is the only thing a
 * confidence gate should be judging.
 */
export function evaluateConfidenceGate(
  research: ResearchOutcome,
  rentResearch: RentResearchOutcome,
  customerRentConfidence: "low" | "moderate" | "high",
  insuranceSource: InsuranceSource,
  rentSource: RentSource,
): ConfidenceGateResult {
  const reasons: string[] = [];

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
  } else if (rentSource === "customer" && customerRentConfidence !== CONFIDENCE_PASS_BAR) {
    reasons.push(`Rent estimate is not backed by at least ${CONFIDENCE_PASS_BAR} confidence from the buyer (rated "${customerRentConfidence}").`);
  } else if (rentSource === "research" && rentResearch.status === "ok") {
    if (rentResearch.result.confidence !== CONFIDENCE_PASS_BAR) {
      reasons.push(
        `Rent estimate is not backed by ${CONFIDENCE_PASS_BAR}-confidence comps from research (rated "${rentResearch.result.confidence}": ${rentResearch.result.confidenceNote}).`,
      );
    }
  }

  return { passed: reasons.length === 0, reasons };
}
