import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';
import { escapeCSV, flattenPlace, addUtf8Bom } from '../export-utils';

interface CSVGeneratorOptions {
  includeBOM?: boolean;
  relationMetadata?: Map<string, any>;
}

export async function generateCSV(
  places: Place[],
  fieldDefs: FieldDefinition[],
  options: CSVGeneratorOptions = {}
): Promise<string> {
  const { includeBOM = true, relationMetadata } = options;

  const headers = fieldDefs.map(field => field.csvHeader);
  const headerRow = headers.map(escapeCSV).join(',');

  const dataRows = places.map(place => {
    const relationData = relationMetadata?.get(place.id);
    const flatPlace = flattenPlace(place, fieldDefs, relationData);

    return headers.map(header => escapeCSV(flatPlace[header] || '')).join(',');
  });

  const csvContent = [headerRow, ...dataRows].join('\n');

  return includeBOM ? addUtf8Bom(csvContent) : csvContent;
}
