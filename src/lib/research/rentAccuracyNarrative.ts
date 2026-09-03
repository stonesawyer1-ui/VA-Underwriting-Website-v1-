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
 *
 * Tone rule (added 2026-09-03, owner feedback): this text goes in front of a
 * paying customer, so it states the FINDING, never the research process's
 * own play-by-play. Concretely: never explain *why* a search came back
 * empty or degraded (a session limit, an unavailable source, "did not
 * return usable results this session," etc.) — that's internal mechanics,
 * not evidence about the property, and it reads as an apology/excuse rather
 * than a professional finding. Every branch below states only (a) whether
 * independent data was found and (b) what it shows, full stop. This also
 * means `confidenceNote` — free-text the research model writes about its
 * OWN process — is deliberately never concatenated into this narrative
 * (sanitizeReportText.ts still filters it separately for the fields that
 * do use it, but the real fix here is not passing it through at all).
 */
export function buildRentAccuracyNarrative(buyerMonthlyRent: number, rentResearch: RentResearchOutcome): string {
  if (rentResearch.status !== "ok") {
    // Research didn't produce a result. State the fact, not the cause.
    return `This figure could not be independently verified against market data. The underwriting relies on the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo.`;
  }

  const { low, base, high, confidence, comps } = rentResearch.result;
  const hasRange = low !== null && high !== null;

  if (!hasRange && comps.length === 0) {
    // A genuine data gap on the research side — never invent a supporting
    // range or comps that were never found, and never narrate the reason
    // no comps came back.
    return `Independent comparable-rental data was not available for this property. The underwriting relies on the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo, which has not been corroborated by market data.`;
  }

  const rangeText = hasRange ? `$${low!.toLocaleString()}-$${high!.toLocaleString()}/mo` : null;
  const compCountText = comps.length > 0 ? `${comps.length} comparable listing${comps.length === 1 ? "" : "s"}` : "comparable listings";

  const withinRange = hasRange && buyerMonthlyRent >= low! && buyerMonthlyRent <= high!;
  const nearRange = hasRange && !withinRange && (buyerMonthlyRent < low! ? low! - buyerMonthlyRent : buyerMonthlyRent - high!) <= 0.1 * (base ?? buyerMonthlyRent);

  if (withinRange) {
    return `Market research identified ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), supporting the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo.`;
  }

  if (nearRange) {
    return `Market research identified ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), placing the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo close to, but outside, the researched range.`;
  }

  if (hasRange) {
    const direction = buyerMonthlyRent < low! ? "below" : "above";
    return `Market research identified ${compCountText}${rangeText ? ` ranging ${rangeText}` : ""} (confidence: ${confidence}), notably ${direction} the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo. This discrepancy should be reconciled against the lease, unit condition, or amenities before relying on the buyer's figure for this deal.`;
  }

  // Comps exist but low/high didn't come back — state what was found
  // without inventing a range.
  return `Market research identified ${compCountText} but did not produce a comparable rent range for the buyer's reported estimate of $${buyerMonthlyRent.toLocaleString()}/mo (confidence: ${confidence}).`;
}
