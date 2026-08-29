import type { UnderwritingFormData } from "./types";

export type TaxResult = {
  /** Whether the model produces one number or an owner-occupied vs. rental comparison. */
  hasOwnerRentalSplit: boolean;
  ownerOccupiedAnnualTax: number;
  rentalAnnualTax: number;
  /** The tax figure that should drive ongoing rental cash-flow math. */
  applicableAnnualTax: number;
  note: string;
};

export function calculateTax(
  purchasePrice: number,
  state: string,
  tax: UnderwritingFormData["tax"],
  modelId: "assessment_ratio" | "homestead_exemption" | "flat_rate" | "fallback",
): TaxResult {
  if (modelId === "assessment_ratio") {
    const f = tax.assessmentRatio;
    const ownerOccupiedAnnualTax =
      purchasePrice *
      (f.ownerAssessmentRatioPct / 100) *
      ((f.totalMillageRate - f.schoolOperatingMillage - f.schoolBondMillage) / 1000);
    const rentalAnnualTax =
      purchasePrice * (f.investorAssessmentRatioPct / 100) * (f.totalMillageRate / 1000);
    return {
      hasOwnerRentalSplit: true,
      ownerOccupiedAnnualTax,
      rentalAnnualTax,
      applicableAnnualTax: rentalAnnualTax,
      note: `Assessment-ratio model (e.g. ${state}). Investor-owned property is assessed at a higher ratio than owner-occupied.`,
    };
  }

  if (modelId === "homestead_exemption") {
    const f = tax.homesteadExemption;
    const combinedRatePct = f.cityRatePct + f.schoolIsdRatePct + f.countyRatePct;
    const ownerOccupiedAnnualTax =
      Math.max(0, purchasePrice - f.schoolHomesteadExemption) * (f.schoolIsdRatePct / 100) +
      purchasePrice * (f.cityRatePct / 100) +
      purchasePrice * (f.countyRatePct / 100);
    const rentalAnnualTax = purchasePrice * (combinedRatePct / 100);
    return {
      hasOwnerRentalSplit: true,
      ownerOccupiedAnnualTax,
      rentalAnnualTax,
      applicableAnnualTax: rentalAnnualTax,
      note: `Homestead-exemption model (e.g. ${state}). The school district homestead exemption applies only to an owner-occupied primary residence — it drops off once the property becomes a rental.`,
    };
  }

  if (modelId === "flat_rate") {
    const f = tax.flatRate;
    const annualTax = purchasePrice * (f.combinedTaxRatePct / 100);
    return {
      hasOwnerRentalSplit: false,
      ownerOccupiedAnnualTax: annualTax,
      rentalAnnualTax: annualTax,
      applicableAnnualTax: annualTax,
      note: `Flat-rate model (e.g. ${state}). Owner-occupied and rental tax are the same number for a typical buyer — most states' senior/disabled homestead exemptions don't apply here.`,
    };
  }

  const f = tax.fallback;
  const annualTax = purchasePrice * (f.estimatedEffectiveTaxRatePct / 100);
  return {
    hasOwnerRentalSplit: false,
    ownerOccupiedAnnualTax: annualTax,
    rentalAnnualTax: annualTax,
    applicableAnnualTax: annualTax,
    note: `No detailed tax model is mapped for this state yet. This is a rough estimated effective rate — confirm the real rate with your county Assessor/Auditor's office before relying on it.`,
  };
}
