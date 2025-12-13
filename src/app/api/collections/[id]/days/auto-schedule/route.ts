import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlacesInCollection } from '@/lib/db-queries';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { point } from '@turf/helpers';
import distance from '@turf/distance';
import type { Place, DayBucket } from '@/types/database';

const AutoScheduleSchema = z.object({
  hoursPerDay: z.number().min(1).max(24),
  transportMode: z.enum(['drive', 'walk']),
});

function calculateDistance(a: Place, b: Place): number {
  if (!a.coords || !b.coords) return Infinity;
  const from = point([a.coords.lon, a.coords.lat]);
  const to = point([b.coords.lon, b.coords.lat]);
  return distance(from, to, { units: 'kilometers' });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthForApi();
    const { id } = await params;
    const body = await request.json();
    const { hoursPerDay, transportMode } = AutoScheduleSchema.parse(body);

    const places = await getPlacesInCollection(id, user.id);

    if (places.length === 0) {
      return NextResponse.json({
        status: 'success',
        dayBuckets: [],
      });
    }

    const speed = transportMode === 'drive' ? 60 : 5;
    const maxDistancePerDay = hoursPerDay * speed;

    const dayBuckets: DayBucket[] = [];
    const placesWithCoords = places.filter(p => p.coords);
    const placesWithoutCoords = places.filter(p => !p.coords);

    let currentDay: Place[] = [];
    let currentDayDistance = 0;
    let dayNumber = 1;

    for (const place of placesWithCoords) {
      if (currentDay.length === 0) {
        currentDay.push(place);
      } else {
        const lastPlace = currentDay[currentDay.length - 1];
        const distanceToPlace = calculateDistance(lastPlace, place);

        if (currentDayDistance + distanceToPlace <= maxDistancePerDay) {
          currentDay.push(place);
          currentDayDistance += distanceToPlace;
        } else {
          dayBuckets.push({
            id: `day-${dayNumber}`,
            dayNumber,
            placeIds: currentDay.map(p => p.id),
          });
          dayNumber++;
          currentDay = [place];
          currentDayDistance = 0;
        }
      }
    }

    if (currentDay.length > 0) {
      dayBuckets.push({
        id: `day-${dayNumber}`,
        dayNumber,
        placeIds: currentDay.map(p => p.id),
      });
      dayNumber++;
    }

    if (placesWithoutCoords.length > 0) {
      dayBuckets.push({
        id: `day-${dayNumber}`,
        dayNumber,
        placeIds: placesWithoutCoords.map(p => p.id),
      });
    }

    return NextResponse.json({
      status: 'success',
      dayBuckets,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: 'error', errors: error.errors },
        { status: 400 }
      );
    }
    console.error('Error auto-scheduling days:', error);
    return NextResponse.json(
      { status: 'error', message: 'Failed to auto-schedule days' },
      { status: 500 }
    );
  }
}
