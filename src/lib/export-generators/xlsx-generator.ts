import * as XLSX from 'xlsx';
import type { Place } from '@/types/database';
import type { FieldDefinition } from '@/types/export';
import { flattenPlace } from '../export-utils';

interface XLSXGeneratorOptions {
  includeSummary?: boolean;
  relationMetadata?: Map<string, any>;
}

export async function generateXLSX(
  places: Place[],
  fieldDefs: FieldDefinition[],
  options: XLSXGeneratorOptions = {}
): Promise<Buffer> {
  const { includeSummary = true, relationMetadata } = options;

  const workbook = XLSX.utils.book_new();

  const placesData = places.map(place => {
    const relationData = relationMetadata?.get(place.id);
    return flattenPlace(place, fieldDefs, relationData);
  });

  const placesSheet = XLSX.utils.json_to_sheet(placesData);

  XLSX.utils.book_append_sheet(workbook, placesSheet, 'Places');

  if (includeSummary && places.length > 0) {
    const summary = buildSummarySheet(places);
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function buildSummarySheet(places: Place[]): Record<string, any>[] {
  const summary: Record<string, any>[] = [];

  summary.push({
    Metric: 'Total Places',
    Count: places.length
  });

  const kindCounts = new Map<string, number>();
  places.forEach(place => {
    const count = kindCounts.get(place.kind) || 0;
    kindCounts.set(place.kind, count + 1);
  });

  summary.push({
    Metric: '',
    Count: ''
  });

  summary.push({
    Metric: 'By Type',
    Count: ''
  });

  Array.from(kindCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([kind, count]) => {
      summary.push({
        Metric: `  ${kind}`,
        Count: count
      });
    });

  const cityCounts = new Map<string, number>();
  places.forEach(place => {
    if (place.city) {
      const count = cityCounts.get(place.city) || 0;
      cityCounts.set(place.city, count + 1);
    }
  });

  if (cityCounts.size > 0) {
    summary.push({
      Metric: '',
      Count: ''
    });

    summary.push({
      Metric: 'By City',
      Count: ''
    });

    Array.from(cityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([city, count]) => {
        summary.push({
          Metric: `  ${city}`,
          Count: count
        });
      });
  }

  const countryCounts = new Map<string, number>();
  places.forEach(place => {
    if (place.country) {
      const count = countryCounts.get(place.country) || 0;
      countryCounts.set(place.country, count + 1);
    }
  });

  if (countryCounts.size > 0) {
    summary.push({
      Metric: '',
      Count: ''
    });

    summary.push({
      Metric: 'By Country',
      Count: ''
    });

    Array.from(countryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([country, count]) => {
        summary.push({
          Metric: `  ${country}`,
          Count: count
        });
      });
  }

  const avgConfidence = places.reduce((sum, p) => sum + (p.confidence || 0), 0) / places.length;

  summary.push({
    Metric: '',
    Count: ''
  });

  summary.push({
    Metric: 'Average Confidence',
    Count: avgConfidence.toFixed(2)
  });

  const withCoords = places.filter(p => p.coords).length;

  summary.push({
    Metric: 'Places with Coordinates',
    Count: withCoords
  });

  const withRatings = places.filter(p => (p.ratingSelf || 0) > 0).length;

  summary.push({
    Metric: 'Places with Ratings',
    Count: withRatings
  });

  return summary;
}
