import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { getPlacesByStatus } from '@/lib/db-queries';
import {
  detectDuplicates,
  batchDetectDuplicates,
  findDuplicateClusters,
  DEFAULT_DETECTION_CONFIG,
  type DuplicateDetectionConfig
} from '@/lib/duplicate-detection';
import { db } from '@/db';
import { places, dismissedDuplicates } from '@/db/schema';
import { eq, inArray, and, ne } from 'drizzle-orm';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';
import type { Place } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for duplicate detection

// Request validation schemas
const DuplicateQuerySchema = z.object({
  placeId: z.string().nullable().optional(),
  status: z.enum(['inbox', 'library', 'archived']).nullable().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  minConfidence: z.coerce.number().min(0).max(1).default(0.6),
  includeReasoning: z.coerce.boolean().default(true),
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

// Cache for expensive duplicate calculations
const duplicateCache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(params: any): string {
  return JSON.stringify(params);
}

function setCache(key: string, value: any) {
  duplicateCache.set(key, {
    data: value,
    timestamp: Date.now()
  });
}

function getCache(key: string): any | null {
  const cached = duplicateCache.get(key);
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > CACHE_TTL;
  if (isExpired) {
    duplicateCache.delete(key);
    return null;
  }

  return cached.data;
}

async function getDismissedPairsSet(): Promise<Set<string>> {
  const dismissed = await db.select().from(dismissedDuplicates);
  const dismissedSet = new Set<string>();

  for (const d of dismissed) {
    dismissedSet.add(`${d.placeId1}:${d.placeId2}`);
  }

  return dismissedSet;
}

function filterDismissedClusters(
  clusters: Array<{ places: Place[]; avgConfidence: number; cluster_id: string }>,
  dismissedSet: Set<string>
): Array<{ places: Place[]; avgConfidence: number; cluster_id: string }> {
  return clusters.filter(cluster => {
    // Check if ANY pair in cluster is dismissed
    for (let i = 0; i < cluster.places.length; i++) {
      for (let j = i + 1; j < cluster.places.length; j++) {
        const key1 = `${cluster.places[i].id}:${cluster.places[j].id}`;
        const key2 = `${cluster.places[j].id}:${cluster.places[i].id}`;
        if (dismissedSet.has(key1) || dismissedSet.has(key2)) {
          return false;
        }
      }
    }
    return true;
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryValidation = DuplicateQuerySchema.safeParse({
      placeId: searchParams.get('placeId'),
      status: searchParams.get('status'),
      limit: searchParams.get('limit'),
      minConfidence: searchParams.get('minConfidence'),
      includeReasoning: searchParams.get('includeReasoning'),
      mode: searchParams.get('mode')
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
    const cacheKey = getCacheKey({ placeId, status, limit, config, mode });
    const cachedResult = getCache(cacheKey);
    if (cachedResult) {
      return NextResponse.json({
        status: 'success',
        ...cachedResult,
        cached: true,
        timestamp: new Date().toISOString(),
      });
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

        // Get target place
        const targetPlace = await withErrorHandling(async () => {
          return await db.select().from(places).where(eq(places.id, placeId)).limit(1);
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

        // Get candidate places (excluding target)
        const candidates = await withErrorHandling(async () => {
          const whereConditions = status
            ? and(ne(places.id, placeId), eq(places.status, status))
            : ne(places.id, placeId);

          return await db.select()
            .from(places)
            .where(whereConditions)
            .limit(limit);
        }, 'getCandidatePlaces');

        // Detect duplicates
        const result = detectDuplicates(targetPlace[0], candidates, config);

        // Filter by confidence and optionally remove reasoning
        const filteredDuplicates = result.potentialDuplicates.filter(
          d => d.confidence >= minConfidence
        );

        if (!includeReasoning) {
          filteredDuplicates.forEach(d => delete (d as any).reasoning);
        }

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

        setCache(cacheKey, response);
        return NextResponse.json({
          status: 'success',
          ...response,
          cached: false,
          timestamp: new Date().toISOString(),
        });
      }

      case 'batch': {
        // Get places for batch processing
        const targetPlaces = await withErrorHandling(async () => {
          const query = db.select().from(places);

          if (status) {
            query.where(eq(places.status, status));
          }

          return await query.limit(limit);
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

            if (!includeReasoning) {
              filteredDuplicates.forEach(d => delete (d as any).reasoning);
            }

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

        setCache(cacheKey, response);
        return NextResponse.json({
          status: 'success',
          ...response,
          cached: false,
          timestamp: new Date().toISOString(),
        });
      }

      case 'clusters': {
        // Get places for cluster analysis (exclude archived by default)
        const targetPlaces = await withErrorHandling(async () => {
          if (status) {
            // If specific status requested, use that
            return await db.select().from(places)
              .where(eq(places.status, status))
              .limit(limit);
          } else {
            // Default: exclude archived places
            return await db.select().from(places)
              .where(ne(places.status, 'archived'))
              .limit(limit);
          }
        }, 'getClusterPlaces');

        if (targetPlaces.length < 2) {
          return NextResponse.json({
            status: 'success',
            mode: 'clusters',
            clusters: [],
            summary: {
              totalPlaces: targetPlaces.length,
              totalClusters: 0,
              largestClusterSize: 0
            },
            cached: false,
            timestamp: new Date().toISOString(),
          });
        }

        // Batch duplicate detection for clustering
        const duplicateResults = await batchDetectDuplicates(targetPlaces, config);

        // Find clusters with configurable confidence threshold
        const allClusters = findDuplicateClusters(duplicateResults, 2, minConfidence);

        // Filter out dismissed clusters
        const dismissedSet = await getDismissedPairsSet();
        const clusters = filterDismissedClusters(allClusters, dismissedSet);

        const response = {
          mode: 'clusters',
          clusters: clusters.map(cluster => ({
            ...cluster,
            places: includeReasoning ? cluster.places : cluster.places.map(p => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              city: p.city,
              country: p.country
            }))
          })),
          summary: {
            totalPlaces: targetPlaces.length,
            totalClusters: clusters.length,
            largestClusterSize: clusters.length > 0 ? Math.max(...clusters.map(c => c.places.length)) : 0,
            avgClusterSize: clusters.length > 0 ? clusters.reduce((sum, c) => sum + c.places.length, 0) / clusters.length : 0
          },
          config
        };

        setCache(cacheKey, response);
        return NextResponse.json({
          status: 'success',
          ...response,
          cached: false,
          timestamp: new Date().toISOString(),
        });
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
  // Clear duplicate detection cache
  duplicateCache.clear();

  return NextResponse.json({
    status: 'success',
    message: 'Duplicate detection cache cleared',
    timestamp: new Date().toISOString(),
  });
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
        limit: 'number (1-1000, default: 100)',
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