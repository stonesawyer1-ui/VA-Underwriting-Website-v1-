import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";
import type { InsuranceSource, RentSource } from "@/lib/pipeline/buildEngineInputs";

export type ConfidenceGateResult = {
  /** True only when every material number clears the 90% confidence bar (customer-supplied or sourced research) — otherwise this holds for manual review rather than auto-sending. */
  passed: boolean;
  reasons: string[];
  /**
   * Which research call(s) actually failed the gate this round AND could
   * plausibly be improved by another, broadened attempt — added 2026-09-02,
   * tightened 2026-09-03. These two flags now do double duty: they still
   * tell processSubmission's targeted retry which call(s) to broaden, but
   * they're ALSO the sole signal of whether ANOTHER ROUND IS WORTH RUNNING
   * AT ALL. A failing reason that is structurally unfixable by research (a
   * buyer-input gap, or a placeholder fallback with no data source left to
   * query) never sets its corresponding flag, specifically so
   * processSubmission holds for review on round 1 instead of burning all of
   * MAX_CONFIDENCE_ROUNDS retrying something a broader search can never
   * change (the real incident that prompted this: GRR-MTKIHYO2, 2026-09-03
   * — see the reasoning inline on each branch below for why it is or isn't
   * retryable).
   *
   * `needsPropertyRefinement` maps to the insurance check (researchProperty's
   * domain); `needsRentRefinement` maps to the rent checks
   * (researchRentEstimate's domain).
   */
  needsPropertyRefinement: boolean;
  /**
   * True only when broadening researchRentEstimate could plausibly change
   * the outcome — never true for a buyer-supplied rent number (there is no
   * research call backing that number at all — see the "customer" branch
   * below, which as of 2026-09-03 is no longer even a gate finding).
   */
  needsRentRefinement: boolean;
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
  // Deliberately unused as of 2026-09-03 — see the "customer" branch's
  // comment below for why a buyer's self-rated rent confidence is no longer
  // a gate finding. Kept in the signature so every call site doesn't need
  // updating for what's now a deliberately-unused input, and so a future
  // reviewer can see exactly what was dropped rather than wondering why the
  // signature doesn't match the buyer-facing field it's named after.
  _customerRentConfidence: "low" | "moderate" | "high",
  insuranceSource: InsuranceSource,
  rentSource: RentSource,
): ConfidenceGateResult {
  const reasons: string[] = [];
  const needsPropertyRefinement = false;
  let needsRentRefinement = false;

  // A research-backed market-rate estimate is accepted on its own — only a
  // bare, no-data-at-all placeholder holds for review. Per buildEngineInputs
  // .ts's resolveYearlyInsurance, "default_estimate" is reachable ONLY when
  // the purchase price itself is missing (customer quote absent, research
  // estimate absent or empty, AND the price-scaled regional-average fallback
  // also has no price to scale from). That's a buyer-input gap — the buyer
  // never entered a purchase price — not a research shortfall. No amount of
  // re-running researchProperty can conjure a purchase price the buyer never
  // gave, so this does NOT set needsPropertyRefinement: retrying here would
  // just burn MAX_CONFIDENCE_ROUNDS reproducing the identical placeholder
  // every round before landing on the exact same hold. This is the "insurance
  // already fell back to a bare placeholder... retrying isn't going to
  // conjure a quote" case from the 2026-09-03 gate audit.
  if (insuranceSource === "default_estimate") {
    reasons.push(
      "No insurance figure available from the buyer or research — the memo would use a generic placeholder rather than a market-rate estimate.",
    );
  }

  // A regional-average estimate is an intentional, disclosed fallback (tied
  // to this property's own purchase price) for when neither the buyer nor
  // research can supply a number — it's accepted on its own so a data gap
  // never blocks the submission; only "unavailable" (research found nothing
  // usable AND there's no purchase price to fall back to a regional average
  // with either) still holds for review.
  //
  // Unlike the insurance placeholder above, this genuinely IS worth
  // retrying: resolveMonthlyRent() re-checks rentResearch fresh every round,
  // so if a broadened researchRentEstimate search turns up a usable
  // base/low/high this round, rentSource flips from "unavailable" to
  // "research" and this specific reason disappears on its own — even though
  // the missing-purchase-price half of the condition never changes. (Only
  // reachable here in the first place because rentResearch didn't already
  // error/not_configure — processSubmission treats that as Path B before
  // this gate ever runs — so there's a live research outcome to broaden.)
  if (rentSource === "unavailable") {
    reasons.push("No rent figure available from the buyer, research, or a regional estimate.");
    needsRentRefinement = true;
  } else if (rentSource === "research" && rentResearch.status === "ok") {
    if (rentResearch.result.confidence !== CONFIDENCE_PASS_BAR) {
      reasons.push(
        `Rent estimate is not backed by ${CONFIDENCE_PASS_BAR}-confidence comps from research (rated "${rentResearch.result.confidence}": ${rentResearch.result.confidenceNote}).`,
      );
      needsRentRefinement = true;
    }
  }
  // rentSource === "customer": deliberately NOT a gate finding at all (as of
  // 2026-09-03, incident GRR-MTKIHYO2). The owner's explicit call: when the
  // buyer supplies their own rent number, it is used for the math regardless
  // of how the buyer rated their own confidence in it — "moderate" or "low"
  // buyer self-rating is not something any amount of re-running research can
  // fix (it was never a research finding to begin with), so it must never
  // hold a job for review or burn a confidence-refinement round. Research
  // still runs (see processSubmission.ts — rentResearch is never skipped
  // just because the buyer supplied their own number) and its findings are
  // surfaced to the buyer as evidence via rentAccuracyNarrative.ts, not as a
  // pass/fail gate. See the note on the (now-unused, `_`-prefixed) rent
  // confidence parameter above for why it's kept rather than removed.

  return { passed: reasons.length === 0, reasons, needsPropertyRefinement, needsRentRefinement };
}
