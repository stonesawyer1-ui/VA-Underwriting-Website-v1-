import { renderToBuffer } from "@react-pdf/renderer";
import {
  sendUnderwritingReportToCustomer,
  sendHoldForReviewNotice,
  sendCustomerReviewDelayNotice,
  sendStillProcessingNotice,
} from "@/lib/email";
import { researchProperty } from "@/lib/research/researchProperty";
import { researchRentEstimate } from "@/lib/research/researchRentEstimate";
import { researchMemoNarrative } from "@/lib/research/researchMemoNarrative";
import { resolveTaxInputs, resolveYearlyInsurance, resolveMonthlyRent, buildEngineInputs } from "@/lib/pipeline/buildEngineInputs";
import { computeUnderwriting } from "@/lib/workbook/computeUnderwriting";
import { fillWorkbookXlsx } from "@/lib/workbook/fillWorkbookXlsx";
import { evaluateConfidenceGate } from "@/lib/confidenceGate";
import { getTaxDisclaimer } from "@/lib/underwriting/taxDisclaimers";
import { propertyTypeLabel } from "@/lib/underwriting/defaults";
import { UnderwritingReportDocument, type UnderwritingReportData } from "@/lib/pdf/UnderwritingReportDocument";
import { UnderwritingDetailDocument } from "@/lib/pdf/UnderwritingDetailDocument";
import { getStripeClient } from "@/lib/stripe";
import { saveJob, removePendingJob, isJobStoreConfigured, type ProcessingJob } from "@/lib/jobStore";
import { MAX_INFRA_ATTEMPTS, MAX_CONFIDENCE_ROUNDS } from "@/lib/pipeline/config";

/** e.g. " (Unit 1: 3bd/2ba, Unit 2: 2bd/1ba)" — blank unless at least one unit has a real value, so a duplex the buyer left blank still just shows the plain total bed/bath line. */
function unitBreakdownSuffix(units: { beds: number | ""; baths: number | "" }[]): string {
  const meaningful = units.filter((u) => u.beds !== "" || u.baths !== "");
  if (meaningful.length === 0) return "";
  const parts = units.map((u, i) => `Unit ${i + 1}: ${u.beds || "?"}bd/${u.baths || "?"}ba`);
  return ` (${parts.join(", ")})`;
}

/**
 * Charges one allowance slot against the entitlement snapshot carried on the
 * job — the same Stripe-metadata persistence the synchronous path always
 * used, just addressed by the job's own entitlement rather than a
 * request-scoped closure, since this now also runs from the background
 * retry sweep with no HTTP request in scope at all.
 */
async function chargeAllowanceForJob(job: ProcessingJob): Promise<void> {
  const stripe = getStripeClient();
  const newUsedCount = job.entitlement.used + 1;
  if (stripe && job.entitlement.stripeSessionId !== "demo") {
    try {
      await stripe.checkout.sessions.update(job.entitlement.stripeSessionId, {
        metadata: { used: String(newUsedCount) },
      });
    } catch (err) {
      console.error("[processSubmission] Failed to persist usage count to Stripe session", err);
    }
  }
  job.entitlement = { ...job.entitlement, used: newUsedCount };
}

export type ProcessSubmissionResult = "completed" | "held_for_review" | "needs_retry" | "needs_confidence_retry";

/**
 * The full research -> compute -> confidence gate -> PDFs -> delivery
 * pipeline, extracted unchanged from what used to be the intake route's
 * inline "Stage B" so both the first synchronous attempt and every
 * background retry call the exact same logic.
 *
 * Two independent retry-eligible outcomes, kept deliberately distinct end to
 * end (job fields, config constants, email copy, everything) so they can
 * never be conflated into one generic "didn't work" bucket:
 *
 * - "needs_retry" (Path B, infrastructure fault — Anthropic error, timeout,
 *   or ANTHROPIC_API_KEY not configured): the research service itself
 *   failed to answer at all. This is never a reflection of this property's
 *   real data, so it's never charged and never treated as a confidence
 *   finding — see runJobAttempt for the backoff-and-retry handling.
 *
 * - "needs_confidence_retry" (Path A, a genuine but not-yet-exhausted
 *   confidence-gate finding — research succeeded but didn't clear the 90%
 *   ("high") bar): rather than holding for review the moment the bar isn't
 *   cleared, the job gets more chances to actually raise its own
 *   confidence — broader search radius, alternate sources/phrasing (see
 *   researchRentEstimate.ts / researchProperty.ts's refinementRound) —
 *   before MAX_CONFIDENCE_ROUNDS is reached and it's accepted as a real
 *   data-quality gap rather than something more search effort would fix.
 *   Also never charged until that point, since charging happens exactly
 *   once, on a genuine terminal outcome (see chargeAllowanceForJob's call
 *   sites below).
 */
