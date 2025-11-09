import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCollectionById } from '@/lib/db-queries';
import { saveDayBuckets, saveUnscheduledPlaces } from '@/lib/db-mutations';
import { DayBucketSchema } from '@/types/database';

const UpdateDaysSchema = z.object({
  dayBuckets: DayBucketSchema.array(),
  unscheduledPlaceIds: z.array(z.string()),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const collection = await getCollectionById(id);

    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      dayBuckets: collection.dayBuckets || [],
      unscheduledPlaceIds: collection.unscheduledPlaceIds || [],
    });
  } catch (error) {
    console.error('Error fetching day buckets:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to fetch day buckets' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    console.log('[API PATCH /days] Collection ID:', id);
    console.log('[API PATCH /days] Request body:', JSON.stringify(body, null, 2));

    const { dayBuckets, unscheduledPlaceIds } = UpdateDaysSchema.parse(body);

    console.log('[API PATCH /days] Parsed day buckets count:', dayBuckets.length);
    console.log('[API PATCH /days] Parsed unscheduled IDs count:', unscheduledPlaceIds.length);

    await saveDayBuckets(id, dayBuckets);
    await saveUnscheduledPlaces(id, unscheduledPlaceIds);

    console.log('[API PATCH /days] Save operations completed successfully');

    return NextResponse.json({
      status: 'success',
      message: 'Day buckets updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[API PATCH /days] Validation error:', error.errors);
      return NextResponse.json(
        { status: 'error', errors: error.errors },
        { status: 400 }
      );
    }
    console.error('[API PATCH /days] Error updating day buckets:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to update day buckets' },
      { status: 500 }
    );
  }
}
