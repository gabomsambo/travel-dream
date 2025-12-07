import { NextRequest, NextResponse } from 'next/server';
import { getCollectionById, getCollectionAvailableImages } from '@/lib/db-queries';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const images = await getCollectionAvailableImages(collectionId, source);

    return NextResponse.json({
      status: 'success',
      images,
      count: images.length,
      source,
    });
  } catch (error) {
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
