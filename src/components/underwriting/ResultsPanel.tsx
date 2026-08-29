"use client";

import { formatCurrency, formatPercent } from "@/lib/underwriting/format";
import type { ResultsSummary } from "@/lib/underwriting/calculations";

const verdictCopy: Record<ResultsSummary["verdict"], { label: string; tone: string }> = {
  no_rent_entered: {
    label: "Enter a rent estimate below to see your cash-flow verdict.",
    tone: "bg-navy-50 text-navy-900/60",
  },
  cash_flows: {
    label: "This property cash-flows at your rent estimate.",
    tone: "bg-emerald-100 text-emerald-700",
  },
  breaks_even: {
    label: "This property roughly breaks even at your rent estimate.",
    tone: "bg-amber-100 text-amber-700",
  },
  does_not_cash_flow: {
    label: "This property does not cash-flow at your rent estimate.",
    tone: "bg-red-100 text-red-700",
  },
};

export function ResultsPanel({ results }: { results: ResultsSummary }) {
  const verdict = verdictCopy[results.verdict];

  return (
    <div className="rounded-sm border border-navy-900/10 bg-white shadow-xl shadow-navy-950/10">
      <div className="border-b border-navy-900/10 p-6">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-navy-900/40 uppercase">
          Live Results
        </p>
        <h2 className="mt-1.5 font-display text-lg font-bold text-navy-900">
          First-Pass Underwriting
        </h2>
      </div>

      <div className="space-y-5 p-6">
        <div className={`rounded-sm px-4 py-3 text-sm font-semibold ${verdict.tone}`}>
          {verdict.label}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Stat label="Monthly PITI" value={formatCurrency(results.monthlyPITI)} />
          <Stat label="Break-Even Rent" value={formatCurrency(results.breakEvenRent)} />
          <Stat
            label="Cap Rate"
            value={results.capRatePct === null ? "—" : formatPercent(results.capRatePct)}
          />
          <Stat
            label="Cash-on-Cash"
            value={results.cashOnCashPct === null ? "N/A (no cash invested)" : formatPercent(results.cashOnCashPct)}
          />
        </div>

        {results.rentScenarios.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/40 uppercase">
              Cash Flow by Rent Scenario
            </p>
            <div className="mt-3 space-y-2">
              {results.rentScenarios.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-sm bg-navy-50 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-xs font-semibold text-navy-900">{s.label} Rent</p>
                    <p className="text-xs text-navy-900/50">{formatCurrency(s.monthlyRent)}/mo</p>
                  </div>
                  <p
                    className={`text-sm font-bold ${
                      s.monthlyCashFlow >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {s.monthlyCashFlow >= 0 ? "+" : ""}
                    {formatCurrency(s.monthlyCashFlow)}/mo
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-navy-900/10 pt-5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/40 uppercase">
            Financing
          </p>
          <dl className="mt-2 space-y-1.5">
            <Row label="Loan amount" value={formatCurrency(results.financing.loanAmount)} />
            <Row
              label="Funding fee"
              value={`${formatPercent(results.financing.fundingFeeRatePct)} (${formatCurrency(results.financing.fundingFeeAmount)})`}
            />
            <Row label="Total loan amount" value={formatCurrency(results.financing.totalLoanAmount)} />
            <Row label="Monthly P&I" value={formatCurrency(results.financing.monthlyPI)} />
            <Row
              label="Required down payment"
              value={formatCurrency(results.entitlement.requiredDownPayment)}
            />
          </dl>
        </div>

        <div className="border-t border-navy-900/10 pt-5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-navy-900/40 uppercase">
            Property Tax
          </p>
          {results.tax.hasOwnerRentalSplit ? (
            <dl className="mt-2 space-y-1.5">
              <Row label="Owner-occupied (annual)" value={formatCurrency(results.tax.ownerOccupiedAnnualTax)} />
              <Row label="Rental (annual)" value={formatCurrency(results.tax.rentalAnnualTax)} />
            </dl>
          ) : (
            <dl className="mt-2 space-y-1.5">
              <Row label="Annual tax" value={formatCurrency(results.tax.rentalAnnualTax)} />
            </dl>
          )}
          <p className="mt-2 text-xs leading-relaxed text-navy-900/50">{results.tax.note}</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-navy-50 p-3.5">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-navy-900/40 uppercase">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-navy-900">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-navy-900/50">{label}</dt>
      <dd className="font-medium text-navy-900">{value}</dd>
    </div>
  );
}