export async function processSubmission(job: ProcessingJob): Promise<ProcessSubmissionResult> {
  const { formData, referenceId } = job;
  const isCondo = formData.property.propertyType === "condo";
  // 0 on the very first pass; >0 once a prior round's gate failed without
  // being exhausted — see the "needs_confidence_retry" branch below and
  // runJobAttempt, which increments this on the job before the next attempt.
  const refinementRound = job.confidenceRounds ?? 0;

  const researchStartedAt = Date.now();
  const [research, rentResearch, narrative] = await Promise.all([
    researchProperty(
      formData.property.address,
      formData.property.city,
      formData.property.state,
      formData.property.zip,
      {
        sqft: typeof formData.property.sqft === "number" ? formData.property.sqft : undefined,
        beds: typeof formData.property.beds === "number" ? formData.property.beds : undefined,
        baths: typeof formData.property.baths === "number" ? formData.property.baths : undefined,
        yearBuilt: typeof formData.property.yearBuilt === "number" ? formData.property.yearBuilt : undefined,
      },
      { refinementRound },
    ),
    researchRentEstimate(
      formData.property.address,
      formData.property.city,
      formData.property.state,
      formData.property.zip,
      {
        sqft: typeof formData.property.sqft === "number" ? formData.property.sqft : undefined,
        beds: typeof formData.property.beds === "number" ? formData.property.beds : undefined,
        baths: typeof formData.property.baths === "number" ? formData.property.baths : undefined,
        units: formData.property.units.some((u) => u.beds !== "" || u.baths !== "")
          ? formData.property.units.map((u) => ({
              beds: typeof u.beds === "number" ? u.beds : undefined,
              baths: typeof u.baths === "number" ? u.baths : undefined,
            }))
          : undefined,
      },
      { refinementRound },
    ),
    researchMemoNarrative({
      address: formData.property.address,
      city: formData.property.city,
      state: formData.property.state,
      zip: formData.property.zip,
      isCondo,
    }),
  ]);
  // Structured timing for the parallel research fan-out as a whole — the
  // observability gap the owner called out: previously only success/failure
  // was logged, never how long a round actually took, so a customer's "why
  // is my report late" question meant reading through several separate
  // per-call logs and doing the math by hand.
  console.log("[processSubmission] Research round finished", {
    referenceId,
    refinementRound,
    durationMs: Date.now() - researchStartedAt,
    researchStatus: research.status,
    rentResearchStatus: rentResearch.status,
    narrativeStatus: narrative.status,
  });

  const resolvedTax = resolveTaxInputs(formData, research);
  const insurance = resolveYearlyInsurance(formData, research);
  const rent = resolveMonthlyRent(formData, rentResearch);

  const gate = evaluateConfidenceGate(research, rentResearch, formData.rentEstimate.confidence, insurance.source, rent.source);

  const isInfrastructureFault =
    research.status === "error" ||
    research.status === "not_configured" ||
    rentResearch.status === "error" ||
    rentResearch.status === "not_configured";

  if (isInfrastructureFault) {
    // Never charged, never notified here — the job stays "processing" and
    // runJobAttempt decides whether to try again (with backoff) or, only
    // after MAX_INFRA_ATTEMPTS genuinely-exhausted attempts, fall back to a
    // clearly-labeled infra-fault hold. This branch is entirely independent
    // of the confidence-seeking logic below — an infrastructure fault is
    // never treated as (or counted toward) a confidence-gate finding.
    console.error("[processSubmission] Infrastructure fault (Path B) — eligible for retry", {
      referenceId,
      attempts: job.attempts,
      researchStatus: research.status,
      rentResearchStatus: rentResearch.status,
    });
    return "needs_retry";
  }

  if (!gate.passed) {
    const roundsCompleted = refinementRound + 1; // this round just ran
    if (roundsCompleted < MAX_CONFIDENCE_ROUNDS) {
      // A real finding, but not yet an exhausted one — keep working the
      // problem instead of giving up on the first below-bar answer. The
      // next round (see runJobAttempt) reruns research with a broader
      // search asked for explicitly, not a repeat of the identical query.
      console.log("[processSubmission] Confidence gate below 90% bar (Path A) — retrying with broader research", {
        referenceId,
        roundsCompleted,
        maxRounds: MAX_CONFIDENCE_ROUNDS,
        reasons: gate.reasons,
      });
      return "needs_confidence_retry";
    }

    // Genuinely exhausted MAX_CONFIDENCE_ROUNDS worth of real search effort
    // and still below the bar — this is now a real data-quality finding, not
    // a fault, so it's charged and finalized exactly like the pre-existing
    // behavior, just with an honest count of how much extra effort already
    // went into it.
    console.log("[processSubmission] Confidence gate exhausted after full refinement effort — genuine hold for review", {
      referenceId,
      roundsCompleted,
      reasons: gate.reasons,
    });
    await chargeAllowanceForJob(job);
    await sendHoldForReviewNotice({
      referenceId,
      reasons: gate.reasons,
      customerEmail: formData.customer.email,
      propertyAddress: formData.property.address,
      holdReason: "confidence_exhausted",
    });
    try {
      await sendCustomerReviewDelayNotice({
        referenceId,
        customerEmail: formData.customer.email,
        customerName: formData.customer.name,
        isInfrastructureFault: false,
      });
    } catch (err) {
      console.error("[processSubmission] Failed to send customer review-delay notice", err);
    }
    return "held_for_review";
  }

  await chargeAllowanceForJob(job);

  const engineInputs = buildEngineInputs(formData, research, rentResearch, resolvedTax);
  const outputs = await computeUnderwriting(engineInputs);

  const researchResult = research.status === "ok" ? research.result : null;
  const rentResearchResult = rentResearch.status === "ok" ? rentResearch.result : null;
  const dealNumbers = outputs.monthlyDealNumbers;
  const numberOf = (key: string): number => {
    const v = dealNumbers[key];
    return typeof v === "number" ? v : 0;
  };

  const narrativeResult = narrative.status === "ok" ? narrative.result : null;
  if (narrative.status === "error") {
    console.error("[processSubmission] Memo narrative research failed — proceeding without it", narrative.message);
  }

  const reportData: UnderwritingReportData = {
    propertyAddressLine: `${formData.property.address}, ${formData.property.city}, ${formData.property.state} ${formData.property.zip}`,
    county: formData.property.county,
    propertyTypeLine: `${propertyTypeLabel(formData.property.propertyType)}, ${formData.property.beds || "?"} bed / ${formData.property.baths || "?"} bath${unitBreakdownSuffix(formData.property.units)}, ${formData.property.sqft || "?"} sf, built ${formData.property.yearBuilt || "?"}`,
    isCondo,
    preparedFor: formData.customer.name || "Buyer",
    dateOfMemo: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    underwritingSource: `Garrison Risk Review automated underwriting pipeline (${referenceId}) — filled workbook attached`,
    purchasePrice: engineInputs.property.price,
    loanAmount: typeof outputs.vaLoanNumbers.totalLoanAmount === "number" ? outputs.vaLoanNumbers.totalLoanAmount : 0,
    interestRatePct: engineInputs.financing.interestRate,
    occupancyStatus: formData.property.ownershipStatus.replace(/_/g, " "),
    pcsNote: formData.customer.targetPcsDate || "Not specified",

    hasOwnerRentalSplit: outputs.hasOwnerRentalSplit,
    ownerOccupiedAnnualTax: outputs.hasOwnerRentalSplit ? numberOf("ownerOccupiedAnnualTax") : null,
    rentalAnnualTax: outputs.hasOwnerRentalSplit ? numberOf("rentalAnnualTax") : numberOf("annualTax"),
    taxIncreaseAnnual: outputs.hasOwnerRentalSplit ? numberOf("taxIncreaseOnConversion") : null,
    taxInsights: researchResult?.taxInsights ?? [],
    taxDisclaimer: getTaxDisclaimer(engineInputs.taxModel, formData.property.state),

    monthlyPI: numberOf("monthlyPI"),
    monthlyPropertyTax: numberOf("monthlyPropertyTax"),
    monthlyInsurance: numberOf("monthlyInsurance"),
    monthlyHoa: numberOf("monthlyHoa"),
    totalPITI: numberOf("totalMonthlyPITI"),
    vacancyAllowancePct: engineInputs.vacancyAllowancePct,
    runningCostsPct: engineInputs.runningCostsPct,
    runningCostsAmount: numberOf("runningCostsAmount"),
    rentUsed: engineInputs.property.expectedMonthlyRent,
    rentConfidenceLabel:
      rent.source === "research"
        ? `${rentResearchResult?.confidence ?? "unknown"} confidence (research)${rentResearchResult?.confidenceNote ? ` — ${rentResearchResult.confidenceNote}` : ""}`
        : rent.source === "regional_average"
          ? "regional average estimate — not live comps for this address"
          : `${formData.rentEstimate.confidence} confidence (buyer estimate)`,
    rentAfterVacancy: numberOf("rentAfterVacancy"),
    moneyLeftOverMonthly: numberOf("moneyLeftOverMonthly"),
    moneyLeftOverYearly: numberOf("moneyLeftOverYearly"),
    cashOnCashPct: typeof dealNumbers.cashOnCashPct === "number" ? dealNumbers.cashOnCashPct * 100 : 0,
    capRatePct: typeof dealNumbers.capRatePct === "number" ? dealNumbers.capRatePct : 0,
    rentComps: rentResearchResult?.comps ?? [],

    entitlementFirstUse: outputs.vaLoanNumbers.isFirstTimeUse === "Yes",
    entitlementAvailable: typeof outputs.vaLoanNumbers.entitlementRemaining === "number" ? outputs.vaLoanNumbers.entitlementRemaining : 0,
    fundingFeeWaived: formData.customer.vaDisabilityRating,

    condoApproval: narrativeResult?.condoApproval ?? null,
    marketTrends: narrativeResult?.marketTrends ?? null,
    positiveFactors: narrativeResult?.positiveFactors ?? [],
    marketRiskRating: narrativeResult?.marketRiskRating ?? null,
    fundingFeeRatePct: typeof outputs.vaLoanNumbers.fundingFeeRatePct === "number" ? outputs.vaLoanNumbers.fundingFeeRatePct : 0,

    referenceId,
  };

  const [reportPdf, underwritingPdf, workbookXlsx] = await Promise.all([
    renderToBuffer(UnderwritingReportDocument(reportData)),
    renderToBuffer(
      UnderwritingDetailDocument({
        referenceId,
        generatedAt: new Date().toLocaleDateString("en-US"),
        property: engineInputs.property,
        financing: engineInputs.financing,
        outputs,
      }),
    ),
    fillWorkbookXlsx({
      inputs: engineInputs,
      outputs,
      taxFieldSources: resolvedTax.fieldSources,
      research,
      insuranceSource: insurance.source,
      insuranceNote: insurance.note,
      rentSource: rent.source,
      rentNote: rent.note,
    }),
  ]);

  console.log("[processSubmission] Research audit log", {
    referenceId,
    research: research.status === "ok" ? research.result.rawResponse : research,
    rentResearch,
  });

  await sendUnderwritingReportToCustomer({
    customerEmail: formData.customer.email,
    customerName: formData.customer.name,
    referenceId,
    reportPdf: Buffer.from(reportPdf),
    underwritingPdf: Buffer.from(underwritingPdf),
    workbookXlsx,
  });

  return "completed";
}

