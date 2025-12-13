import { eq, and, or, like, inArray, desc, asc, sql, gte, lte, between, isNull, SQL } from 'drizzle-orm';
import { db } from '@/db';
import { sources, places, collections, sourcesToPlaces, placesToCollections } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { withErrorHandling } from './db-utils';
import type { Place, Source, Collection, PlaceWithSources } from '@/types/database';

// Place queries
export async function getPlaceById(id: string, userId: string): Promise<Place | null> {
  return withErrorHandling(async () => {
    const result = await db.select().from(places)
      .where(and(eq(places.id, id), eq(places.userId, userId)))
      .limit(1);
    return result[0] || null;
  }, 'getPlaceById');
}

export async function getPlacesByCity(city: string, userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(places)
      .where(and(eq(places.city, city), eq(places.userId, userId)))
      .orderBy(asc(places.name));
  }, 'getPlacesByCity');
}

export async function getPlacesByCountry(country: string, userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(places)
      .where(and(eq(places.country, country), eq(places.userId, userId)))
      .orderBy(asc(places.city), asc(places.name));
  }, 'getPlacesByCountry');
}

export async function getPlacesByKind(kind: string, userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(places)
      .where(and(eq(places.kind, kind), eq(places.userId, userId)))
      .orderBy(desc(places.ratingSelf), asc(places.name));
  }, 'getPlacesByKind');
}

export async function getPlacesByStatus(status: string, userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(places)
      .where(and(eq(places.status, status), eq(places.userId, userId)))
      .orderBy(desc(places.createdAt));
  }, 'getPlacesByStatus');
}

// Tag-based queries (JSON field search)
export async function getPlacesByTags(tags: string[], userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    // For SQLite JSON queries, we need to use LIKE with JSON patterns
    const conditions = tags.map(tag =>
      like(places.tags, `%"${tag}"%`)
    );

    return await db.select()
      .from(places)
      .where(and(eq(places.userId, userId), or(...conditions)))
      .orderBy(desc(places.ratingSelf), asc(places.name));
  }, 'getPlacesByTags');
}

export async function getPlacesByVibes(vibes: string[], userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    const conditions = vibes.map(vibe =>
      like(places.vibes, `%"${vibe}"%`)
    );

    return await db.select()
      .from(places)
      .where(and(eq(places.userId, userId), or(...conditions)))
      .orderBy(desc(places.ratingSelf), asc(places.name));
  }, 'getPlacesByVibes');
}

// Complex search function
export async function searchPlaces(query: {
  userId: string;
  text?: string;
  city?: string;
  country?: string;
  kind?: string;
  tags?: string[];
  vibes?: string[];
  status?: string;
  minRating?: number;
  hasCoords?: boolean;
  limit?: number;
}): Promise<Place[]> {
  return withErrorHandling(async () => {
    let conditions: (SQL | undefined)[] = [eq(places.userId, query.userId)];

    // Text search in name and notes
    if (query.text) {
      const textCondition = or(
        like(places.name, `%${query.text}%`),
        like(places.notes, `%${query.text}%`)
      );
      conditions.push(textCondition);
    }

    // Location filters
    if (query.city) {
      conditions.push(eq(places.city, query.city));
    }

    if (query.country) {
      conditions.push(eq(places.country, query.country));
    }

    if (query.kind) {
      conditions.push(eq(places.kind, query.kind));
    }

    if (query.status) {
      conditions.push(eq(places.status, query.status));
    }

    // Rating filter
    if (query.minRating !== undefined) {
      conditions.push(sql`${places.ratingSelf} >= ${query.minRating}`);
    }

    // Coordinates filter
    if (query.hasCoords) {
      conditions.push(sql`${places.coords} IS NOT NULL`);
    }

    // Tag filters
    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(tag =>
        like(places.tags, `%"${tag}"%`)
      );
      conditions.push(or(...tagConditions));
    }

    // Vibe filters
    if (query.vibes && query.vibes.length > 0) {
      const vibeConditions = query.vibes.map(vibe =>
        like(places.vibes, `%"${vibe}"%`)
      );
      conditions.push(or(...vibeConditions));
    }

    let dbQuery = db.select().from(places);

    if (conditions.length > 0) {
      dbQuery = dbQuery.where(and(...conditions)) as typeof dbQuery;
    }

    dbQuery = dbQuery.orderBy(desc(places.ratingSelf), asc(places.name)) as typeof dbQuery;

    if (query.limit) {
      dbQuery = dbQuery.limit(query.limit) as typeof dbQuery;
    }

    return await dbQuery;
  }, 'searchPlaces');
}

