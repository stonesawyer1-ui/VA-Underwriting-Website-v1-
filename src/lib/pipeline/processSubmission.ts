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
import { evaluateConfidenceGate, type ConfidenceGateResult } from "@/lib/confidenceGate";
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
 * The per-target part of a job's state a targeted confidence-refinement
 * round reads and writes — pulled out as its own type (rather than the full
 * ProcessingJob) so the two functions below, and their tests, don't need to
 * construct a whole fake job.
 */
export type RefinementCounters = Pick<
  ProcessingJob,
  "propertyRefinementRound" | "rentRefinementRound" | "pendingPropertyRefinement" | "pendingRentRefinement"
>;

/**
 * Called from processSubmission the moment a round's gate check comes back
 * not-yet-exhausted (Path A, "needs_confidence_retry") — records which
 * side(s) actually need another attempt AND resets the other side's
 * refinement-round counter to 0.
 *
 * The reset is the fix for a real bug (caught in independent review,
 * 2026-09-02): without it, a target's cumulative refinement-round counter
 * only ever incremented, never decreased, even after that side's gate check
 * started passing again. Since the counter is read directly as the
 * refinementRound argument the *next* round (see processSubmission.ts),
 * a stale nonzero leftover from an earlier failure made a now-passing call
 * bypass its own cache and rerun a live, broadened search for no reason —
 * reintroducing the extra-live-call/timeout risk this whole fix was meant
 * to eliminate. Concrete trace that reproduced it: round 0 both property
 * and rent fail (both counters -> 1); round 1 property now passes, rent
 * still fails (only rent's counter should move) — without resetting
 * property's counter back to 0 here, round 2 would still pass
 * researchProperty a nonzero refinementRound despite property having
 * already succeeded. See processSubmission.refinement.test.ts for the
 * regression test.
 */
export function applyTargetedRefinementDecision(
  counters: RefinementCounters,
  gate: Pick<ConfidenceGateResult, "needsPropertyRefinement" | "needsRentRefinement">,
): void {
  counters.pendingPropertyRefinement = gate.needsPropertyRefinement;
  counters.pendingRentRefinement = gate.needsRentRefinement;
  if (!gate.needsPropertyRefinement) counters.propertyRefinementRound = 0;
  if (!gate.needsRentRefinement) counters.rentRefinementRound = 0;
}

/**
 * Called from runJobAttempt right after a round comes back
 * "needs_confidence_retry" — bumps only the counter(s) whose
 * pending*Refinement flag applyTargetedRefinementDecision just set, so the
 * *next* round's broadened search actually broadens further for a
 * repeatedly-failing target instead of retrying with the same parameters.
 */
