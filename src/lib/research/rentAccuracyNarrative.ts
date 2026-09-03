import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";

/**
 * Built 2026-09-03 per the owner's explicit policy decision (incident
 * GRR-MTKIHYO2): "If an input the buyer put in is used for the number, use
 * it for the number but provide evidence from the search of how accurate
 * that number is and give a detailed explanation as to why it is accurate
 * or not, based on evidence found."
 *
 * confidenceGate.ts no longer holds a job for review just because a buyer
 * rated their own rent estimate below "high" — but the buyer (and the
 * report's reader) still deserves an honest, evidence-based read on whether
 * that self-reported number looks right. This is that read: a short,
 * plain-language paragraph built ENTIRELY from rentResearch's own returned
 * fields (comps, low/base/high, confidence, confidenceNote) — never a
 * separate LLM call, and never text invented for the occasion. If research
 * genuinely found nothing, this says so plainly rather than fabricating
 * supporting comps — see the "no usable range" branch below.
 *
 * Only meaningful when the buyer supplied their own rent number
 * (rentSource === "customer" in buildEngineInputs.ts) — processSubmission.ts
 * only calls this in that case. When research itself already produced the
 * number (rentSource === "research"), the existing rentConfidenceLabel /
 * confidenceNote already say what research thinks of its own figure, so a
 * second "does research agree with itself" paragraph would be redundant.
 */
export function buildRentAccuracyNarrative(buyerMonthlyRent: number, rentResearch: RentResearchOutcome): string {
  if (rentResearch.status !== "ok") {
    // Research genuinely didn't run or errored (Path B territory in most
    // cases, but this function is also defensively safe to call regardless
    // of that classification) — say so plainly rather than implying comps
    // were checked when they weren't.
    return `Research could not independently verify this figure this session (research service unavailable or not configured); the underwriting relies on the buyer's own reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo.`;
  }

  const { low, base, high, confidence, confidenceNote, comps } = rentResearch.result;
  const hasRange = low !== null && high !== null;

  if (!hasRange && comps.length === 0) {
    // A genuine data gap on the research side — never invent a supporting
    // range or comps that were never found.
    return `Research could not independently verify this figure — no usable comparable rental listings were found (confidence: ${confidence}${confidenceNote ? `; ${confidenceNote}` : ""}). The underwriting relies on the buyer's own reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo; this has not been corroborated by live comps.`;
  }

  const rangeText = hasRange ? `$${low!.toLocaleString()}-$${high!.toLocaleString()}/mo` : null;
  const compCountText = comps.length > 0 ? `${comps.length} comparable listing${comps.length === 1 ? "" : "s"}` : "comparable listings";

  const withinRange = hasRange && buyerMonthlyRent >= low! && buyerMonthlyRent <= high!;
  const nearRange = hasRange && !withinRange && (buyerMonthlyRent < low! ? low! - buyerMonthlyRent : buyerMonthlyRent - high!) <= 0.1 * (base ?? buyerMonthlyRent);

  if (withinRange) {
    return `Research found ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), which supports the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo — the buyer's figure falls within the researched range.${confidenceNote ? ` ${confidenceNote}` : ""}`;
  }

  if (nearRange) {
    return `Research found ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), which is close to but not exactly within the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo — reasonably close, but worth a second look before relying on it fully.${confidenceNote ? ` ${confidenceNote}` : ""}`;
  }

  if (hasRange) {
    const direction = buyerMonthlyRent < low! ? "below" : "above";
    return `Research found ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), which is notably ${direction} the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo — this is a meaningful discrepancy the buyer should reconcile (e.g. against the lease, unit condition, or amenities) before relying on their own figure for this deal.${confidenceNote ? ` ${confidenceNote}` : ""}`;
  }

  // Comps exist but low/high didn't come back — fall back to whatever
  // research actually said without inventing a range.
  return `Research found ${compCountText} but did not return a clear rent range to compare directly against the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo (confidence: ${confidence}).${confidenceNote ? ` ${confidenceNote}` : ""}`;
}
