import { inArray, and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { places, placesToCollections } from '@/db/schema';
import type { Place, Collection } from '@/types/database';
import type { ExportRequest, ExportResult, FieldDefinition } from '@/types/export';
import { getPlacesInCollection, getPlacesByStatus, searchPlaces, getCollectionById } from './db-queries';
import { FIELD_DEFINITIONS, getFieldsForPreset } from './export-field-metadata';
import { generateCSV } from './export-generators/csv-generator';
import { generateXLSX } from './export-generators/xlsx-generator';
import { generatePDF } from './export-generators/pdf-generator';
import { generateKML } from './export-generators/kml-generator';
import { generateFilename, getMimeType } from './export-utils';
import { NotFoundError } from './db-utils';

/**
 * A library export that names a city, country, or kind used to search with no
 * status, so archived places rode along. Missing status means the library.
 */
export function libraryExportStatus(status: string | undefined): string {
  return status ?? 'library';
}

/**
 * Collection export keeps archived stops (archiving does not take a place off
 * its trip) and labels them. The Status column is how the file says so.
 * Library export is a different path and stays limited to library rows.
 */
export function labelArchivedInCollectionExport(
  fields: FieldDefinition[],
  scopeType: string
): FieldDefinition[] {
  if (scopeType !== 'collection') return fields;
  if (fields.some((f) => f.dbField === 'status')) return fields;
  return [...fields, FIELD_DEFINITIONS.status];
}

export async function exportData(request: ExportRequest, userId: string): Promise<ExportResult> {
  let results: Place[] = [];
  let relationMetadata: Map<string, any> | undefined;
  let collection: Collection | null = null;
  let baseName = 'export';

  switch (request.scope.type) {
    case 'collection': {
      const collectionId = request.scope.collectionId;

      collection = await getCollectionById(collectionId, userId);
      if (!collection) {
        throw new NotFoundError('Collection not found');
      }

      results = await getPlacesInCollection(collectionId, userId);
      baseName = collection.name;

      if (request.options?.includeCollectionMetadata) {
        const relations = await db
          .select()
          .from(placesToCollections)
          .where(inArray(
            placesToCollections.collectionId,
            [collectionId]
          ));

        relationMetadata = new Map();
        relations.forEach(rel => {
          relationMetadata!.set(rel.placeId, {
            orderIndex: rel.orderIndex,
            isPinned: rel.isPinned,
            note: rel.note
          });
        });
      }

      break;
    }

    case 'library': {
      if (request.scope.filters) {
        results = await searchPlaces({
          userId,
          text: request.scope.filters.searchText,
          city: request.scope.filters.city,
          country: request.scope.filters.country,
          kind: request.scope.filters.kind,
          tags: request.scope.filters.tags,
          vibes: request.scope.filters.vibes,
          status: libraryExportStatus(request.scope.filters.status),
          minRating: request.scope.filters.minRating,
          hasCoords: request.scope.filters.hasCoords
        });
      } else {
        results = await getPlacesByStatus('library', userId);
      }

      baseName = 'library';
      break;
    }

    case 'selected': {
      if (request.scope.placeIds.length === 0) {
        throw new Error('No places selected for export');
      }

      results = await db
        .select()
        .from(places)
        .where(and(
          inArray(places.id, request.scope.placeIds),
          eq(places.userId, userId)
        ));

      baseName = 'selected_places';
      break;
    }

    default:
      throw new Error('Invalid export scope');
  }

  if (results.length === 0) {
    throw new NotFoundError('No places found to export');
  }

  const fieldDefs = labelArchivedInCollectionExport(
    getFieldsForPreset(request.preset, request.options?.customFields),
    request.scope.type
  );

  const filename = request.options?.filename || generateFilename(baseName, request.format);
  const mimeType = getMimeType(request.format);

  let buffer: Buffer | string;

  switch (request.format) {
    case 'csv': {
      buffer = await generateCSV(results, fieldDefs, {
        includeBOM: true,
        relationMetadata
      });
      break;
    }

    case 'xlsx': {
      buffer = await generateXLSX(results, fieldDefs, {
        includeSummary: true,
        relationMetadata
      });
      break;
    }

    case 'pdf': {
      buffer = await generatePDF(results, fieldDefs, {
        title: collection?.name || 'Places Export',
        groupByDay: !!collection?.dayBuckets && collection.dayBuckets.length > 0,
        dayBuckets: collection?.dayBuckets || [],
        relationMetadata
      });
      break;
    }

    case 'kml': {
      const kmlGroupBy = (request.options as any)?.kmlGroupBy;
      buffer = await generateKML(results, {
        documentName: collection?.name || 'Places Export',
        documentDescription: collection?.description || undefined,
        groupByKind: kmlGroupBy === 'kind',
        groupByCity: kmlGroupBy === 'city'
      });
      break;
    }

    default:
      throw new Error('Invalid export format');
  }

  return {
    buffer,
    mimeType,
    filename
  };
}
