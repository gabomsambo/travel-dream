import { NextRequest, NextResponse } from 'next/server';
import { getCollectionById, getCollectionAvailableImages } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id: collectionId } = await params;
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') as 'collection' | 'all' || 'collection';

    // Validate source parameter
    if (source !== 'collection' && source !== 'all') {
      return NextResponse.json(
        { status: 'error', message: 'Invalid source. Must be "collection" or "all"' },
        { status: 400 }
      );
    }

    // Check if collection exists
    const collection = await getCollectionById(collectionId, user.id);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const images = await getCollectionAvailableImages(collectionId, source, user.id);

    return NextResponse.json({
      status: 'success',
      images,
      count: images.length,
      source,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Error fetching available images:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch images',
      },
      { status: 500 }
    );
  }
}