// Source queries
export async function getSourceById(id: string, userId: string): Promise<Source | null> {
  return withErrorHandling(async () => {
    const result = await db.select().from(sourcesCurrentSchema)
      .where(and(eq(sourcesCurrentSchema.id, id), eq(sourcesCurrentSchema.userId, userId)))
      .limit(1);
    return result[0] || null;
  }, 'getSourceById');
}

export async function getSourcesByType(type: string, userId: string): Promise<Source[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(sourcesCurrentSchema)
      .where(and(eq(sourcesCurrentSchema.type, type), eq(sourcesCurrentSchema.userId, userId)))
      .orderBy(desc(sourcesCurrentSchema.createdAt));
  }, 'getSourcesByType');
}

export async function getSourcesForPlace(placeId: string, userId: string): Promise<Source[]> {
  return withErrorHandling(async () => {
    return await db.select({
      id: sourcesCurrentSchema.id,
      type: sourcesCurrentSchema.type,
      uri: sourcesCurrentSchema.uri,
      hash: sourcesCurrentSchema.hash,
      ocrText: sourcesCurrentSchema.ocrText,
      lang: sourcesCurrentSchema.lang,
      meta: sourcesCurrentSchema.meta,
      createdAt: sourcesCurrentSchema.createdAt,
      updatedAt: sourcesCurrentSchema.updatedAt,
      userId: sourcesCurrentSchema.userId,
    })
      .from(sourcesCurrentSchema)
      .innerJoin(sourcesToPlaces, eq(sourcesCurrentSchema.id, sourcesToPlaces.sourceId))
      .where(and(eq(sourcesToPlaces.placeId, placeId), eq(sourcesCurrentSchema.userId, userId)))
      .orderBy(desc(sourcesCurrentSchema.createdAt));
  }, 'getSourcesForPlace');
}

// Collection queries
export async function getCollectionById(id: string, userId: string): Promise<Collection | null> {
  return withErrorHandling(async () => {
    const result = await db.select().from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .limit(1);
    return result[0] || null;
  }, 'getCollectionById');
}

export async function getAllCollections(userId: string): Promise<Collection[]> {
  return withErrorHandling(async () => {
    return await db.select()
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.updatedAt));
  }, 'getAllCollections');
}

export async function getPlacesInCollection(collectionId: string, userId: string): Promise<Place[]> {
  return withErrorHandling(async () => {
    return await db.select({
      id: places.id,
      name: places.name,
      kind: places.kind,
      description: places.description,
      city: places.city,
      country: places.country,
      admin: places.admin,
      coords: places.coords,
      address: places.address,
      googlePlaceId: places.googlePlaceId,
      altNames: places.altNames,
      tags: places.tags,
      vibes: places.vibes,
      price_level: places.price_level,
      best_time: places.best_time,
      activities: places.activities,
      cuisine: places.cuisine,
      amenities: places.amenities,
      ratingSelf: places.ratingSelf,
      notes: places.notes,
      status: places.status,
      confidence: places.confidence,
      createdAt: places.createdAt,
      updatedAt: places.updatedAt,
      userId: places.userId,
      website: places.website,
      phone: places.phone,
      email: places.email,
      hours: places.hours,
      visitStatus: places.visitStatus,
      priority: places.priority,
      lastVisited: places.lastVisited,
      plannedVisit: places.plannedVisit,
      recommendedBy: places.recommendedBy,
      companions: places.companions,
      practicalInfo: places.practicalInfo,
      orderIndex: placesToCollections.orderIndex,
      isPinned: placesToCollections.isPinned,
      note: placesToCollections.note,
    })
      .from(places)
      .innerJoin(placesToCollections, eq(places.id, placesToCollections.placeId))
      .innerJoin(collections, eq(placesToCollections.collectionId, collections.id))
      .where(and(eq(placesToCollections.collectionId, collectionId), eq(collections.userId, userId)))
      .orderBy(asc(placesToCollections.orderIndex), asc(places.name));
  }, 'getPlacesInCollection');
}

