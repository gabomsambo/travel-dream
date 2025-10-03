import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { sources, places, collections, sourcesToPlaces, placesToCollections, mergeLogs } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { withErrorHandling, withTransaction, generateSourceId, generatePlaceId, generateCollectionId } from './db-utils';
import type { NewSource, NewPlace, NewCollection, Source, Place, Collection } from '@/types/database';
import type { ExtractedPlace, ExtractionResult, ExtractionMetadata } from '@/types/llm-extraction';

// Place mutations
export async function createPlace(data: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place> {
  return withErrorHandling(async () => {
    const newPlace: NewPlace = {
      id: generatePlaceId(),
      ...data,
    };
    
    const [created] = await db.insert(places).values(newPlace).returning();
    return created;
  }, 'createPlace');
}

export async function updatePlace(id: string, data: Partial<Omit<NewPlace, 'id' | 'createdAt'>>): Promise<Place> {
  return withErrorHandling(async () => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    const [updated] = await db.update(places)
      .set(updateData)
      .where(eq(places.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Place with id ${id} not found`);
    }
    
    return updated;
  }, 'updatePlace');
}

export async function archivePlace(id: string): Promise<Place> {
  return updatePlace(id, { status: 'archived' });
}

export async function deletePlace(id: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.placeId, id));
      await tx.delete(placesToCollections).where(eq(placesToCollections.placeId, id));
      
      // Delete the place
      const result = await tx.delete(places).where(eq(places.id, id));
      
      if (result.changes === 0) {
        throw new Error(`Place with id ${id} not found`);
      }
    });
  }, 'deletePlace');
}

// Source mutations
export async function createSource(data: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<Source> {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const [created] = await db.insert(sourcesCurrentSchema).values(compatibleSource).returning();
    return created as Source;
  }, 'createSource');
}

export async function updateSource(id: string, data: Partial<Omit<NewSource, 'id' | 'createdAt'>>): Promise<Source> {
  return withErrorHandling(async () => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    const [updated] = await db.update(sources)
      .set(updateData)
      .where(eq(sources.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Source with id ${id} not found`);
    }
    
    return updated;
  }, 'updateSource');
}

export async function deleteSource(id: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      // Delete related records first
      await tx.delete(sourcesToPlaces).where(eq(sourcesToPlaces.sourceId, id));
      
      // Delete the source
      const result = await tx.delete(sources).where(eq(sources.id, id));
      
      if (result.changes === 0) {
        throw new Error(`Source with id ${id} not found`);
      }
    });
  }, 'deleteSource');
}

// Collection mutations
export async function createCollection(data: Omit<NewCollection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
  return withErrorHandling(async () => {
    const newCollection: NewCollection = {
      id: generateCollectionId(),
      ...data,
    };
    
    const [created] = await db.insert(collections).values(newCollection).returning();
    return created;
  }, 'createCollection');
}

