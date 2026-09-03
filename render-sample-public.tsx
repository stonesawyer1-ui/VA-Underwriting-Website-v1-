// Dev-only, uncommitted: generates the redacted sample PDF that ships in
// public/ and is linked from /sample-report. Run with `npx tsx
// render-sample-public.tsx` after any change to UnderwritingReportDocument
// so the downloadable sample stays byte-for-byte the real renderer's
// output — never hand-build a look-alike.
import { renderToFile } from "@react-pdf/renderer";
import { UnderwritingReportDocument, type UnderwritingReportData } from "./src/lib/pdf/UnderwritingReportDocument";

const reportData: UnderwritingReportData = {
  propertyAddressLine: "123 Sample Ct, Fayetteville, NC 28303",
  county: "Cumberland County, NC",
  propertyTypeLine: "Single-Family Residence, 3bd/2ba, 1,540 sqft, built 2006",
  isCondo: false,
  preparedFor: "Sample Buyer",
  dateOfMemo: "September 4, 2026",
  underwritingSource: "Garrison Risk Review automated underwriting pipeline (GRR-SAMPLE01) — filled workbook attached",
  purchasePrice: 285000,
  loanAmount: 285000,
  interestRatePct: 0.0625,
  occupancyStatus: "Currently owner-occupied (buyer's primary residence)",
  pcsNote: "Estimated PCS / move-out: June 2027",

  hasOwnerRentalSplit: false,
  ownerOccupiedAnnualTax: null,
  rentalAnnualTax: 2650,
  taxIncreaseAnnual: null,
  taxInsights: [
    {
      note: "North Carolina applies one tax rate regardless of owner-occupancy status — there is no separate rental/investor assessment ratio the way South Carolina or Texas have.",
      source: "Cumberland County Tax Administrator",
    },
  ],
  taxDisclaimer: null,

  monthlyPI: 1755,
  monthlyPropertyTax: 221,
  monthlyInsurance: 132,
  monthlyHoa: 0,
  totalPITI: 2108,
  vacancyAllowancePct: 0.08,
  runningCostsPct: 0.1,
  runningCostsAmount: 265,
  rentUsed: 2650,
  rentConfidenceLabel: "high confidence (area market research)",
  rentComparison: { buyerEstimate: null, researchEstimate: null },
  rentAccuracyNarrative: null,
  rentAfterVacancy: 2438,
  moneyLeftOverMonthly: 65,
  moneyLeftOverYearly: 780,
  cashOnCashPct: 1.8,
  capRatePct: 0.058,
  rentComps: [
    { address: "410 Deep Creek Rd, Fayetteville, NC", rent: 2625, beds: 3, baths: 2, source: "Zillow" },
    { address: "88 Ramsey St, Fayetteville, NC", rent: 2695, beds: 3, baths: 2, source: "Apartments.com" },
    { address: "1204 Bragg Blvd, Fayetteville, NC", rent: 2650, beds: 3, baths: 1.5, source: "Realtor.com" },
  ],
  rentSearchRadiusMiles: 10,

  entitlementFirstUse: true,
  entitlementAvailable: 138750,
  fundingFeeWaived: false,
  fundingFeeRatePct: 0.0215,

  condoApproval: null,
  marketTrends: {
    note: "Fayetteville's rental market has stayed steady near Fort Bragg-Liberty, with demand closely tracking the installation's PCS cycle.",
    sourcesConflict: false,
    bullets: [
      { note: "Median rents up roughly 3% year-over-year", source: "Apartments.com Market Trends" },
    ],
  },
  positiveFactors: [
    "Property is in good condition per buyer's description, requiring no immediate capital improvements before renting.",
    "North Carolina's flat tax structure means no post-PCS tax spike risk, unlike states with a homestead exemption gap.",
  ],
  marketRiskRating: "MEDIUM",

  referenceId: "GRR-SAMPLE01",
};

async function main() {
  await renderToFile(<UnderwritingReportDocument {...reportData} />, "./public/sample-underwriting-report.pdf");
  console.log("done");
}

main();
