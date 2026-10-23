import { NextResponse } from 'next/server'
import { places } from '@/db/schema'
import { forUser } from '@/lib/tenant-db'

type PlaceRow = typeof places.$inferSelect

/** 404 when the id does not exist, 403 when it belongs to someone else. */
export async function readOwnedPlace(
  userId: string,
  placeId: string,
): Promise<{ place: PlaceRow; response?: undefined } | { place?: undefined; response: NextResponse }> {
  const found = await forUser(userId).findOwned(places, placeId)
  if (found.status === 'ok') return { place: found.row }
  return {
    response: NextResponse.json(
      { status: 'error', message: 'Place not found' },
      { status: found.status === 'forbidden' ? 403 : 404 },
    ),
  }
}
