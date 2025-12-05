import * as XLSX from 'xlsx';

export interface ParsedXLSXResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
  sheetName: string;
  availableSheets: string[];
  errors: Array<{ row: number; message: string }>;
}

export function parseXLSX(buffer: ArrayBuffer, targetSheet?: string): ParsedXLSXResult {
  const errors: Array<{ row: number; message: string }> = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false,
    });
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

  const availableSheets = workbook.SheetNames;

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

  const sheet = workbook.Sheets[sheetName];

  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
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

  const headers = (rawData[0] as unknown[]).map((h) =>
    h !== null && h !== undefined ? String(h).trim() : ''
  );

  const dataRows = rawData.slice(1);

  const validRows = dataRows.filter((row) => {
    const arr = row as unknown[];
    return arr.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
  });

  const normalizedRows = validRows.map((row) => {
    const arr = row as unknown[];
    const normalized: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      const cell = arr[i];
      if (cell === null || cell === undefined) {
        normalized.push('');
      } else if (cell instanceof Date) {
        normalized.push(cell.toISOString().split('T')[0]);
      } else {
        normalized.push(String(cell));
      }
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

export function getSheetNames(buffer: ArrayBuffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames;
  } catch {
    return [];
  }
}
