import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import {
  detectDuplicates,
  batchDetectDuplicates,
  findDuplicateClusters,
  DEFAULT_DETECTION_CONFIG,
  type DuplicateDetectionConfig
} from '@/lib/duplicate-detection';
import { DUPLICATE_PAGE_BAND, filterDismissedClusters, possibleGroups, type QueuePlace } from '@/lib/duplicate-certainty';
import { loadDuplicateQueueExtras } from '@/lib/duplicate-queue-data';
// TODO(tenant-db): migrate to `forUser(user.id)` from '@/lib/tenant-db'.
// Not migrated in the change that introduced the accessor: the largest of the
// group — six reads plus the duplicate-detection joins.
// See AGENTS.md § Multi-Tenancy for the rule this exemption suspends.
// eslint-disable-next-line no-restricted-imports -- unmigrated; see the TODO above
import { db } from '@/db';
import { places, dismissedDuplicates } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';
import {
  clearDuplicateScanCache,
  getDuplicateScanCache,
  setDuplicateScanCache,
} from '@/lib/duplicate-scan-cache';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for duplicate detection

function parseQueryBoolean(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return value;
}

// Request validation schemas
const DuplicateQuerySchema = z.object({
  placeId: z.string().nullable().optional(),
  status: z.enum(['inbox', 'library', 'archived']).nullable().optional(),
  limit: z.coerce.number().min(1).max(5000).default(1000),
  minConfidence: z.coerce.number().min(0).max(1).default(0.6),
  includeReasoning: z.preprocess(parseQueryBoolean, z.boolean().default(true)),
  mode: z.enum(['single', 'batch', 'clusters']).default('single')
});

const DuplicateConfigSchema = z.object({
  nameThreshold: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.nameThreshold),
  locationThresholdKm: z.number().min(0).max(50).default(DEFAULT_DETECTION_CONFIG.locationThresholdKm),
  minConfidenceScore: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.minConfidenceScore),
  weights: z.object({
    name: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.weights.name),
    location: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.weights.location),
    kind: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.weights.kind),
    city: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.weights.city),
    country: z.number().min(0).max(1).default(DEFAULT_DETECTION_CONFIG.weights.country)
  }).default(DEFAULT_DETECTION_CONFIG.weights)
}).default(DEFAULT_DETECTION_CONFIG);

function getCacheKey(params: any): string {
  return JSON.stringify(params);
}

