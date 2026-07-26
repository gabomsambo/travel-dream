import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { db } from '@/db';
import { sources, places, collections, sourcesToPlaces, placesToCollections, mergeLogs, attachments } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { withErrorHandling, withTransaction, generateSourceId, generatePlaceId, generateCollectionId } from './db-utils';
import type { NewSource, NewPlace, NewCollection, Source, Place, Collection } from '@/types/database';
import type { ExtractedPlace, ExtractionResult, ExtractionMetadata } from '@/types/llm-extraction';
import type { PipelinePlace } from '@/types/extraction-pipeline';

// Place mutations
export async function createPlace(
  data: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>,
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
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db.update(places)
      .set(updateData)
      .where(and(eq(places.id, id), eq(places.userId, userId)))
      .returning();

    if (!updated) {
      throw new Error(`Place with id ${id} not found or unauthorized`);
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
        throw new Error(`Place with id ${id} not found or unauthorized`);
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
  data: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt'>,
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
      throw new Error(`Source with id ${id} not found or unauthorized`);
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
      throw new Error(`Source with id ${id} not found or unauthorized`);
    }

    await withTransaction(async (tx) => {
      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.sourceId, id));

      // Delete the source
      await tx.delete(sources).where(eq(sources.id, id));
    });

    // Clean up blob storage AFTER transaction commits (best-effort)
    if (source.uri?.startsWith('https://')) {
      try {
        await del(source.uri);
      } catch (e) {
        console.warn(`[deleteSource] Failed to delete blob ${source.uri}:`, e);
      }
    }
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

    // Clean up blobs AFTER transaction commits (best-effort)
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls);
      } catch (e) {
        console.warn(`[clearAllScreenshots] Failed to delete ${blobUrls.length} blobs:`, e);
      }
    }

    return { deleted: userScreenshots.length };
  }, 'clearAllScreenshots');
}