export async function getCollectionWithPlaces(
  collectionId: string,
  userId: string
): Promise<(Collection & { places: Place[] }) | null> {
  return withErrorHandling(async () => {
    const collection = await getCollectionById(collectionId, userId);
    if (!collection) return null;

    const collectionPlaces = await getPlacesInCollection(collectionId, userId);

    return {
      ...collection,
      places: collectionPlaces,
    };
  }, 'getCollectionWithPlaces');
}

export async function getDayPlaces(
  collectionId: string,
  placeIds: string[],
  userId: string,
  lockedPlaceIds?: string[]
): Promise<Place[]> {
  return withErrorHandling(async () => {
    if (placeIds.length === 0) return [];

    const allPlaces = await db.select({
      id: places.id,
      name: places.name,
      kind: places.kind,
      description: places.description,
      city: places.city,
      country: places.country,
      admin: places.admin,
      coords: places.coords,
      address: places.address,
      googlePlaceId: places.googlePlaceId,
      altNames: places.altNames,
      tags: places.tags,
      vibes: places.vibes,
      price_level: places.price_level,
      best_time: places.best_time,
      activities: places.activities,
      cuisine: places.cuisine,
      amenities: places.amenities,
      ratingSelf: places.ratingSelf,
      notes: places.notes,
      status: places.status,
      confidence: places.confidence,
      createdAt: places.createdAt,
      updatedAt: places.updatedAt,
      userId: places.userId,
      website: places.website,
      phone: places.phone,
      email: places.email,
      hours: places.hours,
      visitStatus: places.visitStatus,
      priority: places.priority,
      lastVisited: places.lastVisited,
      plannedVisit: places.plannedVisit,
      recommendedBy: places.recommendedBy,
      companions: places.companions,
      practicalInfo: places.practicalInfo,
      orderIndex: placesToCollections.orderIndex,
      isPinned: placesToCollections.isPinned,
      note: placesToCollections.note,
    })
      .from(places)
      .innerJoin(placesToCollections, eq(places.id, placesToCollections.placeId))
      .innerJoin(collections, eq(placesToCollections.collectionId, collections.id))
      .where(and(
        eq(placesToCollections.collectionId, collectionId),
        inArray(places.id, placeIds),
        eq(collections.userId, userId)
      ));

    const placeMap = new Map(allPlaces.map(p => [p.id, p]));
    const orderedPlaces = placeIds
      .map(id => placeMap.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined) as Place[];

    if (lockedPlaceIds && lockedPlaceIds.length > 0) {
      return orderedPlaces.map(p => ({
        ...p,
        isLocked: lockedPlaceIds.includes(p.id)
      }));
    }

    return orderedPlaces;
  }, 'getDayPlaces');
}

export async function getUnscheduledPlaces(
  collectionId: string,
  unscheduledPlaceIds: string[],
  userId: string
): Promise<Place[]> {
  return withErrorHandling(async () => {
    if (unscheduledPlaceIds.length === 0) return [];

    return getDayPlaces(collectionId, unscheduledPlaceIds, userId);
  }, 'getUnscheduledPlaces');
}

// Statistics queries
export async function getPlaceStats(userId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byCountry: Record<string, number>;
}> {
  return withErrorHandling(async () => {
    const [totalResult, statusResults, kindResults, countryResults] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(places).where(eq(places.userId, userId)),
      db.select({
        status: places.status,
        count: sql<number>`count(*)`
      }).from(places).where(eq(places.userId, userId)).groupBy(places.status),
      db.select({
        kind: places.kind,
        count: sql<number>`count(*)`
      }).from(places).where(eq(places.userId, userId)).groupBy(places.kind),
      db.select({
        country: places.country,
        count: sql<number>`count(*)`
      }).from(places).where(and(eq(places.userId, userId), sql`${places.country} IS NOT NULL`)).groupBy(places.country),
    ]);

    return {
      total: totalResult[0]?.count || 0,
      byStatus: Object.fromEntries(statusResults.map(r => [r.status, r.count])),
      byKind: Object.fromEntries(kindResults.map(r => [r.kind, r.count])),
      byCountry: Object.fromEntries(countryResults.map(r => [r.country || 'unknown', r.count])),
    };
  }, 'getPlaceStats');
}

