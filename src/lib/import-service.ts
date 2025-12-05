import { parseCSV, parseCSVFromBuffer } from './import-parsers/csv-parser';
import { parseXLSX } from './import-parsers/xlsx-parser';
import { autoMapColumns, detectTemplate, getReverseTransform, HEADER_ALIASES } from './import-field-metadata';
import { ImportPlaceSchema, splitArrayField } from '@/types/import';
import type {
  ImportFormat,
  ColumnMapping,
  ParsedRow,
  ValidationError,
  ImportPreviewResponse,
  ImportOptions,
  ImportResult,
} from '@/types/import';
import type { NewPlace, Place } from '@/types/database';

export interface ParseFileResult {
  success: boolean;
  preview?: ImportPreviewResponse;
  error?: string;
}

export async function parseFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseFileResult> {
  const extension = filename.toLowerCase().split('.').pop();

  let headers: string[] = [];
  let rows: string[][] = [];
  let totalRows = 0;
  let format: ImportFormat;

  try {
    if (extension === 'csv') {
      format = 'csv';
      const result = parseCSVFromBuffer(buffer);
      if (result.errors.length > 0 && result.headers.length === 0) {
        return { success: false, error: result.errors[0].message };
      }
      headers = result.headers;
      rows = result.rows;
      totalRows = result.totalRows;
    } else if (extension === 'xlsx' || extension === 'xls') {
      format = 'xlsx';
      const result = parseXLSX(buffer);
      if (result.errors.length > 0 && result.headers.length === 0) {
        return { success: false, error: result.errors[0].message };
      }
      headers = result.headers;
      rows = result.rows;
      totalRows = result.totalRows;
    } else {
      return { success: false, error: `Unsupported file type: ${extension}` };
    }

    const detectedTemplate = detectTemplate(headers);
    const suggestedMappings = autoMapColumns(headers, detectedTemplate || 'auto');

    const sampleRows = rows.slice(0, 5);

    return {
      success: true,
      preview: {
        headers,
        sampleRows,
        totalRows,
        suggestedMappings,
        detectedTemplate,
        format,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse file',
    };
  }
}

export function transformRow(
  row: string[],
  mappings: ColumnMapping[]
): Partial<NewPlace> {
  const result: Partial<NewPlace> = {};
  let latValue: string | null = null;
  let lonValue: string | null = null;

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;

    const value = row[mapping.sourceIndex]?.trim() || '';

    if (mapping.targetField === 'latitude') {
      latValue = value;
      continue;
    }
    if (mapping.targetField === 'longitude') {
      lonValue = value;
      continue;
    }

    const reverseTransform = getReverseTransform(mapping.targetField);
    if (reverseTransform) {
      (result as any)[mapping.targetField] = reverseTransform(value);
    } else {
      (result as any)[mapping.targetField] = value || null;
    }
  }

  if (latValue && lonValue) {
    const lat = parseFloat(latValue);
    const lon = parseFloat(lonValue);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      result.coords = { lat, lon };
    }
  }

  return result;
}

export function validateRow(
  row: string[],
  mappings: ColumnMapping[],
  rowNumber: number
): ParsedRow {
  const mappedData = transformRow(row, mappings);
  const errors: ValidationError[] = [];

  const validationResult = ImportPlaceSchema.safeParse(mappedData);

  if (!validationResult.success) {
    for (const issue of validationResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
        value: mappedData[issue.path[0] as keyof typeof mappedData],
      });
    }
  }

  return {
    rowNumber,
    rawValues: row,
    mappedData: validationResult.success ? validationResult.data : mappedData,
    errors,
    isValid: validationResult.success,
  };
}

export function validateRows(
  rows: string[][],
  mappings: ColumnMapping[]
): { valid: ParsedRow[]; invalid: ParsedRow[] } {
  const valid: ParsedRow[] = [];
  const invalid: ParsedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = validateRow(rows[i], mappings, i + 2);
    if (parsed.isValid) {
      valid.push(parsed);
    } else {
      invalid.push(parsed);
    }
  }

  return { valid, invalid };
}

export function preparePlacesForImport(
  parsedRows: ParsedRow[],
  options: ImportOptions,
  confirmedRowIndices?: Set<number>
): Array<{ data: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>; rowNumber: number; toLibrary: boolean }> {
  const places: Array<{ data: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>; rowNumber: number; toLibrary: boolean }> = [];

  for (const row of parsedRows) {
    if (!row.isValid) continue;

    const toLibrary = options.confidentMode && (confirmedRowIndices?.has(row.rowNumber) ?? false);

    const placeData: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'> = {
      name: row.mappedData.name || 'Unnamed Place',
      kind: row.mappedData.kind || 'tip',
      status: toLibrary ? 'library' : 'inbox',

      city: row.mappedData.city || null,
      country: row.mappedData.country || null,
      admin: row.mappedData.admin || null,
      address: row.mappedData.address || null,
      coords: row.mappedData.coords || null,
      googlePlaceId: row.mappedData.googlePlaceId || null,

      altNames: row.mappedData.altNames || [],
      tags: row.mappedData.tags || [],
      vibes: row.mappedData.vibes || [],
      activities: row.mappedData.activities || null,
      cuisine: row.mappedData.cuisine || null,
      amenities: row.mappedData.amenities || null,
      companions: row.mappedData.companions || null,

      description: row.mappedData.description || null,
      notes: row.mappedData.notes || null,
      practicalInfo: row.mappedData.practicalInfo || null,

      ratingSelf: row.mappedData.ratingSelf ?? 0,
      confidence: row.mappedData.confidence ?? 1.0,
      priority: row.mappedData.priority ?? 0,

      price_level: row.mappedData.price_level || null,
      best_time: row.mappedData.best_time || null,

      website: row.mappedData.website || null,
      phone: row.mappedData.phone || null,
      email: row.mappedData.email || null,
      hours: row.mappedData.hours || null,

      visitStatus: row.mappedData.visitStatus || 'not_visited',
      lastVisited: row.mappedData.lastVisited || null,
      plannedVisit: row.mappedData.plannedVisit || null,

      recommendedBy: row.mappedData.recommendedBy || null,
    };

    places.push({
      data: placeData,
      rowNumber: row.rowNumber,
      toLibrary,
    });
  }

  return places;
}

export function getMappingStats(mappings: ColumnMapping[]): {
  total: number;
  mapped: number;
  unmapped: number;
  highConfidence: number;
  lowConfidence: number;
  hasRequiredFields: boolean;
} {
  const mapped = mappings.filter(m => m.targetField !== null);
  const highConfidence = mapped.filter(m => m.confidence >= 0.8);
  const lowConfidence = mapped.filter(m => m.confidence > 0 && m.confidence < 0.8);

  const hasName = mappings.some(m => m.targetField === 'name');
  const hasKind = mappings.some(m => m.targetField === 'kind');

  return {
    total: mappings.length,
    mapped: mapped.length,
    unmapped: mappings.length - mapped.length,
    highConfidence: highConfidence.length,
    lowConfidence: lowConfidence.length,
    hasRequiredFields: hasName,
  };
}
