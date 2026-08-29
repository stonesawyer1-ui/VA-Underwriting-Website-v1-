/**
 * Cell maps for the underwriting workbook models. "homestead_exemption" was
 * recorded from a real example file (406_Rustic_Cir_Underwriting.xlsx,
 * Texas) and verified to reproduce its numbers exactly. The other three
 * models were built from scratch mirroring that file's exact tabs,
 * formatting conventions, and "The Loan" / "The Rent" / "The Bottom Line"
 * layout — only the tax section and everything below it differs per model,
 * since each tax model needs a different number of rows.
 */

export type TaxModelId = "homestead_exemption" | "assessment_ratio" | "flat_rate" | "fallback";

export const MODEL_FILES: Record<TaxModelId, string> = {
  homestead_exemption: "tx-homestead-exemption-master.xlsx",
  assessment_ratio: "assessment-ratio-master.xlsx",
  flat_rate: "flat-rate-master.xlsx",
  fallback: "fallback-master.xlsx",
};

export const SHEETS = {
  propertySnapshot: "Property Snapshot",
  vaLoanNumbers: "VA Loan Numbers",
  rentalIncome: "Rental Income for Next Loan",
  monthlyDealNumbers: "Monthly Deal Numbers",
} as const;

/** Identical across every model's master file. */
export const SHARED_INPUT_CELLS = {
  propertySnapshot: {
    address: "B5",
    cityStateZip: "B6",
    county: "B7",
    propertyType: "B8",
    bedsBaths: "B9",
    sqft: "B10",
    yearBuilt: "B11",
    price: "B14",
    expectedMonthlyRent: "B15",
    yearlyInsurance: "B16",
    monthlyHoa: "B17",
    repairsNeeded: "B18",
    arvValueAdded: "B22",
    loanAmount: "B26",
  },
  vaLoanNumbers: {
    loan1Nickname: "B6",
    loan1Amount: "B7",
    loan2Nickname: "C6",
    loan2Amount: "C7",
    loanLimitForArea: "B11",
    priceOfNewHome: "B17",
    hasDisabilityRating: "B24",
  },
  rentalIncome: {
    monthlyRentPerLease: "B5",
    hasSignedLease: "B6",
    monthlyPaymentOnOldHome: "B8",
    householdMonthlyIncome: "B12",
    newHomeMonthlyPayment: "B13",
    otherMonthlyDebts: "B15",
  },
  /** Identical across every model — "The Loan" section always occupies rows 5-10. */
  monthlyDealCommon: {
    downPayment: "B6",
    interestRate: "B7",
    loanLengthYears: "B8",
    loanAmount: "B9",
  },
} as const;

export const SHARED_OUTPUT_CELLS = {
  vaLoanNumbers: {
    entitlementChargedLoan1: "B8",
    entitlementChargedLoan2: "C8",
    totalEntitlementCharged: "B12",
    totalEntitlementAvailable: "B13",
    entitlementRemaining: "B14",
    loanNeeded25Pct: "B19",
    downPaymentNeeded: "B20",
    canBuyWithZeroDown: "B21",
    isFirstTimeUse: "B25",
    downPaymentPct: "B26",
    fundingFeeRatePct: "B27",
    fundingFeeAmount: "B28",
    totalLoanAmount: "B29",
  },
  monthlyDealCommon: {
    monthlyPI: "B10",
  },
} as const;

type DealCellMap = {
  hasOwnerRentalSplit: boolean;
  input: Record<string, string>;
  output: Record<string, string>;
};

/** Per-model "Monthly Deal Numbers" layout — tax section + everything below it. */
export const MONTHLY_DEAL_CELLS: Record<TaxModelId, DealCellMap> = {
  homestead_exemption: {
    hasOwnerRentalSplit: true,
    input: {
      cityTaxRatePct: "B14",
      schoolIsdTaxRatePct: "B15",
      countyTaxRatePct: "B16",
      schoolHomesteadExemption: "B18",
      vacancyAllowancePct: "B33",
      runningCostsPct: "B35",
    },
    output: {
      combinedTaxRatePct: "B17",
      ownerOccupiedTaxableValue: "B19",
      ownerOccupiedAnnualTax: "B20",
      rentalAnnualTax: "B21",
      taxIncreaseOnConversion: "B22",
      monthlyPropertyTax: "B25",
      monthlyInsurance: "B26",
      monthlyHoa: "B27",
      totalMonthlyPITI: "B28",
      pitiAtOwnerOccupiedRate: "B29",
      rentAfterVacancy: "B34",
      runningCostsAmount: "B36",
      moneyLeftOverMonthly: "B39",
      moneyLeftOverYearly: "B40",
      capRatePct: "B41",
      cashActuallyPutIn: "B42",
      cashOnCashPct: "B43",
    },
  },
  assessment_ratio: {
    hasOwnerRentalSplit: true,
    input: {
      totalMillageRate: "B14",
      schoolOperatingMillage: "B15",
      schoolBondMillage: "B16",
      ownerAssessmentRatioPct: "B17",
      investorAssessmentRatioPct: "B18",
      vacancyAllowancePct: "B32",
      runningCostsPct: "B34",
    },
    output: {
      ownerOccupiedAnnualTax: "B19",
      rentalAnnualTax: "B20",
      taxIncreaseOnConversion: "B21",
      monthlyPropertyTax: "B24",
      monthlyInsurance: "B25",
      monthlyHoa: "B26",
      totalMonthlyPITI: "B27",
      pitiAtOwnerOccupiedRate: "B28",
      rentAfterVacancy: "B33",
      runningCostsAmount: "B35",
      moneyLeftOverMonthly: "B38",
      moneyLeftOverYearly: "B39",
      capRatePct: "B40",
      cashActuallyPutIn: "B41",
      cashOnCashPct: "B42",
    },
  },
  flat_rate: {
    hasOwnerRentalSplit: false,
    input: {
      combinedTaxRatePct: "B14",
      vacancyAllowancePct: "B25",
      runningCostsPct: "B27",
    },
    output: {
      annualTax: "B15",
      monthlyPropertyTax: "B18",
      monthlyInsurance: "B19",
      monthlyHoa: "B20",
      totalMonthlyPITI: "B21",
      rentAfterVacancy: "B26",
      runningCostsAmount: "B28",
      moneyLeftOverMonthly: "B31",
      moneyLeftOverYearly: "B32",
      capRatePct: "B33",
      cashActuallyPutIn: "B34",
      cashOnCashPct: "B35",
    },
  },
  fallback: {
    hasOwnerRentalSplit: false,
    input: {
      estimatedEffectiveTaxRatePct: "B14",
      vacancyAllowancePct: "B25",
      runningCostsPct: "B27",
    },
    output: {
      annualTax: "B15",
      monthlyPropertyTax: "B18",
      monthlyInsurance: "B19",
      monthlyHoa: "B20",
      totalMonthlyPITI: "B21",
      rentAfterVacancy: "B26",
      runningCostsAmount: "B28",
      moneyLeftOverMonthly: "B31",
      moneyLeftOverYearly: "B32",
      capRatePct: "B33",
      cashActuallyPutIn: "B34",
      cashOnCashPct: "B35",
    },
  },
};
