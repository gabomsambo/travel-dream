import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { usablePin } from '@/lib/place-coords'
import { readOwnedPlace } from '@/lib/review/place-access'
import { lookupCityFromPin } from '@/lib/review/places-lookup'

/**
 * City suggestion for a place that has a pin and no city. One reverse-geocode
 * when a real key is configured; local verification stubs it and never calls
 * Google. No pin answers `{ suggestion: null }` without a lookup.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  try {
    const user = await requireAuthForApi()
    const { placeId } = await params
    const owned = await readOwnedPlace(user.id, placeId)
    if (owned.response) return owned.response
    const pin = usablePin(owned.place.coords)
    if (!pin) {
      return NextResponse.json({ suggestion: null, unavailable: false })
    }
    const looked = await lookupCityFromPin(pin)
    return NextResponse.json({ suggestion: looked.value, unavailable: looked.unavailable })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Error suggesting a city:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to suggest a city' }, { status: 500 })
  }
}
