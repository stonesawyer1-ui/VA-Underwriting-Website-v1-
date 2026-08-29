import ExcelJS from "exceljs";
import path from "path";
import { MODEL_FILES, MONTHLY_DEAL_CELLS, SHARED_INPUT_CELLS, SHEETS } from "./cellMap";
import type { UnderwritingInputs, UnderwritingOutputs } from "./computeUnderwriting";
import type { ResearchOutcome } from "@/lib/research/researchProperty";
import type { InsuranceSource, RentSource, TaxFieldSource } from "@/lib/pipeline/buildEngineInputs";

function taxFieldNote(
  source: TaxFieldSource,
  key: string,
  research: ResearchOutcome,
  state: string,
): string | null {
  if (source === "customer") return null;
  const researched = research.status === "ok" ? research.result.taxFields[key] : undefined;
  if (researched?.value !== undefined && researched.value !== null) {
    return `${researched.confidence} — ${researched.source ?? "no source URL returned"}. Not entered by the buyer.`;
  }
  return `Estimated — default rate for ${state}, not confirmed by the buyer or a sourced county record.`;
}

/**
 * Fills a fresh copy of the master template for this tax model with the
 * exact same resolved inputs already validated by computeUnderwriting — it
 * never recomputes or re-derives a tax figure itself. Every non-formula cell
 * left in the template keeps its live formula, so opening the file in Excel
 * or Sheets recalculates everything downstream from the values written here,
 * the same way every workbook delivered by hand has worked.
 */
