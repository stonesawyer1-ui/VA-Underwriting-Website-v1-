import type { UnderwritingFormData } from "@/lib/underwriting/types";
import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { RentResearchOutcome } from "@/lib/research/researchRentEstimate";
import type { TaxModelId } from "@/lib/workbook/cellMap";
import type { UnderwritingInputs } from "@/lib/workbook/computeUnderwriting";
import { getStateModelId } from "@/lib/underwriting/constants";
import { regionalRentEstimate, regionalInsuranceEstimate } from "@/lib/research/regionalAverages";
import { propertyTypeLabel } from "@/lib/underwriting/defaults";

/** number | "" -> 0, for the tax sub-object fields (and anything else sharing that clear-and-retype pattern) at the one place they're actually consumed. */
function numOr0(v: number | ""): number {
  return typeof v === "number" ? v : 0;
}

/** Client form field names -> engine cell-map field names (only homestead_exemption differs). */
function clientTaxInputsForModel(data: UnderwritingFormData, model: TaxModelId): Record<string, number> {
  switch (model) {
    case "assessment_ratio": {
      const f = data.tax.assessmentRatio;
      return {
        totalMillageRate: numOr0(f.totalMillageRate),
        schoolOperatingMillage: numOr0(f.schoolOperatingMillage),
        schoolBondMillage: numOr0(f.schoolBondMillage),
        ownerAssessmentRatioPct: numOr0(f.ownerAssessmentRatioPct),
        investorAssessmentRatioPct: numOr0(f.investorAssessmentRatioPct),
      };
    }
    case "homestead_exemption":
      return {
        cityTaxRatePct: numOr0(data.tax.homesteadExemption.cityRatePct),
        schoolIsdTaxRatePct: numOr0(data.tax.homesteadExemption.schoolIsdRatePct),
        countyTaxRatePct: numOr0(data.tax.homesteadExemption.countyRatePct),
        schoolHomesteadExemption: numOr0(data.tax.homesteadExemption.schoolHomesteadExemption),
      };
    case "flat_rate":
      return { combinedTaxRatePct: numOr0(data.tax.flatRate.combinedTaxRatePct) };
    case "fallback":
      return { estimatedEffectiveTaxRatePct: numOr0(data.tax.fallback.estimatedEffectiveTaxRatePct) };
  }
}

function clientTouchedForModel(data: UnderwritingFormData, model: TaxModelId): Set<string> {
  if (model === "assessment_ratio") return new Set(Object.keys(data.tax.assessmentRatioTouched).filter((k) => data.tax.assessmentRatioTouched[k as keyof typeof data.tax.assessmentRatioTouched]));
  if (model === "flat_rate") return new Set(Object.keys(data.tax.flatRateTouched).filter((k) => data.tax.flatRateTouched[k as keyof typeof data.tax.flatRateTouched]));
  if (model === "homestead_exemption") {
    const touched = data.tax.homesteadExemptionTouched;
    const engineKeys: string[] = [];
    if (touched.cityRatePct) engineKeys.push("cityTaxRatePct");
    if (touched.schoolIsdRatePct) engineKeys.push("schoolIsdTaxRatePct");
    if (touched.countyRatePct) engineKeys.push("countyTaxRatePct");
    if (touched.schoolHomesteadExemption) engineKeys.push("schoolHomesteadExemption");
    return new Set(engineKeys);
  }
  return new Set();
}

export type TaxFieldSource = "customer" | "research_confirmed" | "default_estimate";

export type ResolvedTaxInputs = {
  taxModel: TaxModelId;
  taxInputs: Record<string, number>;
  /** Field name -> where the value ultimately came from, for the confidence gate and PDF badges. */
  fieldSources: Record<string, TaxFieldSource>;
};

/**
 * Customer-typed values always win. Research fills genuine gaps (fields the
 * customer never touched). If research determines a different tax model
 * than the client's static state guess, research's model and fields take
 * over entirely, since the customer's edits don't map onto a different
 * model's fields.
 */