/**
 * Runs one attempt of `processSubmission` for a job and handles every
 * outcome — persisting job status, removing it from the pending set once
 * it's done, and sending the right customer email. Shared by both the
 * intake route's first (background) attempt and every retry the sweep
 * endpoint drives, so "what happens after an attempt" is defined in exactly
 * one place.
 *
 * Handles four outcomes, each mapped to exactly one job-state transition:
 * - "completed": terminal, already charged inside processSubmission.
 * - "held_for_review": terminal, a genuine Path A confidence-exhausted
 *   finding — already charged and already notified inside processSubmission
 *   (see the comment there); this branch just persists the final status.
 * - "needs_confidence_retry": Path A, not yet exhausted — increments
 *   job.confidenceRounds and leaves the job "processing" for another round.
 * - "needs_retry": Path B, an infrastructure fault — increments nothing new
 *   here (job.attempts is incremented by the caller before invoking this
 *   function, same as before); leaves the job "processing" until
 *   MAX_INFRA_ATTEMPTS is reached, at which point it's the one and only
 *   place an infra fault becomes a (clearly-labeled, never-charged)
 *   held_for_review — the last-resort safety valve so a job can never be
 *   stuck "processing" forever with no human ever finding out, even though
 *   ordinary "the API was slow" or "one call failed" never reaches it (see
 *   MAX_INFRA_ATTEMPTS's comment in config.ts for the numbers behind that).
 */
