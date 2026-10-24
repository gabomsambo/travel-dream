import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { bulkConfirmPlaces, bulkReturnPlacesToInbox, batchArchivePlaces, batchRestorePlaces, batchDeletePlaces, batchSetVisitStatus, type PlaceStatusUpdate } from '@/lib/db-mutations';
import { getOwnedPlaceIds } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute for bulk operations

const BulkActionSchema = z.object({
  action: z.enum(['confirm', 'archive', 'restore', 'delete', 'set-visit-status', 'return-to-inbox'], {
    required_error: 'Action is required',
    invalid_type_error: 'Action must be one of: "confirm", "archive", "restore", "delete", "set-visit-status" or "return-to-inbox"'
  }),
  // Only for "set-visit-status": the Library's Dreaming / Planned / Been.
  visitStatus: z.enum(['not_visited', 'planned', 'visited']).optional(),
  placeIds: z.array(z.string().min(1, 'Place ID cannot be empty'), {
    required_error: 'Place IDs are required',
    invalid_type_error: 'Place IDs must be an array of strings'
  }).min(1, 'At least one place ID is required').max(500, 'Cannot process more than 500 places at once')
}).refine((b) => b.action !== 'set-visit-status' || b.visitStatus !== undefined, {
  message: 'visitStatus is required for "set-visit-status"',
  path: ['visitStatus'],
});

interface BulkActionRequest {
  action: 'confirm' | 'archive' | 'restore' | 'delete' | 'set-visit-status' | 'return-to-inbox';
  visitStatus?: 'not_visited' | 'planned' | 'visited';
  placeIds: string[];
}

interface BulkActionResult {
  success: boolean;
  action: string;
  updatedCount: number;
  requestedCount: number;
  placeIds: string[];
  updatedIds: string[];
  errors?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
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

    const { action, placeIds, visitStatus } = validation.data;

    // Remove duplicates and validate place IDs
    const uniquePlaceIds = [...new Set(placeIds)];
    if (uniquePlaceIds.length !== placeIds.length) {
      console.warn(`Duplicate place IDs detected: ${placeIds.length} requested, ${uniquePlaceIds.length} unique`);
    }

    // Every named id must be the caller's: the scoped batch update would
    // otherwise match nothing and the route would answer 500.
    const ownedPlaceIds = await getOwnedPlaceIds(uniquePlaceIds, user.id);
    if (ownedPlaceIds.size !== uniquePlaceIds.length) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'One or more places were not found',
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    let updatedCount = 0;
    let updatedIds: string[] = [];
    let errors: string[] = [];

    const takeStatus = (update: PlaceStatusUpdate) => {
      updatedCount = update.updatedCount;
      updatedIds = update.updatedIds;
    };

    // Execute bulk action based on type
    try {
      switch (action) {
        case 'confirm':
          takeStatus(await bulkConfirmPlaces(uniquePlaceIds, user.id));
          break;
        case 'return-to-inbox':
          takeStatus(await bulkReturnPlacesToInbox(uniquePlaceIds, user.id));
          break;
        case 'archive':
          updatedCount = await batchArchivePlaces(uniquePlaceIds, user.id);
          break;
        case 'restore':
          updatedCount = await batchRestorePlaces(uniquePlaceIds, user.id);
          break;
        case 'delete':
          updatedCount = await batchDeletePlaces(uniquePlaceIds, user.id);
          console.log(`Permanently deleted ${updatedCount} places`);
          break;
        case 'set-visit-status':
          updatedCount = await batchSetVisitStatus(uniquePlaceIds, visitStatus!, user.id);
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

    // Invalidate cached library stats — any of confirm/archive/restore/delete affects counts.
    if (updatedCount > 0) {
      try {
        revalidateTag(`library-stats:${user.id}`);
      } catch (error) {
        console.error('Failed to revalidate library stats:', error);
      }
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
      updatedIds,
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
      const actionVerb = action === 'confirm' ? 'confirmed' : action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : action === 'set-visit-status' ? 'updated' : action === 'return-to-inbox' ? 'returned to the Inbox' : 'deleted';
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
    const actionVerb = action === 'confirm' ? 'confirmed' : action === 'archive' ? 'archived' : action === 'restore' ? 'restored' : action === 'set-visit-status' ? 'updated' : action === 'return-to-inbox' ? 'returned to the Inbox' : 'permanently deleted';
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
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
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
          action: 'confirm | archive | restore | delete | set-visit-status | return-to-inbox',
          placeIds: 'string[] (1-500 items)',
          visitStatus: 'not_visited | planned | visited (set-visit-status only)'
        },
        actions: {
          confirm: 'Move places from inbox to library',
          'return-to-inbox': 'Move places back to the inbox (undo a confirm)',
          archive: 'Move places to archived status',
          restore: 'Restore archived places back to library',
          delete: 'Permanently delete places from database',
          'set-visit-status': 'Set Dreaming / Planned / Been on places'
        },
        responses: {
          200: 'Operation successful (full or partial)',
          400: 'Invalid request data',
          404: 'One or more places were not found',
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