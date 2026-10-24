import { eq, and, inArray, count, sql, desc, lt, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { releaseBlobIfUnreferenced, releaseBlobsIfUnreferenced } from '@/lib/shared-blob';
import { sources, places, collections, sourcesToPlaces, placesToCollections, mergeLogs, attachments, reservations, placeLinks, dismissedDuplicates } from '@/db/schema';
import { appendNote, MERGED_PLACE_FIELDS, mergePlaceFields, sanitizeMergeFieldOverrides, type MergeFieldOverrides } from '@/lib/place-merge';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from './tenant-db';
import { withErrorHandling, withTransaction, generateSourceId, generatePlaceId, generateCollectionId, NotFoundError, ConflictError } from './db-utils';
import { retryBackoffUntilIso } from './mass-upload/queue-config';
import { metaDroppingRetryPrevious } from './mass-upload/retry-previous';
import { isClaimableNow } from './mass-upload/queue-sql';
import { archivedAtForStatus } from './place-status';
import { usablePin } from './place-coords';
import type { NewSource, NewPlace, NewCollection, Source, Place, Collection } from '@/types/database';
import type { ExtractedPlace, ExtractionResult, ExtractionMetadata } from '@/types/llm-extraction';
import type { PipelinePlace } from '@/types/extraction-pipeline';

// Place mutations
export async function createPlace(
  data: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  userId: string
): Promise<Place> {
  return withErrorHandling(async () => {
    const newPlace: NewPlace = {
      id: generatePlaceId(),
      ...data,
      userId,
    };

    const [created] = await db.insert(places).values(newPlace).returning();
    return created;
  }, 'createPlace');
}

export async function updatePlace(
  id: string,
  data: Partial<Omit<NewPlace, 'id' | 'createdAt'>>,
  userId: string
): Promise<Place> {
  return withErrorHandling(async () => {
    const now = new Date().toISOString();
    // A caller cannot stamp or clear the archive clock on its own. It moves
    // only when status moves: archived stamps now, anything else clears it.
    const { archivedAt: _ignored, ...rest } = data;
    const updateData: Partial<Omit<NewPlace, 'id' | 'createdAt'>> = {
      ...rest,
      updatedAt: now,
    };
    if (data.status) {
      updateData.archivedAt = archivedAtForStatus(data.status, now);
    }

    const [updated] = await db.update(places)
      .set(updateData)
      .where(and(eq(places.id, id), eq(places.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Place with id ${id} not found or unauthorized`);
    }

    return updated;
  }, 'updatePlace');
}

export async function archivePlace(id: string, userId: string): Promise<Place> {
  return updatePlace(id, { status: 'archived' }, userId);
}

export async function deletePlace(id: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      // Verify ownership first
      const [place] = await tx.select().from(places)
        .where(and(eq(places.id, id), eq(places.userId, userId)))
        .limit(1);

      if (!place) {
        throw new NotFoundError(`Place with id ${id} not found or unauthorized`);
      }

      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.placeId, id));
      await tx.delete(placesToCollections).where(eq(placesToCollections.placeId, id));

      // Delete the place
      await tx.delete(places).where(eq(places.id, id));
    });
  }, 'deletePlace');
}

// Source mutations
export async function createSource(
  data: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  userId: string
): Promise<Source> {
  return withErrorHandling(async () => {
    // Use current schema that matches actual database structure
    const compatibleSource = {
      id: generateSourceId(),
      type: data.type,
      uri: data.uri,
      hash: data.hash,
      ocrText: data.ocrText,
      lang: data.lang,
      meta: data.meta,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const [created] = await db.insert(sourcesCurrentSchema).values(compatibleSource).returning();
    return created as Source;
  }, 'createSource');
}

export async function updateSource(
  id: string,
  data: Partial<Omit<NewSource, 'id' | 'createdAt'>>,
  userId: string
): Promise<Source> {
  return withErrorHandling(async () => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db.update(sources)
      .set(updateData)
      .where(and(eq(sources.id, id), eq(sources.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Source with id ${id} not found or unauthorized`);
    }

    return updated;
  }, 'updateSource');
}

export async function deleteSource(id: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    // Capture URI before transaction deletes the record
    const [source] = await db.select({ uri: sources.uri }).from(sources)
      .where(and(eq(sources.id, id), eq(sources.userId, userId)))
      .limit(1);

    if (!source) {
      throw new NotFoundError(`Source with id ${id} not found or unauthorized`);
    }

    await withTransaction(async (tx) => {
      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.sourceId, id));

      // Delete the source
      await tx.delete(sources).where(eq(sources.id, id));
    });

    await releaseBlobIfUnreferenced(
      userId,
      source.uri,
      { excludeSourceIds: [id] },
      '[deleteSource]'
    );
  }, 'deleteSource');
}

export async function clearAllScreenshots(userId: string): Promise<{ deleted: number }> {
  return withErrorHandling(async () => {
    // Collect source info before deletion
    const userScreenshots = await db
      .select({ id: sources.id, uri: sources.uri, meta: sources.meta })
      .from(sources)
      .where(and(eq(sources.userId, userId), eq(sources.type, 'screenshot')));

    if (userScreenshots.length === 0) {
      return { deleted: 0 };
    }

    const sourceIds = userScreenshots.map(s => s.id);

    // Collect all blob URLs (main URIs + thumbnails from meta)
    const blobUrls: string[] = [];
    for (const s of userScreenshots) {
      if (s.uri?.startsWith('https://')) {
        blobUrls.push(s.uri);
      }
      const meta = typeof s.meta === 'string' ? JSON.parse(s.meta) : s.meta;
      const thumbnailPath = meta?.uploadInfo?.thumbnailPath;
      if (thumbnailPath?.startsWith('https://')) {
        blobUrls.push(thumbnailPath);
      }
    }

    await withTransaction(async (tx) => {
      // Delete join records first
      await tx.delete(sourcesToPlaces).where(inArray(sourcesToPlaces.sourceId, sourceIds));
      // Delete the sources
      await tx.delete(sources).where(inArray(sources.id, sourceIds));
    });

    await releaseBlobsIfUnreferenced(
      userId,
      blobUrls,
      { excludeSourceIds: sourceIds },
      '[clearAllScreenshots]'
    );

    return { deleted: userScreenshots.length };
  }, 'clearAllScreenshots');
}

// Collection mutations
export async function createCollection(
  data: Omit<NewCollection, 'id' | 'createdAt' | 'updatedAt' | 'userId'>,
  userId: string
): Promise<Collection> {
  return withErrorHandling(async () => {
    const newCollection: NewCollection = {
      id: generateCollectionId(),
      ...data,
      userId,
    };

    const [created] = await db.insert(collections).values(newCollection).returning();
    return created;
  }, 'createCollection');
}

export async function updateCollection(
  id: string,
  data: Partial<Omit<NewCollection, 'id' | 'createdAt'>>,
  userId: string
): Promise<Collection> {
  return withErrorHandling(async () => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db.update(collections)
      .set(updateData)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Collection with id ${id} not found or unauthorized`);
    }

    return updated;
  }, 'updateCollection');
}

export async function deleteCollection(id: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      // Verify ownership first
      const [collection] = await tx.select().from(collections)
        .where(and(eq(collections.id, id), eq(collections.userId, userId)))
        .limit(1);

      if (!collection) {
        throw new NotFoundError(`Collection with id ${id} not found or unauthorized`);
      }

      // Delete related records first
      await tx.delete(placesToCollections).where(eq(placesToCollections.collectionId, id));

      // Delete the collection
      await tx.delete(collections).where(eq(collections.id, id));
    });
  }, 'deleteCollection');
}

export async function updateCollectionTransportMode(
  collectionId: string,
  mode: 'drive' | 'walk',
  userId: string
): Promise<Collection> {
  return withErrorHandling(async () => {
    const [updated] = await db
      .update(collections)
      .set({
        transportMode: mode,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Collection with id ${collectionId} not found or unauthorized`);
    }

    return updated;
  }, 'updateCollectionTransportMode');
}

export async function togglePlacePin(
  collectionId: string,
  placeId: string,
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    // Verify collection ownership
    const [collection] = await db.select().from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!collection) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    const [current] = await db
      .select({ isPinned: placesToCollections.isPinned })
      .from(placesToCollections)
      .where(and(
        eq(placesToCollections.collectionId, collectionId),
        eq(placesToCollections.placeId, placeId)
      ));

    if (!current) {
      throw new NotFoundError(`Place ${placeId} not found in collection ${collectionId}`);
    }

    await db
      .update(placesToCollections)
      .set({ isPinned: current.isPinned ? 0 : 1 })
      .where(and(
        eq(placesToCollections.collectionId, collectionId),
        eq(placesToCollections.placeId, placeId)
      ));
  }, 'togglePlacePin');
}

export async function updatePlaceNote(
  collectionId: string,
  placeId: string,
  note: string | null,
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    // Verify collection ownership
    const [collection] = await db.select().from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!collection) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    await db
      .update(placesToCollections)
      .set({ note })
      .where(and(
        eq(placesToCollections.collectionId, collectionId),
        eq(placesToCollections.placeId, placeId)
      ));
  }, 'updatePlaceNote');
}

// Relationship mutations
export async function linkSourceToPlace(sourceId: string, placeId: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    // Verify ownership of both source and place
    const [source] = await db.select().from(sources)
      .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
      .limit(1);
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, userId)))
      .limit(1);

    if (!source || !place) {
      throw new NotFoundError('Source or place not found or unauthorized');
    }

    await db.insert(sourcesToPlaces).values({
      sourceId,
      placeId,
    }).onConflictDoNothing();
  }, 'linkSourceToPlace');
}

