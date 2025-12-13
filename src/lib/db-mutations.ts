import { eq, and, inArray, count } from 'drizzle-orm';
import { db } from '@/db';
import { sources, places, collections, sourcesToPlaces, placesToCollections, mergeLogs, attachments } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { withErrorHandling, withTransaction, generateSourceId, generatePlaceId, generateCollectionId } from './db-utils';
import type { NewSource, NewPlace, NewCollection, Source, Place, Collection } from '@/types/database';
import type { ExtractedPlace, ExtractionResult, ExtractionMetadata } from '@/types/llm-extraction';

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
    await withTransaction(async (tx) => {
      // Verify ownership first
      const [source] = await tx.select().from(sources)
        .where(and(eq(sources.id, id), eq(sources.userId, userId)))
        .limit(1);

      if (!source) {
        throw new Error(`Source with id ${id} not found or unauthorized`);
      }

      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.sourceId, id));

      // Delete the source
      await tx.delete(sources).where(eq(sources.id, id));
    });
  }, 'deleteSource');
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
  status: string,
  userId: string
): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const result = await db.update(places)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(and(inArray(places.id, placeIds), eq(places.userId, userId)))
      .returning();

    return result.length;
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

          const meta = source?.meta as { uploadInfo?: { storedPath?: string; originalName?: string; mimeType?: string; size?: number } } | null;
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
                fileSize: meta?.uploadInfo?.size || null,
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
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const result = await db.update(places)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(and(inArray(places.id, placeIds), eq(places.userId, userId)))
      .returning();

    return result.length;
  }, 'batchArchivePlaces');
}

// Enhanced bulk operations for inbox workflow
export async function bulkConfirmPlaces(placeIds: string[], userId: string): Promise<number> {
  return withErrorHandling(async () => {
    return await bulkUpdatePlaceStatus(placeIds, 'library', userId);
  }, 'bulkConfirmPlaces');
}

export async function bulkMovePlacesToReview(placeIds: string[], userId: string): Promise<number> {
  return withErrorHandling(async () => {
    return await bulkUpdatePlaceStatus(placeIds, 'review', userId);
  }, 'bulkMovePlacesToReview');
}

export async function createAttachment(
  data: {
    placeId: string;
    type: string;
    uri: string;
    filename: string;
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
    thumbnailUri?: string;
    caption?: string;
    takenAt?: string;
    isPrimary?: number;
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

    const [attachment] = await db
      .insert(attachments)
      .values(data)
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
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const result = await db.update(places)
      .set({
        status: 'library',
        updatedAt: new Date().toISOString(),
      })
      .where(and(inArray(places.id, placeIds), eq(places.userId, userId)))
      .returning();

    return result.length;
  }, 'batchRestorePlaces');
}

export async function batchDeletePlaces(placeIds: string[], userId: string): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    return await withTransaction(async (tx) => {
      let count = 0;

      for (const placeId of placeIds) {
        // Verify ownership
        const [place] = await tx.select().from(places)
          .where(and(eq(places.id, placeId), eq(places.userId, userId)))
          .limit(1);

        if (!place) continue; // Skip places not owned by user

        await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.placeId, placeId));
        await tx.delete(placesToCollections).where(eq(placesToCollections.placeId, placeId));

        const result = await tx.delete(places).where(eq(places.id, placeId));

        if (result.rowsAffected && result.rowsAffected > 0) {
          count++;
        }
      }

      return count;
    });
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
