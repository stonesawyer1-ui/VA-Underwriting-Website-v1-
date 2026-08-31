import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  sendUnderwritingInquiryEmail,
  sendUnderwritingReportToCustomer,
  sendHoldForReviewNotice,
  sendCustomerReviewDelayNotice,
} from "@/lib/email";
import type { ResultsSummary } from "@/lib/underwriting/calculations";
import { formatCurrency } from "@/lib/underwriting/format";
import type { UnderwritingFormData } from "@/lib/underwriting/types";
import { researchProperty } from "@/lib/research/researchProperty";
import { researchRentEstimate } from "@/lib/research/researchRentEstimate";
import { researchMemoNarrative } from "@/lib/research/researchMemoNarrative";
import { resolveTaxInputs, resolveYearlyInsurance, resolveMonthlyRent, buildEngineInputs } from "@/lib/pipeline/buildEngineInputs";
import { computeUnderwriting } from "@/lib/workbook/computeUnderwriting";
import { fillWorkbookXlsx } from "@/lib/workbook/fillWorkbookXlsx";
import { evaluateConfidenceGate } from "@/lib/confidenceGate";
import { getTaxDisclaimer } from "@/lib/underwriting/taxDisclaimers";
import { UnderwritingReportDocument, type UnderwritingReportData } from "@/lib/pdf/UnderwritingReportDocument";
import { UnderwritingDetailDocument } from "@/lib/pdf/UnderwritingDetailDocument";
import { signEntitlement, verifyEntitlement } from "@/lib/entitlementToken";
import { getStripeClient } from "@/lib/stripe";