export async function unlinkSourceFromPlace(sourceId: string, placeId: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    // Verify ownership of both source and place
    const [source] = await db.select().from(sources)
      .where(and(eq(sources.id, sourceId), eq(sources.userId, userId)))
      .limit(1);
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, userId)))
      .limit(1);

    if (!source || !place) {
      throw new NotFoundError('Source or place not found or unauthorized');
    }

    await db.delete(sourcesToPlaces)
      .where(and(
        eq(sourcesToPlaces.sourceId, sourceId),
        eq(sourcesToPlaces.placeId, placeId)
      ));
  }, 'unlinkSourceFromPlace');
}

export async function addPlaceToCollection(
  placeId: string,
  collectionId: string,
  userId: string,
  orderIndex?: number
): Promise<void> {
  return withErrorHandling(async () => {
    // Verify ownership of both place and collection
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, userId)))
      .limit(1);
    const [collection] = await db.select().from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!place || !collection) {
      throw new NotFoundError('Place or collection not found or unauthorized');
    }

    // If no order index provided, append to end
    if (orderIndex === undefined) {
      const maxOrder = await db.select({ max: count() })
        .from(placesToCollections)
        .where(eq(placesToCollections.collectionId, collectionId));

      orderIndex = (maxOrder[0]?.max || 0) + 1;
    }

    await db.insert(placesToCollections).values({
      placeId,
      collectionId,
      orderIndex,
    }).onConflictDoUpdate({
      target: [placesToCollections.placeId, placesToCollections.collectionId],
      set: { orderIndex },
    });
  }, 'addPlaceToCollection');
}

export async function removePlaceFromCollection(
  placeId: string,
  collectionId: string,
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    // Verify collection ownership
    const [collection] = await db.select().from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!collection) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    console.log('[removePlaceFromCollection] Deleting placeId:', placeId, 'from collectionId:', collectionId);

    const result = await db.delete(placesToCollections)
      .where(and(
        eq(placesToCollections.placeId, placeId),
        eq(placesToCollections.collectionId, collectionId)
      ))
      .returning();

    console.log('[removePlaceFromCollection] Rows deleted:', result.length);

    if (result.length === 0) {
      console.warn('[removePlaceFromCollection] WARNING: No rows were deleted! Place may not be in collection.');
    }
  }, 'removePlaceFromCollection');
}

export async function reorderPlacesInCollection(
  collectionId: string,
  placeIds: string[],
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    // Verify collection ownership
    const [collection] = await db.select().from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!collection) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    await withTransaction(async (tx) => {
      // Update order indexes for all places in the collection
      for (let i = 0; i < placeIds.length; i++) {
        await tx.update(placesToCollections)
          .set({ orderIndex: i })
          .where(and(
            eq(placesToCollections.collectionId, collectionId),
            eq(placesToCollections.placeId, placeIds[i])
          ));
      }
    });
  }, 'reorderPlacesInCollection');
}

export async function saveDayBuckets(
  collectionId: string,
  dayBuckets: any[],
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    const { DayBucketSchema } = await import('@/types/database');

    DayBucketSchema.array().parse(dayBuckets);

    console.log('[saveDayBuckets] Saving to collection:', collectionId);
    console.log('[saveDayBuckets] Day buckets count:', dayBuckets.length);
    console.log('[saveDayBuckets] Day buckets data:', JSON.stringify(dayBuckets, null, 2));

    const result = await db
      .update(collections)
      .set({
        dayBuckets: dayBuckets as any,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    console.log('[saveDayBuckets] Update result:', result);
    console.log('[saveDayBuckets] Rows affected:', result.length);
  }, 'saveDayBuckets');
}

export async function saveUnscheduledPlaces(
  collectionId: string,
  placeIds: string[],
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    console.log('[saveUnscheduledPlaces] Saving to collection:', collectionId);
    console.log('[saveUnscheduledPlaces] Unscheduled place IDs count:', placeIds.length);
    console.log('[saveUnscheduledPlaces] Place IDs:', placeIds);

    const result = await db
      .update(collections)
      .set({
        unscheduledPlaceIds: placeIds as any,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    console.log('[saveUnscheduledPlaces] Update result:', result);
    console.log('[saveUnscheduledPlaces] Rows affected:', result.length);
  }, 'saveUnscheduledPlaces');
}

export async function updateDayNote(
  collectionId: string,
  dayId: string,
  note: string,
  userId: string
): Promise<void> {
  return withErrorHandling(async () => {
    const collection = await db
      .select({ dayBuckets: collections.dayBuckets })
      .from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);

    if (!collection[0]) {
      throw new NotFoundError(`Collection ${collectionId} not found or unauthorized`);
    }

    const dayBuckets = collection[0].dayBuckets as any[];
    const updatedBuckets = dayBuckets.map(bucket =>
      bucket.id === dayId ? { ...bucket, dayNote: note } : bucket
    );

    await saveDayBuckets(collectionId, updatedBuckets, userId);
  }, 'updateDayNote');
}

// Batch operations
export async function createPlacesFromSources(
  sourcesData: Array<{
    source: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;
    place: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt' | 'userId'>;
  }>,
  userId: string
): Promise<Array<{ source: Source; place: Place }>> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      const results = [];

      for (const { source: sourceData, place: placeData } of sourcesData) {
        // Create source
        const newSource: NewSource = {
          id: generateSourceId(),
          ...sourceData,
          userId,
        };
        const [source] = await tx.insert(sources).values(newSource).returning();

        // Create place
        const newPlace: NewPlace = {
          id: generatePlaceId(),
          ...placeData,
          userId,
        };
        const [place] = await tx.insert(places).values(newPlace).returning();

        // Link them
        await tx.insert(sourcesToPlaces).values({
          sourceId: source.id,
          placeId: place.id,
        });

        results.push({ source, place });
      }

      return results;
    });
  }, 'createPlacesFromSources');
}

const PLACE_STATUS_CHUNK = 50;

export type PlaceStatusUpdate = {
  updatedCount: number;
  updatedIds: string[];
};

export async function bulkUpdatePlaceStatus(
  placeIds: string[],
  status: 'inbox' | 'library' | 'archived' | 'review',
  userId: string
): Promise<PlaceStatusUpdate> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return { updatedCount: 0, updatedIds: [] };

    const now = new Date().toISOString();
    const updatedIds = await withTransaction(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < placeIds.length; i += PLACE_STATUS_CHUNK) {
        const chunk = placeIds.slice(i, i + PLACE_STATUS_CHUNK);
        const updated = await tx.update(places)
          .set({
            status,
            updatedAt: now,
            archivedAt: archivedAtForStatus(status, now),
          })
          .where(and(inArray(places.id, chunk), eq(places.userId, userId)))
          .returning({ id: places.id });
        ids.push(...updated.map((row: { id: string }) => row.id));
      }
      return ids;
    });

    return { updatedCount: updatedIds.length, updatedIds };
  }, 'bulkUpdatePlaceStatus');
}

// LLM-specific mutations
export async function createPlaceFromExtraction(
  extractedPlace: ExtractedPlace,
  userId: string,
  sourceId?: string
): Promise<Place> {
  return withErrorHandling(async () => {
    const newPlace: NewPlace = {
      id: generatePlaceId(),
      name: extractedPlace.name,
      kind: extractedPlace.kind,
      description: extractedPlace.description || null,
      status: 'inbox',
      userId,

      // Location information
      city: extractedPlace.location.city || null,
      admin: extractedPlace.location.state || null,
      country: extractedPlace.location.country || null,
      address: extractedPlace.location.address || null,

      // LLM-specific metadata
      confidence: extractedPlace.confidence,
      price_level: extractedPlace.metadata.price_level || null,
      best_time: extractedPlace.metadata.best_time || null,
      activities: extractedPlace.metadata.activities || null,
      cuisine: extractedPlace.metadata.cuisine || null,
      amenities: extractedPlace.metadata.amenities || null,
      tags: extractedPlace.metadata.tags || null,
      vibes: extractedPlace.metadata.vibes || null,
    };

    const [created] = await db.insert(places).values(newPlace).returning();

    // Link to source if provided
    if (sourceId) {
      await linkSourceToPlace(sourceId, created.id, userId);
    }

    return created;
  }, 'createPlaceFromExtraction');
}

export async function updateSourceWithLLMMetadata(
  sourceId: string,
  metadata: ExtractionMetadata,
  placesCount: number,
  userId: string
): Promise<Source> {
  return withErrorHandling(async () => {
    // Fetch existing source to preserve meta
    const [existingSource] = await db.select()
      .from(sourcesCurrentSchema)
      .where(and(eq(sourcesCurrentSchema.id, sourceId), eq(sourcesCurrentSchema.userId, userId)))
      .limit(1);

    if (!existingSource) {
      throw new NotFoundError(`Source with id ${sourceId} not found or unauthorized`);
    }

    // Store LLM metadata in meta.llmProcessing JSON field
    const updatedMeta = {
      ...existingSource.meta,
      llmProcessing: {
        processed: true,
        model: metadata.model,
        processedAt: metadata.completed_at,
        confidence: metadata.confidence_avg,
        placesExtracted: placesCount,
        details: {
          processingTimeMs: metadata.processing_time_ms,
          costUsd: metadata.cost_usd,
          errors: metadata.errors || []
        }
      }
    };

    const [updated] = await db.update(sourcesCurrentSchema)
      .set({
        meta: updatedMeta,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(sourcesCurrentSchema.id, sourceId), eq(sourcesCurrentSchema.userId, userId)))
      .returning();

    return updated;
  }, 'updateSourceWithLLMMetadata');
}

