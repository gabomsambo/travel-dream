import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { mergePlaces } from '@/lib/db-mutations';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30; // 30 seconds for merge operations

const MergeRequestSchema = z.object({
  sourceId: z.string().min(1, 'Source place ID is required'),
  targetId: z.string().min(1, 'Target place ID is required')
});

interface MergeRequest {
  sourceId: string;
  targetId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: MergeRequest = await request.json();

    // Validate request body
    const validation = MergeRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid request data',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          })),
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const { sourceId, targetId } = validation.data;

    // Prevent merging a place with itself
    if (sourceId === targetId) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Cannot merge a place with itself',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Perform the merge operation
    const mergedPlace = await mergePlaces(sourceId, targetId);

    return NextResponse.json(
      {
        status: 'success',
        message: `Successfully merged "${mergedPlace.name}"`,
        mergedPlace: {
          id: mergedPlace.id,
          name: mergedPlace.name,
          kind: mergedPlace.kind,
          city: mergedPlace.city,
          country: mergedPlace.country,
          status: mergedPlace.status,
          confidence: mergedPlace.confidence,
          updatedAt: mergedPlace.updatedAt
        },
        operation: {
          sourceId,
          targetId,
          resultId: mergedPlace.id
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Merge places API error:', error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'One or both places not found',
            timestamp: new Date().toISOString(),
          },
          { status: 404 }
        );
      }

      if (error.message.includes('already merged') || error.message.includes('already deleted')) {
        return NextResponse.json(
          {
            status: 'error',
            message: 'Places have already been processed',
            timestamp: new Date().toISOString(),
          },
          { status: 409 }
        );
      }
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Invalid JSON in request body',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Merge operation failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return API documentation for merge endpoint
  return NextResponse.json(
    {
      status: 'info',
      message: 'Place Merge API Endpoint',
      documentation: {
        endpoint: '/api/places/merge',
        method: 'POST',
        description: 'Merge two places by combining their data and removing the source place',
        requestBody: {
          sourceId: 'string (place to be merged and removed)',
          targetId: 'string (place that will receive the merged data)'
        },
        behavior: {
          dataHandling: 'Target place keeps its core identity, source data is merged in',
          sourcePlace: 'Deleted after successful merge',
          targetPlace: 'Updated with merged data and new timestamp',
          relationships: 'Source place relationships are transferred to target'
        },
        responses: {
          200: 'Merge successful',
          400: 'Invalid request data or same place IDs',
          404: 'One or both places not found',
          409: 'Places already processed/merged',
          500: 'Merge operation failed'
        },
        example: {
          request: {
            sourceId: 'plc_abc123',
            targetId: 'plc_def456'
          },
          response: {
            status: 'success',
            mergedPlace: {
              id: 'plc_def456',
              name: 'Merged Place Name',
              kind: 'landmark',
              city: 'Barcelona',
              country: 'ES'
            },
            operation: {
              sourceId: 'plc_abc123',
              targetId: 'plc_def456',
              resultId: 'plc_def456'
            }
          }
        }
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}