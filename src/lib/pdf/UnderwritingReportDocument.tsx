import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatPercent } from "@/lib/underwriting/format";
import {
  RED,
  GREY,
  GREEN,
  sharedStyles,
  Table,
  Letterhead,
  SectionHeading,
  StatCard,
  RunningFooter,
  CashFlowBarChart,
} from "@/lib/pdf/pdfShared";
import type { CondoApproval, MarketTrendBullet } from "@/lib/research/researchMemoNarrative";

const styles = { ...sharedStyles, ...StyleSheet.create({
  flagBox: { borderWidth: 1, padding: 10, marginTop: 6, marginBottom: 6, borderRadius: 2 },
  flagBoxRed: { borderColor: RED, backgroundColor: "#FBE3E6" },
  flagBoxAmber: { borderColor: "#B8860B", backgroundColor: "#FBF3D9" },
  flagBoxGreen: { borderColor: "#1E7A3C", backgroundColor: "#E5F3E8" },
  flagTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 3 },
  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 10, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },

  verdictBanner: { borderRadius: 3, padding: 14, marginBottom: 18, alignItems: "center" },
  verdictBannerRed: { backgroundColor: "#C8102E" },
  verdictBannerAmber: { backgroundColor: "#B8860B" },
  verdictBannerGreen: { backgroundColor: "#1E7A3C" },
  verdictBannerLabel: { fontSize: 7.5, fontWeight: 700, color: "#fff", letterSpacing: 2, opacity: 0.85 },
  verdictBannerText: { fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 4, textAlign: "center" },
}) };

export type UnderwritingReportData = {
  propertyAddressLine: string;
  county: string;
  propertyTypeLine: string;
  isCondo: boolean;
  preparedFor: string;
  dateOfMemo: string;
  underwritingSource: string;
  purchasePrice: number;
  loanAmount: number;
  interestRatePct: number;
  occupancyStatus: string;
  pcsNote: string;

  hasOwnerRentalSplit: boolean;
  ownerOccupiedAnnualTax: number | null;
  rentalAnnualTax: number;
  taxIncreaseAnnual: number | null;
  taxInsights: { note: string; source: string | null }[];
  taxDisclaimer: string | null;

  monthlyPI: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  totalPITI: number;
  vacancyAllowancePct: number;
  runningCostsPct: number;
  runningCostsAmount: number;
  rentUsed: number;
  rentConfidenceLabel: string;
  rentComparison: {
    buyerEstimate: { monthly: number; confidence: "low" | "moderate" | "high" } | null;
    researchEstimate: { monthly: number; confidence: "low" | "moderate" | "high" } | null;
  } | null;
  /**
   * Evidence-based accuracy assessment for a BUYER-SUPPLIED rent figure,
   * built from research's own comps/range (see rentAccuracyNarrative.ts) —
   * null whenever rent came from research or a regional average instead,
   * since rentConfidenceLabel above already covers those cases. Added
   * 2026-09-03 per the owner's policy: a buyer-supplied number is used for
   * the math regardless of the buyer's own confidence rating, but the
   * report still owes the reader an honest, evidence-based read on it.
   */
  rentAccuracyNarrative: string | null;
  rentAfterVacancy: number;
  moneyLeftOverMonthly: number;
  moneyLeftOverYearly: number;
  cashOnCashPct: number;
  capRatePct: number;
  rentComps: { address: string; rent: number; beds: number; baths: number; source: string }[];

  entitlementFirstUse: boolean;
  entitlementAvailable: number;
  fundingFeeWaived: boolean;
  fundingFeeRatePct: number;

  condoApproval: CondoApproval | null;
  marketTrends: { note: string; sourcesConflict: boolean; bullets: MarketTrendBullet[] } | null;
  positiveFactors: string[];
  marketRiskRating: "LOW" | "MEDIUM" | "MEDIUM-HIGH" | "HIGH" | null;

  referenceId: string;
};

function verdictOf(data: UnderwritingReportData): { label: string; tone: "red" | "amber" | "green" } {
  const tolerance = 25;
  if (data.moneyLeftOverMonthly > tolerance) return { label: "PROCEED — this property cash-flows as modeled.", tone: "green" };
  if (data.moneyLeftOverMonthly < -tolerance)
    return { label: "DO NOT PROCEED AS MODELED — this property does not cash-flow as a rental under these numbers.", tone: "red" };
  return { label: "MARGINAL — this property roughly breaks even as modeled.", tone: "amber" };
}

