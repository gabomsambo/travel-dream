import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addPlaceToCollection } from '@/lib/db-mutations';

const AddPlacesSchema = z.object({
  placeIds: z.array(z.string())
    .min(1, 'At least one place ID is required')
    .max(100, 'Cannot add more than 100 places at once'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const body = await request.json();
    const { placeIds } = AddPlacesSchema.parse(body);

    const results = {
      successful: [] as string[],
      failed: [] as { placeId: string; error: string }[],
    };

    for (const placeId of placeIds) {
      try {
        await addPlaceToCollection(placeId, collectionId);
        results.successful.push(placeId);
      } catch (error) {
        results.failed.push({
          placeId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const allSuccessful = results.failed.length === 0;

    return NextResponse.json({
      status: allSuccessful ? 'success' : 'partial',
      message: allSuccessful
        ? `Successfully added ${results.successful.length} places to collection`
        : `Added ${results.successful.length} places, failed to add ${results.failed.length} places`,
      results,
    }, { status: allSuccessful ? 200 : 207 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'Validation failed',
          errors: error.errors,
        },
        { status: 400 }
      );
    }

    console.error('Error adding places to collection:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to add places to collection',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
