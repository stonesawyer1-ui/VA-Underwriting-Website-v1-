import { Document, Page, Text, View } from "@react-pdf/renderer";
import { formatCurrency, formatPercent } from "@/lib/underwriting/format";
import { sharedStyles, Table, Letterhead, SectionHeading, RunningFooter } from "@/lib/pdf/pdfShared";
import type { UnderwritingOutputs } from "@/lib/workbook/computeUnderwriting";

export type UnderwritingDetailDocumentData = {
  referenceId: string;
  generatedAt: string;
  property: {
    address: string;
    cityStateZip: string;
    county: string;
    propertyType: string;
    bedsBaths: string;
    sqft: number;
    yearBuilt: number;
    price: number;
    expectedMonthlyRent: number;
    yearlyInsurance: number;
    monthlyHoa: number;
  };
  financing: {
    downPayment: number;
    interestRate: number;
    loanLengthYears: number;
  };
  outputs: UnderwritingOutputs;
};

const vaLoanLabels: Record<string, string> = {
  entitlementChargedLoan1: "Entitlement charged — prior loan 1",
  entitlementChargedLoan2: "Entitlement charged — prior loan 2",
  totalEntitlementCharged: "Total entitlement charged (prior loans)",
  totalEntitlementAvailable: "Total entitlement available for this area",
  entitlementRemaining: "Entitlement remaining for a new loan",
  loanNeeded25Pct: "25% of the new loan amount",
  downPaymentNeeded: "Down payment needed",
  canBuyWithZeroDown: "Can buy with $0 down?",
  isFirstTimeUse: "First-time VA loan use?",
  downPaymentPct: "Down payment percentage",
  fundingFeeRatePct: "VA funding fee rate",
  fundingFeeAmount: "VA funding fee amount",
  totalLoanAmount: "Total loan amount (funding fee rolled in)",
};

/** Defensive fallback for any key not in a label map above — "someFieldName" -> "Some field name" — never shows the raw code identifier. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Genuine percentage fields only — "loanNeeded25Pct" is a dollar amount
 * (25% of the loan, expressed in dollars) despite the "Pct" in its name, so
 * a plain `.includes("pct")` check on the key would format it as a
 * percentage and print something like "10000000.00%" for a $100,000 value.
 */
const vaLoanPctKeys = new Set(["downPaymentPct", "fundingFeeRatePct"]);

const outputLabels: Record<string, string> = {
  monthlyPI: "Monthly P&I",
  combinedTaxRatePct: "Combined tax rate",
  ownerOccupiedTaxableValue: "Owner-occupied taxable value",
  ownerOccupiedAnnualTax: "Owner-occupied annual tax",
  rentalAnnualTax: "Rental/investor annual tax",
  annualTax: "Annual tax",
  taxIncreaseOnConversion: "Tax increase on conversion",
  monthlyPropertyTax: "Monthly property tax",
  monthlyInsurance: "Monthly insurance",
  monthlyHoa: "Monthly HOA",
  totalMonthlyPITI: "Total monthly PITI",
  pitiAtOwnerOccupiedRate: "PITI at owner-occupied rate",
  rentAfterVacancy: "Rent after vacancy",
  runningCostsAmount: "Running costs amount",
  moneyLeftOverMonthly: "Money left over / month",
  moneyLeftOverYearly: "Money left over / year",
  capRatePct: "Cap rate",
  cashActuallyPutIn: "Cash actually put in",
  cashOnCashPct: "Cash-on-cash return",
};

const pctKeys = new Set(["combinedTaxRatePct", "capRatePct", "cashOnCashPct"]);
const currencyKeys = new Set([
  "monthlyPI", "ownerOccupiedTaxableValue", "ownerOccupiedAnnualTax", "rentalAnnualTax", "annualTax",
  "taxIncreaseOnConversion", "monthlyPropertyTax", "monthlyInsurance", "monthlyHoa", "totalMonthlyPITI",
  "pitiAtOwnerOccupiedRate", "rentAfterVacancy", "runningCostsAmount", "moneyLeftOverMonthly",
  "moneyLeftOverYearly", "cashActuallyPutIn",
]);

function formatDealValue(key: string, value: number | string): string {
  if (typeof value === "string") return value;
  if (pctKeys.has(key)) return formatPercent(value * 100, 2);
  if (currencyKeys.has(key)) return formatCurrency(value);
  return String(value);
}

export function UnderwritingDetailDocument(data: UnderwritingDetailDocumentData) {
  const { outputs } = data;

  return (
    <Document>
      <Page size="LETTER" style={sharedStyles.page}>
        <Letterhead title="UNDERWRITING DETAIL" subtitle={`Reference ${data.referenceId} — Generated ${data.generatedAt}`} />

        <SectionHeading n={1} title="Property Snapshot" />
        <Table
          rows={[
            ["Address", data.property.address],
            ["City / State / Zip", data.property.cityStateZip],
            ["County", data.property.county],
            ["Property Type", data.property.propertyType],
            ["Beds / Baths", data.property.bedsBaths],
            ["Square Feet", String(data.property.sqft)],
            ["Year Built", String(data.property.yearBuilt)],
            ["Price", formatCurrency(data.property.price)],
            ["Expected Monthly Rent", formatCurrency(data.property.expectedMonthlyRent)],
            ["Yearly Insurance", formatCurrency(data.property.yearlyInsurance)],
            ["Monthly HOA", formatCurrency(data.property.monthlyHoa)],
          ]}
        />

        <SectionHeading n={2} title="Financing" />
        <Table
          rows={[
            ["Down payment", formatCurrency(data.financing.downPayment)],
            ["Interest rate", formatPercent(data.financing.interestRate * 100, 2)],
            ["Loan length (years)", String(data.financing.loanLengthYears)],
          ]}
        />

        <SectionHeading n={3} title="VA Loan Numbers" />
        <Table
          rows={Object.entries(outputs.vaLoanNumbers).map(([key, value]) => [
            vaLoanLabels[key] ?? humanizeKey(key),
            typeof value === "number"
              ? vaLoanPctKeys.has(key)
                ? formatPercent(value * 100, 2)
                : formatCurrency(value)
              : String(value),
          ])}
        />

        <SectionHeading
          n={4}
          title={`Monthly Deal Numbers (${outputs.taxModel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())})`}
        />
        <Table
          rows={Object.entries(outputs.monthlyDealNumbers).map(([key, value]) => [
            outputLabels[key] ?? humanizeKey(key),
            formatDealValue(key, value),
          ])}
        />

        <Text style={sharedStyles.footer}>
          This is a computed detail sheet from Garrison Risk Review&apos;s underwriting workbook — every number above
          comes directly from that workbook&apos;s own formulas, not a separate estimate. It supplements, and does not
          replace, the VA Home Underwriting Report, a licensed appraisal, or advice from a CPA or attorney.
        </Text>

        <RunningFooter leftText={`Garrison Risk Review — ${data.referenceId} — Underwriting Detail`} />
      </Page>
    </Document>
  );
}