export async function runJobAttempt(job: ProcessingJob): Promise<void> {
  const attemptStartedAt = Date.now();
  let result: ProcessSubmissionResult;
  try {
    result = await processSubmission(job);
  } catch (err) {
    // An unexpected crash (not a handled research-service error) is treated
    // the same as an infrastructure fault — retry-eligible, never charged —
    // rather than silently losing the submission.
    console.error("[runJobAttempt] processSubmission threw unexpectedly — treating as retryable (Path B)", {
      referenceId: job.referenceId,
      attempts: job.attempts,
      err,
    });
    result = "needs_retry";
  }

  const attemptDurationMs = Date.now() - attemptStartedAt;
  console.log("[runJobAttempt] Attempt finished", {
    referenceId: job.referenceId,
    result,
    attemptDurationMs,
    attempts: job.attempts,
    confidenceRounds: job.confidenceRounds ?? 0,
  });

  // This attempt has now genuinely finished, one way or another — clear the
  // flag before anything else so the sweep can safely retry a still-eligible
  // job on its very next tick instead of waiting out the time-based fallback.
  job.attemptInProgress = false;

  if (result === "completed") {
    job.status = "completed";
    job.pendingRetryKind = null;
    await saveJob(job);
    await removePendingJob(job.referenceId);
    return;
  }

  if (result === "held_for_review") {
    // processSubmission already decided this is a genuine, fully-exhausted
    // Path A confidence finding and already charged + notified — this is
    // just persisting the final state.
    job.status = "held_for_review";
    job.holdReason = "confidence_exhausted";
    job.pendingRetryKind = null;
    await saveJob(job);
    await removePendingJob(job.referenceId);
    return;
  }

  if (result === "needs_confidence_retry") {
    // Path A, not yet exhausted — keep working the problem. Not charged,
    // not held; just one more round of broader research on the next sweep
    // tick (spaced by the confidence backoff — see retryPolicy.ts).
    job.confidenceRounds = (job.confidenceRounds ?? 0) + 1;
    job.pendingRetryKind = "confidence";
    await saveJob(job);
    await notifyProcessingDelayOnce(job);
    return;
  }

  // result === "needs_retry" (Path B, infrastructure fault)
  const exhausted = job.attempts >= MAX_INFRA_ATTEMPTS || !isJobStoreConfigured();
  if (exhausted) {
    // Every retry has been used, or there's no job store configured to
    // retry against at all — finalize as a clearly-labeled infra-fault
    // hold: no charge, honest "our research service had trouble" wording,
    // held for a human to finish by hand. This is the one and only place an
    // infra fault becomes held_for_review, and only after MAX_INFRA_ATTEMPTS
    // (with exponential backoff between them) genuinely failed to recover —
    // never "by itself" from one slow call or one failed attempt.
    job.status = "held_for_review";
    job.holdReason = "infra_fault_exhausted";
    job.pendingRetryKind = null;
    await saveJob(job);
    await removePendingJob(job.referenceId);
    try {
      await sendHoldForReviewNotice({
        referenceId: job.referenceId,
        reasons: [`Automated research did not complete after ${job.attempts} attempt(s) — infrastructure fault, needs investigation, not a data-quality check.`],
        customerEmail: job.formData.customer.email,
        propertyAddress: job.formData.property.address,
        holdReason: "infra_fault_exhausted",
      });
    } catch (err) {
      console.error("[runJobAttempt] Failed to send hold-for-review notice", err);
    }
    try {
      await sendCustomerReviewDelayNotice({
        referenceId: job.referenceId,
        customerEmail: job.formData.customer.email,
        customerName: job.formData.customer.name,
        isInfrastructureFault: true,
      });
    } catch (err) {
      console.error("[runJobAttempt] Failed to send customer review-delay notice", err);
    }
    return;
  }

  // Still eligible for another attempt — leave it "processing" (already is)
  // and persist the incremented attempt count/timestamp the caller set
  // before invoking this attempt.
  job.pendingRetryKind = "infra";
  await saveJob(job);
  await notifyProcessingDelayOnce(job);
}

/** The one-time "this is taking longer than usual" email — sent once per job, on whichever retry path first triggers it, not on every subsequent round. */
async function notifyProcessingDelayOnce(job: ProcessingJob): Promise<void> {
  if (job.notifiedProcessingDelay) return;
  job.notifiedProcessingDelay = true;
  try {
    await sendStillProcessingNotice({
      referenceId: job.referenceId,
      customerEmail: job.formData.customer.email,
      customerName: job.formData.customer.name,
    });
  } catch (err) {
    console.error("[runJobAttempt] Failed to send still-processing notice", err);
  }
  await saveJob(job);
}