async function getDismissedPairsSet(userId: string): Promise<Set<string>> {
  const dismissed = await db.select().from(dismissedDuplicates)
    .where(eq(dismissedDuplicates.userId, userId));
  const dismissedSet = new Set<string>();

  for (const d of dismissed) {
    dismissedSet.add(`${d.placeId1}:${d.placeId2}`);
  }

  return dismissedSet;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function stripReasoning(duplicate: unknown): unknown {
  if (!isRecord(duplicate)) return duplicate;
  const { reasoning: _reasoning, ...rest } = duplicate;
  return rest;
}

function presentPlace(place: QueuePlace) {
  return {
    id: place.id,
    name: place.name,
    kind: place.kind,
    city: place.city,
    country: place.country,
    status: place.status,
    coords: place.coords,
    googlePlaceId: place.googlePlaceId,
    altNames: place.altNames,
    screenshotCount: place.screenshotCount ?? 0,
    hasPhoto: place.hasPhoto ?? false,
    photoUrl: place.photoUrl ?? null,
  };
}

function projectClusterList(clusters: unknown): unknown {
  if (!Array.isArray(clusters)) return clusters;
  return clusters.map((cluster) => {
    if (!isRecord(cluster) || !Array.isArray(cluster.places)) return cluster;
    return {
      ...cluster,
      places: cluster.places.map((place) => (
        isRecord(place) ? presentPlace(place as QueuePlace) : place
      )),
    };
  });
}

function projectCachedScan(body: unknown, includeReasoning: boolean): Record<string, unknown> {
  if (!isRecord(body) || includeReasoning) return isRecord(body) ? body : {};

  if (body.mode === 'single' && isRecord(body.result) && Array.isArray(body.result.potentialDuplicates)) {
    return {
      ...body,
      result: {
        ...body.result,
        potentialDuplicates: body.result.potentialDuplicates.map(stripReasoning),
      },
    };
  }

  if (body.mode === 'batch' && isRecord(body.results)) {
    const results: Record<string, unknown> = {};
    for (const [id, entry] of Object.entries(body.results)) {
      if (!isRecord(entry) || !Array.isArray(entry.duplicates)) {
        results[id] = entry;
        continue;
      }
      results[id] = {
        ...entry,
        duplicates: entry.duplicates.map(stripReasoning),
      };
    }
    return { ...body, results };
  }

  if (body.mode === 'clusters') {
    return {
      ...body,
      clusters: projectClusterList(body.clusters),
      possible: projectClusterList(body.possible),
    };
  }

  return body;
}

function scanResponse(body: unknown, includeReasoning: boolean, cached: boolean) {
  return NextResponse.json({
    ...projectCachedScan(body, includeReasoning),
    status: 'success',
    cached,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters (convert null to undefined so .default() works)
    const queryValidation = DuplicateQuerySchema.safeParse({
      placeId: searchParams.get('placeId'),
      status: searchParams.get('status'),
      limit: searchParams.get('limit') ?? undefined,
      minConfidence: searchParams.get('minConfidence') ?? undefined,
      includeReasoning: searchParams.get('includeReasoning') ?? undefined,
      mode: searchParams.get('mode') ?? undefined
    });

    if (!queryValidation.success) {
      const errorDetails = {
        errors: queryValidation.error.errors,
        receivedParams: {
          placeId: searchParams.get('placeId'),
          status: searchParams.get('status'),
          limit: searchParams.get('limit'),
          minConfidence: searchParams.get('minConfidence'),
          includeReasoning: searchParams.get('includeReasoning'),
          mode: searchParams.get('mode')
        },
        fullUrl: request.url,
        searchParamsString: searchParams.toString()
      };

      console.error('❌ Duplicate detection validation failed:', JSON.stringify(errorDetails, null, 2));

      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid query parameters',
          errors: queryValidation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            received: err.path.length > 0 ? searchParams.get(err.path[0] as string) : null
          })),
          receivedParams: errorDetails.receivedParams,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const { placeId, status, limit, minConfidence, includeReasoning, mode } = queryValidation.data;

    console.log('✅ Duplicate detection validation passed:', { mode, status, limit, minConfidence });

    // Parse configuration from query params or use defaults
    const configData = {
      nameThreshold: parseFloat(searchParams.get('nameThreshold') || '0.8'),
      locationThresholdKm: parseFloat(searchParams.get('locationThresholdKm') || '0.5'),
      minConfidenceScore: minConfidence
    };

    const configValidation = DuplicateConfigSchema.safeParse(configData);
    const config: DuplicateDetectionConfig = configValidation.success
      ? configValidation.data
      : DEFAULT_DETECTION_CONFIG;

    // Check cache first
    const cacheKey = getCacheKey({ userId: user.id, placeId, status, limit, config, mode });
    const cachedResult = getDuplicateScanCache(cacheKey);
    if (cachedResult) {
      return scanResponse(cachedResult, includeReasoning, true);
    }

    // Handle different modes
    switch (mode) {
      case 'single': {
        if (!placeId) {
          return NextResponse.json(
            {
              status: 'error',
              message: 'placeId is required for single mode',
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
        }

        // Get target place (scoped to current user)
        const targetPlace = await withErrorHandling(async () => {
          return await db.select().from(places)
            .where(and(eq(places.id, placeId), eq(places.userId, user.id)))
            .limit(1);
        }, 'getTargetPlace');

        if (!targetPlace || targetPlace.length === 0) {
          return NextResponse.json(
            {
              status: 'error',
              message: 'Place not found',
              timestamp: new Date().toISOString(),
            },
            { status: 404 }
          );
        }

        // Get candidate places (excluding target, scoped to current user)
        const candidates = await withErrorHandling(async () => {
          const conditions = [
            ne(places.id, placeId),
            eq(places.userId, user.id),
          ];
          if (status) {
            conditions.push(eq(places.status, status));
          }

          return await db.select()
            .from(places)
            .where(and(...conditions))
            .limit(limit);
        }, 'getCandidatePlaces');

        // Detect duplicates
        const result = detectDuplicates(targetPlace[0], candidates, config);

        // Filter by confidence and optionally remove reasoning
        const filteredDuplicates = result.potentialDuplicates.filter(
          d => d.confidence >= minConfidence
        );

        const response = {
          mode: 'single',
          result: {
            ...result,
            potentialDuplicates: filteredDuplicates
          },
          config,
          performance: {
            candidatesChecked: result.totalCandidates,
            duplicatesFound: filteredDuplicates.length,
            highConfidenceMatches: filteredDuplicates.filter(d => d.confidence > 0.8).length
          }
        };

        setDuplicateScanCache(cacheKey, response);
        return scanResponse(response, includeReasoning, false);
      }

      case 'batch': {
        // Get places for batch processing (scoped to current user)
        const targetPlaces = await withErrorHandling(async () => {
          const conditions = [eq(places.userId, user.id)];
          if (status) {
            conditions.push(eq(places.status, status));
          }
          return await db.select().from(places)
            .where(and(...conditions))
            .limit(limit);
        }, 'getBatchPlaces');

        if (targetPlaces.length === 0) {
          return NextResponse.json({
            status: 'success',
            mode: 'batch',
            results: {},
            summary: {
              totalPlaces: 0,
              placesWithDuplicates: 0,
              totalDuplicateMatches: 0
            },
            cached: false,
            timestamp: new Date().toISOString(),
          });
        }

        // Batch duplicate detection
        const results = await batchDetectDuplicates(targetPlaces, config);

        // Filter and format results
        const formattedResults: any = {};
        let placesWithDuplicates = 0;
        let totalDuplicateMatches = 0;

        for (const [placeId, result] of results) {
          const filteredDuplicates = result.potentialDuplicates.filter(
            d => d.confidence >= minConfidence
          );

          if (filteredDuplicates.length > 0) {
            placesWithDuplicates++;
            totalDuplicateMatches += filteredDuplicates.length;

            formattedResults[placeId] = {
              place: result.originalPlace,
              duplicates: filteredDuplicates,
              hasHighConfidenceDuplicates: filteredDuplicates.some(d => d.confidence > 0.8)
            };
          }
        }

        const response = {
          mode: 'batch',
          results: formattedResults,
          summary: {
            totalPlaces: targetPlaces.length,
            placesWithDuplicates,
            totalDuplicateMatches,
            avgDuplicatesPerPlace: placesWithDuplicates > 0 ? totalDuplicateMatches / placesWithDuplicates : 0
          },
          config
        };

        setDuplicateScanCache(cacheKey, response);
        return scanResponse(response, includeReasoning, false);
      }

      case 'clusters': {
        // Get places for cluster analysis (scoped to current user; exclude archived by default)
        const targetPlaces = await withErrorHandling(async () => {
          const userFilter = eq(places.userId, user.id);
          if (status) {
            // If specific status requested, use that
            return await db.select().from(places)
              .where(and(eq(places.status, status), userFilter))
              .limit(limit);
          } else {
            // Default: exclude archived places
            return await db.select().from(places)
              .where(and(ne(places.status, 'archived'), userFilter))
              .limit(limit);
          }
        }, 'getClusterPlaces');

        if (targetPlaces.length < 2) {
          const extras = await loadDuplicateQueueExtras(user.id, [], []);
          return NextResponse.json({
            status: 'success',
            mode: 'clusters',
            clusters: [],
            possible: [],
            dismissed: extras.dismissed,
            merged: extras.merged,
            summary: {
              totalPlaces: targetPlaces.length,
              totalClusters: 0,
              largestClusterSize: 0
            },
            cached: false,
            timestamp: new Date().toISOString(),
          });
        }

        // Detect down to the Possible floor so a 0.60–0.70 pair is not dropped
        // before the queue can put it on its own tab. To review stays the
        // caller's threshold (the page asks for 0.7).
        const detectionFloor = Math.min(minConfidence, DUPLICATE_PAGE_BAND.possibleMin);
        const detectionConfig = { ...config, minConfidenceScore: detectionFloor };
        const duplicateResults = await batchDetectDuplicates(targetPlaces, detectionConfig);

        // Group membership is findDuplicateClusters. The page asks for 0.7.
        // Pairs under that stay on the group's edges. The 2 km split fills leftOut.
        const reviewClusters = findDuplicateClusters(duplicateResults, 2, minConfidence, config);
        const wideClusters = detectionFloor < minConfidence
          ? findDuplicateClusters(duplicateResults, 2, detectionFloor, config)
          : reviewClusters;

        // Filter out dismissed clusters (scoped to current user)
        const dismissedSet = await getDismissedPairsSet(user.id);
        const clusters = filterDismissedClusters(reviewClusters, dismissedSet);
        const possibleClusters = possibleGroups(wideClusters, dismissedSet);
        const extras = await loadDuplicateQueueExtras(
          user.id,
          clusters,
          possibleClusters,
        );

        const response = {
          mode: 'clusters',
          clusters: extras.clusters,
          possible: extras.possible,
          dismissed: extras.dismissed,
          merged: extras.merged,
          summary: {
            totalPlaces: targetPlaces.length,
            totalClusters: extras.clusters.length,
            largestClusterSize: extras.clusters.length > 0 ? Math.max(...extras.clusters.map(c => c.places.length)) : 0,
            avgClusterSize: extras.clusters.length > 0 ? extras.clusters.reduce((sum, c) => sum + c.places.length, 0) / extras.clusters.length : 0
          },
          config
        };

        setDuplicateScanCache(cacheKey, response);
        return scanResponse(response, includeReasoning, false);
      }

      default:
        return NextResponse.json(
          {
            status: 'error',
            message: 'Invalid mode specified',
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
    }

  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Duplicate detection API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Duplicate detection failed',
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Auth guard: prevent unauthenticated cache-flush DoS that would force
    // full re-detection for every active user simultaneously.
    await requireAuthForApi();

    clearDuplicateScanCache();

    return NextResponse.json({
      status: 'success',
      message: 'Duplicate detection cache cleared',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    throw error;
  }
}

export async function OPTIONS() {
  // Return API documentation
  return NextResponse.json({
    status: 'info',
    message: 'Duplicate Detection API',
    documentation: {
      endpoint: '/api/places/duplicates',
      method: 'GET',
      description: 'Find potential duplicate places using fuzzy matching and location proximity',
      modes: {
        single: 'Find duplicates for a specific place',
        batch: 'Find duplicates for multiple places',
        clusters: 'Find groups of similar places'
      },
      parameters: {
        placeId: 'string (required for single mode)',
        status: 'inbox | library | archived (filter places by status)',
        limit: 'number (1-5000, default: 1000)',
        minConfidence: 'number (0-1, default: 0.6)',
        includeReasoning: 'boolean (default: true)',
        mode: 'single | batch | clusters (default: single)',
        nameThreshold: 'number (0-1, default: 0.8)',
        locationThresholdKm: 'number (0-50, default: 0.5)'
      },
      examples: {
        single: '/api/places/duplicates?placeId=plc_123&mode=single',
        batch: '/api/places/duplicates?mode=batch&status=inbox&limit=50',
        clusters: '/api/places/duplicates?mode=clusters&minConfidence=0.7'
      },
      caching: {
        ttl: '5 minutes',
        clearCache: 'DELETE /api/places/duplicates'
      }
    },
    timestamp: new Date().toISOString(),
  });
}