import { NextRequest, NextResponse } from 'next/server';
import { removePlaceFromCollection } from '@/lib/db-mutations';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId, placeId } = await params;

    console.log('[DELETE place] Removing place:', placeId, 'from collection:', collectionId);

    await removePlaceFromCollection(placeId, collectionId, user.id);

    console.log('[DELETE place] Successfully removed');

    return NextResponse.json({
      status: 'success',
      message: 'Place removed from collection',
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[DELETE place] Error removing place from collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to remove place from collection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