// This route runs three Claude research calls (two in parallel, one after)
// plus PDF/Excel generation, which is genuinely slow. 300s is the ceiling
// this plan allows a serverless function to run — request it explicitly
// rather than relying on an implicit default, since a customer submission
// timing out mid-flight means no email at all (see 2026-08-30 incident).
export const maxDuration = 300;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const customer = body.customer as { email?: unknown } | undefined;
  const property = body.property as { address?: unknown; state?: unknown; purchasePrice?: unknown } | undefined;
  const financing = body.financing as { interestRate?: unknown } | undefined;
  const occupancy = body.occupancy as { moveInDate?: unknown } | undefined;

  if (!customer || !isNonEmptyString(customer.email) || !isValidEmail(customer.email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (
    !property ||
    !isNonEmptyString(property.address) ||
    !isNonEmptyString(property.state) ||
    typeof property.purchasePrice !== "number" ||
    property.purchasePrice <= 0
  ) {
    return NextResponse.json({ error: "Property address, state, and purchase price are required." }, { status: 400 });
  }

  if (!financing || typeof financing.interestRate !== "number" || financing.interestRate <= 0) {
    return NextResponse.json({ error: "Interest rate is required." }, { status: 400 });
  }

  if (!occupancy || !isNonEmptyString(occupancy.moveInDate)) {
    return NextResponse.json({ error: "Move-in date is required." }, { status: 400 });
  }

  const rawToken = body.entitlementToken;
  if (!isNonEmptyString(rawToken)) {
    return NextResponse.json({ error: "Missing payment confirmation. Choose a plan from /pricing first." }, { status: 402 });
  }
  const entitlement = verifyEntitlement(rawToken);
  if (!entitlement) {
    return NextResponse.json({ error: "We couldn't verify your payment for this submission." }, { status: 402 });
  }
  if (entitlement.used >= entitlement.allowance) {
    return NextResponse.json(
      { error: `You've already used all ${entitlement.allowance} property reviews on this plan.` },
      { status: 402 },
    );
  }
  const newUsedCount = entitlement.used + 1;
  const nextToken = signEntitlement({ ...entitlement, used: newUsedCount });

  // Persist the incremented count on the Stripe Checkout Session itself so a
  // customer can't bypass their plan's allowance by simply revisiting
  // /get-started?session_id=... — that page reads this value fresh on every
  // load instead of trusting a client-supplied token. This is a real-money
  // guard: without it, a single paid session could generate unlimited
  // reports (each one a real research + email cost) for free.
  const stripe = getStripeClient();
  if (stripe && entitlement.stripeSessionId !== "demo") {
    try {
      await stripe.checkout.sessions.update(entitlement.stripeSessionId, {
        metadata: { used: String(newUsedCount) },
      });
    } catch (err) {
      console.error("[underwriting-intake] Failed to persist usage count to Stripe session", err);
    }
  }

  const referenceId = `GRR-${Date.now().toString(36).toUpperCase()}`;

  console.log("[underwriting-intake] New submission", {
    referenceId,
    receivedAt: new Date().toISOString(),
    ...body,
  });

  const { results, ...formData } = body as { results: ResultsSummary; entitlementToken: string } & UnderwritingFormData;

  try {
    await sendUnderwritingInquiryEmail(formData, results, referenceId);
  } catch (err) {
    console.error("[underwriting-intake] Failed to send notification email", err);
  }

  // Stage B: Claude research -> real workbook computation -> confidence gate -> PDFs -> delivery.
  // Runs best-effort; a failure here never blocks the customer's initial submission response.
  try {
    // Tax/insurance research and rent-comp research run in parallel with
    // their own separate search budgets — bundled together, rent comps kept
    // losing out on search budget to tax-district lookups.
    const [research, rentResearch] = await Promise.all([
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
      }),
    ]);

    const resolvedTax = resolveTaxInputs(formData, research);
    const insurance = resolveYearlyInsurance(formData, research);
    const rent = resolveMonthlyRent(formData, rentResearch);

    const gate = evaluateConfidenceGate(research, rentResearch, formData.rentEstimate.confidence, insurance.source, rent.source);

    if (!gate.passed) {
      await sendHoldForReviewNotice({
        referenceId,
        reasons: gate.reasons,
        customerEmail: formData.customer.email,
        propertyAddress: formData.property.address,
      });
      // The success screen promises "within 1 hour" — a held submission
      // can't meet that, so the customer gets an honest heads-up instead of
      // silence past the promised window (see 2026-08-31 delivery-time change).
      try {
        await sendCustomerReviewDelayNotice({
          referenceId,
          customerEmail: formData.customer.email,
          customerName: formData.customer.name,
        });
      } catch (err) {
        console.error("[underwriting-intake] Failed to send customer review-delay notice", err);
      }
      return NextResponse.json({ success: true, referenceId, nextToken }, { status: 200 });
    }

    const engineInputs = buildEngineInputs(formData, research, rentResearch, resolvedTax);
    const outputs = await computeUnderwriting(engineInputs);

    const researchResult = research.status === "ok" ? research.result : null;
    const rentResearchResult = rentResearch.status === "ok" ? rentResearch.result : null;
    const dealNumbers = outputs.monthlyDealNumbers;
    const numberOf = (key: string): number => {
      const v = dealNumbers[key];
      return typeof v === "number" ? v : 0;
    };

    const isCondo = formData.property.propertyType === "condo";
    const taxIncreaseAnnual = outputs.hasOwnerRentalSplit ? numberOf("taxIncreaseOnConversion") : 0;
    const moneyLeftOverMonthly = numberOf("moneyLeftOverMonthly");
    const computedContext = outputs.hasOwnerRentalSplit
      ? `Tax increases ${formatCurrency(taxIncreaseAnnual)}/yr on conversion to a rental. Modeled cash flow is ${formatCurrency(moneyLeftOverMonthly)}/mo.`
      : `No owner-vs-rental tax gap under this state's mechanism. Modeled cash flow is ${formatCurrency(moneyLeftOverMonthly)}/mo.`;

    const narrative = await researchMemoNarrative({
      address: formData.property.address,
      city: formData.property.city,
      state: formData.property.state,
      zip: formData.property.zip,
      isCondo,
      computedContext,
    });
    const narrativeResult = narrative.status === "ok" ? narrative.result : null;
    if (narrative.status === "error") {
      console.error("[underwriting-intake] Memo narrative research failed — proceeding without it", narrative.message);
    }

    const reportData: UnderwritingReportData = {
      propertyAddressLine: `${formData.property.address}, ${formData.property.city}, ${formData.property.state} ${formData.property.zip}`,
      county: formData.property.county,
      propertyTypeLine: `${formData.property.propertyType.replace(/_/g, " ")}, ${formData.property.beds || "?"} bed / ${formData.property.baths || "?"} bath, ${formData.property.sqft || "?"} sf, built ${formData.property.yearBuilt || "?"}`,
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

    // Audit trail: the full research response alongside the generated file,
    // so a wrong or stale figure can be traced back to what Claude returned.
    console.log("[underwriting-intake] Research audit log", {
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
  } catch (err) {
    console.error("[underwriting-intake] Stage B pipeline failed", err);
  }

  return NextResponse.json({ success: true, referenceId, nextToken }, { status: 200 });
}