export async function batchCreatePlacesFromExtractions(
  extractionResults: ExtractionResult[],
  userId: string
): Promise<Array<{ sourceId: string; places: Place[]; error?: string }>> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      const results = [];

      for (const result of extractionResults) {
        try {
          if (!result.success) {
            results.push({
              sourceId: result.sourceId,
              places: [],
              error: result.error || 'Extraction failed'
            });
            continue;
          }

          const createdPlaces: Place[] = [];

          // Get source info for screenshot attachment - verify ownership
          const [source] = await tx.select().from(sourcesCurrentSchema)
            .where(and(eq(sourcesCurrentSchema.id, result.sourceId), eq(sourcesCurrentSchema.userId, userId)))
            .limit(1);

          if (!source) {
            results.push({
              sourceId: result.sourceId,
              places: [],
              error: 'Source not found or unauthorized'
            });
            continue;
          }

          const meta = source?.meta as { uploadInfo?: { storedPath?: string; originalName?: string; mimeType?: string; fileSize?: number } } | null;
          const screenshotPath = meta?.uploadInfo?.storedPath;

          // Create places from extraction results
          for (const extractedPlace of result.places) {
            const newPlace: NewPlace = {
              id: generatePlaceId(),
              name: extractedPlace.name,
              kind: extractedPlace.kind,
              description: extractedPlace.description || null,
              status: 'inbox',
              userId,

              // Location information
              city: extractedPlace.location.city || null,
              admin: extractedPlace.location.state || null,
              country: extractedPlace.location.country || null,
              address: extractedPlace.location.address || null,

              // LLM-specific metadata
              confidence: extractedPlace.confidence,
              price_level: extractedPlace.metadata.price_level || null,
              best_time: extractedPlace.metadata.best_time || null,
              activities: extractedPlace.metadata.activities || null,
              cuisine: extractedPlace.metadata.cuisine || null,
              amenities: extractedPlace.metadata.amenities || null,
              tags: extractedPlace.metadata.tags || null,
              vibes: extractedPlace.metadata.vibes || null,
            };

            const [place] = await tx.insert(places).values(newPlace).returning();
            createdPlaces.push(place);

            // Link to source
            await tx.insert(sourcesToPlaces).values({
              sourceId: result.sourceId,
              placeId: place.id,
            });

            // Import source screenshot as attachment (if available)
            if (screenshotPath) {
              await tx.insert(attachments).values({
                placeId: place.id,
                type: 'photo',
                uri: screenshotPath,
                filename: meta?.uploadInfo?.originalName || 'screenshot.jpg',
                mimeType: meta?.uploadInfo?.mimeType || 'image/jpeg',
                fileSize: meta?.uploadInfo?.fileSize || null,
                isPrimary: 1, // Auto-set as cover image
              });
            }
          }

          // Update source with LLM metadata in meta.llmProcessing JSON field
          const updatedMeta = {
            ...source.meta,
            llmProcessing: {
              processed: true,
              model: result.metadata.model,
              processedAt: result.metadata.completed_at,
              confidence: result.metadata.confidence_avg,
              placesExtracted: createdPlaces.length,
              details: {
                processingTimeMs: result.metadata.processing_time_ms,
                costUsd: result.metadata.cost_usd,
                errors: result.metadata.errors || []
              }
            }
          };

          await tx.update(sourcesCurrentSchema)
            .set({
              meta: updatedMeta,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(sourcesCurrentSchema.id, result.sourceId));

          results.push({
            sourceId: result.sourceId,
            places: createdPlaces
          });

        } catch (error) {
          results.push({
            sourceId: result.sourceId,
            places: [],
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return results;
    });
  }, 'batchCreatePlacesFromExtractions');
}

// Inbox & Review System specific mutations
export async function mergePlaces(
  sourceId: string,
  targetId: string,
  userId: string
): Promise<Place> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      // Get source and target places - verify ownership
      const [sourcePlace, targetPlace] = await Promise.all([
        tx.select().from(places).where(and(eq(places.id, sourceId), eq(places.userId, userId))).limit(1),
        tx.select().from(places).where(and(eq(places.id, targetId), eq(places.userId, userId))).limit(1)
      ]);

      if (!sourcePlace[0] || !targetPlace[0]) {
        throw new NotFoundError('Source or target place not found or unauthorized');
      }

      const source = sourcePlace[0];
      const target = targetPlace[0];

      // Merge data - target takes precedence for basic fields, merge arrays
      const mergedData = {
        // Keep target's core info but merge additional data
        name: target.name || source.name,
        kind: target.kind || source.kind,
        city: target.city || source.city,
        country: target.country || source.country,
        admin: target.admin || source.admin,
        address: target.address || source.address,
        coords: target.coords || source.coords,

        // Merge arrays (tags, vibes, altNames)
        altNames: [...new Set([
          ...(Array.isArray(target.altNames) ? target.altNames : []),
          ...(Array.isArray(source.altNames) ? source.altNames : []),
          source.name // Add source name as alt name if different
        ].filter(Boolean))],

        tags: [...new Set([
          ...(Array.isArray(target.tags) ? target.tags : []),
          ...(Array.isArray(source.tags) ? source.tags : [])
        ])],

        vibes: [...new Set([
          ...(Array.isArray(target.vibes) ? target.vibes : []),
          ...(Array.isArray(source.vibes) ? source.vibes : [])
        ])],

        // Merge notes
        notes: [target.notes, source.notes].filter(Boolean).join('\n\n---\n\n'),

        // Keep highest confidence and rating
        confidence: Math.max(target.confidence || 0, source.confidence || 0),
        ratingSelf: Math.max(target.ratingSelf || 0, source.ratingSelf || 0),

        // Use library status if either is library, otherwise keep target
        status: (target.status === 'library' || source.status === 'library')
          ? 'library'
          : target.status,

        updatedAt: new Date().toISOString()
      };

      // Update target place with merged data
      const [updatedPlace] = await tx.update(places)
        .set(mergedData)
        .where(eq(places.id, targetId))
        .returning();

      // Move all source relationships to target
      await tx.update(sourcesToPlaces)
        .set({ placeId: targetId })
        .where(eq(sourcesToPlaces.placeId, sourceId));

      await tx.update(placesToCollections)
        .set({ placeId: targetId })
        .where(eq(placesToCollections.placeId, sourceId));

      // Delete the source place
      await tx.delete(places).where(eq(places.id, sourceId));

      return updatedPlace;
    });
  }, 'mergePlaces');
}

export interface MovedMergeRelations {
  attachmentIds: string[];
  reservationIds: string[];
  placeLinkIds: string[];
  /** Where each moved row came from, so `undoMerge` can put it back. */
  attachmentOrigins?: Array<{ id: string; fromPlaceId: string; isPrimary: number }>;
  reservationOrigins?: Array<{ id: string; fromPlaceId: string }>;
  placeLinkOrigins?: Array<{ id: string; fromPlaceId: string }>;
  sourceLinks: Array<{ sourceId: string; fromPlaceId: string; action: 'moved' | 'dropped' }>;
  collectionLinks: Array<{
    collectionId: string;
    fromPlaceId: string;
    action: 'moved' | 'note-appended';
    absorbedNote: string | null;
    /** For 'note-appended': the kept row's note before, and the absorbed row's position. */
    keptNoteBefore?: string | null;
    orderIndex?: number;
    isPinned?: number;
  }>;
}

function dismissPairKey(placeId1: string, placeId2: string): string {
  return placeId1 < placeId2 ? `${placeId1}\0${placeId2}` : `${placeId2}\0${placeId1}`;
}

function dismissPairsForLog(pairs: unknown): Array<{ placeId1: string; placeId2: string }> {
  if (!Array.isArray(pairs)) return [];
  const seen = new Set<string>();
  const kept: Array<{ placeId1: string; placeId2: string }> = [];
  for (const pair of pairs) {
    if (!pair || typeof pair !== 'object') continue;
    const placeId1 = (pair as { placeId1?: unknown }).placeId1;
    const placeId2 = (pair as { placeId2?: unknown }).placeId2;
    if (typeof placeId1 !== 'string' || typeof placeId2 !== 'string' || !placeId1 || !placeId2 || placeId1 === placeId2) continue;
    const key = dismissPairKey(placeId1, placeId2);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ placeId1, placeId2 });
  }
  return kept;
}

type DismissConn = Pick<typeof db, 'select' | 'insert'>;

async function ownedPlaceIds(tx: DismissConn, userId: string, ids: string[]): Promise<Set<string>> {
  const owned = new Set<string>();
  for (let index = 0; index < ids.length; index += 200) {
    const rows = await tx.select({ id: places.id }).from(places).where(and(
      eq(places.userId, userId),
      inArray(places.id, ids.slice(index, index + 200)),
    ));
    for (const row of rows) owned.add(row.id);
  }
  return owned;
}

export async function insertFreshDismissPairs(
  tx: DismissConn,
  userId: string,
  pairs: Array<{ placeId1: string; placeId2: string }>,
  reason?: string | null,
): Promise<{ ids: string[]; pairs: Array<{ placeId1: string; placeId2: string }> }> {
  const requested = dismissPairsForLog(pairs);
  if (requested.length === 0) return { ids: [], pairs: [] };

  const named = [...new Set(requested.flatMap((pair) => [pair.placeId1, pair.placeId2]))];
  const owned = await ownedPlaceIds(tx, userId, named);
  const allowed = requested.filter((pair) => owned.has(pair.placeId1) && owned.has(pair.placeId2));
  if (allowed.length === 0) return { ids: [], pairs: [] };

  const existing = await tx.select({
    placeId1: dismissedDuplicates.placeId1,
    placeId2: dismissedDuplicates.placeId2,
  }).from(dismissedDuplicates).where(eq(dismissedDuplicates.userId, userId));
  const seen = new Set(existing.map((row) => dismissPairKey(row.placeId1, row.placeId2)));

  const fresh: Array<{ placeId1: string; placeId2: string }> = [];
  for (const pair of allowed) {
    const key = dismissPairKey(pair.placeId1, pair.placeId2);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(pair);
  }
  if (fresh.length === 0) return { ids: [], pairs: [] };

  const ids: string[] = [];
  for (let index = 0; index < fresh.length; index += 40) {
    const batch = fresh.slice(index, index + 40);
    const inserted = await tx.insert(dismissedDuplicates).values(batch.flatMap((pair) => [
      { userId, placeId1: pair.placeId1, placeId2: pair.placeId2, reason: reason || null },
      { userId, placeId1: pair.placeId2, placeId2: pair.placeId1, reason: reason || null },
    ])).returning({ id: dismissedDuplicates.id });
    ids.push(...inserted.map((row) => row.id));
  }
  return { ids, pairs: fresh };
}