// Collection mutations
export async function createCollection(
  data: Omit<NewCollection, 'id' | 'createdAt' | 'updatedAt'>,
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
      throw new Error(`Collection with id ${id} not found or unauthorized`);
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
        throw new Error(`Collection with id ${id} not found or unauthorized`);
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
      throw new Error(`Collection with id ${collectionId} not found or unauthorized`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
    }

    const [current] = await db
      .select({ isPinned: placesToCollections.isPinned })
      .from(placesToCollections)
      .where(and(
        eq(placesToCollections.collectionId, collectionId),
        eq(placesToCollections.placeId, placeId)
      ));

    if (!current) {
      throw new Error(`Place ${placeId} not found in collection ${collectionId}`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
      throw new Error('Source or place not found or unauthorized');
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
      throw new Error('Source or place not found or unauthorized');
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
      throw new Error('Place or collection not found or unauthorized');
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
      throw new Error(`Collection ${collectionId} not found or unauthorized`);
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
    source: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt'>;
    place: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>;
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

// Bulk status updates
export async function bulkUpdatePlaceStatus(
  placeIds: string[],
  status: 'inbox' | 'library' | 'archived' | 'review',
  userId: string
): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const CHUNK_SIZE = 50;
    let totalUpdated = 0;

    for (let i = 0; i < placeIds.length; i += CHUNK_SIZE) {
      const chunk = placeIds.slice(i, i + CHUNK_SIZE);
      const result = await db.update(places)
        .set({
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(and(inArray(places.id, chunk), eq(places.userId, userId)));

      totalUpdated += result.rowsAffected ?? 0;
    }

    return totalUpdated;
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
      throw new Error(`Source with id ${sourceId} not found or unauthorized`);
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
        throw new Error('Source or target place not found or unauthorized');
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

export async function bulkMergePlaces(
  clusters: Array<{ targetId: string; sourceIds: string[]; confidence: number }>,
  userId: string
): Promise<{ success: number; failed: number; results: any[] }> {
  return withErrorHandling(async () => {
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const cluster of clusters) {
      try {
        await withTransaction(async (tx) => {
          // Verify ownership of all places
          const [targetPlace] = await tx.select().from(places)
            .where(and(eq(places.id, cluster.targetId), eq(places.userId, userId))).limit(1);
          const sourcePlaces = await tx.select().from(places)
            .where(and(inArray(places.id, cluster.sourceIds), eq(places.userId, userId)));

          if (!targetPlace) throw new Error('Target place not found or unauthorized');
          if (sourcePlaces.length !== cluster.sourceIds.length) {
            throw new Error('One or more source places not found or unauthorized');
          }

          const sourceSnapshots = sourcePlaces.map((p: Place) => ({ ...p }));

          const mergedData = {
            altNames: [...new Set([
              targetPlace.name,
              ...(targetPlace.altNames || []),
              ...sourcePlaces.flatMap((p: Place) => [p.name, ...(p.altNames || [])])
            ])],
            tags: [...new Set([
              ...(targetPlace.tags || []),
              ...sourcePlaces.flatMap((p: Place) => p.tags || [])
            ])],
            vibes: [...new Set([
              ...(targetPlace.vibes || []),
              ...sourcePlaces.flatMap((p: Place) => p.vibes || [])
            ])],
            notes: [
              targetPlace.notes,
              ...sourcePlaces.map((p: Place) => p.notes)
            ].filter(Boolean).join('\n\n---\n\n'),
            updatedAt: new Date().toISOString()
          };

          await tx.update(places)
            .set(mergedData)
            .where(eq(places.id, cluster.targetId));

          for (const sourceId of cluster.sourceIds) {
            // Get existing associations for target to avoid duplicates
            const targetSourceAssocs = await tx.select({ sourceId: sourcesToPlaces.sourceId })
              .from(sourcesToPlaces)
              .where(eq(sourcesToPlaces.placeId, cluster.targetId));
            const targetSourceIds = new Set(targetSourceAssocs.map((a: { sourceId: string }) => a.sourceId));

            const targetCollectionAssocs = await tx.select({ collectionId: placesToCollections.collectionId })
              .from(placesToCollections)
              .where(eq(placesToCollections.placeId, cluster.targetId));
            const targetCollectionIds = new Set(targetCollectionAssocs.map((a: { collectionId: string }) => a.collectionId));

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
              } else {
                await tx.delete(sourcesToPlaces)
                  .where(and(
                    eq(sourcesToPlaces.placeId, sourceId),
                    eq(sourcesToPlaces.sourceId, assoc.sourceId)
                  ));
              }
            }

            for (const assoc of sourceCollectionAssocs) {
              if (!targetCollectionIds.has(assoc.collectionId)) {
                await tx.update(placesToCollections)
                  .set({ placeId: cluster.targetId })
                  .where(and(
                    eq(placesToCollections.placeId, sourceId),
                    eq(placesToCollections.collectionId, assoc.collectionId)
                  ));
              } else {
                await tx.delete(placesToCollections)
                  .where(and(
                    eq(placesToCollections.placeId, sourceId),
                    eq(placesToCollections.collectionId, assoc.collectionId)
                  ));
              }
            }
          }

          await tx.update(places)
            .set({ status: 'archived' })
            .where(inArray(places.id, cluster.sourceIds));

          const [mergeLog] = await tx.insert(mergeLogs).values({
            targetId: cluster.targetId,
            sourceIds: cluster.sourceIds,
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
      } catch (error) {
        results.push({
          clusterId: cluster.targetId,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount, results };
  }, 'bulkMergePlaces');
}

export async function undoMerge(mergeLogId: string, userId: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      const [log] = await tx.select().from(mergeLogs)
        .where(eq(mergeLogs.id, mergeLogId)).limit(1);

      if (!log || log.undone) {
        throw new Error('Merge log not found or already undone');
      }

      // Verify ownership - check that the target place belongs to user
      const [targetPlace] = await tx.select().from(places)
        .where(and(eq(places.id, log.targetId), eq(places.userId, userId)))
        .limit(1);

      if (!targetPlace) {
        throw new Error('Unauthorized to undo this merge');
      }

      for (const snapshot of (log.sourceSnapshots as any[]) || []) {
        await tx.insert(places).values({
          ...snapshot,
          status: 'library',
        });
      }

      await tx.update(mergeLogs)
        .set({ undone: true, undonAt: new Date().toISOString() })
        .where(eq(mergeLogs.id, mergeLogId));
    });
  }, 'undoMerge');
}

export async function batchArchivePlaces(placeIds: string[], userId: string): Promise<number> {
  if (placeIds.length === 0) return 0;
  return bulkUpdatePlaceStatus(placeIds, 'archived', userId);
}

// Enhanced bulk operations for inbox workflow
export async function bulkConfirmPlaces(placeIds: string[], userId: string): Promise<number> {
  return bulkUpdatePlaceStatus(placeIds, 'library', userId);
}

export async function bulkMovePlacesToReview(placeIds: string[], userId: string): Promise<number> {
  return bulkUpdatePlaceStatus(placeIds, 'review', userId);
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
      throw new Error(`Place ${data.placeId} not found or unauthorized`);
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
      throw new Error(`Attachment ${id} not found`);
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

    // Clean up blob storage (best-effort)
    if (attachment.uri?.startsWith('https://')) {
      try {
        await del(attachment.uri);
      } catch (e) {
        console.warn(`[deleteAttachment] Failed to delete blob ${attachment.uri}:`, e);
      }
    }
    if (attachment.thumbnailUri?.startsWith('https://')) {
      try {
        await del(attachment.thumbnailUri);
      } catch (e) {
        console.warn(`[deleteAttachment] Failed to delete thumbnail blob:`, e);
      }
    }

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
      throw new Error(`Place ${data.placeId} not found or unauthorized`);
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
      throw new Error(`Link ${id} not found`);
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
      throw new Error(`Place ${data.placeId} not found or unauthorized`);
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
  },
  userId: string
) {
  return withErrorHandling(async () => {
    const { reservations } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get reservation and verify place ownership
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.id, id))
      .limit(1);

    if (!reservation) {
      throw new Error(`Reservation ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, reservation.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new Error('Unauthorized to update this reservation');
    }

    const [updated] = await db
      .update(reservations)
      .set(data)
      .where(eq(reservations.id, id))
      .returning();

    return updated;
  }, 'updateReservation');
}

export async function deleteReservation(id: string, userId: string) {
  return withErrorHandling(async () => {
    const { reservations } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    // Get reservation and verify place ownership
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.id, id))
      .limit(1);

    if (!reservation) {
      throw new Error(`Reservation ${id} not found`);
    }

    const [place] = await db.select().from(places)
      .where(and(eq(places.id, reservation.placeId), eq(places.userId, userId)))
      .limit(1);

    if (!place) {
      throw new Error('Unauthorized to delete this reservation');
    }

    await db
      .delete(reservations)
      .where(eq(reservations.id, id));

    return { success: true };
  }, 'deleteReservation');
}

export async function batchRestorePlaces(placeIds: string[], userId: string): Promise<number> {
  if (placeIds.length === 0) return 0;
  return bulkUpdatePlaceStatus(placeIds, 'library', userId);
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
  placesData: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>[],
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
        throw new Error(`Collection ${options.collectionId} not found or unauthorized`);
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

// Mass upload pipeline — create places from enriched pipeline results
export async function createPlacesFromPipeline(
  pipelinePlaces: PipelinePlace[],
  sourceId: string,
  userId: string
): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      // Get source to verify ownership and get screenshot URL
      const [source] = await tx.select()
        .from(sourcesCurrentSchema)
        .where(and(eq(sourcesCurrentSchema.id, sourceId), eq(sourcesCurrentSchema.userId, userId)))
        .limit(1);

      if (!source) throw new Error(`Source ${sourceId} not found or unauthorized`);

      const screenshotUri = source.uri;
      const meta = source.meta as { uploadInfo?: { originalName?: string; mimeType?: string; fileSize?: number; thumbnailPath?: string } } | null;
      const createdPlaces: Place[] = [];

      // ── Batched dedup lookup ───────────────────────────────────────────
      // One query per lookup shape for the whole screenshot instead of two
      // per extracted place: a 10-place screenshot went from 20 round trips
      // to 2, which is what made heavy runs blow the function time limit.
      const googleIds = Array.from(
        new Set(pipelinePlaces.map(p => p.googlePlaceId).filter((id): id is string => Boolean(id)))
      );
      const names = Array.from(
        new Set(pipelinePlaces.map(p => p.name?.toLowerCase()).filter((n): n is string => Boolean(n)))
      );

      const byGoogleId = new Map<string, Place>();
      if (googleIds.length > 0) {
        const rows = await tx.select().from(places)
          .where(and(eq(places.userId, userId), inArray(places.googlePlaceId, googleIds)));
        for (const row of rows as Place[]) {
          if (row.googlePlaceId && !byGoogleId.has(row.googlePlaceId)) byGoogleId.set(row.googlePlaceId, row);
        }
      }

      const byNameKey = new Map<string, Place>();
      if (names.length > 0) {
        const rows = await tx.select().from(places)
          .where(and(
            eq(places.userId, userId),
            sql`LOWER(${places.name}) IN (${sql.join(names.map(n => sql`${n}`), sql`, `)})`
          ));
        for (const row of rows as Place[]) {
          const key = placeNameKey(row.name, row.city, row.country);
          if (!byNameKey.has(key)) byNameKey.set(key, row);
        }
      }

      const sourceLinks: Array<{ sourceId: string; placeId: string }> = [];
      const newAttachments: Array<typeof attachments.$inferInsert> = [];

      for (const p of pipelinePlaces) {
        // ── Dedup check (in-memory, including places created in this batch) ─
        const nameKey = p.name ? placeNameKey(p.name, p.city ?? null, p.country ?? null) : null;
        const existingPlace =
          (p.googlePlaceId ? byGoogleId.get(p.googlePlaceId) : undefined) ??
          (nameKey ? byNameKey.get(nameKey) : undefined);

        if (existingPlace) {
          // Duplicate found — link source to existing place, skip insert
          sourceLinks.push({ sourceId, placeId: existingPlace.id });
          createdPlaces.push(existingPlace);
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
          coords: p.coords || null,
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
        createdPlaces.push(place);
        if (place.googlePlaceId) byGoogleId.set(place.googlePlaceId, place);
        if (nameKey) byNameKey.set(nameKey, place);

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

      return createdPlaces;
    });
  }, 'createPlacesFromPipeline');
}

/**
 * Dedup key for "same place, same user" — mirrors the case-insensitive,
 * null-aware comparison the per-place lookup used to do in SQL.
 */
function placeNameKey(name: string, city: string | null, country: string | null): string {
  return [name, city ?? '', country ?? ''].map(v => v.toLowerCase()).join('\u0000');
}

// ─── Mass-upload queue: lease-based claim / release ──────────────────────────
//
// The queue distinguishes two very different things that used to share one
// counter:
//   • an ATTEMPT is a genuine verdict on the image (bad file, invalid response)
//   • an INTERRUPTION is "we ran out of clock" (function killed, lease expired)
// Only attempts can ever end in `failed`. Interruptions requeue, and after too
// many they land in `stalled` — visible and retryable, never a verdict.
//
// Every write is guarded by the lease id the claiming run holds, so a run whose
// lease was reclaimed cannot finish, fail or complete an item someone else owns.

/**
 * Atomically claim the oldest queued source. Returns null when the queue is
 * empty or every candidate was taken by a concurrent run.
 */
export async function claimNextQueuedSource(
  leaseId: string,
  candidateLimit: number = 10
): Promise<Source | null> {
  return withErrorHandling(async () => {
    const candidates = await db.select({ id: sourcesCurrentSchema.id })
      .from(sourcesCurrentSchema)
      .where(eq(sourcesCurrentSchema.processingStatus, 'queued'))
      .orderBy(sourcesCurrentSchema.createdAt)
      .limit(candidateLimit);

    for (const candidate of candidates) {
      const [claimed] = await db.update(sourcesCurrentSchema)
        .set({
          processingStatus: 'extracting',
          processingStartedAt: new Date().toISOString(),
          processingLeaseId: leaseId,
          updatedAt: new Date().toISOString(),
        })
        .where(and(
          eq(sourcesCurrentSchema.id, candidate.id),
          eq(sourcesCurrentSchema.processingStatus, 'queued')
        ))
        .returning();

      if (claimed) return claimed as Source;
    }

    return null;
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
    const [current] = await db.select({ meta: sourcesCurrentSchema.meta })
      .from(sourcesCurrentSchema)
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .limit(1);

    if (!current) return false;

    const meta = (current.meta ?? {}) as Record<string, unknown>;
    const massUpload = (meta.massUpload ?? {}) as Record<string, unknown>;
    const uploadInfo = (meta.uploadInfo ?? {}) as Record<string, unknown>;

    const nextMassUpload = {
      ...massUpload,
      ...(work.extraction !== undefined
        ? { extraction: work.extraction, extractedAt: new Date().toISOString() }
        : {}),
      ...(work.thumbnailUrl ? { thumbnailUrl: work.thumbnailUrl } : {}),
    };

    const updated = await db.update(sourcesCurrentSchema)
      .set({
        meta: {
          ...meta,
          massUpload: nextMassUpload,
          // Keep the attachment-facing field in sync with the cached thumbnail.
          uploadInfo: work.thumbnailUrl
            ? { ...uploadInfo, thumbnailPath: work.thumbnailUrl }
            : uploadInfo,
        } as Source['meta'],
        updatedAt: new Date().toISOString(),
      })
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
 * Record an INTERRUPTION: the run ran out of clock, was killed, or an upstream
 * dependency was unavailable. Never consumes an attempt and never marks the
 * source `failed`; too many in a row park it in `stalled` for a manual retry.
 */
export async function recordSourceInterruption(
  sourceId: string,
  leaseId: string,
  message: string,
  maxInterruptions: number
): Promise<'stalled' | 'queued' | 'lease-lost'> {
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
    const nextStatus = interruptions >= maxInterruptions ? 'stalled' : 'queued';

    const updated = await db.update(sourcesCurrentSchema)
      .set({
        processingStatus: nextStatus,
        processingInterruptions: interruptions,
        processingError: message.slice(0, 1000),
        processingLeaseId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(and(
        eq(sourcesCurrentSchema.id, sourceId),
        eq(sourcesCurrentSchema.processingLeaseId, leaseId)
      ))
      .returning({ id: sourcesCurrentSchema.id });

    return updated.length > 0 ? nextStatus : 'lease-lost';
  }, 'recordSourceInterruption');
}

/**
 * Requeue sources whose lease expired — the run that held them died without
 * getting a chance to write anything back (deploy, OOM, hard kill).
 */
export async function reclaimExpiredSourceLeases(
  expiredBeforeIso: string,
  maxInterruptions: number
): Promise<{ requeued: number; stalled: number; ids: string[] }> {
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
    const ids: string[] = [];

    for (const row of expired) {
      const interruptions = (row.interruptions ?? 0) + 1;
      const nextStatus = interruptions >= maxInterruptions ? 'stalled' : 'queued';

      // Guarded by the same lease id we saw: if the owner is somehow still
      // alive and has re-leased the row, we leave it alone.
      const updated = await db.update(sourcesCurrentSchema)
        .set({
          processingStatus: nextStatus,
          processingInterruptions: interruptions,
          processingError: nextStatus === 'stalled'
            ? `Interrupted ${interruptions} times before finishing — not a problem with the image; retry it`
            : 'Run was interrupted before finishing; requeued',
          processingLeaseId: null,
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
        if (nextStatus === 'stalled') stalled++;
        else requeued++;
      }
    }

    return { requeued, stalled, ids };
  }, 'reclaimExpiredSourceLeases');
}
