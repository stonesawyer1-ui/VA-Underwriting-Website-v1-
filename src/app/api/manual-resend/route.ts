import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { researchProperty } from "@/lib/research/researchProperty";
import { researchRentEstimate } from "@/lib/research/researchRentEstimate";
import { researchMemoNarrative } from "@/lib/research/researchMemoNarrative";
import { resolveTaxInputs, resolveYearlyInsurance, resolveMonthlyRent, buildEngineInputs } from "@/lib/pipeline/buildEngineInputs";
import { computeUnderwriting } from "@/lib/workbook/computeUnderwriting";
import { fillWorkbookXlsx } from "@/lib/workbook/fillWorkbookXlsx";
import { getTaxDisclaimer } from "@/lib/underwriting/taxDisclaimers";
import { UnderwritingReportDocument, type UnderwritingReportData } from "@/lib/pdf/UnderwritingReportDocument";
import { UnderwritingDetailDocument } from "@/lib/pdf/UnderwritingDetailDocument";
import { sendUnderwritingReportToCustomer } from "@/lib/email";
import type { UnderwritingFormData } from "@/lib/underwriting/types";

// TEMPORARY — one-off manual resend for epskinner20@gmail.com (GRR-MTITR367)
// whose report silently failed to send due to the just-fixed Resend-error
// bug. Runs in production (same environment that already proved this
// address's research succeeds), reusing the Redis cache from the earlier
// successful attempt so no new Anthropic cost. Does NOT charge allowance —
// that already happened during the original successful attempt. Delete
// this route after use.
export const maxDuration = 1800;

function unitBreakdownSuffix(units: { beds: number | ""; baths: number | "" }[]): string {
  const meaningful = units.filter((u) => u.beds !== "" || u.baths !== "");
  if (meaningful.length === 0) return "";
  const parts = units.map((u, i) => `Unit ${i + 1}: ${u.beds || "?"}bd/${u.baths || "?"}ba`);
  return ` (${parts.join(", ")})`;
}

const formData = {
  customer: {
    name: "Elizabeth Skinner",
    email: "epskinner20@gmail.com",
    phone: "8637121152",
    dutyStation: "Fort Jackson, SC ",
    targetPcsDate: "",
    vaDisabilityRating: false,
  },
  priorVaLoans: [],
  property: {
    address: "2088 Lofton Rd ",
    city: "Blythewood",
    state: "SC",
    zip: "29016",
    county: "",
    propertyType: "single_family",
    beds: "",
    baths: "",
    units: [],
    sqft: "",
    yearBuilt: "",
    purchasePrice: 287000,
    ownershipStatus: "evaluating_purchase",
  },
  financing: {
    interestRate: 4.75,
    loanTermYears: 30,
    downPayment: 0,
    hoaMonthly: 0,
    countyLoanLimit: 806500,
    countyLoanLimitOverridden: false,
  },
  tax: {
    assessmentRatio: { totalMillageRate: 250, schoolOperatingMillage: 120, schoolBondMillage: 20, ownerAssessmentRatioPct: 4, investorAssessmentRatioPct: 6 },
    assessmentRatioTouched: {},
    homesteadExemption: { cityRatePct: 0.55, schoolIsdRatePct: 1, countyRatePct: 0.4, schoolHomesteadExemption: 140000 },
    homesteadExemptionTouched: {},
    flatRate: { combinedTaxRatePct: 1 },
    flatRateTouched: {},
    fallback: { estimatedEffectiveTaxRatePct: 1.1 },
  },
  rentalIncomeForNextLoan: { currentRent: 0, hasSignedLease: false, currentMortgagePayment: 0, householdMonthlyIncome: 0, otherMonthlyDebts: 0 },
  occupancy: { moveInDate: "2026-10-01", moveOutDate: "" },
  expenses: { hasInsuranceQuote: false, insuranceAnnual: 1800, selfManaged: true, knownCapitalNeeds: "", vacancyPct: 5, reservePct: 5 },
  rentEstimate: { monthlyRent: "", confidence: "moderate" },
  tier: "recon",
} as unknown as UnderwritingFormData;

const referenceId = "GRR-MTITR367";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!configuredSecret || authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const isCondo = formData.property.propertyType === "condo";

  const [research, rentResearch, narrative] = await Promise.all([
    researchProperty(formData.property.address, formData.property.city, formData.property.state, formData.property.zip, {}),
    researchRentEstimate(formData.property.address, formData.property.city, formData.property.state, formData.property.zip, {}),
    researchMemoNarrative({
      address: formData.property.address,
      city: formData.property.city,
      state: formData.property.state,
      zip: formData.property.zip,
      isCondo,
    }),
  ]);

  if (research.status !== "ok" || rentResearch.status !== "ok") {
    return NextResponse.json({ success: false, researchStatus: research.status, rentResearchStatus: rentResearch.status }, { status: 200 });
  }

  const resolvedTax = resolveTaxInputs(formData, research);
  const insurance = resolveYearlyInsurance(formData, research);
  const rent = resolveMonthlyRent(formData, rentResearch);
  const engineInputs = buildEngineInputs(formData, research, rentResearch, resolvedTax);
  const outputs = await computeUnderwriting(engineInputs);

  const dealNumbers = outputs.monthlyDealNumbers;
  const numberOf = (key: string): number => {
    const v = dealNumbers[key];
    return typeof v === "number" ? v : 0;
  };
  const narrativeResult = narrative.status === "ok" ? narrative.result : null;

  const reportData: UnderwritingReportData = {
    propertyAddressLine: `${formData.property.address}, ${formData.property.city}, ${formData.property.state} ${formData.property.zip}`,
    county: formData.property.county,
    propertyTypeLine: `${formData.property.propertyType.replace(/_/g, " ")}, ${formData.property.beds || "?"} bed / ${formData.property.baths || "?"} bath${unitBreakdownSuffix(formData.property.units)}, ${formData.property.sqft || "?"} sf, built ${formData.property.yearBuilt || "?"}`,
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
    taxInsights: research.result.taxInsights ?? [],
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
        ? `${rentResearch.result.confidence} confidence (research)${rentResearch.result.confidenceNote ? ` — ${rentResearch.result.confidenceNote}` : ""}`
        : rent.source === "regional_average"
          ? "regional average estimate — not live comps for this address"
          : `${formData.rentEstimate.confidence} confidence (buyer estimate)`,
    rentAfterVacancy: numberOf("rentAfterVacancy"),
    moneyLeftOverMonthly: numberOf("moneyLeftOverMonthly"),
    moneyLeftOverYearly: numberOf("moneyLeftOverYearly"),
    cashOnCashPct: typeof dealNumbers.cashOnCashPct === "number" ? dealNumbers.cashOnCashPct * 100 : 0,
    capRatePct: typeof dealNumbers.capRatePct === "number" ? dealNumbers.capRatePct : 0,
    rentComps: rentResearch.result.comps ?? [],
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

  try {
    await sendUnderwritingReportToCustomer({
      customerEmail: formData.customer.email,
      customerName: formData.customer.name,
      referenceId,
      reportPdf: Buffer.from(reportPdf),
      underwritingPdf: Buffer.from(underwritingPdf),
      workbookXlsx,
    });
  } catch (err) {
    return NextResponse.json({ success: false, sendError: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }

  return NextResponse.json({ success: true, sentTo: formData.customer.email, referenceId });
}