// LLM-specific queries - Updated to work with current schema
export async function getSourcesForLLMProcessing(userId: string, options: {
  limit?: number;
  requireOcrText?: boolean;
  prioritizeManual?: boolean;
} = {}): Promise<Source[]> {
  return withErrorHandling(async () => {
    const {
      limit = 100,
      requireOcrText = true,
      prioritizeManual = true
    } = options;

    const conditions: SQL[] = [eq(sourcesCurrentSchema.userId, userId)];

    // Only sources with OCR text available
    if (requireOcrText) {
      conditions.push(sql`${sourcesCurrentSchema.ocrText} IS NOT NULL`);
      conditions.push(sql`length(trim(${sourcesCurrentSchema.ocrText})) > 10`); // Minimum meaningful text
    }

    let dbQuery = db.select().from(sourcesCurrentSchema);

    if (conditions.length > 0) {
      dbQuery = dbQuery.where(and(...conditions)!) as any;
    }

    // Priority ordering: manual uploads first, then by creation date
    if (prioritizeManual) {
      dbQuery = dbQuery.orderBy(
        sql`CASE WHEN ${sourcesCurrentSchema.type} = 'screenshot' THEN 0 ELSE 1 END`,
        desc(sourcesCurrentSchema.createdAt)
      ) as any;
    } else {
      dbQuery = dbQuery.orderBy(desc(sourcesCurrentSchema.createdAt)) as any;
    }

    if (limit > 0) {
      dbQuery = dbQuery.limit(limit) as any;
    }

    return await dbQuery;
  }, 'getSourcesForLLMProcessing');
}

export async function getPlacesByConfidenceRange(userId: string, options: {
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
  status?: string;
} = {}): Promise<Place[]> {
  return withErrorHandling(async () => {
    const {
      minConfidence = 0.0,
      maxConfidence = 1.0,
      limit = 100,
      status
    } = options;

    const conditions: SQL[] = [eq(places.userId, userId)];

    // Confidence range filter
    conditions.push(between(places.confidence, minConfidence, maxConfidence));

    // Status filter
    if (status) {
      conditions.push(eq(places.status, status));
    }

    // Only LLM-generated places (have confidence scores)
    conditions.push(sql`${places.confidence} IS NOT NULL`);

    let dbQuery = db.select().from(places)
      .where(and(...conditions)!) as any;

    dbQuery = dbQuery.orderBy(asc(places.confidence), desc(places.createdAt)) as any; // Low confidence first for review

    if (limit > 0) {
      dbQuery = dbQuery.limit(limit) as any;
    }

    return await dbQuery;
  }, 'getPlacesByConfidenceRange');
}

// Temporary replacement function
export async function getLLMProcessingStats(userId: string) {
  return {
    sources: { total: 0, processed: 0, pending: 0, failed: 0 },
    places: { total_llm_generated: 0, by_confidence: { high: 0, medium: 0, low: 0 }, avg_confidence: 0 },
    processing: { total_cost_usd: 0, avg_processing_time_ms: 0, most_used_model: 'unknown', last_24h_processed: 0 }
  };
}

// Utility query for LLM workflow integration
export async function getSourcesWithPlaces(sourceIds: string[], userId: string): Promise<Array<Source & { places: Place[] }>> {
  return withErrorHandling(async () => {
    if (sourceIds.length === 0) return [];

    const sourcesData = await db.select()
      .from(sources)
      .where(and(inArray(sources.id, sourceIds), eq(sources.userId, userId)));

    const results = [];
    for (const source of sourcesData) {
      const placesData = await db.select({
        id: places.id,
        name: places.name,
        kind: places.kind,
        description: places.description,
        city: places.city,
        country: places.country,
        admin: places.admin,
        coords: places.coords,
        address: places.address,
        googlePlaceId: places.googlePlaceId,
        altNames: places.altNames,
        tags: places.tags,
        vibes: places.vibes,
        price_level: places.price_level,
        best_time: places.best_time,
        activities: places.activities,
        cuisine: places.cuisine,
        amenities: places.amenities,
        ratingSelf: places.ratingSelf,
        notes: places.notes,
        status: places.status,
        confidence: places.confidence,
        createdAt: places.createdAt,
        updatedAt: places.updatedAt,
        website: places.website,
        phone: places.phone,
        email: places.email,
        hours: places.hours,
        visitStatus: places.visitStatus,
        priority: places.priority,
        lastVisited: places.lastVisited,
        plannedVisit: places.plannedVisit,
        recommendedBy: places.recommendedBy,
        companions: places.companions,
        practicalInfo: places.practicalInfo,
        userId: places.userId,
      })
        .from(places)
        .innerJoin(sourcesToPlaces, eq(places.id, sourcesToPlaces.placeId))
        .where(and(eq(sourcesToPlaces.sourceId, source.id), eq(places.userId, userId)));

      results.push({
        ...source,
        places: placesData
      });
    }

    return results;
  }, 'getSourcesWithPlaces');
}