export async function bulkMergePlaces(
  clusters: Array<{
    targetId: string;
    sourceIds: string[];
    confidence: number;
    fieldOverrides?: MergeFieldOverrides;
    dismissPairs?: Array<{ placeId1: string; placeId2: string }>;
  }>,
  userId: string
): Promise<{ success: number; failed: number; results: any[] }> {
  return withErrorHandling(async () => {
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const cluster of clusters) {
      try {
        let skipped = false;
        await withTransaction(async (tx) => {
          const orderedSourceIds = Array.from(new Set(
            cluster.sourceIds.filter((id) => id !== cluster.targetId)
          ));
          if (orderedSourceIds.length === 0) {
            throw new NotFoundError('No source places to merge');
          }

          // Verify ownership of all places
          const [targetPlace] = await tx.select().from(places)
            .where(and(eq(places.id, cluster.targetId), eq(places.userId, userId))).limit(1);
          const sourcePlaces = await tx.select().from(places)
            .where(and(inArray(places.id, orderedSourceIds), eq(places.userId, userId)));

          if (!targetPlace) throw new NotFoundError('Target place not found or unauthorized');
          if (sourcePlaces.length !== orderedSourceIds.length) {
            throw new NotFoundError('One or more source places not found or unauthorized');
          }

          if (targetPlace.status === 'archived') {
            skipped = true;
            return;
          }

          const byId = new Map<string, Place>(sourcePlaces.map((place: Place) => [place.id, place]));
          const liveSourceIds = orderedSourceIds.filter((id) => byId.get(id)!.status !== 'archived');
          if (liveSourceIds.length === 0) {
            skipped = true;
            return;
          }
          const orderedSources = liveSourceIds.map((id) => byId.get(id)!);
          const sourceSnapshots = orderedSources.map((place) => ({ ...place }));

          const fieldOverrides = sanitizeMergeFieldOverrides(cluster.fieldOverrides);
          const merged = mergePlaceFields(targetPlace, orderedSources, fieldOverrides);
          const updatedAt = new Date().toISOString();

          await tx.update(places)
            .set({
              name: merged.name,
              kind: merged.kind,
              city: merged.city,
              country: merged.country,
              admin: merged.admin,
              address: merged.address,
              coords: merged.coords,
              website: merged.website,
              phone: merged.phone,
              hours: merged.hours,
              price_level: merged.price_level,
              best_time: merged.best_time,
              practicalInfo: merged.practicalInfo,
              description: merged.description,
              googlePlaceId: merged.googlePlaceId,
              activities: merged.activities,
              cuisine: merged.cuisine,
              amenities: merged.amenities,
              tags: merged.tags,
              vibes: merged.vibes,
              altNames: merged.altNames,
              notes: merged.notes,
              confidence: merged.confidence,
              ratingSelf: merged.ratingSelf,
              status: merged.status,
              updatedAt,
            })
            .where(eq(places.id, cluster.targetId));

          const movedRelations: MovedMergeRelations = {
            attachmentIds: [],
            reservationIds: [],
            placeLinkIds: [],
            attachmentOrigins: [],
            reservationOrigins: [],
            placeLinkOrigins: [],
            sourceLinks: [],
            collectionLinks: [],
          };

          for (const sourceId of liveSourceIds) {
            const [targetHasPrimary] = await tx.select({ id: attachments.id })
              .from(attachments)
              .where(and(eq(attachments.placeId, cluster.targetId), eq(attachments.isPrimary, 1)))
              .limit(1);
            const sourceAttachments = await tx.select({ id: attachments.id, isPrimary: attachments.isPrimary })
              .from(attachments)
              .where(eq(attachments.placeId, sourceId));
            if (sourceAttachments.length > 0) {
              movedRelations.attachmentIds.push(...sourceAttachments.map((row: { id: string }) => row.id));
              movedRelations.attachmentOrigins!.push(...sourceAttachments.map((row: { id: string; isPrimary: number }) => ({
                id: row.id,
                fromPlaceId: sourceId,
                isPrimary: row.isPrimary,
              })));
              await tx.update(attachments)
                .set(targetHasPrimary
                  ? { placeId: cluster.targetId, isPrimary: 0 }
                  : { placeId: cluster.targetId })
                .where(eq(attachments.placeId, sourceId));
            }

            const sourceReservations = await tx.select({ id: reservations.id })
              .from(reservations)
              .where(eq(reservations.placeId, sourceId));
            if (sourceReservations.length > 0) {
              movedRelations.reservationIds.push(...sourceReservations.map((row: { id: string }) => row.id));
              movedRelations.reservationOrigins!.push(...sourceReservations.map((row: { id: string }) => ({ id: row.id, fromPlaceId: sourceId })));
              await tx.update(reservations)
                .set({ placeId: cluster.targetId, updatedAt })
                .where(eq(reservations.placeId, sourceId));
            }

            const sourceLinks = await tx.select({ id: placeLinks.id })
              .from(placeLinks)
              .where(eq(placeLinks.placeId, sourceId));
            if (sourceLinks.length > 0) {
              movedRelations.placeLinkIds.push(...sourceLinks.map((row: { id: string }) => row.id));
              movedRelations.placeLinkOrigins!.push(...sourceLinks.map((row: { id: string }) => ({ id: row.id, fromPlaceId: sourceId })));
              await tx.update(placeLinks)
                .set({ placeId: cluster.targetId })
                .where(eq(placeLinks.placeId, sourceId));
            }

            // Get existing associations for target to avoid duplicates
            const targetSourceAssocs = await tx.select({ sourceId: sourcesToPlaces.sourceId })
              .from(sourcesToPlaces)
              .where(eq(sourcesToPlaces.placeId, cluster.targetId));
            const targetSourceIds = new Set(targetSourceAssocs.map((a: { sourceId: string }) => a.sourceId));

            const targetCollectionAssocs = await tx.select({
              collectionId: placesToCollections.collectionId,
              note: placesToCollections.note,
            })
              .from(placesToCollections)
              .where(eq(placesToCollections.placeId, cluster.targetId));
            const targetCollectionNotes = new Map<string, string | null>(
              targetCollectionAssocs.map((a: { collectionId: string; note: string | null }) => [a.collectionId, a.note] as const)
            );

            // Get source's associations
            const sourceSourceAssocs = await tx.select()
              .from(sourcesToPlaces)
              .where(eq(sourcesToPlaces.placeId, sourceId));
            const sourceCollectionAssocs = await tx.select()
              .from(placesToCollections)
              .where(eq(placesToCollections.placeId, sourceId));

            // Transfer source associations that target doesn't have, delete the rest
            for (const assoc of sourceSourceAssocs) {
              if (!targetSourceIds.has(assoc.sourceId)) {
                await tx.update(sourcesToPlaces)
                  .set({ placeId: cluster.targetId })
                  .where(and(
                    eq(sourcesToPlaces.placeId, sourceId),
                    eq(sourcesToPlaces.sourceId, assoc.sourceId)
                  ));
                targetSourceIds.add(assoc.sourceId);
                movedRelations.sourceLinks.push({
                  sourceId: assoc.sourceId,
                  fromPlaceId: sourceId,
                  action: 'moved',
                });
              } else {
                await tx.delete(sourcesToPlaces)
                  .where(and(
                    eq(sourcesToPlaces.placeId, sourceId),
                    eq(sourcesToPlaces.sourceId, assoc.sourceId)
                  ));
                movedRelations.sourceLinks.push({
                  sourceId: assoc.sourceId,
                  fromPlaceId: sourceId,
                  action: 'dropped',
                });
              }
            }

            for (const assoc of sourceCollectionAssocs) {
              if (!targetCollectionNotes.has(assoc.collectionId)) {
                await tx.update(placesToCollections)
                  .set({ placeId: cluster.targetId })
                  .where(and(
                    eq(placesToCollections.placeId, sourceId),
                    eq(placesToCollections.collectionId, assoc.collectionId)
                  ));
                targetCollectionNotes.set(assoc.collectionId, assoc.note);
                movedRelations.collectionLinks.push({
                  collectionId: assoc.collectionId,
                  fromPlaceId: sourceId,
                  action: 'moved',
                  absorbedNote: assoc.note ?? null,
                });
              } else {
                const keptNote = targetCollectionNotes.get(assoc.collectionId);
                const combined = appendNote(keptNote, assoc.note);
                if (combined !== keptNote) {
                  await tx.update(placesToCollections)
                    .set({ note: combined })
                    .where(and(
                      eq(placesToCollections.placeId, cluster.targetId),
                      eq(placesToCollections.collectionId, assoc.collectionId)
                    ));
                  targetCollectionNotes.set(assoc.collectionId, combined);
                }
                await tx.delete(placesToCollections)
                  .where(and(
                    eq(placesToCollections.placeId, sourceId),
                    eq(placesToCollections.collectionId, assoc.collectionId)
                  ));
                movedRelations.collectionLinks.push({
                  collectionId: assoc.collectionId,
                  fromPlaceId: sourceId,
                  action: 'note-appended',
                  absorbedNote: assoc.note ?? null,
                  keptNoteBefore: keptNote ?? null,
                  orderIndex: assoc.orderIndex,
                  isPinned: assoc.isPinned,
                });
              }
            }
          }

          await tx.update(places)
            .set({
              status: 'archived',
              archivedAt: updatedAt,
              updatedAt,
            })
            .where(inArray(places.id, liveSourceIds));

          const recordedDismissals = await insertFreshDismissPairs(tx, userId, cluster.dismissPairs ?? []);

          const mergedData = {
            description: merged.description,
            address: merged.address,
            coords: merged.coords,
            website: merged.website,
            phone: merged.phone,
            hours: merged.hours,
            price_level: merged.price_level,
            best_time: merged.best_time,
            practicalInfo: merged.practicalInfo,
            admin: merged.admin,
            city: merged.city,
            country: merged.country,
            kind: merged.kind,
            googlePlaceId: merged.googlePlaceId,
            activities: merged.activities,
            cuisine: merged.cuisine,
            amenities: merged.amenities,
            tags: merged.tags,
            vibes: merged.vibes,
            altNames: merged.altNames,
            notes: merged.notes,
            confidence: merged.confidence,
            ratingSelf: merged.ratingSelf,
            status: merged.status,
            fieldOverrides: fieldOverrides ?? null,
            movedRelations,
            // The kept place before this merge; `undoMerge` restores it.
            targetSnapshot: { ...targetPlace },
            updatedAt,
            ...(recordedDismissals.ids.length > 0 ? { dismissedPairIds: recordedDismissals.ids } : {}),
          };

          const [mergeLog] = await tx.insert(mergeLogs).values({
            targetId: cluster.targetId,
            sourceIds: liveSourceIds,
            mergedData,
            sourceSnapshots,
            confidence: cluster.confidence,
            performedBy: 'user',
          }).returning();

          results.push({
            clusterId: cluster.targetId,
            status: 'success',
            mergeLogId: mergeLog.id,
          });
          successCount++;
        });
        if (skipped) {
          results.push({
            clusterId: cluster.targetId,
            status: 'skipped',
          });
        }
      } catch (error) {
        results.push({
          clusterId: cluster.targetId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          notFound: error instanceof NotFoundError,
        });
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount, results };
  }, 'bulkMergePlaces');
}

