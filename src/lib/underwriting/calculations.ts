import { CASH_FLOW_BREAKEVEN_TOLERANCE, RENT_RANGE_BY_CONFIDENCE } from "./constants";
import { calculateTax, type TaxResult } from "./taxModels";
import { getStateModelId } from "./constants";
import type { UnderwritingFormData } from "./types";

export type EntitlementResult = {
  entitlementCharged: number;
  firstTimeUse: boolean;
  totalEntitlementAvailable: number;
  entitlementRemaining: number;
  requiredDownPayment: number;
};

export function calculateEntitlement(
  data: UnderwritingFormData,
  purchasePrice: number,
): EntitlementResult {
  const entitlementCharged = data.priorVaLoans
    .filter((l) => l.status === "open")
    .reduce((sum, l) => sum + (l.originalLoanAmount || 0) * 0.25, 0);
  const firstTimeUse = data.priorVaLoans.length === 0;
  const totalEntitlementAvailable = (data.financing.countyLoanLimit || 0) * 0.25;
  const entitlementRemaining = totalEntitlementAvailable - entitlementCharged;
  const requiredDownPayment = Math.max(0, purchasePrice * 0.25 - entitlementRemaining);

  return {
    entitlementCharged,
    firstTimeUse,
    totalEntitlementAvailable,
    entitlementRemaining,
    requiredDownPayment,
  };
}

export type FinancingResult = {
  downPaymentPct: number;
  fundingFeeRatePct: number;
  loanAmount: number;
  fundingFeeAmount: number;
  totalLoanAmount: number;
  monthlyPI: number;
};

export function calculateFinancing(
  data: UnderwritingFormData,
  purchasePrice: number,
  firstTimeUse: boolean,
): FinancingResult {
  const downPayment = data.financing.downPayment || 0;
  const downPaymentPct = purchasePrice > 0 ? downPayment / purchasePrice : 0;

  let fundingFeeRatePct: number;
  if (data.customer.vaDisabilityRating) {
    fundingFeeRatePct = 0;
  } else if (downPaymentPct >= 0.1) {
    fundingFeeRatePct = 1.25;
  } else if (downPaymentPct >= 0.05) {
    fundingFeeRatePct = 1.5;
  } else if (firstTimeUse) {
    fundingFeeRatePct = 2.15;
  } else {
    fundingFeeRatePct = 3.3;
  }

  const loanAmount = Math.max(0, purchasePrice - downPayment);
  const fundingFeeAmount = loanAmount * (fundingFeeRatePct / 100);
  const totalLoanAmount = loanAmount + fundingFeeAmount;

  const interestRate = typeof data.financing.interestRate === "number" ? data.financing.interestRate : 0;
  const termYears = data.financing.loanTermYears || 30;
  const monthlyPI = calculateMonthlyPI(totalLoanAmount, interestRate, termYears);

  return { downPaymentPct, fundingFeeRatePct, loanAmount, fundingFeeAmount, totalLoanAmount, monthlyPI };
}

export function calculateMonthlyPI(principal: number, annualRatePct: number, termYears: number): number {
  const monthlyRate = annualRatePct / 100 / 12;
  const numPayments = termYears * 12;
  if (numPayments <= 0) return 0;
  if (monthlyRate === 0) return principal / numPayments;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));
}

export type RentScenario = {
  label: string;
  monthlyRent: number;
  effectiveMonthlyIncome: number;
  monthlyCashFlow: number;
};

export type ResultsSummary = {
  entitlement: EntitlementResult;
  financing: FinancingResult;
  tax: TaxResult;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyPITI: number;
  breakEvenRent: number;
  rentScenarios: RentScenario[];
  baseCaseCashFlow: number;
  capRatePct: number | null;
  cashOnCashPct: number | null;
  verdict: "cash_flows" | "breaks_even" | "does_not_cash_flow" | "no_rent_entered";
};

export function calculateResults(data: UnderwritingFormData): ResultsSummary {
  const purchasePrice = typeof data.property.purchasePrice === "number" ? data.property.purchasePrice : 0;

  const entitlement = calculateEntitlement(data, purchasePrice);
  const financing = calculateFinancing(data, purchasePrice, entitlement.firstTimeUse);

  const modelId = getStateModelId(data.property.state);
  const tax = calculateTax(purchasePrice, data.property.state, data.tax, modelId);

  const monthlyTax = tax.applicableAnnualTax / 12;
  const insuranceAnnual = data.expenses.insuranceAnnual || 0;
  const monthlyInsurance = insuranceAnnual / 12;

  const monthlyPITI = financing.monthlyPI + monthlyTax + monthlyInsurance + (data.financing.hoaMonthly || 0);

  const vacancyFraction = (data.expenses.vacancyPct || 0) / 100;
  const reserveFraction = (data.expenses.reservePct || 0) / 100;
  const retainedFraction = 1 - vacancyFraction - reserveFraction;

  const breakEvenRent = retainedFraction > 0 ? monthlyPITI / retainedFraction : Infinity;

  const monthlyRent = typeof data.rentEstimate.monthlyRent === "number" ? data.rentEstimate.monthlyRent : 0;
  const rangePct = RENT_RANGE_BY_CONFIDENCE[data.rentEstimate.confidence];

  const scenarioDefs: { label: string; rent: number }[] = monthlyRent
    ? [
        { label: "Low", rent: monthlyRent * (1 - rangePct) },
        { label: "Base", rent: monthlyRent },
        { label: "High", rent: monthlyRent * (1 + rangePct) },
      ]
    : [];

  const rentScenarios: RentScenario[] = scenarioDefs.map((s) => {
    const effectiveMonthlyIncome = s.rent * retainedFraction;
    return {
      label: s.label,
      monthlyRent: s.rent,
      effectiveMonthlyIncome,
      monthlyCashFlow: effectiveMonthlyIncome - monthlyPITI,
    };
  });

  const baseCaseCashFlow = rentScenarios.find((s) => s.label === "Base")?.monthlyCashFlow ?? 0;

  let capRatePct: number | null = null;
  let cashOnCashPct: number | null = null;

  if (monthlyRent > 0 && purchasePrice > 0) {
    const grossAnnualRent = monthlyRent * 12;
    const effectiveGrossIncome = grossAnnualRent * (1 - vacancyFraction);
    const annualReserve = grossAnnualRent * reserveFraction;
    const operatingExpenses = tax.applicableAnnualTax + insuranceAnnual + (data.financing.hoaMonthly || 0) * 12 + annualReserve;
    const noi = effectiveGrossIncome - operatingExpenses;
    capRatePct = (noi / purchasePrice) * 100;

    const annualDebtService = financing.monthlyPI * 12;
    const annualCashFlow = noi - annualDebtService;
    const cashInvested = data.financing.downPayment || 0;
    cashOnCashPct = cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : null;
  }

  let verdict: ResultsSummary["verdict"];
  if (monthlyRent <= 0) {
    verdict = "no_rent_entered";
  } else if (baseCaseCashFlow > CASH_FLOW_BREAKEVEN_TOLERANCE) {
    verdict = "cash_flows";
  } else if (baseCaseCashFlow < -CASH_FLOW_BREAKEVEN_TOLERANCE) {
    verdict = "does_not_cash_flow";
  } else {
    verdict = "breaks_even";
  }

  return {
    entitlement,
    financing,
    tax,
    monthlyTax,
    monthlyInsurance,
    monthlyPITI,
    breakEvenRent,
    rentScenarios,
    baseCaseCashFlow,
    capRatePct,
    cashOnCashPct,
    verdict,
  };
}
