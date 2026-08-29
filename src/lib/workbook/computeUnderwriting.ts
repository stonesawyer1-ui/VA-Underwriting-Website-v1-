import { HyperFormula } from "hyperformula";
import { loadWorkbookAsGrids, type WorkbookGrids } from "./loadTemplate";
import {
  MODEL_FILES,
  MONTHLY_DEAL_CELLS,
  SHARED_INPUT_CELLS,
  SHARED_OUTPUT_CELLS,
  SHEETS,
  type TaxModelId,
} from "./cellMap";

const gridsCache = new Map<TaxModelId, WorkbookGrids>();

async function getGrids(model: TaxModelId): Promise<WorkbookGrids> {
  let grids = gridsCache.get(model);
  if (!grids) {
    grids = await loadWorkbookAsGrids(MODEL_FILES[model]);
    gridsCache.set(model, grids);
  }
  return grids;
}

function parseA1(ref: string): { row: number; col: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) throw new Error(`Invalid cell reference: ${ref}`);
  const [, colLetters, rowDigits] = match;
  let col = 0;
  for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(rowDigits) - 1, col: col - 1 };
}

export type UnderwritingInputs = {
  taxModel: TaxModelId;
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
    repairsNeeded: number;
    arvValueAdded: number;
  };
  priorLoans: { nickname: string; amount: number }[];
  loanLimitForArea: number;
  hasDisabilityRating: boolean;
  financing: {
    downPayment: number;
    /** Decimal, e.g. 0.0662 for 6.62% */
    interestRate: number;
    loanLengthYears: number;
  };
  /** Field names must match MONTHLY_DEAL_CELLS[taxModel].input for the chosen model. */
  taxInputs: Record<string, number>;
  vacancyAllowancePct: number;
  runningCostsPct: number;
  rentalIncomeForNextLoan?: {
    monthlyRentPerLease: number;
    hasSignedLease: boolean;
    monthlyPaymentOnOldHome: number;
    householdMonthlyIncome: number;
    newHomeMonthlyPayment: number;
    otherMonthlyDebts: number;
  };
};

export type UnderwritingOutputs = {
  taxModel: TaxModelId;
  hasOwnerRentalSplit: boolean;
  vaLoanNumbers: Record<keyof typeof SHARED_OUTPUT_CELLS.vaLoanNumbers, number | string>;
  monthlyDealNumbers: Record<string, number | string>;
};

