import ExcelJS from "exceljs";
import path from "path";

export type SheetGrid = (string | number | boolean | null)[][];
export type WorkbookGrids = Record<string, SheetGrid>;

/**
 * Reads an xlsx template with exceljs and converts every sheet into a plain
 * 2D grid suitable for HyperFormula.buildFromSheets — formula cells become
 * "=<formula>" strings, everything else becomes its literal value.
 */
export async function loadWorkbookAsGrids(fileName: string): Promise<WorkbookGrids> {
  const filePath = path.join(process.cwd(), "workbook-templates", fileName);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const grids: WorkbookGrids = {};

  workbook.eachSheet((worksheet) => {
    const grid: SheetGrid = [];
    const maxRow = worksheet.rowCount;
    const maxCol = worksheet.columnCount;

    for (let r = 1; r <= maxRow; r++) {
      const row: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = worksheet.getCell(r, c);

        if (cell.type === ExcelJS.ValueType.Merge) {
          row.push(null);
          continue;
        }

        if (cell.formula) {
          row.push(`=${cell.formula}`);
        } else if (cell.value === null || cell.value === undefined) {
          row.push(null);
        } else if (typeof cell.value === "object" && "result" in cell.value) {
          // Formula-with-cached-result object shape from exceljs
          const formulaValue = cell.value as { formula?: string; result?: unknown };
          row.push(formulaValue.formula ? `=${formulaValue.formula}` : (formulaValue.result as string | number | boolean | null));
        } else if (
          typeof cell.value === "string" ||
          typeof cell.value === "number" ||
          typeof cell.value === "boolean"
        ) {
          row.push(cell.value);
        } else {
          row.push(String(cell.value));
        }
      }
      grid.push(row);
    }

    grids[worksheet.name] = grid;
  });

  return grids;
}
