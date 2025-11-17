import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { places, placesToCollections, collections } from '@/db/schema';
import type { Place, PlaceToCollection, Collection } from '@/types/database';
import type { ExportRequest, ExportResult, LibraryFilters } from '@/types/export';
import { getPlacesInCollection, getPlacesByStatus, searchPlaces, getCollectionById } from './db-queries';
import { getFieldsForPreset } from './export-field-metadata';
import { generateCSV } from './export-generators/csv-generator';
import { generateXLSX } from './export-generators/xlsx-generator';
import { generatePDF } from './export-generators/pdf-generator';
import { generateFilename, getMimeType } from './export-utils';

export async function exportData(request: ExportRequest): Promise<ExportResult> {
  let results: Place[] = [];
  let relationMetadata: Map<string, any> | undefined;
  let collection: Collection | null = null;
  let baseName = 'export';

  switch (request.scope.type) {
    case 'collection': {
      const collectionId = request.scope.collectionId;

      collection = await getCollectionById(collectionId);
      if (!collection) {
        throw new Error('Collection not found');
      }

      results = await getPlacesInCollection(collectionId);
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
          text: request.scope.filters.searchText,
          city: request.scope.filters.city,
          country: request.scope.filters.country,
          kind: request.scope.filters.kind,
          tags: request.scope.filters.tags,
          vibes: request.scope.filters.vibes,
          status: request.scope.filters.status,
          minRating: request.scope.filters.minRating,
          hasCoords: request.scope.filters.hasCoords
        });
      } else {
        results = await getPlacesByStatus('library');
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
        .where(inArray(places.id, request.scope.placeIds));

      baseName = 'selected_places';
      break;
    }

    default:
      throw new Error('Invalid export scope');
  }

  if (results.length === 0) {
    throw new Error('No places found to export');
  }

  const fieldDefs = getFieldsForPreset(request.preset);

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

    default:
      throw new Error('Invalid export format');
  }

  return {
    buffer,
    mimeType,
    filename
  };
}