/** Place columns a merge may change; undo writes them back from the snapshots. */
const UNDO_RESTORED_FIELDS = [
  ...MERGED_PLACE_FIELDS,
  'archivedAt',
] as const;

function restoredColumns(snapshot: Record<string, unknown>, updatedAt: string): Record<string, unknown> {
  const columns: Record<string, unknown> = { updatedAt };
  for (const field of UNDO_RESTORED_FIELDS) {
    if (field in snapshot) columns[field] = snapshot[field] ?? null;
  }
  return columns;
}

function mergeOrderKey(log: { performedAt: string; mergedData: unknown }): string {
  const data = log.mergedData as { updatedAt?: unknown } | null;
  return typeof data?.updatedAt === 'string' ? data.updatedAt : log.performedAt;
}

/**
 * Undo the latest merge into `placeId`: the kept place goes back to how it was
 * before, every absorbed place comes back with its own fields and status, and
 * photos, reservations, links, screenshots, and collection rows move back.
 * Dismissal rows this merge newly wrote are removed. A pair that was already
 * marked not duplicates is left in place.
 *
 * Merges into one place are undone newest first. `mergeLogId`, when given,
 * must be that newest merge. A place that was itself merged away since must
 * have that later merge undone first. Merges logged before the kept-place
 * snapshot existed cannot be undone.
 */
export async function undoMerge(
  placeId: string,
  userId: string,
  mergeLogId?: string
): Promise<{ mergeLogId: string; restoredIds: string[] }> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      const [target] = await tx.select().from(places)
        .where(and(eq(places.id, placeId), eq(places.userId, userId))).limit(1);
      if (!target) throw new NotFoundError('Place not found or unauthorized');

      const logs = await tx.select().from(mergeLogs)
        .where(and(eq(mergeLogs.targetId, placeId), eq(mergeLogs.undone, false)));
      const latest = [...logs].sort((a, b) => mergeOrderKey(b).localeCompare(mergeOrderKey(a)))[0];
      if (!latest) throw new NotFoundError('No merge to undo');
      if (mergeLogId && mergeLogId !== latest.id) {
        if (!logs.some((log: { id: string }) => log.id === mergeLogId)) {
          throw new NotFoundError('No merge to undo');
        }
        throw new ConflictError('Undo the later merge into this place first');
      }
      if (target.status === 'archived') {
        throw new ConflictError('This place was merged into another place since. Undo that merge first');
      }

      const data = (latest.mergedData ?? {}) as {
        targetSnapshot?: Record<string, unknown>;
        movedRelations?: MovedMergeRelations;
        dismissedPairIds?: unknown;
      };
      if (!data.targetSnapshot) {
        throw new ConflictError('This merge was made before undo was available');
      }

      const updatedAt = new Date().toISOString();
      await tx.update(places)
        .set(restoredColumns(data.targetSnapshot, updatedAt))
        .where(and(eq(places.id, placeId), eq(places.userId, userId)));

      const snapshots = (Array.isArray(latest.sourceSnapshots) ? latest.sourceSnapshots : []) as Array<Record<string, unknown>>;
      const restoredIds: string[] = [];
      for (const snapshot of snapshots) {
        if (typeof snapshot.id !== 'string') continue;
        await tx.update(places)
          .set(restoredColumns(snapshot, updatedAt))
          .where(and(eq(places.id, snapshot.id), eq(places.userId, userId)));
        restoredIds.push(snapshot.id);
      }

      const moved = data.movedRelations;
      for (const row of moved?.attachmentOrigins ?? []) {
        await tx.update(attachments)
          .set({ placeId: row.fromPlaceId, isPrimary: row.isPrimary })
          .where(and(eq(attachments.id, row.id), eq(attachments.placeId, placeId)));
      }
      for (const row of moved?.reservationOrigins ?? []) {
        await tx.update(reservations)
          .set({ placeId: row.fromPlaceId, updatedAt })
          .where(and(eq(reservations.id, row.id), eq(reservations.placeId, placeId)));
      }
      for (const row of moved?.placeLinkOrigins ?? []) {
        await tx.update(placeLinks)
          .set({ placeId: row.fromPlaceId })
          .where(and(eq(placeLinks.id, row.id), eq(placeLinks.placeId, placeId)));
      }
      // Newest first, so a row moved by one source and then appended to by
      // the next ends with the note it had before either.
      for (const link of [...(moved?.sourceLinks ?? [])].reverse()) {
        if (link.action === 'moved') {
          await tx.update(sourcesToPlaces)
            .set({ placeId: link.fromPlaceId })
            .where(and(eq(sourcesToPlaces.placeId, placeId), eq(sourcesToPlaces.sourceId, link.sourceId)));
        } else {
          await tx.insert(sourcesToPlaces)
            .values({ sourceId: link.sourceId, placeId: link.fromPlaceId })
            .onConflictDoNothing();
        }
      }
      for (const link of [...(moved?.collectionLinks ?? [])].reverse()) {
        if (link.action === 'moved') {
          await tx.update(placesToCollections)
            .set({ placeId: link.fromPlaceId })
            .where(and(eq(placesToCollections.placeId, placeId), eq(placesToCollections.collectionId, link.collectionId)));
        } else {
          await tx.update(placesToCollections)
            .set({ note: link.keptNoteBefore ?? null })
            .where(and(eq(placesToCollections.placeId, placeId), eq(placesToCollections.collectionId, link.collectionId)));
          await tx.insert(placesToCollections)
            .values({
              placeId: link.fromPlaceId,
              collectionId: link.collectionId,
              note: link.absorbedNote,
              orderIndex: link.orderIndex ?? 0,
              isPinned: link.isPinned ?? 0,
            })
            .onConflictDoNothing();
        }
      }

      const dismissedPairIds = Array.isArray(data.dismissedPairIds)
        ? data.dismissedPairIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
      for (let index = 0; index < dismissedPairIds.length; index += 200) {
        await tx.delete(dismissedDuplicates).where(and(
          eq(dismissedDuplicates.userId, userId),
          inArray(dismissedDuplicates.id, dismissedPairIds.slice(index, index + 200)),
        ));
      }

      await tx.update(mergeLogs)
        .set({ undone: true, undonAt: updatedAt })
        .where(eq(mergeLogs.id, latest.id));

      return { mergeLogId: latest.id, restoredIds };
    });
  }, 'undoMerge');
}

/**
 * Sets the visit status (Dreaming / Planned / Been) on the caller's places. Dates
 * are left as they are, so moving a place back keeps the visit or the plan it had.
 */
export async function batchSetVisitStatus(
  placeIds: string[],
  visitStatus: 'not_visited' | 'planned' | 'visited',
  userId: string
): Promise<number> {
  return withErrorHandling(async () => {
    const tdb = forUser(userId);
    let updated = 0;
    for (let i = 0; i < placeIds.length; i += 50) {
      const result = await tdb.update(
        places,
        { visitStatus, updatedAt: new Date().toISOString() },
        inArray(places.id, placeIds.slice(i, i + 50))
      );
      updated += result.rowsAffected ?? 0;
    }
    return updated;
  }, 'batchSetVisitStatus');
}

export async function batchArchivePlaces(placeIds: string[], userId: string): Promise<number> {
  if (placeIds.length === 0) return 0;
  const { updatedCount } = await bulkUpdatePlaceStatus(placeIds, 'archived', userId);
  return updatedCount;
}

// Enhanced bulk operations for inbox workflow
export async function bulkConfirmPlaces(placeIds: string[], userId: string): Promise<PlaceStatusUpdate> {
  return bulkUpdatePlaceStatus(placeIds, 'library', userId);
}

export async function bulkReturnPlacesToInbox(placeIds: string[], userId: string): Promise<PlaceStatusUpdate> {
  return bulkUpdatePlaceStatus(placeIds, 'inbox', userId);
}

export async function bulkMovePlacesToReview(placeIds: string[], userId: string): Promise<number> {
  const { updatedCount } = await bulkUpdatePlaceStatus(placeIds, 'review', userId);
  return updatedCount;
}