export function resolveTaxInputs(data: UnderwritingFormData, research: ResearchOutcome): ResolvedTaxInputs {
  const clientModel = getStateModelId(data.property.state);

  if (research.status !== "ok" || research.result.taxModel === "fallback") {
    const taxInputs = clientTaxInputsForModel(data, clientModel);
    const touched = clientTouchedForModel(data, clientModel);
    const fieldSources: ResolvedTaxInputs["fieldSources"] = {};
    for (const key of Object.keys(taxInputs)) {
      fieldSources[key] = touched.has(key) ? "customer" : "default_estimate";
    }
    return { taxModel: clientModel, taxInputs, fieldSources };
  }

  const researchModel = research.result.taxModel;
  const fieldSources: ResolvedTaxInputs["fieldSources"] = {};

  if (researchModel !== clientModel) {
    // Research overrides the client's static model guess entirely.
    const taxInputs: Record<string, number> = {};
    for (const [key, field] of Object.entries(research.result.taxFields)) {
      if (field.value !== null) {
        taxInputs[key] = field.value;
        fieldSources[key] = field.confidence === "Confirmed" ? "research_confirmed" : "default_estimate";
      }
    }
    return { taxModel: researchModel, taxInputs, fieldSources };
  }

  // Same model: customer-touched values win; research fills the rest.
  const clientInputs = clientTaxInputsForModel(data, clientModel);
  const touched = clientTouchedForModel(data, clientModel);
  const taxInputs: Record<string, number> = { ...clientInputs };
  for (const [key, field] of Object.entries(research.result.taxFields)) {
    if (touched.has(key)) {
      fieldSources[key] = "customer";
      continue;
    }
    if (field.value !== null) {
      taxInputs[key] = field.value;
      fieldSources[key] = field.confidence === "Confirmed" ? "research_confirmed" : "default_estimate";
    } else {
      fieldSources[key] = "default_estimate";
    }
  }
  return { taxModel: clientModel, taxInputs, fieldSources };
}

/**
 * Every "*Pct" field, from both the client form and Claude's research, is a
 * plain percentage number (6.5 for 6.5%) — the workbook engine's cells store
 * true fractions (0.065), matching how the real Excel template's "0.00%"
 * number format works. Convert once, here, rather than at every call site.
 */
function toEngineFractions(taxInputs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(taxInputs)) {
    out[key] = key.endsWith("Pct") ? value / 100 : value;
  }
  return out;
}

export type InsuranceSource = "customer" | "research_estimate" | "regional_average" | "default_estimate";

/**
 * The customer's own quote always wins. Without one, prefer a market-rate
 * estimate from research (based on this property's actual state/value).
 * Without either, fall back to a regional-average estimate tied to this
 * property's purchase price rather than holding the whole submission for
 * manual review over a missing number — "default_estimate" (a bare zero) is
 * now only reachable if purchase price itself is somehow missing.
 */
export function resolveYearlyInsurance(data: UnderwritingFormData, research: ResearchOutcome): {
  annual: number;
  source: InsuranceSource;
  note?: string;
} {
  if (data.expenses.hasInsuranceQuote) {
    return { annual: numOr0(data.expenses.insuranceAnnual), source: "customer" };
  }
  if (research.status === "ok" && research.result.insuranceEstimate.annualPremium !== null) {
    return { annual: research.result.insuranceEstimate.annualPremium, source: "research_estimate" };
  }
  const purchasePrice = typeof data.property.purchasePrice === "number" ? data.property.purchasePrice : 0;
  const regional = regionalInsuranceEstimate(data.property.state, purchasePrice);
  if (regional) {
    return { annual: regional.annual, source: "regional_average", note: regional.note };
  }
  return { annual: numOr0(data.expenses.insuranceAnnual), source: "default_estimate" };
}

export type RentSource = "customer" | "research" | "regional_average" | "unavailable";