export async function fillWorkbookXlsx(params: {
  inputs: UnderwritingInputs;
  outputs: UnderwritingOutputs;
  taxFieldSources: Record<string, TaxFieldSource>;
  research: ResearchOutcome;
  insuranceSource: InsuranceSource;
  insuranceNote?: string;
  rentSource: RentSource;
  rentNote?: string;
}): Promise<Buffer> {
  const { inputs, outputs } = params;
  const filePath = path.join(process.cwd(), "workbook-templates", MODEL_FILES[inputs.taxModel]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  workbook.calcProperties.fullCalcOnLoad = true;

  const propSheet = workbook.getWorksheet(SHEETS.propertySnapshot)!;
  const vaSheet = workbook.getWorksheet(SHEETS.vaLoanNumbers)!;
  const rentalSheet = workbook.getWorksheet(SHEETS.rentalIncome)!;
  const dealSheet = workbook.getWorksheet(SHEETS.monthlyDealNumbers)!;

  const setVal = (ws: ExcelJS.Worksheet, ref: string, value: string | number | boolean) => {
    ws.getCell(ref).value = value;
  };
  const setNote = (ws: ExcelJS.Worksheet, ref: string, note: string) => {
    ws.getCell(ref).note = note;
  };

  const IC = SHARED_INPUT_CELLS;
  const dealCells = MONTHLY_DEAL_CELLS[inputs.taxModel];
  const totalLoanAmount = outputs.vaLoanNumbers.totalLoanAmount as number;

  // --- Property Snapshot ---
  setVal(propSheet, IC.propertySnapshot.address, inputs.property.address);
  setVal(propSheet, IC.propertySnapshot.cityStateZip, inputs.property.cityStateZip);
  setVal(propSheet, IC.propertySnapshot.county, inputs.property.county);
  setVal(propSheet, IC.propertySnapshot.propertyType, inputs.property.propertyType);
  setVal(propSheet, IC.propertySnapshot.bedsBaths, inputs.property.bedsBaths);
  setVal(propSheet, IC.propertySnapshot.sqft, inputs.property.sqft);
  setVal(propSheet, IC.propertySnapshot.yearBuilt, inputs.property.yearBuilt);
  setVal(propSheet, IC.propertySnapshot.price, inputs.property.price);
  setVal(propSheet, IC.propertySnapshot.expectedMonthlyRent, inputs.property.expectedMonthlyRent);
  setVal(propSheet, IC.propertySnapshot.yearlyInsurance, inputs.property.yearlyInsurance);
  setVal(propSheet, IC.propertySnapshot.monthlyHoa, inputs.property.monthlyHoa);
  setVal(propSheet, IC.propertySnapshot.repairsNeeded, inputs.property.repairsNeeded);
  setVal(propSheet, IC.propertySnapshot.arvValueAdded, inputs.property.arvValueAdded);
  setVal(propSheet, IC.propertySnapshot.loanAmount, totalLoanAmount);

  if (params.rentSource !== "customer") {
    setNote(
      propSheet,
      IC.propertySnapshot.expectedMonthlyRent,
      params.rentNote ?? `${params.rentSource} — not a live comp confirmed by the buyer.`,
    );
  }
  if (params.insuranceSource !== "customer") {
    setNote(
      propSheet,
      IC.propertySnapshot.yearlyInsurance,
      params.insuranceNote ?? `${params.insuranceSource} — not a real quote from the buyer.`,
    );
  }

  // --- VA Loan Numbers ---
  const [loan1, loan2] = inputs.priorLoans;
  setVal(vaSheet, IC.vaLoanNumbers.loan1Nickname, loan1?.nickname || "None yet - first VA loan");
  setVal(vaSheet, IC.vaLoanNumbers.loan1Amount, loan1?.amount || 0);
  setVal(vaSheet, IC.vaLoanNumbers.loan2Nickname, loan2?.nickname || "");
  setVal(vaSheet, IC.vaLoanNumbers.loan2Amount, loan2?.amount || 0);
  setVal(vaSheet, IC.vaLoanNumbers.loanLimitForArea, inputs.loanLimitForArea);
  setVal(vaSheet, IC.vaLoanNumbers.priceOfNewHome, inputs.property.price);
  setVal(vaSheet, IC.vaLoanNumbers.hasDisabilityRating, inputs.hasDisabilityRating ? "Yes" : "No");

  // --- Rental Income for Next Loan ---
  if (inputs.rentalIncomeForNextLoan) {
    const r = inputs.rentalIncomeForNextLoan;
    setVal(rentalSheet, IC.rentalIncome.monthlyRentPerLease, r.monthlyRentPerLease);
    setVal(rentalSheet, IC.rentalIncome.hasSignedLease, r.hasSignedLease ? "Yes" : "No");
    setVal(rentalSheet, IC.rentalIncome.monthlyPaymentOnOldHome, r.monthlyPaymentOnOldHome);
    setVal(rentalSheet, IC.rentalIncome.householdMonthlyIncome, r.householdMonthlyIncome);
    setVal(rentalSheet, IC.rentalIncome.newHomeMonthlyPayment, r.newHomeMonthlyPayment);
    setVal(rentalSheet, IC.rentalIncome.otherMonthlyDebts, r.otherMonthlyDebts);
  }

  // --- Monthly Deal Numbers ---
  setVal(dealSheet, IC.monthlyDealCommon.downPayment, inputs.financing.downPayment);
  setVal(dealSheet, IC.monthlyDealCommon.interestRate, inputs.financing.interestRate);
  setVal(dealSheet, IC.monthlyDealCommon.loanLengthYears, inputs.financing.loanLengthYears);
  setVal(dealSheet, IC.monthlyDealCommon.loanAmount, totalLoanAmount);
  setVal(dealSheet, dealCells.input.vacancyAllowancePct, inputs.vacancyAllowancePct);
  setVal(dealSheet, dealCells.input.runningCostsPct, inputs.runningCostsPct);

  for (const [key, ref] of Object.entries(dealCells.input)) {
    if (key === "vacancyAllowancePct" || key === "runningCostsPct") continue;
    const value = inputs.taxInputs[key];
    if (value === undefined) continue;
    setVal(dealSheet, ref, value);
    const source = params.taxFieldSources[key];
    if (source) {
      const note = taxFieldNote(source, key, params.research, inputs.property.address);
      if (note) setNote(dealSheet, ref, note);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
