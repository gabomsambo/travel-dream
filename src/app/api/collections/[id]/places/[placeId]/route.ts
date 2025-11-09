import { NextRequest, NextResponse } from 'next/server';
import { removePlaceFromCollection } from '@/lib/db-mutations';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; placeId: string }> }
) {
  try {
    const { id: collectionId, placeId } = await params;

    console.log('[DELETE place] Removing place:', placeId, 'from collection:', collectionId);

    await removePlaceFromCollection(placeId, collectionId);

    console.log('[DELETE place] Successfully removed');

    return NextResponse.json({
      status: 'success',
      message: 'Place removed from collection',
    });
  } catch (error) {
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