// Inbox-specific queries for inbox & review system
export async function getInboxStats(userId: string): Promise<{
  total: number;
  byConfidence: {
    high: number;    // 90%+
    medium: number;  // 80-89%
    low: number;     // 60-79%
    veryLow: number; // <60%
  };
  needsReview: number; // Potential duplicates or conflicts
  avgConfidence: number;
}> {
  return withErrorHandling(async () => {
    const [
      totalResult,
      highConfResult,
      mediumConfResult,
      lowConfResult,
      veryLowConfResult,
      avgConfResult
    ] = await Promise.all([
      // Total inbox items
      db.select({ count: sql<number>`count(*)` })
        .from(places)
        .where(and(eq(places.status, 'inbox'), eq(places.userId, userId))),

      // High confidence (90%+)
      db.select({ count: sql<number>`count(*)` })
        .from(places)
        .where(and(
          eq(places.status, 'inbox'),
          eq(places.userId, userId),
          sql`${places.confidence} >= 0.9`
        )),

      // Medium confidence (80-89%)
      db.select({ count: sql<number>`count(*)` })
        .from(places)
        .where(and(
          eq(places.status, 'inbox'),
          eq(places.userId, userId),
          sql`${places.confidence} >= 0.8 AND ${places.confidence} < 0.9`
        )),

      // Low confidence (60-79%)
      db.select({ count: sql<number>`count(*)` })
        .from(places)
        .where(and(
          eq(places.status, 'inbox'),
          eq(places.userId, userId),
          sql`${places.confidence} >= 0.6 AND ${places.confidence} < 0.8`
        )),

      // Very low confidence (<60%)
      db.select({ count: sql<number>`count(*)` })
        .from(places)
        .where(and(
          eq(places.status, 'inbox'),
          eq(places.userId, userId),
          sql`${places.confidence} < 0.6`
        )),

      // Average confidence
      db.select({ avg: sql<number>`avg(${places.confidence})` })
        .from(places)
        .where(and(
          eq(places.status, 'inbox'),
          eq(places.userId, userId),
          sql`${places.confidence} IS NOT NULL`
        ))
    ]);

    const total = totalResult[0]?.count || 0;
    const high = highConfResult[0]?.count || 0;
    const medium = mediumConfResult[0]?.count || 0;
    const low = lowConfResult[0]?.count || 0;
    const veryLow = veryLowConfResult[0]?.count || 0;

    // Estimate items needing review (very low confidence + potential duplicates)
    const needsReview = veryLow + Math.floor(total * 0.05); // Estimate 5% might be duplicates

    return {
      total,
      byConfidence: {
        high,
        medium,
        low,
        veryLow
      },
      needsReview,
      avgConfidence: avgConfResult[0]?.avg || 0
    };
  }, 'getInboxStats');
}