export function bumpRefinementCounters(counters: RefinementCounters): void {
  if (counters.pendingPropertyRefinement) {
    counters.propertyRefinementRound = (counters.propertyRefinementRound ?? 0) + 1;
  }
  if (counters.pendingRentRefinement) {
    counters.rentRefinementRound = (counters.rentRefinementRound ?? 0) + 1;
  }
}

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
  // Overall round counter — 0 on the very first pass; >0 once a prior
  // round's gate failed without being exhausted (see the
  // "needs_confidence_retry" branch below and runJobAttempt).
  const refinementRound = job.confidenceRounds ?? 0;

  // 2026-09-02 targeted-retry fix: a refinement round used to broaden and
  // rerun BOTH researchProperty and researchRentEstimate uniformly,
  // regardless of which one actually failed the confidence gate. That
  // wasted a whole extra research call every round, and — worse — forced a
  // researchProperty call that already SUCCEEDED to redo unnecessary
  // broadened work under the (already tighter) research deadline, which is
  // exactly the failure mode that made timeouts more likely on a call that
  // didn't need retrying at all.
  //
  // Each call now gets its OWN refinement round, sourced from the job's
  // separate propertyRefinementRound/rentRefinementRound counters — 0
  // unless that specific call's side of the gate actually failed last
  // round (see the pendingPropertyRefinement/pendingRentRefinement fields
  // set below and incremented in runJobAttempt). Passing 0 for a call whose
  // side already passed lets it hit its own 30-day cache and reuse the
  // already-good result at zero cost instead of doing another live call.
  const propertyRefinementRound = job.propertyRefinementRound ?? 0;
  const rentRefinementRound = job.rentRefinementRound ?? 0;

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
      { refinementRound: propertyRefinementRound },
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
      { refinementRound: rentRefinementRound },
    ),
    // Never given a refinementRound — the narrative isn't part of the
    // confidence gate at all (evaluateConfidenceGate only looks at
    // insurance/rent), and it's now cached (see researchMemoNarrative.ts),
    // so a repeat round for the same address is a free cache hit rather
    // than a wasted live call.
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
    propertyRefinementRound,
    rentRefinementRound,
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
      // search asked for explicitly, not a repeat of the identical query —
      // targeted, per the gate's own needsPropertyRefinement/
      // needsRentRefinement verdict, at only the call(s) that actually
      // failed (see propertyRefinementRound/rentRefinementRound above).
      // runJobAttempt reads these two flags right after this function
      // returns to decide which counter(s) to bump before the next round.
      // See applyTargetedRefinementDecision's own comment for why it also
      // resets the *other* side's counter back to 0 here rather than only
      // ever incrementing.
      applyTargetedRefinementDecision(job, gate);
      console.log("[processSubmission] Confidence gate below 90% bar (Path A) — retrying with targeted, broader research", {
        referenceId,
        roundsCompleted,
        maxRounds: MAX_CONFIDENCE_ROUNDS,
        reasons: gate.reasons,
        needsPropertyRefinement: gate.needsPropertyRefinement,
        needsRentRefinement: gate.needsRentRefinement,
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
  await buildAndSendReport({ formData, referenceId, isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent });
  return "completed";
}

/**
 * The "gate passed, produce the real report" tail — pulled out of
 * processSubmission() so forceCompleteHeldJob() (below) can reuse the exact
 * same report-building/sending code for a manual admin override, instead of
 * a second, drift-prone copy of ~90 lines of report assembly.
 */
async function buildAndSendReport(args: {
  formData: ProcessingJob["formData"];
  referenceId: string;
  isCondo: boolean;
  research: Awaited<ReturnType<typeof researchProperty>>;
  rentResearch: Awaited<ReturnType<typeof researchRentEstimate>>;
  narrative: Awaited<ReturnType<typeof researchMemoNarrative>>;
  resolvedTax: ReturnType<typeof resolveTaxInputs>;
  insurance: ReturnType<typeof resolveYearlyInsurance>;
  rent: ReturnType<typeof resolveMonthlyRent>;
  /** Skip the actual customer email — used by regenerateReportFiles() to produce an owner-facing copy of an already-sent report without re-sending it. */
  skipSend?: boolean;
}): Promise<{ reportPdf: Buffer; underwritingPdf: Buffer; workbookXlsx: Buffer }> {
  const { formData, referenceId, isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent, skipSend } = args;

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
    propertyTypeLine: `${propertyTypeLabel(formData.property.propertyType, formData.property.hasAdu)}, ${formData.property.beds || "?"} bed / ${formData.property.baths || "?"} bath${unitBreakdownSuffix(formData.property.units)}, ${formData.property.sqft || "?"} sf, built ${formData.property.yearBuilt || "?"}`,
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
        ? `${rentResearchResult?.confidence ?? "unknown"} confidence (area market research)${
            rent.comparison.buyerEstimate ? " — higher confidence than the buyer's own estimate, shown below" : ""
          }${rentResearchResult?.confidenceNote ? ` — ${rentResearchResult.confidenceNote}` : ""}`
        : rent.source === "regional_average"
          ? "regional average estimate — not live comps for this address"
          : `${formData.rentEstimate.confidence} confidence (buyer estimate)${
              rent.comparison.researchEstimate ? " — at least as confident as area market research, shown below" : ""
            }`,
    rentComparison: rent.comparison,
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

  const files = { reportPdf: Buffer.from(reportPdf), underwritingPdf: Buffer.from(underwritingPdf), workbookXlsx: Buffer.from(workbookXlsx) };

  if (!skipSend) {
    console.log("[processSubmission] Research audit log", {
      referenceId,
      research: research.status === "ok" ? research.result.rawResponse : research,
      rentResearch,
    });

    await sendUnderwritingReportToCustomer({
      customerEmail: formData.customer.email,
      customerName: formData.customer.name,
      referenceId,
      reportPdf: files.reportPdf,
      underwritingPdf: files.underwritingPdf,
      workbookXlsx: files.workbookXlsx,
    });
  }

  return files;
}

/**
 * Manual admin override for a job that already finalized `held_for_review`
 * *specifically* because the BUYER's own self-rated rent confidence was
 * below the gate's bar ("moderate" or "low") — not because research itself
 * found a genuine data gap. Broader research can't raise a buyer's own
 * confidence label (see evaluateConfidenceGate's needsRentRefinement
 * comment), so the confidence-seeking retry loop always burns its full
 * MAX_CONFIDENCE_ROUNDS on exactly this case before landing on
 * held_for_review, even though nothing about round 2 or 3 could ever have
 * come out differently from round 1 — a real design gap (first seen
 * 2026-09-02, GRR-MTKIHYO2) worth fixing properly, but this function exists
 * to get an already-held, already-good-data customer their report without
 * waiting on that fix.
 *
 * Deliberately narrow: recomputes the confidence gate from the job's own
 * stored data, and refuses to send unless EVERY reason the gate gives is
 * this exact buyer-confidence case. If research itself ever comes back with
 * a genuine data gap (insurance default estimate, no rent information at
 * all, or research-side low-confidence comps), this refuses rather than
 * shipping an unvetted report — that kind of hold still needs a real human
 * look, not an override.
 *
 * Never charges the allowance — chargeAllowanceForJob already ran exactly
 * once, at the moment this job first finalized held_for_review (see the
 * exhausted-gate branch above). Calling it again here would double-charge.
 */
async function recomputeResearchForJob(formData: ProcessingJob["formData"]) {
  const isCondo = formData.property.propertyType === "condo";

  const [research, rentResearch, narrative] = await Promise.all([
    researchProperty(formData.property.address, formData.property.city, formData.property.state, formData.property.zip, {
      sqft: typeof formData.property.sqft === "number" ? formData.property.sqft : undefined,
      beds: typeof formData.property.beds === "number" ? formData.property.beds : undefined,
      baths: typeof formData.property.baths === "number" ? formData.property.baths : undefined,
      yearBuilt: typeof formData.property.yearBuilt === "number" ? formData.property.yearBuilt : undefined,
    }),
    researchRentEstimate(formData.property.address, formData.property.city, formData.property.state, formData.property.zip, {
      sqft: typeof formData.property.sqft === "number" ? formData.property.sqft : undefined,
      beds: typeof formData.property.beds === "number" ? formData.property.beds : undefined,
      baths: typeof formData.property.baths === "number" ? formData.property.baths : undefined,
      units: formData.property.units.some((u) => u.beds !== "" || u.baths !== "")
        ? formData.property.units.map((u) => ({
            beds: typeof u.beds === "number" ? u.beds : undefined,
            baths: typeof u.baths === "number" ? u.baths : undefined,
          }))
        : undefined,
    }),
    researchMemoNarrative({
      address: formData.property.address,
      city: formData.property.city,
      state: formData.property.state,
      zip: formData.property.zip,
      isCondo,
    }),
  ]);

  const resolvedTax = resolveTaxInputs(formData, research);
  const insurance = resolveYearlyInsurance(formData, research);
  const rent = resolveMonthlyRent(formData, rentResearch);
  return { isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent };
}

export async function forceCompleteHeldJob(
  referenceId: string,
): Promise<{ status: "sent" } | { status: "refused"; reason: string }> {
  const { getJob } = await import("@/lib/jobStore");
  const job = await getJob(referenceId);
  if (!job) {
    return { status: "refused", reason: "No stored job found for this referenceId." };
  }
  if (job.status !== "held_for_review") {
    return {
      status: "refused",
      reason: `Job status is "${job.status}", not "held_for_review" — this tool only overrides an existing hold.`,
    };
  }

  const { formData } = job;
  const { isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent } = await recomputeResearchForJob(formData);
  const gate = evaluateConfidenceGate(research, rentResearch, formData.rentEstimate.confidence, insurance.source, rent.source);

  const isBuyerConfidenceReason = (reason: string): boolean => /confidence from the buyer/.test(reason);
  if (!gate.passed && !gate.reasons.every(isBuyerConfidenceReason)) {
    return {
      status: "refused",
      reason: `Refusing — at least one gate reason is a genuine data gap, not just the buyer's own confidence rating: ${gate.reasons.join(" | ")}`,
    };
  }

  await buildAndSendReport({ formData, referenceId, isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent });

  job.status = "completed";
  await saveJob(job);
  await removePendingJob(referenceId);

  return { status: "sent" };
}

/**
 * Owner-facing debug tool: rebuilds the exact same three report files for
 * any stored job (any status — unlike forceCompleteHeldJob, this never sends
 * anything to the customer and never touches job status) so the owner can
 * see what a report actually looks like. Research is re-run, but every call
 * involved (property/tax/insurance, rent comps, market narrative) is cached
 * for 30 days keyed on address — so for a job whose research already
 * succeeded, this returns the identical data that was (or will be) emailed,
 * not a fresh live search that could come back different.
 */
export async function regenerateReportFiles(
  referenceId: string,
): Promise<{ status: "ok"; files: { reportPdf: Buffer; underwritingPdf: Buffer; workbookXlsx: Buffer } } | { status: "not_found" }> {
  const { getJob } = await import("@/lib/jobStore");
  const job = await getJob(referenceId);
  if (!job) return { status: "not_found" };

  const { formData } = job;
  const { isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent } = await recomputeResearchForJob(formData);
  const files = await buildAndSendReport({ formData, referenceId, isCondo, research, rentResearch, narrative, resolvedTax, insurance, rent, skipSend: true });
  return { status: "ok", files };
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
    if (job.pendingRetryKind === "infra") {
      // The caller pre-incremented `attempts` expecting this to be another
      // infra-fault retry (since that's what the job was waiting on going
      // in), but research actually succeeded this round and produced a
      // genuine below-bar confidence result instead — undo that increment
      // so a successful research round never quietly eats into the
      // infra-fault budget (see the mirrored correction below).
      job.attempts -= 1;
    }
    job.confidenceRounds = (job.confidenceRounds ?? 0) + 1;
    // Targeted retry (2026-09-02): only bump the counter(s) for the call(s)
    // processSubmission actually flagged as needing another broadened
    // attempt — see bumpRefinementCounters and the
    // propertyRefinementRound/rentRefinementRound comments on
    // ProcessingJob. A call whose side of the gate already passed had its
    // counter reset to 0 by applyTargetedRefinementDecision above and gets
    // refinementRound 0 next round (see processSubmission.ts), so it reuses
    // its own cached result instead of redoing already-good work.
    bumpRefinementCounters(job);
    job.pendingRetryKind = "confidence";
    await saveJob(job);
    await notifyProcessingDelayOnce(job);
    return;
  }

  // result === "needs_retry" (Path B, infrastructure fault)
  if (job.pendingRetryKind === "confidence") {
    // The caller did NOT increment `attempts` for this call, since the job
    // was waiting on a confidence-refinement round — but this attempt
    // actually hit an infrastructure fault instead. Correct the undercount
    // here so every real infra attempt counts toward MAX_INFRA_ATTEMPTS
    // regardless of which retry kind was expected going in (caught in
    // review 2026-09-02, before this ever reached a real submission).
    job.attempts += 1;
  }
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