/**
 * The buyer's own rent estimate wins if they gave one. Otherwise prefer
 * live research comps. Without either, fall back to a regional rent-to-price
 * estimate tied to this property's purchase price, same "never block on a
 * missing number" rule as insurance.
 */
export function resolveMonthlyRent(
  data: UnderwritingFormData,
  rentResearch: RentResearchOutcome,
): { monthly: number; source: RentSource; note?: string } {
  if (typeof data.rentEstimate.monthlyRent === "number" && data.rentEstimate.monthlyRent > 0) {
    return { monthly: data.rentEstimate.monthlyRent, source: "customer" };
  }
  const researchRent = rentResearch.status === "ok" ? rentResearch.result.base : null;
  if (researchRent !== null) {
    return { monthly: researchRent, source: "research" };
  }
  const purchasePrice = typeof data.property.purchasePrice === "number" ? data.property.purchasePrice : 0;
  const regional = regionalRentEstimate(data.property.state, purchasePrice);
  if (regional) {
    return { monthly: regional.monthly, source: "regional_average", note: regional.note };
  }
  return { monthly: 0, source: "unavailable" };
}

export function buildEngineInputs(
  data: UnderwritingFormData,
  research: ResearchOutcome,
  rentResearch: RentResearchOutcome,
  resolved: ResolvedTaxInputs,
): UnderwritingInputs {
  const priorLoans = data.priorVaLoans
    .filter((l) => l.status === "open")
    .slice(0, 2)
    .map((l) => ({ nickname: l.nickname || "Prior VA loan", amount: numOr0(l.originalLoanAmount) }));

  const expectedMonthlyRent = resolveMonthlyRent(data, rentResearch).monthly;
  const yearlyInsurance = resolveYearlyInsurance(data, research).annual;

  return {
    taxModel: resolved.taxModel,
    property: {
      address: data.property.address,
      cityStateZip: `${data.property.city}, ${data.property.state} ${data.property.zip}`,
      county: data.property.county,
      propertyType: propertyTypeLabel(data.property.propertyType, data.property.hasAdu),
      bedsBaths: `${data.property.beds || "?"} / ${data.property.baths || "?"}`,
      sqft: typeof data.property.sqft === "number" ? data.property.sqft : 0,
      yearBuilt: typeof data.property.yearBuilt === "number" ? data.property.yearBuilt : 0,
      price: typeof data.property.purchasePrice === "number" ? data.property.purchasePrice : 0,
      expectedMonthlyRent,
      yearlyInsurance,
      monthlyHoa: typeof data.financing.hoaMonthly === "number" ? data.financing.hoaMonthly : 0,
      repairsNeeded: 0,
      arvValueAdded: 0,
    },
    priorLoans,
    loanLimitForArea: numOr0(data.financing.countyLoanLimit),
    hasDisabilityRating: data.customer.vaDisabilityRating,
    financing: {
      downPayment: numOr0(data.financing.downPayment),
      interestRate: typeof data.financing.interestRate === "number" ? data.financing.interestRate / 100 : 0,
      loanLengthYears: data.financing.loanTermYears,
    },
    taxInputs: toEngineFractions(resolved.taxInputs),
    vacancyAllowancePct: numOr0(data.expenses.vacancyPct) / 100,
    runningCostsPct: numOr0(data.expenses.reservePct) / 100,
    rentalIncomeForNextLoan:
      priorLoans.length > 0
        ? {
            monthlyRentPerLease: numOr0(data.rentalIncomeForNextLoan.currentRent),
            hasSignedLease: true,
            monthlyPaymentOnOldHome: numOr0(data.rentalIncomeForNextLoan.currentMortgagePayment),
            householdMonthlyIncome: numOr0(data.rentalIncomeForNextLoan.householdMonthlyIncome),
            newHomeMonthlyPayment: 0,
            otherMonthlyDebts: numOr0(data.rentalIncomeForNextLoan.otherMonthlyDebts),
          }
        : undefined,
  };
}
