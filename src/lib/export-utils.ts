import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';
import { transformValue } from './export-field-metadata';

export function escapeCSV(value: string | null | undefined): string {
  const str = value || '';

  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

export function flattenPlace(
  place: Place,
  fieldDefs: FieldDefinition[],
  relationMetadata?: any
): Record<string, string> {
  const row: Record<string, string> = {};

  fieldDefs.forEach(fieldDef => {
    const value = transformValue(fieldDef, place, relationMetadata);
    row[fieldDef.csvHeader] = value;
  });

  return row;
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    return date.toISOString().split('T')[0];
  } catch {
    return isoString || '';
  }
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '';

  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString || '';
  }
}

export function generateFilename(
  baseName: string,
  format: 'csv' | 'xlsx' | 'pdf' | 'kml'
): string {
  const sanitized = sanitizeFilename(baseName);
  const timestamp = new Date().toISOString().split('T')[0];
  return `${sanitized}_${timestamp}.${format}`;
}

export function arrayToString(
  value: any,
  delimiter: string = ', '
): string {
  if (!value) return '';
  if (!Array.isArray(value)) return String(value);
  return value.join(delimiter);
}

export function getMimeType(format: 'csv' | 'xlsx' | 'pdf' | 'kml'): string {
  const mimeTypes = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    kml: 'application/vnd.google-earth.kml+xml'
  };

  return mimeTypes[format];
}

export function addUtf8Bom(content: string): string {
  return '\uFEFF' + content;
}