export function UnderwritingReportDocument(data: UnderwritingReportData) {
  const verdict = verdictOf(data);
  const flagStyle =
    verdict.tone === "red" ? styles.flagBoxRed : verdict.tone === "amber" ? styles.flagBoxAmber : styles.flagBoxGreen;
  const verdictBannerStyle =
    verdict.tone === "red" ? styles.verdictBannerRed : verdict.tone === "amber" ? styles.verdictBannerAmber : styles.verdictBannerGreen;

  let headingNum = 1;

  const entitlementBullet = data.entitlementFirstUse
    ? `This would be ${data.preparedFor}'s first VA loan use, so full entitlement (${formatCurrency(data.entitlementAvailable)} for this loan limit) is available${data.fundingFeeWaived ? ", and the funding fee is waived by the buyer's disability rating." : " and $0 down is achievable — the deal's rental economics don't constrain future VA-loan stacking."}`
    : `${data.preparedFor} has used VA entitlement before — ${formatCurrency(data.entitlementAvailable)} remains available for this loan limit.${data.fundingFeeWaived ? " The funding fee is waived by the buyer's disability rating." : ` Funding fee rate: ${formatPercent(data.fundingFeeRatePct * 100, 2)}, rolled into the loan amount above.`}`;

  const condoUnapproved = data.condoApproval?.applicable && data.condoApproval.status !== "approved";
  const totalMonthlyCost = data.totalPITI + data.runningCostsAmount;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Letterhead title="INDEPENDENT BUYER RISK MEMORANDUM" subtitle="VA-Financed Residential Property — Buyer Risk Review" />

        <View style={[styles.verdictBanner, verdictBannerStyle]}>
          <Text style={styles.verdictBannerLabel}>OVERALL RECOMMENDATION</Text>
          <Text style={styles.verdictBannerText}>{verdict.label}</Text>
        </View>

        <View style={styles.statRow}>
          <StatCard
            label="Monthly Cash Flow"
            value={formatCurrency(data.moneyLeftOverMonthly)}
            tone={data.moneyLeftOverMonthly < 0 ? "red" : "green"}
          />
          <StatCard label="Cash-on-Cash Return" value={formatPercent(data.cashOnCashPct, 1)} />
          <StatCard label="Cap Rate" value={formatPercent(data.capRatePct * 100, 1)} />
          <StatCard label="Total Monthly PITI" value={formatCurrency(data.totalPITI)} />
        </View>

        <Table
          rows={[
            ["Property Address", data.propertyAddressLine],
            ["County / Tax District", data.county],
            ["Property Type", data.propertyTypeLine],
            ["Prepared For (Buyer)", data.preparedFor],
            ["Prepared By", "Independent Risk Review Agent"],
            ["Date of Memo", data.dateOfMemo],
            ["Underwriting Source", data.underwritingSource],
            ["Purchase Price", formatCurrency(data.purchasePrice)],
            ["Loan Amount (funding fee rolled in)", formatCurrency(data.loanAmount)],
            ["Interest Rate", `${formatPercent(data.interestRatePct * 100, 2)}`],
            ["Current Occupancy Status", data.occupancyStatus],
            ["Projected PCS / Move-Out Date", data.pcsNote],
          ]}
        />

        <SectionHeading n={headingNum++} title="Purpose & Scope" />
        <Text style={styles.p}>
          This memorandum is a complied assessment of the underwriting at {data.propertyAddressLine}. It is written
          for {data.preparedFor}&apos;s benefit and does not replace a licensed appraisal, CPA tax opinion, or
          attorney review. It focuses on what changes financially once this property converts from primary residence
          to a rental after a future PCS.
        </Text>

        {data.condoApproval?.applicable && (
          <>
            <SectionHeading n={headingNum++} title="VA Condo Project Approval Risk" />
            <View style={[styles.flagBox, condoUnapproved ? styles.flagBoxRed : styles.flagBoxGreen]}>
              <Text style={styles.flagTitle}>
                {data.condoApproval.status === "approved"
                  ? "Project confirmed on the VA's approved condo list"
                  : data.condoApproval.status === "not_approved"
                    ? "Project is NOT on the VA's approved condo list"
                    : "Project approval status could not be confirmed"}
              </Text>
              <Text style={styles.p}>{data.condoApproval.note}</Text>
              {data.condoApproval.source && <Text style={{ fontSize: 7.5, color: GREY }}>Source: {data.condoApproval.source}</Text>}
              <Text style={styles.p}>
                This is a financing-eligibility risk that sits above the cash-flow numbers below — an unapproved (or
                unconfirmed) project can block VA financing entirely regardless of how the deal otherwise pencils
                out.
              </Text>
            </View>
          </>
        )}

        <SectionHeading n={headingNum++} title="Tax Spike Risk" />
        {data.hasOwnerRentalSplit && data.ownerOccupiedAnnualTax !== null ? (
          <Table
            rows={[
              ["Owner-occupied annual tax", formatCurrency(data.ownerOccupiedAnnualTax)],
              ["Rental / investor annual tax", formatCurrency(data.rentalAnnualTax)],
              [
                "Increase upon conversion to rental",
                `${formatCurrency(data.taxIncreaseAnnual ?? 0)}/yr (~${formatCurrency((data.taxIncreaseAnnual ?? 0) / 12)}/mo)`,
              ],
            ]}
          />
        ) : (
          <>
            <Table rows={[["Annual property tax (owner-occupied and rental — same rate)", formatCurrency(data.rentalAnnualTax)]]} />
            <Text style={styles.p}>
              This state&apos;s tax mechanism doesn&apos;t create an owner-vs-rental gap for a typical buyer — $0
              increase on conversion to a rental.
            </Text>
          </>
        )}
        {data.taxDisclaimer && (
          <View style={[styles.flagBox, styles.flagBoxAmber]}>
            <Text style={styles.flagTitle}>Disclaimer — Possible Tax Relief Not Reflected Above</Text>
            <Text style={styles.p}>{data.taxDisclaimer}</Text>
          </View>
        )}
        {data.taxInsights.map((insight, i) => (
          <View key={i} style={[styles.flagBox, styles.flagBoxAmber]}>
            <Text style={styles.flagTitle}>Tax Note (informational — not tax or legal advice)</Text>
            <Text style={styles.p}>{insight.note}</Text>
            {insight.source && <Text style={{ fontSize: 7.5, color: GREY }}>Source: {insight.source}</Text>}
          </View>
        ))}

        <SectionHeading n={headingNum++} title="Rent Coverage vs. Adjusted Post-PCS Cost" />
        <CashFlowBarChart rentAfterVacancy={data.rentAfterVacancy} totalMonthlyCost={totalMonthlyCost} />
        <Table
          rows={[
            ["Principal & Interest", formatCurrency(data.monthlyPI)],
            ["Property Tax (rental rate)", formatCurrency(data.monthlyPropertyTax)],
            ["Insurance", formatCurrency(data.monthlyInsurance)],
            ["HOA", formatCurrency(data.monthlyHoa)],
            ["Total PITI (rental tax rate)", formatCurrency(data.totalPITI)],
            [`Vacancy allowance (${formatPercent(data.vacancyAllowancePct * 100, 0)} of rent)`, formatCurrency(data.rentUsed * data.vacancyAllowancePct)],
            [
              `Maintenance/management reserve (${formatPercent(data.runningCostsPct * 100, 0)} of rent)`,
              formatCurrency(data.runningCostsAmount),
            ],
          ]}
        />
        {data.rentComparison && data.rentComparison.buyerEstimate && data.rentComparison.researchEstimate && (
          <Table
            rows={[
              ["Buyer-supplied rent estimate", `${formatCurrency(data.rentComparison.buyerEstimate.monthly)}/mo (${data.rentComparison.buyerEstimate.confidence} confidence)`],
              ["Area market research rent", `${formatCurrency(data.rentComparison.researchEstimate.monthly)}/mo (${data.rentComparison.researchEstimate.confidence} confidence)`],
            ]}
          />
        )}
        <Text style={styles.p}>
          Rent used in the underwriting: {formatCurrency(data.rentUsed)}/mo — {data.rentConfidenceLabel}. Rent after
          vacancy allowance: {formatCurrency(data.rentAfterVacancy)}/mo. Money left over per month:{" "}
          <Text style={{ fontWeight: 700, color: data.moneyLeftOverMonthly < 0 ? RED : GREEN }}>
            {formatCurrency(data.moneyLeftOverMonthly)}
          </Text>
          . Money left over per year: {formatCurrency(data.moneyLeftOverYearly)}. Cash-on-cash return:{" "}
          {formatPercent(data.cashOnCashPct, 2)}. Cap rate: {formatPercent(data.capRatePct * 100, 2)}.
        </Text>

        {data.rentAccuracyNarrative && (
          <View style={[styles.flagBox, styles.flagBoxAmber]}>
            <Text style={styles.flagTitle}>Rent Estimate — Accuracy Evidence (Buyer-Supplied Figure)</Text>
            <Text style={styles.p}>{data.rentAccuracyNarrative}</Text>
          </View>
        )}

        {data.rentComps.length > 0 && (
          <View style={styles.table}>
            <View style={styles.rowHeader}>
              <Text style={[styles.cellHeaderL, { flex: 1.6 }]}>Comparable</Text>
              <Text style={styles.cellHeaderL}>Rent</Text>
              <Text style={styles.cellHeaderL}>Bed/Bath</Text>
            </View>
            {data.rentComps.map((c, i) => (
              <View key={i} style={i % 2 === 0 ? styles.row : styles.rowAlt}>
                <Text style={[styles.cellL, { flex: 1.6 }]}>{c.address}</Text>
                <Text style={styles.cellL}>{formatCurrency(c.rent)}</Text>
                <Text style={styles.cellL}>
                  {c.beds}bd/{c.baths}ba
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={flagStyle}>
          <Text style={styles.flagTitle}>Rent Sufficiency — Detailed Rationale</Text>
          <Text style={styles.p}>{verdict.label}</Text>
        </View>

        <SectionHeading n={headingNum++} title="Local Market Trends" />
        {data.marketTrends ? (
          <>
            <Text style={styles.p}>{data.marketTrends.note}</Text>
            {data.marketTrends.sourcesConflict && (
              <View style={[styles.flagBox, styles.flagBoxAmber]}>
                <Text style={styles.flagTitle}>Genuinely Mixed Signals</Text>
                <Text style={styles.p}>
                  Sources disagree on this market&apos;s direction — that dispersion is itself worth flagging as a
                  risk factor, suggesting real volatility rather than a clean read in either direction.
                </Text>
              </View>
            )}
            {data.marketTrends.bullets.map((b, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>
                  {b.note}
                  {b.source ? ` (${b.source})` : ""}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.p}>Market trend research is not available for this submission.</Text>
        )}

        <SectionHeading n={headingNum++} title="Positive Factors" />
        <Text style={{ fontSize: 9, fontStyle: "italic", color: GREY, marginBottom: 6 }}>
          Balancing the risk items above:
        </Text>
        {[...data.positiveFactors, entitlementBullet].map((f, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{f}</Text>
          </View>
        ))}

        <SectionHeading n={headingNum++} title="Summary Risk Rating" />
        <Table
          rows={[
            [
              "Tax Spike Risk",
              !data.hasOwnerRentalSplit
                ? "NONE — no owner-vs-rental gap under this state's mechanism"
                : data.taxIncreaseAnnual && data.taxIncreaseAnnual > 2000
                  ? "MEDIUM-HIGH — material increase confirmed on conversion to rental"
                  : "LOW-MEDIUM — modest increase confirmed on conversion to rental",
            ],
            [
              "Rent Coverage Risk",
              data.moneyLeftOverMonthly < -25
                ? "HIGH — confirmed negative cash flow under these numbers"
                : data.moneyLeftOverMonthly > 25
                  ? "LOW — confirmed positive cash flow under these numbers"
                  : "MEDIUM — roughly breaks even under these numbers",
            ],
            ...(data.marketRiskRating ? ([["Market Trend Risk", data.marketRiskRating]] as [string, string][]) : []),
            ...(data.condoApproval?.applicable
              ? ([
                  [
                    "VA Financing Eligibility",
                    data.condoApproval.status === "approved"
                      ? "CONFIRMED — project is on the VA's approved condo list"
                      : "AT RISK — condo project approval is not confirmed",
                  ],
                ] as [string, string][])
              : []),
            ["Overall Recommendation", verdict.label],
          ]}
        />

        <Text style={styles.footer}>
          Reference {data.referenceId}. This memorandum reflects an independent review as of the date above and is
          intended to supplement, not replace, {data.preparedFor}&apos;s own due diligence, a licensed appraisal, and
          consultation with a CPA and attorney regarding tax and legal matters specific to this transaction. Garrison
          Risk Review is not affiliated with, endorsed by, or acting on behalf of the Department of Veterans Affairs.
        </Text>

        <RunningFooter leftText={`Garrison Risk Review — ${data.referenceId} — ${data.propertyAddressLine}`} />
      </Page>
    </Document>
  );
}
