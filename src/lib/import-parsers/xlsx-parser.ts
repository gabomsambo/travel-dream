import ExcelJS from 'exceljs';

export interface ParsedXLSXResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
  sheetName: string;
  availableSheets: string[];
  errors: Array<{ row: number; message: string }>;
}

/**
 * exceljs ships its own `declare interface Buffer extends ArrayBuffer {}`, which
 * a real Node Buffer does not structurally satisfy, so the cast is needed to
 * hand `xlsx.load` the Buffer it actually wants at runtime.
 */
function toExcelJSBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return Buffer.from(buffer) as unknown as ArrayBuffer;
}

/**
 * Renders a single cell as the plain string the import pipeline expects.
 *
 * Loaded cells can hold primitives, dates, formula results, hyperlinks or rich
 * text, so each of those is flattened to its display text.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map(part => part.text).join('');
    }
    if ('text' in value && value.text !== undefined) {
      return typeof value.text === 'string' ? value.text : String(value.text);
    }
    if ('result' in value && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ('formula' in value || 'sharedFormula' in value) {
      return '';
    }
    if ('error' in value) {
      return String(value.error);
    }
  }

  return String(value);
}

export async function parseXLSX(
  buffer: ArrayBuffer,
  targetSheet?: string
): Promise<ParsedXLSXResult> {
  const errors: Array<{ row: number; message: string }> = [];

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toExcelJSBuffer(buffer));
  } catch (err) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      sheetName: '',
      availableSheets: [],
      errors: [{ row: 0, message: `Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}` }],
    };
  }

  const availableSheets = workbook.worksheets.map((sheet) => sheet.name);

  if (availableSheets.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      sheetName: '',
      availableSheets: [],
      errors: [{ row: 0, message: 'Excel file contains no sheets' }],
    };
  }

  let sheetName: string;
  if (targetSheet && availableSheets.includes(targetSheet)) {
    sheetName = targetSheet;
  } else if (availableSheets.includes('Places')) {
    sheetName = 'Places';
  } else {
    sheetName = availableSheets[0];
  }

  const sheet = workbook.getWorksheet(sheetName)!;

  const rawData: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // `row.values` is 1-based with a leading hole, so drop index 0.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rawData.push(values.map(cellToString));
  });

  if (rawData.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      sheetName,
      availableSheets,
      errors: [{ row: 0, message: `Sheet "${sheetName}" is empty` }],
    };
  }

  const headers = rawData[0].map((cell) => cell.trim());

  const dataRows = rawData.slice(1);

  const validRows = dataRows.filter((row) => row.some((cell) => cell.trim() !== ''));

  const normalizedRows = validRows.map((row) => {
    const normalized: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      normalized.push(row[i] ?? '');
    }
    return normalized;
  });

  return {
    headers,
    rows: normalizedRows,
    totalRows: normalizedRows.length,
    sheetName,
    availableSheets,
    errors,
  };
}

export function getSampleRows(rows: string[][], count: number = 5): string[][] {
  return rows.slice(0, count);
}

export async function getSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toExcelJSBuffer(buffer));
    return workbook.worksheets.map((sheet) => sheet.name);
  } catch {
    return [];
  }
}