export async function createAttachment(
  data: {
    id?: string;
    placeId: string;
    type: string;
    uri: string;
    filename: string;
    mimeType?: string;
    fileSize?: number;
    width?: number | null;
    height?: number | null;
    thumbnailUri?: string | null;
    caption?: string | null;
    takenAt?: string;
    isPrimary?: number;
    source?: string;
    sourceId?: string | null;
    attribution?: import('@/db/schema/attachments').AttributionMeta | null;
  },
  userId: string
) {
  return withErrorHandling(async () => {
    // Verify place ownership
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, data.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new NotFoundError(`Place ${data.placeId} not found or unauthorized`);
    }

    const { attachments } = await import('@/db/schema');

    const insertValues = {
      ...(data.id ? { id: data.id } : {}),
      placeId: data.placeId,
      type: data.type,
      uri: data.uri,
      filename: data.filename,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      width: data.width ?? undefined,
      height: data.height ?? undefined,
      thumbnailUri: data.thumbnailUri ?? undefined,
      caption: data.caption ?? undefined,
      takenAt: data.takenAt,
      isPrimary: data.isPrimary,
      source: data.source ?? 'upload',
      sourceId: data.sourceId ?? undefined,
      attribution: data.attribution ?? undefined,
    };

    const [attachment] = await db
      .insert(attachments)
      .values(insertValues)
      .returning();

    return attachment;
  }, 'createAttachment');
}

export async function deleteAttachment(id: string, userId: string) {
  return withErrorHandling(async () => {
    const { attachments } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get attachment and verify place ownership
    const [attachment] = await db.select().from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);

    if (!attachment) {
      throw new NotFoundError(`Attachment ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, attachment.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new Error('Unauthorized to delete this attachment');
    }

    await db
      .delete(attachments)
      .where(eq(attachments.id, id));

    const exclusions = { excludeAttachmentIds: [id] };
    await releaseBlobIfUnreferenced(userId, attachment.uri, exclusions, '[deleteAttachment]');
    await releaseBlobIfUnreferenced(
      userId,
      attachment.thumbnailUri,
      exclusions,
      '[deleteAttachment]'
    );

    return { success: true };
  }, 'deleteAttachment');
}

export async function createPlaceLink(
  data: {
    placeId: string;
    url: string;
    title?: string;
    description?: string;
    type?: string;
    platform?: string;
  },
  userId: string
) {
  return withErrorHandling(async () => {
    // Verify place ownership
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, data.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new NotFoundError(`Place ${data.placeId} not found or unauthorized`);
    }

    const { placeLinks } = await import('@/db/schema');

    const [link] = await db
      .insert(placeLinks)
      .values(data)
      .returning();

    return link;
  }, 'createPlaceLink');
}

export async function deletePlaceLink(id: string, userId: string) {
  return withErrorHandling(async () => {
    const { placeLinks } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get link and verify place ownership
    const [link] = await db.select().from(placeLinks)
      .where(eq(placeLinks.id, id))
      .limit(1);

    if (!link) {
      throw new NotFoundError(`Link ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, link.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new Error('Unauthorized to delete this link');
    }

    await db
      .delete(placeLinks)
      .where(eq(placeLinks.id, id));

    return { success: true };
  }, 'deletePlaceLink');
}

export async function createReservation(
  data: {
    placeId: string;
    reservationDate: string;
    reservationTime?: string;
    confirmationNumber?: string;
    status?: string;
    partySize?: number;
    bookingPlatform?: string;
    bookingUrl?: string;
    specialRequests?: string;
    totalCost?: string;
    notes?: string;
  },
  userId: string
) {
  return withErrorHandling(async () => {
    // Verify place ownership
    const [place] = await db.select().from(places)
      .where(and(eq(places.id, data.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new NotFoundError(`Place ${data.placeId} not found or unauthorized`);
    }

    const { reservations } = await import('@/db/schema');

    const [reservation] = await db
      .insert(reservations)
      .values(data)
      .returning();

    return reservation;
  }, 'createReservation');
}

export async function updateReservation(
  id: string,
  data: {
    reservationDate?: string;
    reservationTime?: string | null;
    confirmationNumber?: string | null;
    bookingPlatform?: string | null;
    status?: string;
    notes?: string | null;
    partySize?: number | null;
    bookingUrl?: string | null;
    specialRequests?: string | null;
    totalCost?: string | null;
  },
  userId: string,
  placeId: string
) {
  return withErrorHandling(async () => {
    const { reservations } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get reservation and verify place ownership
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.id, id))
      .limit(1);

    if (!reservation || reservation.placeId !== placeId) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, reservation.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new NotFoundError('Unauthorized to update this reservation');
    }

    const [updated] = await db
      .update(reservations)
      .set(data)
      .where(and(eq(reservations.id, id), eq(reservations.placeId, placeId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    return updated;
  }, 'updateReservation');
}

export async function deleteReservation(id: string, userId: string, placeId: string) {
  return withErrorHandling(async () => {
    const { reservations } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get reservation and verify place ownership
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.id, id))
      .limit(1);

    if (!reservation || reservation.placeId !== placeId) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, reservation.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new NotFoundError('Unauthorized to delete this reservation');
    }

    const deleted = await db
      .delete(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.placeId, placeId)))
      .returning();

    if (deleted.length === 0) {
      throw new NotFoundError(`Reservation ${id} not found`);
    }

    return { success: true };
  }, 'deleteReservation');
}

export async function batchRestorePlaces(placeIds: string[], userId: string): Promise<number> {
  if (placeIds.length === 0) return 0;
  const { updatedCount } = await bulkUpdatePlaceStatus(placeIds, 'library', userId);
  return updatedCount;
}

export async function batchDeletePlaces(placeIds: string[], userId: string): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const CHUNK_SIZE = 50;
    let totalDeleted = 0;

    for (let i = 0; i < placeIds.length; i += CHUNK_SIZE) {
      const chunk = placeIds.slice(i, i + CHUNK_SIZE);

      const deleted = await withTransaction(async (tx) => {
        // Verify ownership in bulk
        const ownedPlaces = await tx.select({ id: places.id }).from(places)
          .where(and(inArray(places.id, chunk), eq(places.userId, userId)));
        const ownedIds = ownedPlaces.map((p: { id: string }) => p.id);

        if (ownedIds.length === 0) return 0;

        // Bulk delete join tables
        await tx.delete(sourcesToPlaces).where(inArray(sourcesToPlaces.placeId, ownedIds));
        await tx.delete(placesToCollections).where(inArray(placesToCollections.placeId, ownedIds));

        // Bulk delete places
        const result = await tx.delete(places).where(inArray(places.id, ownedIds));
        return result.rowsAffected ?? 0;
      });

      totalDeleted += deleted;
    }

    return totalDeleted;
  }, 'batchDeletePlaces');
}