export async function computeUnderwriting(inputs: UnderwritingInputs): Promise<UnderwritingOutputs> {
  const grids = await getGrids(inputs.taxModel);
  const hf = HyperFormula.buildFromSheets(grids, { licenseKey: "gpl-v3" });

  const propSheet = hf.getSheetId(SHEETS.propertySnapshot)!;
  const vaSheet = hf.getSheetId(SHEETS.vaLoanNumbers)!;
  const rentalSheet = hf.getSheetId(SHEETS.rentalIncome)!;
  const dealSheet = hf.getSheetId(SHEETS.monthlyDealNumbers)!;

  function set(sheetId: number, ref: string, value: string | number | boolean) {
    const { row, col } = parseA1(ref);
    hf.setCellContents({ sheet: sheetId, row, col }, value);
  }
  function get(sheetId: number, ref: string): number | string {
    const { row, col } = parseA1(ref);
    return hf.getCellValue({ sheet: sheetId, row, col }) as number | string;
  }

  const IC = SHARED_INPUT_CELLS;
  const dealCells = MONTHLY_DEAL_CELLS[inputs.taxModel];

  // --- Property Snapshot inputs ---
  set(propSheet, IC.propertySnapshot.address, inputs.property.address);
  set(propSheet, IC.propertySnapshot.cityStateZip, inputs.property.cityStateZip);
  set(propSheet, IC.propertySnapshot.county, inputs.property.county);
  set(propSheet, IC.propertySnapshot.propertyType, inputs.property.propertyType);
  set(propSheet, IC.propertySnapshot.bedsBaths, inputs.property.bedsBaths);
  set(propSheet, IC.propertySnapshot.sqft, inputs.property.sqft);
  set(propSheet, IC.propertySnapshot.yearBuilt, inputs.property.yearBuilt);
  set(propSheet, IC.propertySnapshot.price, inputs.property.price);
  set(propSheet, IC.propertySnapshot.expectedMonthlyRent, inputs.property.expectedMonthlyRent);
  set(propSheet, IC.propertySnapshot.yearlyInsurance, inputs.property.yearlyInsurance);
  set(propSheet, IC.propertySnapshot.monthlyHoa, inputs.property.monthlyHoa);
  set(propSheet, IC.propertySnapshot.repairsNeeded, inputs.property.repairsNeeded);
  set(propSheet, IC.propertySnapshot.arvValueAdded, inputs.property.arvValueAdded);

  // --- VA Loan Numbers inputs ---
  const [loan1, loan2] = inputs.priorLoans;
  set(vaSheet, IC.vaLoanNumbers.loan1Nickname, loan1?.nickname || "None yet - first VA loan");
  set(vaSheet, IC.vaLoanNumbers.loan1Amount, loan1?.amount || 0);
  set(vaSheet, IC.vaLoanNumbers.loan2Nickname, loan2?.nickname || "");
  set(vaSheet, IC.vaLoanNumbers.loan2Amount, loan2?.amount || 0);
  set(vaSheet, IC.vaLoanNumbers.loanLimitForArea, inputs.loanLimitForArea);
  set(vaSheet, IC.vaLoanNumbers.priceOfNewHome, inputs.property.price);
  set(vaSheet, IC.vaLoanNumbers.hasDisabilityRating, inputs.hasDisabilityRating ? "Yes" : "No");

  // --- Rental Income for Next Loan inputs (optional) ---
  if (inputs.rentalIncomeForNextLoan) {
    const r = inputs.rentalIncomeForNextLoan;
    set(rentalSheet, IC.rentalIncome.monthlyRentPerLease, r.monthlyRentPerLease);
    set(rentalSheet, IC.rentalIncome.hasSignedLease, r.hasSignedLease ? "Yes" : "No");
    set(rentalSheet, IC.rentalIncome.monthlyPaymentOnOldHome, r.monthlyPaymentOnOldHome);
    set(rentalSheet, IC.rentalIncome.householdMonthlyIncome, r.householdMonthlyIncome);
    set(rentalSheet, IC.rentalIncome.newHomeMonthlyPayment, r.newHomeMonthlyPayment);
    set(rentalSheet, IC.rentalIncome.otherMonthlyDebts, r.otherMonthlyDebts);
  }

  // --- Monthly Deal Numbers inputs (excluding loan amount, set below) ---
  set(dealSheet, IC.monthlyDealCommon.downPayment, inputs.financing.downPayment);
  set(dealSheet, IC.monthlyDealCommon.interestRate, inputs.financing.interestRate);
  set(dealSheet, IC.monthlyDealCommon.loanLengthYears, inputs.financing.loanLengthYears);
  set(dealSheet, dealCells.input.vacancyAllowancePct, inputs.vacancyAllowancePct);
  set(dealSheet, dealCells.input.runningCostsPct, inputs.runningCostsPct);
  for (const [key, ref] of Object.entries(dealCells.input)) {
    if (key === "vacancyAllowancePct" || key === "runningCostsPct") continue;
    const value = inputs.taxInputs[key];
    if (value !== undefined) set(dealSheet, ref, value);
  }

  // --- Pass 1: read the workbook's own computed total loan amount (with funding fee rolled in) ---
  const totalLoanAmount = get(vaSheet, SHARED_OUTPUT_CELLS.vaLoanNumbers.totalLoanAmount) as number;

  // --- Pass 2: this template doesn't cross-reference the loan amount into these two cells, so write it explicitly ---
  set(propSheet, IC.propertySnapshot.loanAmount, totalLoanAmount);
  set(dealSheet, IC.monthlyDealCommon.loanAmount, totalLoanAmount);

  const vaOut = SHARED_OUTPUT_CELLS.vaLoanNumbers;
  const vaLoanNumbers = {
    entitlementChargedLoan1: get(vaSheet, vaOut.entitlementChargedLoan1),
    entitlementChargedLoan2: get(vaSheet, vaOut.entitlementChargedLoan2),
    totalEntitlementCharged: get(vaSheet, vaOut.totalEntitlementCharged),
    totalEntitlementAvailable: get(vaSheet, vaOut.totalEntitlementAvailable),
    entitlementRemaining: get(vaSheet, vaOut.entitlementRemaining),
    loanNeeded25Pct: get(vaSheet, vaOut.loanNeeded25Pct),
    downPaymentNeeded: get(vaSheet, vaOut.downPaymentNeeded),
    canBuyWithZeroDown: get(vaSheet, vaOut.canBuyWithZeroDown),
    isFirstTimeUse: get(vaSheet, vaOut.isFirstTimeUse),
    downPaymentPct: get(vaSheet, vaOut.downPaymentPct),
    fundingFeeRatePct: get(vaSheet, vaOut.fundingFeeRatePct),
    fundingFeeAmount: get(vaSheet, vaOut.fundingFeeAmount),
    totalLoanAmount: get(vaSheet, vaOut.totalLoanAmount),
  };

  const monthlyDealNumbers: Record<string, number | string> = {
    monthlyPI: get(dealSheet, SHARED_OUTPUT_CELLS.monthlyDealCommon.monthlyPI),
  };
  for (const [key, ref] of Object.entries(dealCells.output)) {
    monthlyDealNumbers[key] = get(dealSheet, ref);
  }

  return {
    taxModel: inputs.taxModel,
    hasOwnerRentalSplit: dealCells.hasOwnerRentalSplit,
    vaLoanNumbers,
    monthlyDealNumbers,
  };
}
