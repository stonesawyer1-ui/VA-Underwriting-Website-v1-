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

export type ProcessSubmissionResult = "completed" | "held_for_review" | "needs_retry";

/**
 * The full research -> compute -> confidence gate -> PDFs -> delivery
 * pipeline, extracted unchanged from what used to be the intake route's
 * inline "Stage B" so both the first synchronous attempt and every
 * background retry call the exact same logic.
 *
 * "needs_retry" (new, 2026-08-31): a research-service failure (Anthropic
 * error, timeout, not configured) no longer falls straight to hold-for-review
 * after a single attempt — it's retry-eligible instead, since that's exactly
 * what let a genuinely-fine property (finnx27's case) get stuck on a slow
 * research round rather than actually failing. A GENUINE data-quality gap
 * (research succeeded but came back low-confidence) still holds for review
 * immediately, same as always — that's a real finding, not a fault to retry.
 */
export async function processSubmission(job: ProcessingJob): Promise<ProcessSubmissionResult> {
  const { formData, referenceId } = job;
  const isCondo = formData.property.propertyType === "condo";

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
    ),
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

  const gate = evaluateConfidenceGate(research, rentResearch, formData.rentEstimate.confidence, insurance.source, rent.source);

  const isInfrastructureFault =
    research.status === "error" ||
    research.status === "not_configured" ||
    rentResearch.status === "error" ||
    rentResearch.status === "not_configured";

  if (isInfrastructureFault) {
    // Never charged, never notified here — the job stays "processing" and
    // the caller (route handler or retry sweep) decides whether to try
    // again or, after enough attempts, fall back to a genuine hold-for-review.
    console.error("[processSubmission] Infrastructure fault — eligible for retry", {
      referenceId,
      attempts: job.attempts,
      researchStatus: research.status,
      rentResearchStatus: rentResearch.status,
    });
    return "needs_retry";
  }

  if (!gate.passed) {
    await chargeAllowanceForJob(job);
    await sendHoldForReviewNotice({
      referenceId,
      reasons: gate.reasons,
      customerEmail: formData.customer.email,
      propertyAddress: formData.property.address,
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
 * At most ~24 real minutes worst-case (5 attempts, each up to a 4-minute
 * research deadline, spaced by up to a 1-minute sweep tick to notice each
 * failure — see vercel.json and researchProperty.ts) — inside the
 * 25-minute delivery target even if every attempt fails outright, while
 * still giving a genuinely transient research outage several real chances
 * to clear, each with enough real time to plausibly succeed, before a
 * human takes over.
 */
const MAX_ATTEMPTS = 5;

/**
 * Runs one attempt of `processSubmission` for a job and handles every
 * outcome — persisting job status, removing it from the pending set once
 * it's done, and sending the right customer email. Shared by both the
 * intake route's first (background) attempt and every retry the sweep
 * endpoint drives, so "what happens after an attempt" is defined in exactly
 * one place.
 */
export async function runJobAttempt(job: ProcessingJob): Promise<void> {
  let result: ProcessSubmissionResult;
  try {
    result = await processSubmission(job);
  } catch (err) {
    // An unexpected crash (not a handled research-service error) is treated
    // the same as an infrastructure fault — retry-eligible, never charged —
    // rather than silently losing the submission.
    console.error("[runJobAttempt] processSubmission threw unexpectedly — treating as retryable", {
      referenceId: job.referenceId,
      attempts: job.attempts,
      err,
    });
    result = "needs_retry";
  }

  // This attempt has now genuinely finished, one way or another — clear the
  // flag before anything else so the sweep can safely retry a still-eligible
  // job on its very next tick instead of waiting out the time-based fallback.
  job.attemptInProgress = false;

  if (result === "completed" || result === "held_for_review") {
    job.status = result;
    await saveJob(job);
    await removePendingJob(job.referenceId);
    return;
  }

  // result === "needs_retry"
  const exhausted = job.attempts >= MAX_ATTEMPTS || !isJobStoreConfigured();
  if (exhausted) {
    // Either every retry has been used, or there's no job store configured
    // to retry against at all — finalize exactly like the pre-async
    // behavior: no charge, honest "our research service had trouble"
    // wording, held for a human to finish by hand.
    job.status = "held_for_review";
    await saveJob(job);
    await removePendingJob(job.referenceId);
    try {
      await sendHoldForReviewNotice({
        referenceId: job.referenceId,
        reasons: [`Automated research did not complete after ${job.attempts} attempt(s) — needs a manual check.`],
        customerEmail: job.formData.customer.email,
        propertyAddress: job.formData.property.address,
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
  await saveJob(job);
  if (!job.notifiedProcessingDelay) {
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
}