export async function batchCreatePlaces(
  placesData: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt' | 'userId'>[],
  userId: string,
  options?: {
    collectionId?: string;
    defaultStatus?: 'inbox' | 'library';
  }
): Promise<{
  success: Place[];
  failed: Array<{ index: number; error: string }>;
}> {
  return withErrorHandling(async () => {
    // If collectionId provided, verify ownership
    if (options?.collectionId) {
      const [collection] = await db.select().from(collections)
        .where(and(eq(collections.id, options.collectionId), eq(collections.userId, userId)))
        .limit(1);

      if (!collection) {
        throw new NotFoundError(`Collection ${options.collectionId} not found or unauthorized`);
      }
    }

    return await withTransaction(async (tx) => {
      const success: Place[] = [];
      const failed: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < placesData.length; i++) {
        try {
          const placeData = placesData[i];
          const newPlace: NewPlace = {
            id: generatePlaceId(),
            ...placeData,
            userId,
            status: placeData.status || options?.defaultStatus || 'inbox',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const [place] = await tx.insert(places).values(newPlace).returning();
          success.push(place);

          if (options?.collectionId) {
            await tx.insert(placesToCollections).values({
              placeId: place.id,
              collectionId: options.collectionId,
              orderIndex: success.length,
            }).onConflictDoNothing();
          }
        } catch (error) {
          failed.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return { success, failed };
    });
  }, 'batchCreatePlaces');
}

export type CreatePlacesFromPipelineResult = Place[] & { createdCount: number };

/** Patch `$.massUpload.outcome` on the row as it is at commit time. */
function metaSettingMassUploadOutcome(outcome: {
  created: string[];
  linked: Array<{ placeId: string; reason: string }>;
}): SQL {
  const meta = sourcesCurrentSchema.meta;
  return sql`json_set(COALESCE(${meta}, '{}'), '$.massUpload.outcome', json(${JSON.stringify(outcome)}))`;
}

/**
 * Insert new places from one screenshot and attach it to places that already
 * exist. The same transaction stores `meta.massUpload.outcome`: `created` is
 * the place ids this source inserted, including ids already stored by an
 * earlier attempt, and `linked` is existing places this screenshot was
 * attached to. `createdCount` is `created.length`, not how many places the
 * screenshot touched.
 */
export async function createPlacesFromPipeline(
  pipelinePlaces: PipelinePlace[],
  sourceId: string,
  userId: string
): Promise<CreatePlacesFromPipelineResult> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      // Get source to verify ownership and get screenshot URL
      const [source] = await tx.select()
        .from(sourcesCurrentSchema)
        .where(and(eq(sourcesCurrentSchema.id, sourceId), eq(sourcesCurrentSchema.userId, userId)))
        .limit(1);

      if (!source) throw new NotFoundError(`Source ${sourceId} not found or unauthorized`);

      const screenshotUri = source.uri;
      const meta = source.meta;
      const resolvedPlaces: Place[] = [];
      const createdIds = new Set(recordedCreatedPlaceIds(meta));
      const linkedByPlaceId = new Map<string, LinkReason>();

      // ── Batched dedup lookup ───────────────────────────────────────────
      // One query per lookup shape for the whole screenshot instead of two
      // per extracted place: a 10-place screenshot went from 20 round trips
      // to 2, which is what made heavy runs blow the function time limit.
      const googleIds = Array.from(
        new Set(pipelinePlaces.map(p => p.googlePlaceId).filter((id): id is string => Boolean(id)))
      );
      // Bound raw and lowered in SQL on both sides: SQLite's LOWER() is
      // ASCII-only, so an already-lowercased parameter stops agreeing with
      // LOWER(places.name) as soon as the name has an accent.
      const names = Array.from(
        new Set(pipelinePlaces.map(p => p.name).filter((n): n is string => Boolean(n)))
      );

      const byGoogleId = new Map<string, Place[]>();
      if (googleIds.length > 0) {
        const rows = await tx.select().from(places)
          .where(and(eq(places.userId, userId), inArray(places.googlePlaceId, googleIds)));
        for (const row of rows as Place[]) {
          if (!row.googlePlaceId) continue;
          rememberIdentityMatch(byGoogleId, row.googlePlaceId, row);
        }
      }

      const byNameKey = new Map<string, Place[]>();
      if (names.length > 0) {
        const rows = await tx.select().from(places)
          .where(and(
            eq(places.userId, userId),
            sql`LOWER(${places.name}) IN (${sql.join(names.map(n => sql`LOWER(${n})`), sql`, `)})`
          ));
        for (const row of rows as Place[]) {
          rememberIdentityMatch(byNameKey, placeNameKey(row.name, row.city, row.country), row);
        }
      }

      const sourceLinks: Array<{ sourceId: string; placeId: string }> = [];
      const newAttachments: Array<typeof attachments.$inferInsert> = [];

      for (const p of pipelinePlaces) {
        // ── Dedup check (in-memory, including places created in this batch) ─
        const nameKey = p.name ? placeNameKey(p.name, p.city ?? null, p.country ?? null) : null;
        const googleCandidates = p.googlePlaceId ? byGoogleId.get(p.googlePlaceId) : undefined;
        const nameCandidates = nameKey ? byNameKey.get(nameKey) : undefined;
        const candidates = googleCandidates ?? nameCandidates;

        if (candidates && candidates.length > 0) {
          // A place archived by a merge still carries its Google id and name.
          // Attach this screenshot to the survivor instead of the archived copy.
          const linked = await resolveIdentityMatch(tx, candidates, userId);
          sourceLinks.push({ sourceId, placeId: linked.id });
          resolvedPlaces.push(linked);
          // Keep this source's creations out of `linked`: a place inserted earlier
          // in this call, or one already listed on `outcome.created` from an
          // attempt whose inserts committed before the source completed.
          if (!createdIds.has(linked.id)) {
            const matchedOnGoogleId = Boolean(
              p.googlePlaceId &&
              candidates.some((candidate) => candidate.googlePlaceId === p.googlePlaceId)
            );
            rememberLinkReason(
              linkedByPlaceId,
              linked.id,
              matchedOnGoogleId ? 'google_place_id' : 'exact_name_city_country'
            );
          }
          if (p.googlePlaceId) byGoogleId.set(p.googlePlaceId, [linked]);
          if (nameKey) byNameKey.set(nameKey, [linked]);
          continue;
        }

        // ── Create new place ─────────────────────────────────────────────
        const newPlace: NewPlace = {
          id: generatePlaceId(),
          name: p.name,
          kind: p.kind,
          description: p.description || null,
          status: 'inbox',
          userId,
          city: p.city || null,
          admin: p.admin || null,
          country: p.country || null,
          address: p.address || null,
          coords: usablePin(p.coords),
          googlePlaceId: p.googlePlaceId || null,
          confidence: p.confidence,
          price_level: p.price_level || null,
          best_time: p.best_time || null,
          activities: p.activities || null,
          cuisine: p.cuisine || null,
          amenities: p.amenities || null,
          tags: p.tags || null,
          vibes: p.vibes || null,
          practicalInfo: p.practicalInfo || null,
          recommendedBy: p.recommendedBy || null,
        };

        const [place] = await tx.insert(places).values(newPlace).returning();
        resolvedPlaces.push(place);
        createdIds.add(place.id);
        if (place.googlePlaceId) byGoogleId.set(place.googlePlaceId, [place]);
        if (nameKey) byNameKey.set(nameKey, [place]);

        // Link source → place
        sourceLinks.push({ sourceId, placeId: place.id });

        // Attach screenshot as primary photo
        if (screenshotUri) {
          newAttachments.push({
            placeId: place.id,
            type: 'photo',
            uri: screenshotUri,
            filename: meta?.uploadInfo?.originalName || 'screenshot.jpg',
            mimeType: meta?.uploadInfo?.mimeType || 'image/jpeg',
            fileSize: meta?.uploadInfo?.fileSize || null,
            thumbnailUri: meta?.uploadInfo?.thumbnailPath || null,
            isPrimary: 1,
          });
        }
      }

      const uniqueLinks = Array.from(
        new Map(sourceLinks.map(l => [`${l.sourceId}::${l.placeId}`, l])).values()
      );
      if (uniqueLinks.length > 0) {
        await tx.insert(sourcesToPlaces).values(uniqueLinks).onConflictDoNothing();
      }
      if (newAttachments.length > 0) {
        await tx.insert(attachments).values(newAttachments);
      }

      const outcome = {
        created: Array.from(createdIds),
        linked: Array.from(linkedByPlaceId, ([placeId, reason]) => ({ placeId, reason })),
      };
      await tx.update(sourcesCurrentSchema)
        .set({
          meta: metaSettingMassUploadOutcome(outcome),
          updatedAt: new Date().toISOString(),
        })
        .where(and(
          eq(sourcesCurrentSchema.id, sourceId),
          eq(sourcesCurrentSchema.userId, userId)
        ));

      const result = resolvedPlaces as CreatePlacesFromPipelineResult;
      result.createdCount = outcome.created.length;
      return result;
    });
  }, 'createPlacesFromPipeline');
}

type LinkReason = 'google_place_id' | 'exact_name_city_country';

function recordedCreatedPlaceIds(meta: typeof sourcesCurrentSchema.$inferSelect.meta): string[] {
  const created = meta?.massUpload?.outcome?.created;
  if (!Array.isArray(created)) return [];
  return created.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** A google-id match wins over a later name match for the same place. */
function rememberLinkReason(
  linkedByPlaceId: Map<string, LinkReason>,
  placeId: string,
  reason: LinkReason
): void {
  if (linkedByPlaceId.get(placeId) === 'google_place_id') return;
  linkedByPlaceId.set(placeId, reason);
}

/**
 * Dedup key for "same place, same user" — mirrors the case-insensitive,
 * null-aware comparison the per-place lookup used to do in SQL.
 */
function placeNameKey(name: string, city: string | null, country: string | null): string {
  return [name, city ?? '', country ?? ''].map(v => v.toLowerCase()).join('\u0000');
}

function rememberIdentityMatch(map: Map<string, Place[]>, key: string, place: Place): void {
  const matches = map.get(key);
  if (matches) matches.push(place);
  else map.set(key, [place]);
}

/** Prefer a live identity match; otherwise the first archived row that resolves through merge_logs. */
async function resolveIdentityMatch(tx: any, candidates: Place[], userId: string): Promise<Place> {
  const live = candidates.find((candidate) => candidate.status !== 'archived');
  if (live) return live;

  for (const candidate of candidates) {
    const survivor = await survivorOfMergedArchive(tx, candidate, userId);
    if (survivor.id !== candidate.id) return survivor;
  }
  return candidates[0];
}

/**
 * Walk merge_logs from an archived place to the place that survived the merge.
 * Stops when the row was archived for some other reason, the log was undone,
 * or the chain would loop. The target must belong to the same user.
 */
async function survivorOfMergedArchive(tx: any, place: Place, userId: string): Promise<Place> {
  let current = place;
  const seen = new Set<string>();
  for (let hop = 0; hop < 8 && current.status === 'archived' && !seen.has(current.id); hop++) {
    seen.add(current.id);
    const [log] = await tx.select({ targetId: mergeLogs.targetId })
      .from(mergeLogs)
      .innerJoin(places, eq(places.id, mergeLogs.targetId))
      .where(and(
        eq(places.userId, userId),
        eq(mergeLogs.undone, false),
        sql`EXISTS (SELECT 1 FROM json_each(${mergeLogs.sourceIds}) AS je WHERE je.value = ${current.id})`
      ))
      .orderBy(desc(mergeLogs.performedAt))
      .limit(1);
    if (!log?.targetId || log.targetId === current.id) break;

    const [survivor] = await tx.select().from(places)
      .where(and(eq(places.id, log.targetId), eq(places.userId, userId)))
      .limit(1);
    if (!survivor) break;
    current = survivor;
  }
  return current;
}

// ─── Mass-upload queue: lease-based claim / release ──────────────────────────
//
// The queue distinguishes two very different things that used to share one
// counter:
//   • an ATTEMPT is a genuine verdict on the image (bad file, invalid response)
//   • an INTERRUPTION is "we ran out of clock" (function killed, lease expired)
// Attempts and interruptions stay separate counters. Interruptions requeue with
// backoff, stall at the cap (the cron puts that row back on the queue), and
// land in `failed` only once that cap is past.
//
// Every write is guarded by the lease id the claiming run holds, so a run whose
// lease was reclaimed cannot finish, fail or complete an item someone else owns.

/**
 * Result of one claim attempt. `contended` separates "nothing is waiting" from
 * "candidates existed but another run took every one of them" — the caller must
 * not treat the second as an empty queue and stop working.
 */
export interface ClaimAttempt {
  source: Source | null;
  contended: boolean;
}

/**
 * Atomically claim the oldest claimable queued source.
 *
 * Sources backing off after an interruption (`next_attempt_at` in the future)
 * are not candidates; NULL means ready, so pre-existing rows and freshly queued
 * uploads are unaffected. The same write drops `meta.retry.previous`, so a
 * manual retry can no longer be undone once a worker owns the row.
 */
export async function claimNextQueuedSource(
  leaseId: string,
  candidateLimit: number = 10
): Promise<ClaimAttempt> {
  return withErrorHandling(async () => {
    const nowIso = new Date().toISOString();
    const candidates = await db.select({
      id: sourcesCurrentSchema.id,
    })
      .from(sourcesCurrentSchema)
      .where(and(
        eq(sourcesCurrentSchema.processingStatus, 'queued'),
        isClaimableNow(nowIso)
      ))
      .orderBy(sourcesCurrentSchema.createdAt)
      .limit(candidateLimit);

    for (const candidate of candidates) {
      const [claimed] = await db.update(sourcesCurrentSchema)
        .set({
          processingStatus: 'extracting',
          processingStartedAt: new Date().toISOString(),
          processingLeaseId: leaseId,
          nextAttemptAt: null,
          updatedAt: new Date().toISOString(),
          meta: metaDroppingRetryPrevious(),
        })
        .where(and(
          eq(sourcesCurrentSchema.id, candidate.id),
          eq(sourcesCurrentSchema.processingStatus, 'queued')
        ))
        .returning();

      if (claimed) return { source: claimed as Source, contended: false };
    }

    return { source: null, contended: candidates.length > 0 };
  }, 'claimNextQueuedSource');
}

/** Move a claimed source to `enriching`. False means the lease was lost. */
export async function markSourceEnriching(sourceId: string, leaseId: string): Promise<boolean> {
  return withErrorHandling(async () => {
    const updated = await db.update(sourcesCurrentSchema)
      .set({ processingStatus: 'enriching', updatedAt: new Date().toISOString() })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });
    return updated.length > 0;
  }, 'markSourceEnriching');
}

