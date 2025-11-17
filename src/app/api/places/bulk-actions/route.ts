import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/db-utils';
import { bulkConfirmPlaces, batchArchivePlaces, batchRestorePlaces, batchDeletePlaces } from '@/lib/db-mutations';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute for bulk operations

const BulkActionSchema = z.object({
  action: z.enum(['confirm', 'archive', 'restore', 'delete'], {
    required_error: 'Action is required',
    invalid_type_error: 'Action must be one of: "confirm", "archive", "restore", or "delete"'
  }),
  placeIds: z.array(z.string().min(1, 'Place ID cannot be empty'), {
    required_error: 'Place IDs are required',
    invalid_type_error: 'Place IDs must be an array of strings'
  }).min(1, 'At least one place ID is required').max(100, 'Cannot process more than 100 places at once')
});

interface BulkActionRequest {
  action: 'confirm' | 'archive' | 'restore' | 'delete';
  placeIds: string[];
}

interface BulkActionResult {
  success: boolean;
  action: string;
  updatedCount: number;
  requestedCount: number;
  placeIds: string[];
  errors?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: BulkActionRequest = await request.json();

    // Validate request body
    const validation = BulkActionSchema.safeParse(body);
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

    const { action, placeIds } = validation.data;

    // Remove duplicates and validate place IDs
    const uniquePlaceIds = [...new Set(placeIds)];
    if (uniquePlaceIds.length !== placeIds.length) {
      console.warn(`Duplicate place IDs detected: ${placeIds.length} requested, ${uniquePlaceIds.length} unique`);
    }

    let updatedCount = 0;
    let errors: string[] = [];

    // Execute bulk action based on type
    try {
      switch (action) {
        case 'confirm':
          updatedCount = await bulkConfirmPlaces(uniquePlaceIds);
          break;
        case 'archive':
          updatedCount = await batchArchivePlaces(uniquePlaceIds);
          break;
        case 'restore':
          updatedCount = await batchRestorePlaces(uniquePlaceIds);
          break;
        case 'delete':
          updatedCount = await batchDeletePlaces(uniquePlaceIds);
          console.log(`Permanently deleted ${updatedCount} places`);
          break;
        default:
          return NextResponse.json(
            {
              status: 'error',
              message: 'Invalid action type',
              timestamp: new Date().toISOString(),
            },
            { status: 400 }
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Database operation failed';
      errors.push(errorMessage);
      console.error(`Bulk ${action} operation failed:`, error);
      console.error('Error details:', {
        action,
        placeIds: uniquePlaceIds,
        error: error instanceof Error ? error.stack : error
      });
    }

    // Check if operation was partially successful
    const isPartialSuccess = updatedCount > 0 && updatedCount < uniquePlaceIds.length;
    const isFullSuccess = updatedCount === uniquePlaceIds.length;
    const isFailure = updatedCount === 0;

    if (isFailure && errors.length === 0) {
      errors.push('No places were updated. They may not exist or already be in the target status.');
    }

    const result: BulkActionResult = {
      success: isFullSuccess || (isPartialSuccess && errors.length === 0),
      action,
      updatedCount,
      requestedCount: uniquePlaceIds.length,
      placeIds: uniquePlaceIds,
      ...(errors.length > 0 && { errors })
    };

    // Return appropriate status based on operation result
    if (isFailure) {
      return NextResponse.json(
        {
          status: 'error',
          message: `Failed to ${action} places`,
          result,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    if (isPartialSuccess) {
      const actionVerb = action === 'confirm' ? 'confirmed' : action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : 'deleted';
      return NextResponse.json(
        {
          status: 'partial_success',
          message: `Successfully ${actionVerb} ${updatedCount} of ${uniquePlaceIds.length} places`,
          result,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Full success
    const actionVerb = action === 'confirm' ? 'confirmed' : action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : 'permanently deleted';
    return NextResponse.json(
      {
        status: 'success',
        message: `Successfully ${actionVerb} ${updatedCount} places`,
        result,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Bulk actions API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

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
        message: error instanceof Error ? error.message : 'Bulk operation failed',
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return API documentation for bulk actions
  return NextResponse.json(
    {
      status: 'info',
      message: 'Bulk Actions API Endpoint',
      documentation: {
        endpoint: '/api/places/bulk-actions',
        method: 'POST',
        description: 'Perform bulk operations on multiple places',
        requestBody: {
          action: 'confirm | archive | restore | delete',
          placeIds: 'string[] (1-100 items)'
        },
        actions: {
          confirm: 'Move places from inbox to library',
          archive: 'Move places to archived status',
          restore: 'Restore archived places back to library',
          delete: 'Permanently delete places from database'
        },
        responses: {
          200: 'Operation successful (full or partial)',
          400: 'Invalid request data',
          500: 'Operation failed'
        },
        examples: {
          confirm: {
            action: 'confirm',
            placeIds: ['place_123', 'place_456']
          },
          archive: {
            action: 'archive',
            placeIds: ['place_789']
          },
          restore: {
            action: 'restore',
            placeIds: ['place_abc']
          },
          delete: {
            action: 'delete',
            placeIds: ['place_xyz']
          }
        }
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}