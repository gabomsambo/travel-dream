import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlacesInCollection, getPlacesByStatus, searchPlaces } from '@/lib/db-queries';
import { getFieldsForPreset } from '@/lib/export-field-metadata';
import type { PreviewResponse } from '@/types/export';
import type { Place } from '@/types/database';

const PreviewRequestSchema = z.object({
  scope: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('collection'),
      collectionId: z.string().min(1)
    }),
    z.object({
      type: z.literal('library'),
      filters: z.object({
        status: z.enum(['library', 'inbox', 'archived']).optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        kind: z.string().optional(),
        tags: z.array(z.string()).optional(),
        vibes: z.array(z.string()).optional(),
        hasCoords: z.boolean().optional(),
        minRating: z.number().min(0).max(5).optional(),
        searchText: z.string().optional()
      }).optional()
    }),
    z.object({
      type: z.literal('selected'),
      placeIds: z.array(z.string().min(1))
    })
  ]),
  preset: z.enum(['minimal', 'standard', 'complete']).default('standard'),
  customFields: z.array(z.string()).optional()
});

function computeStats(places: Place[]): PreviewResponse['stats'] {
  const byKind: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  const byCountry: Record<string, number> = {};

  places.forEach(place => {
    if (place.kind) {
      byKind[place.kind] = (byKind[place.kind] || 0) + 1;
    }
    if (place.city) {
      byCity[place.city] = (byCity[place.city] || 0) + 1;
    }
    if (place.country) {
      byCountry[place.country] = (byCountry[place.country] || 0) + 1;
    }
  });

  return { byKind, byCity, byCountry };
}

function estimateFileSize(count: number, fieldCount: number): number {
  const avgBytesPerField = 50;
  return count * fieldCount * avgBytesPerField;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const scopeParam = searchParams.get('scope');
    const presetParam = searchParams.get('preset') || 'standard';
    const customFieldsParam = searchParams.get('customFields');

    if (!scopeParam) {
      return NextResponse.json({
        success: false,
        error: 'Missing scope parameter'
      }, { status: 400 });
    }

    let scopeData;
    try {
      scopeData = JSON.parse(scopeParam);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid scope JSON'
      }, { status: 400 });
    }

    const customFields = customFieldsParam ? JSON.parse(customFieldsParam) : undefined;

    const validation = PreviewRequestSchema.safeParse({
      scope: scopeData,
      preset: presetParam,
      customFields
    });

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request parameters',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { scope, preset } = validation.data;

    let allPlaces: Place[] = [];

    switch (scope.type) {
      case 'collection':
        allPlaces = await getPlacesInCollection(scope.collectionId);
        break;

      case 'library':
        if (scope.filters) {
          allPlaces = await searchPlaces({
            text: scope.filters.searchText,
            city: scope.filters.city,
            country: scope.filters.country,
            kind: scope.filters.kind,
            tags: scope.filters.tags,
            vibes: scope.filters.vibes,
            status: scope.filters.status,
            minRating: scope.filters.minRating,
            hasCoords: scope.filters.hasCoords
          });
        } else {
          allPlaces = await getPlacesByStatus('library');
        }
        break;

      case 'selected':
        if (scope.placeIds.length === 0) {
          return NextResponse.json({
            success: true,
            count: 0,
            preview: [],
            stats: { byKind: {} },
            estimatedSize: 0
          });
        }
        const { db } = await import('@/db');
        const { places } = await import('@/db/schema');
        const { inArray } = await import('drizzle-orm');
        allPlaces = await db
          .select()
          .from(places)
          .where(inArray(places.id, scope.placeIds));
        break;
    }

    const count = allPlaces.length;
    const preview = allPlaces.slice(0, 5);
    const stats = computeStats(allPlaces);

    const fieldCount = customFields
      ? customFields.length
      : getFieldsForPreset(preset).length;
    const estimatedSize = estimateFileSize(count, fieldCount);

    const response: PreviewResponse = {
      success: true,
      count,
      preview,
      stats,
      estimatedSize
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Preview error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate preview',
      count: 0,
      preview: [],
      stats: { byKind: {} },
      estimatedSize: 0
    }, { status: 500 });
  }
}