export async function updateCollection(id: string, data: Partial<Omit<NewCollection, 'id' | 'createdAt'>>): Promise<Collection> {
  return withErrorHandling(async () => {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    const [updated] = await db.update(collections)
      .set(updateData)
      .where(eq(collections.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Collection with id ${id} not found`);
    }
    
    return updated;
  }, 'updateCollection');
}

export async function deleteCollection(id: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      // Delete related records first
      await tx.delete(placesToCollections).where(eq(placesToCollections.collectionId, id));
      
      // Delete the collection
      const result = await tx.delete(collections).where(eq(collections.id, id));
      
      if (result.changes === 0) {
        throw new Error(`Collection with id ${id} not found`);
      }
    });
  }, 'deleteCollection');
}

// Relationship mutations
export async function linkSourceToPlace(sourceId: string, placeId: string): Promise<void> {
  return withErrorHandling(async () => {
    await db.insert(sourcesToPlaces).values({
      sourceId,
      placeId,
    }).onConflictDoNothing();
  }, 'linkSourceToPlace');
}

export async function unlinkSourceFromPlace(sourceId: string, placeId: string): Promise<void> {
  return withErrorHandling(async () => {
    await db.delete(sourcesToPlaces)
      .where(and(
        eq(sourcesToPlaces.sourceId, sourceId),
        eq(sourcesToPlaces.placeId, placeId)
      ));
  }, 'unlinkSourceFromPlace');
}

export async function addPlaceToCollection(placeId: string, collectionId: string, orderIndex?: number): Promise<void> {
  return withErrorHandling(async () => {
    // If no order index provided, append to end
    if (orderIndex === undefined) {
      const maxOrder = await db.select({ max: db.$count() })
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

export async function removePlaceFromCollection(placeId: string, collectionId: string): Promise<void> {
  return withErrorHandling(async () => {
    await db.delete(placesToCollections)
      .where(and(
        eq(placesToCollections.placeId, placeId),
        eq(placesToCollections.collectionId, collectionId)
      ));
  }, 'removePlaceFromCollection');
}

export async function reorderPlacesInCollection(collectionId: string, placeIds: string[]): Promise<void> {
  return withErrorHandling(async () => {
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

// Batch operations
export async function createPlacesFromSources(sourcesData: Array<{
  source: Omit<NewSource, 'id' | 'createdAt' | 'updatedAt'>;
  place: Omit<NewPlace, 'id' | 'createdAt' | 'updatedAt'>;
}>): Promise<Array<{ source: Source; place: Place }>> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      const results = [];
      
      for (const { source: sourceData, place: placeData } of sourcesData) {
        // Create source
        const newSource: NewSource = {
          id: generateSourceId(),
          ...sourceData,
        };
        const [source] = await tx.insert(sources).values(newSource).returning();
        
        // Create place
        const newPlace: NewPlace = {
          id: generatePlaceId(),
          ...placeData,
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
export async function bulkUpdatePlaceStatus(placeIds: string[], status: string): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const result = await db.update(places)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(inArray(places.id, placeIds));

    return result.changes || 0;
  }, 'bulkUpdatePlaceStatus');
}

// LLM-specific mutations
export async function createPlaceFromExtraction(
  extractedPlace: ExtractedPlace,
  sourceId?: string
): Promise<Place> {
  return withErrorHandling(async () => {
    const newPlace: NewPlace = {
      id: generatePlaceId(),
      name: extractedPlace.name,
      kind: extractedPlace.kind,
      description: extractedPlace.description || null,
      status: 'inbox',

      // Location information
      city: extractedPlace.location.city || null,
      state: extractedPlace.location.state || null,
      country: extractedPlace.location.country || null,
      address: extractedPlace.location.address || null,

      // LLM-specific metadata
      confidence: extractedPlace.confidence,
      price_level: extractedPlace.metadata.price_level || null,
      best_time: extractedPlace.metadata.best_time || null,
      activities: extractedPlace.metadata.activities ? JSON.stringify(extractedPlace.metadata.activities) : null,
      cuisine: extractedPlace.metadata.cuisine ? JSON.stringify(extractedPlace.metadata.cuisine) : null,
      amenities: extractedPlace.metadata.amenities ? JSON.stringify(extractedPlace.metadata.amenities) : null,
      tags: extractedPlace.metadata.tags ? JSON.stringify(extractedPlace.metadata.tags) : null,
      vibes: extractedPlace.metadata.vibes ? JSON.stringify(extractedPlace.metadata.vibes) : null,
    };

    const [created] = await db.insert(places).values(newPlace).returning();

    // Link to source if provided
    if (sourceId) {
      await linkSourceToPlace(sourceId, created.id);
    }

    return created;
  }, 'createPlaceFromExtraction');
}

export async function updateSourceWithLLMMetadata(
  sourceId: string,
  metadata: ExtractionMetadata,
  placesCount: number
): Promise<Source> {
  return withErrorHandling(async () => {
    const updateData = {
      // Store LLM processing metadata
      llmProcessed: 1,
      llmModel: metadata.model,
      llmProcessedAt: metadata.completed_at,
      llmConfidence: metadata.confidence_avg,
      llmExtractionDetails: {
        processingTimeMs: metadata.processing_time_ms,
        costUsd: metadata.cost_usd,
        overall: metadata.confidence_avg,
        errors: metadata.errors || []
      },
      updatedAt: new Date().toISOString(),
    };

    const [updated] = await db.update(sources)
      .set(updateData)
      .where(eq(sources.id, sourceId))
      .returning();

    if (!updated) {
      throw new Error(`Source with id ${sourceId} not found`);
    }

    return updated;
  }, 'updateSourceWithLLMMetadata');
}

export async function batchCreatePlacesFromExtractions(
  extractionResults: ExtractionResult[]
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

          // Create places from extraction results
          for (const extractedPlace of result.places) {
            const newPlace: NewPlace = {
              id: generatePlaceId(),
              name: extractedPlace.name,
              kind: extractedPlace.kind,
              description: extractedPlace.description || null,
              status: 'inbox',

              // Location information
              city: extractedPlace.location.city || null,
              state: extractedPlace.location.state || null,
              country: extractedPlace.location.country || null,
              address: extractedPlace.location.address || null,

              // LLM-specific metadata
              confidence: extractedPlace.confidence,
              price_level: extractedPlace.metadata.price_level || null,
              best_time: extractedPlace.metadata.best_time || null,
              activities: extractedPlace.metadata.activities ? JSON.stringify(extractedPlace.metadata.activities) : null,
              cuisine: extractedPlace.metadata.cuisine ? JSON.stringify(extractedPlace.metadata.cuisine) : null,
              amenities: extractedPlace.metadata.amenities ? JSON.stringify(extractedPlace.metadata.amenities) : null,
              tags: extractedPlace.metadata.tags ? JSON.stringify(extractedPlace.metadata.tags) : null,
              vibes: extractedPlace.metadata.vibes ? JSON.stringify(extractedPlace.metadata.vibes) : null,
            };

            const [place] = await tx.insert(places).values(newPlace).returning();
            createdPlaces.push(place);

            // Link to source
            await tx.insert(sourcesToPlaces).values({
              sourceId: result.sourceId,
              placeId: place.id,
            });
          }

          // Update source with LLM metadata
          const updateData = {
            llmProcessed: 1,
            llmModel: result.metadata.model,
            llmProcessedAt: result.metadata.completed_at,
            llmConfidence: result.metadata.confidence_avg,
            llmExtractionDetails: {
              processingTimeMs: result.metadata.processing_time_ms,
              costUsd: result.metadata.cost_usd,
              overall: result.metadata.confidence_avg,
              errors: result.metadata.errors || []
            },
            updatedAt: new Date().toISOString(),
          };

          await tx.update(sources)
            .set(updateData)
            .where(eq(sources.id, result.sourceId));

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
export async function mergePlaces(sourceId: string, targetId: string): Promise<Place> {
  return withErrorHandling(async () => {
    return await withTransaction(async (tx) => {
      // Get source and target places
      const [sourcePlace, targetPlace] = await Promise.all([
        tx.select().from(places).where(eq(places.id, sourceId)).limit(1),
        tx.select().from(places).where(eq(places.id, targetId)).limit(1)
      ]);

      if (!sourcePlace[0] || !targetPlace[0]) {
        throw new Error('Source or target place not found');
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
  clusters: Array<{ targetId: string; sourceIds: string[]; confidence: number }>
): Promise<{ success: number; failed: number; results: any[] }> {
  return withErrorHandling(async () => {
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const cluster of clusters) {
      try {
        await withTransaction(async (tx) => {
          const [targetPlace] = await tx.select().from(places)
            .where(eq(places.id, cluster.targetId)).limit(1);
          const sourcePlaces = await tx.select().from(places)
            .where(inArray(places.id, cluster.sourceIds));

          if (!targetPlace) throw new Error('Target place not found');

          const sourceSnapshots = sourcePlaces.map(p => ({ ...p }));

          const mergedData = {
            altNames: [...new Set([
              targetPlace.name,
              ...(targetPlace.altNames || []),
              ...sourcePlaces.flatMap(p => [p.name, ...(p.altNames || [])])
            ])],
            tags: [...new Set([
              ...(targetPlace.tags || []),
              ...sourcePlaces.flatMap(p => p.tags || [])
            ])],
            vibes: [...new Set([
              ...(targetPlace.vibes || []),
              ...sourcePlaces.flatMap(p => p.vibes || [])
            ])],
            notes: [
              targetPlace.notes,
              ...sourcePlaces.map(p => p.notes)
            ].filter(Boolean).join('\n\n---\n\n'),
            updatedAt: new Date().toISOString()
          };

          await tx.update(places)
            .set(mergedData)
            .where(eq(places.id, cluster.targetId));

          for (const sourceId of cluster.sourceIds) {
            await tx.update(sourcesToPlaces)
              .set({ placeId: cluster.targetId })
              .where(eq(sourcesToPlaces.placeId, sourceId));

            await tx.update(placesToCollections)
              .set({ placeId: cluster.targetId })
              .where(eq(placesToCollections.placeId, sourceId));
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

export async function undoMerge(mergeLogId: string): Promise<void> {
  return withErrorHandling(async () => {
    await withTransaction(async (tx) => {
      const [log] = await tx.select().from(mergeLogs)
        .where(eq(mergeLogs.id, mergeLogId)).limit(1);

      if (!log || log.undone) {
        throw new Error('Merge log not found or already undone');
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

export async function batchArchivePlaces(placeIds: string[]): Promise<number> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return 0;

    const result = await db.update(places)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(inArray(places.id, placeIds));

    return result.changes || 0;
  }, 'batchArchivePlaces');
}

// Enhanced bulk operations for inbox workflow
export async function bulkConfirmPlaces(placeIds: string[]): Promise<number> {
  return withErrorHandling(async () => {
    return await bulkUpdatePlaceStatus(placeIds, 'library');
  }, 'bulkConfirmPlaces');
}

export async function bulkMovePlacesToReview(placeIds: string[]): Promise<number> {
  return withErrorHandling(async () => {
    return await bulkUpdatePlaceStatus(placeIds, 'review');
  }, 'bulkMovePlacesToReview');
}