export async function findSimilarPlaces(placeId: string, userId: string, options: {
  similarityThreshold?: number;
  maxResults?: number;
  includeArchived?: boolean;
} = {}): Promise<Array<{
  place: Place;
  similarity: number;
  reasons: string[];
}>> {
  return withErrorHandling(async () => {
    const {
      similarityThreshold = 0.7,
      maxResults = 10,
      includeArchived = false
    } = options;

    // Get the target place first
    const targetPlace = await db.select()
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, userId)))
      .limit(1);

    if (!targetPlace[0]) {
      return [];
    }

    const target = targetPlace[0];

    // Find potential duplicates based on name and location similarity
    let statusConditions = [eq(places.status, 'inbox'), eq(places.status, 'library')];
    if (includeArchived) {
      statusConditions.push(eq(places.status, 'archived'));
    }

    const candidates = await db.select()
      .from(places)
      .where(and(
        eq(places.userId, userId),
        sql`${places.id} != ${placeId}`, // Exclude the target place itself
        or(...statusConditions)
      ));

    // Calculate similarity scores (simplified fuzzy matching)
    const results = candidates
      .map(candidate => {
        const reasons: string[] = [];
        let similarity = 0;

        // Name similarity (simple approach - exact match gets high score)
        if (target.name.toLowerCase() === candidate.name.toLowerCase()) {
          similarity += 0.6;
          reasons.push('Exact name match');
        } else if (target.name.toLowerCase().includes(candidate.name.toLowerCase()) ||
                   candidate.name.toLowerCase().includes(target.name.toLowerCase())) {
          similarity += 0.4;
          reasons.push('Partial name match');
        }

        // Location similarity
        if (target.city && candidate.city &&
            target.city.toLowerCase() === candidate.city.toLowerCase()) {
          similarity += 0.3;
          reasons.push('Same city');
        }

        if (target.country && candidate.country &&
            target.country.toLowerCase() === candidate.country.toLowerCase()) {
          similarity += 0.1;
          reasons.push('Same country');
        }

        // Kind similarity
        if (target.kind === candidate.kind) {
          similarity += 0.1;
          reasons.push('Same category');
        }

        // Address similarity (if available)
        if (target.address && candidate.address &&
            (target.address.toLowerCase().includes(candidate.address.toLowerCase()) ||
            candidate.address.toLowerCase().includes(target.address.toLowerCase()))) {
          similarity += 0.2;
          reasons.push('Similar address');
        }

        return {
          place: candidate,
          similarity: Math.min(similarity, 1.0), // Cap at 1.0
          reasons
        };
      })
      .filter(result => result.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);

    return results;
  }, 'findSimilarPlaces');
}

export async function getAttachmentsForPlace(placeId: string, userId: string) {
  return withErrorHandling(async () => {
    const { attachments } = await import('@/db/schema');
    const { eq, and, desc } = await import('drizzle-orm');

    const results = await db
      .select()
      .from(attachments)
      .innerJoin(places, eq(attachments.placeId, places.id))
      .where(and(eq(attachments.placeId, placeId), eq(places.userId, userId)))
      .orderBy(desc(attachments.createdAt));

    return results.map(r => r.attachments);
  }, 'getAttachmentsForPlace');
}

export async function getCollectionAvailableImages(
  collectionId: string,
  source: 'collection' | 'all',
  userId: string
): Promise<Array<{
  id: string;
  uri: string;
  thumbnailUri: string | null;
  placeId: string;
  placeName: string;
}>> {
  return withErrorHandling(async () => {
    const { attachments, placesToCollections } = await import('@/db/schema');
    const { eq, and, inArray } = await import('drizzle-orm');

    if (source === 'collection') {
      // Verify collection ownership first
      const collection = await getCollectionById(collectionId, userId);
      if (!collection) return [];

      // Get place IDs in this collection
      const collectionPlaces = await db
        .select({ placeId: placesToCollections.placeId })
        .from(placesToCollections)
        .where(eq(placesToCollections.collectionId, collectionId));

      const placeIds = collectionPlaces.map(cp => cp.placeId);

      if (placeIds.length === 0) {
        return [];
      }

      // Get all photo attachments for those places
      const results = await db
        .select({
          id: attachments.id,
          uri: attachments.uri,
          thumbnailUri: attachments.thumbnailUri,
          placeId: attachments.placeId,
          placeName: places.name,
        })
        .from(attachments)
        .innerJoin(places, eq(attachments.placeId, places.id))
        .where(
          and(
            eq(attachments.type, 'photo'),
            eq(places.userId, userId),
            inArray(attachments.placeId, placeIds)
          )
        )
        .orderBy(desc(attachments.createdAt));

      return results;
    } else {
      // Get all photo attachments from all user's places
      const results = await db
        .select({
          id: attachments.id,
          uri: attachments.uri,
          thumbnailUri: attachments.thumbnailUri,
          placeId: attachments.placeId,
          placeName: places.name,
        })
        .from(attachments)
        .innerJoin(places, eq(attachments.placeId, places.id))
        .where(and(eq(attachments.type, 'photo'), eq(places.userId, userId)))
        .orderBy(desc(attachments.createdAt))
        .limit(100); // Limit to 100 images for performance

      return results;
    }
  }, 'getCollectionAvailableImages');
}

