import Papa, { ParseResult } from 'papaparse';

export interface ParsedCSVResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
  errors: Array<{ row: number; message: string }>;
}

export function parseCSV(csvText: string): ParsedCSVResult {
  const cleanedText = csvText.replace(/^\uFEFF/, '');

  const parsed: ParseResult<string[]> = Papa.parse(cleanedText, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    delimitersToGuess: [',', '\t', ';', '|'],
  });

  const errors: Array<{ row: number; message: string }> = [];

  if (parsed.errors && parsed.errors.length > 0) {
    parsed.errors.forEach((err: Papa.ParseError) => {
      errors.push({
        row: err.row !== undefined ? err.row + 1 : 0,
        message: err.message,
      });
    });
  }

  if (!parsed.data || parsed.data.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      errors: [{ row: 0, message: 'CSV file is empty or could not be parsed' }],
    };
  }

  const firstRow = parsed.data[0];
  const headers = firstRow.map((h: string) => (h ? String(h).trim() : ''));
  const dataRows = parsed.data.slice(1);

  const validRows = dataRows.filter((row: string[]) => {
    return row.some((cell: string) => cell !== null && cell !== undefined && String(cell).trim() !== '');
  });

  const normalizedRows = validRows.map((row: string[]) =>
    row.map((cell: string) => (cell !== null && cell !== undefined ? String(cell) : ''))
  );

  return {
    headers,
    rows: normalizedRows,
    totalRows: normalizedRows.length,
    errors,
  };
}

export function parseCSVFromBuffer(buffer: ArrayBuffer): ParsedCSVResult {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(buffer);
  return parseCSV(text);
}

export function getSampleRows(rows: string[][], count: number = 5): string[][] {
  return rows.slice(0, count);
}

export function detectDelimiter(sample: string): string {
  const delimiters = [',', '\t', ';', '|'];
  const counts: Record<string, number> = {};

  const firstLine = sample.split('\n')[0] || '';

  for (const delimiter of delimiters) {
    const parts = firstLine.split(delimiter);
    counts[delimiter] = parts.length - 1;
  }

  let maxCount = 0;
  let bestDelimiter = ',';

  for (const [delimiter, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}