function metaCachingProcessingWork(
  work: { extraction?: unknown; thumbnailUrl?: string },
  extractedAt: string
): SQL | null {
  const meta = sourcesCurrentSchema.meta;
  const pairs: SQL[] = [];
  if (work.extraction !== undefined) {
    pairs.push(sql`'$.massUpload.extraction', json(${JSON.stringify(work.extraction)})`);
    pairs.push(sql`'$.massUpload.extractedAt', ${extractedAt}`);
  }
  if (work.thumbnailUrl) {
    pairs.push(sql`'$.massUpload.thumbnailUrl', ${work.thumbnailUrl}`);
    pairs.push(sql`'$.uploadInfo.thumbnailPath', ${work.thumbnailUrl}`);
  }
  if (pairs.length === 0) return null;
  return sql`json_set(COALESCE(${meta}, '{}'), ${sql.join(pairs, sql`, `)})`;
}

/**
 * Persist work already paid for (Gemini extraction, thumbnail) onto the source
 * so a later retry reuses it instead of calling the API again.
 */
export async function cacheSourceProcessingWork(
  sourceId: string,
  leaseId: string,
  work: { extraction?: unknown; thumbnailUrl?: string }
): Promise<boolean> {
  return withErrorHandling(async () => {
    const now = new Date().toISOString();
    const meta = metaCachingProcessingWork(work, now);
    const updated = await db.update(sourcesCurrentSchema)
      .set(meta ? { meta, updatedAt: now } : { updatedAt: now })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return updated.length > 0;
  }, 'cacheSourceProcessingWork');
}

/** Mark a source completed. False means the lease was lost (another run owns it). */
export async function completeSource(sourceId: string, leaseId: string): Promise<boolean> {
  return withErrorHandling(async () => {
    const updated = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: 'completed',
        processingError: null,
        processingLeaseId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });
    return updated.length > 0;
  }, 'completeSource');
}

/**
 * Record a GENUINE processing failure: consumes an attempt, and only after
 * `maxAttempts` does the source become `failed`.
 */
export async function recordSourceFailure(
  sourceId: string,
  leaseId: string,
  message: string,
  maxAttempts: number
): Promise<'failed' | 'queued' | 'lease-lost'> {
  return withErrorHandling(async () => {
    const [current] = await db.select({ attempts: sourcesCurrentSchema.processingAttempts })
      .from(sourcesCurrentSchema)
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .limit(1);

    if (!current) return 'lease-lost';

    const attempts = (current.attempts ?? 0) + 1;
    const nextStatus = attempts >= maxAttempts ? 'failed' : 'queued';

    const updated = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: nextStatus,
        processingAttempts: attempts,
        processingError: message.slice(0, 1000),
        processingLeaseId: null,
        nextAttemptAt: nextStatus === 'queued' ? retryBackoffUntilIso(attempts) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return updated.length > 0 ? nextStatus : 'lease-lost';
  }, 'recordSourceFailure');
}

/**
 * Where one more interruption leaves the row.
 *
 * Below the cap it is queued with a backoff. At the cap it is `stalled`
 * (Still trying) with a backoff the cron puts back on the queue. Past the cap
 * it is `failed`. The attempt counter is never touched.
 */
function settleInterruption(nextCount: number, maxInterruptions: number, now: number = Date.now()) {
  if (nextCount > maxInterruptions) {
    return { status: 'failed' as const, nextAttemptAt: null as string | null };
  }
  const nextAttemptAt = retryBackoffUntilIso(nextCount, now);
  if (nextCount >= maxInterruptions) {
    return { status: 'stalled' as const, nextAttemptAt };
  }
  return { status: 'queued' as const, nextAttemptAt };
}

/**
 * Record an INTERRUPTION: the run ran out of clock, was killed, or an upstream
 * dependency was unavailable. Never consumes an attempt. See `settleInterruption`.
 */
export async function recordSourceInterruption(
  sourceId: string,
  leaseId: string,
  message: string,
  maxInterruptions: number
): Promise<'failed' | 'stalled' | 'queued' | 'lease-lost'> {
  return withErrorHandling(async () => {
    const [current] = await db.select({ interruptions: sourcesCurrentSchema.processingInterruptions })
      .from(sourcesCurrentSchema)
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .limit(1);

    if (!current) return 'lease-lost';

    const interruptions = (current.interruptions ?? 0) + 1;
    const settled = settleInterruption(interruptions, maxInterruptions);

    const updated = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: settled.status,
        processingInterruptions: interruptions,
        processingError: message.slice(0, 1000),
        processingLeaseId: null,
        // A sustained upstream outage must not burn the whole interruption
        // budget in seconds, so the retry waits before it becomes claimable.
        nextAttemptAt: settled.nextAttemptAt,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return updated.length > 0 ? settled.status : 'lease-lost';
  }, 'recordSourceInterruption');
}

/**
 * Requeue sources whose lease expired — the run that held them died without
 * getting a chance to write anything back (deploy, OOM, hard kill).
 */
export async function reclaimExpiredSourceLeases(
  expiredBeforeIso: string,
  maxInterruptions: number
): Promise<{ requeued: number; stalled: number; failed: number; ids: string[] }> {
  return withErrorHandling(async () => {
    const expired = await db.select({
      id: sourcesCurrentSchema.id,
      leaseId: sourcesCurrentSchema.processingLeaseId,
      interruptions: sourcesCurrentSchema.processingInterruptions,
    })
      .from(sourcesCurrentSchema)
      .where(and(
        sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`,
        sql`COALESCE(${sourcesCurrentSchema.processingStartedAt}, '') < ${expiredBeforeIso}`
      ));

    let requeued = 0;
    let stalled = 0;
    let failed = 0;
    const ids: string[] = [];

    for (const row of expired) {
      const interruptions = (row.interruptions ?? 0) + 1;
      const settled = settleInterruption(interruptions, maxInterruptions);

      // Guarded by the same lease id we saw: if the owner is somehow still
      // alive and has re-leased the row, we leave it alone.
      const updated = await db.update(sourcesCurrentSchema)
        .set({
          processingStatus: settled.status,
          processingInterruptions: interruptions,
          processingError: settled.status === 'queued'
            ? 'Run was interrupted before finishing; requeued'
            : `Interrupted ${interruptions} times before finishing — not a problem with the image; retry it`,
          processingLeaseId: null,
          nextAttemptAt: settled.nextAttemptAt,
          updatedAt: new Date().toISOString(),
        })
        .where(and(
          eq(sourcesCurrentSchema.id, row.id),
          row.leaseId === null
            ? sql`${sourcesCurrentSchema.processingLeaseId} IS NULL`
            : eq(sourcesCurrentSchema.processingLeaseId, row.leaseId),
          sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`
        ))
        .returning({ id: sourcesCurrentSchema.id });

      if (updated.length > 0) {
        ids.push(row.id);
        if (settled.status === 'failed') failed++;
        else if (settled.status === 'stalled') stalled++;
        else requeued++;
      }
    }

    return { requeued, stalled, failed, ids };
  }, 'reclaimExpiredSourceLeases');
}

/**
 * Recover uploads whose browser disappeared after registration but before the
 * Start request. This is not a processing verdict or interruption: no worker
 * ever claimed the source, so both counters remain untouched.
 */
export async function requeueStaleUploadedSources(
  staleBeforeIso: string
): Promise<{ requeued: number; ids: string[] }> {
  return withErrorHandling(async () => {
    const rows = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: 'queued',
        processingError: null,
        processingStartedAt: null,
        processingLeaseId: null,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.processingStatus, 'uploaded'),
        lt(sourcesCurrentSchema.updatedAt, staleBeforeIso)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return { requeued: rows.length, ids: rows.map(row => row.id) };
  }, 'requeueStaleUploadedSources');
}

/**
 * Put `stalled` screenshots whose backoff has elapsed back on the queue.
 *
 * `next_attempt_at` NULL counts as ready, the same rule the claim uses, so a
 * row parked with no wait is picked up on the next cron. The interruption
 * counter stays where it is: the next clock-out past the cap is what fails it.
 */
export async function requeueReadyStalledSources(
  nowIso: string
): Promise<{ requeued: number; ids: string[] }> {
  return withErrorHandling(async () => {
    const rows = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: 'queued',
        processingStartedAt: null,
        processingLeaseId: null,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.processingStatus, 'stalled'),
        isClaimableNow(nowIso)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return { requeued: rows.length, ids: rows.map((row) => row.id) };
  }, 'requeueReadyStalledSources');
}