export async function getLinksForPlace(placeId: string, userId: string) {
  return withErrorHandling(async () => {
    const { placeLinks } = await import('@/db/schema');
    const { eq, and, desc } = await import('drizzle-orm');

    const results = await db
      .select()
      .from(placeLinks)
      .innerJoin(places, eq(placeLinks.placeId, places.id))
      .where(and(eq(placeLinks.placeId, placeId), eq(places.userId, userId)))
      .orderBy(desc(placeLinks.createdAt));

    return results.map(r => r.place_links);
  }, 'getLinksForPlace');
}

export async function getReservationsForPlace(placeId: string, userId: string) {
  return withErrorHandling(async () => {
    const { reservations } = await import('@/db/schema');
    const { eq, and, desc } = await import('drizzle-orm');

    const results = await db
      .select()
      .from(reservations)
      .innerJoin(places, eq(reservations.placeId, places.id))
      .where(and(eq(reservations.placeId, placeId), eq(places.userId, userId)))
      .orderBy(desc(reservations.reservationDate));

    return results.map(r => r.reservations);
  }, 'getReservationsForPlace');
}

export async function getPlaceWithRelations(placeId: string, userId: string) {
  return withErrorHandling(async () => {
    const { places, sourcesCurrentSchema } = await import('@/db/schema');
    const { eq, and } = await import('drizzle-orm');

    const place = await db
      .select()
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, userId)))
      .limit(1)
      .then(rows => rows[0]);

    if (!place) {
      return null;
    }

    const [attachments, links, reservations, sources] = await Promise.all([
      getAttachmentsForPlace(placeId, userId),
      getLinksForPlace(placeId, userId),
      getReservationsForPlace(placeId, userId),
      getSourcesForPlace(placeId, userId),
    ]);

    return {
      ...place,
      attachments,
      links,
      reservations,
      sources,
    };
  }, 'getPlaceWithRelations');
}

export async function getLibraryStatsEnhanced(userId: string) {
  return withErrorHandling(async () => {
    const { places } = await import('@/db/schema');
    const { eq, and, count, sql } = await import('drizzle-orm');

    const totalPlaces = await db
      .select({ count: count() })
      .from(places)
      .where(and(eq(places.status, 'library'), eq(places.userId, userId)))
      .then(rows => rows[0]?.count || 0);

    const visitedCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND ${places.visitStatus} = 'visited'`)
      .then(rows => rows[0]?.count || 0);

    const plannedCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND ${places.visitStatus} = 'planned'`)
      .then(rows => rows[0]?.count || 0);

    const notVisitedCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND (${places.visitStatus} = 'not_visited' OR ${places.visitStatus} IS NULL)`)
      .then(rows => rows[0]?.count || 0);

    const highPriorityCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND ${places.priority} >= 4`)
      .then(rows => rows[0]?.count || 0);

    const mediumPriorityCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND ${places.priority} >= 2 AND ${places.priority} < 4`)
      .then(rows => rows[0]?.count || 0);

    const lowPriorityCount = await db
      .select({ count: count() })
      .from(places)
      .where(sql`${places.status} = 'library' AND ${places.userId} = ${userId} AND ${places.priority} < 2`)
      .then(rows => rows[0]?.count || 0);

    const uniqueCountries = await db
      .select({ country: places.country })
      .from(places)
      .where(and(eq(places.status, 'library'), eq(places.userId, userId)))
      .then(rows => new Set(rows.map(r => r.country).filter(Boolean)).size);

    const { attachments } = await import('@/db/schema');
    const withPhotosCount = await db
      .select({ placeId: attachments.placeId })
      .from(attachments)
      .innerJoin(places, eq(attachments.placeId, places.id))
      .where(and(eq(attachments.type, 'photo'), eq(places.userId, userId)))
      .then(rows => new Set(rows.map(r => r.placeId)).size);

    return {
      total: totalPlaces,
      visited: visitedCount,
      planned: plannedCount,
      notVisited: notVisitedCount,
      byPriority: {
        high: highPriorityCount,
        medium: mediumPriorityCount,
        low: lowPriorityCount,
      },
      countries: uniqueCountries,
      withPhotos: withPhotosCount,
    };
  }, 'getLibraryStatsEnhanced');
}
