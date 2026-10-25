import { NextRequest, NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { readOwnedPlace } from '@/lib/review/place-access'
import { lookupPin } from '@/lib/review/places-lookup'

const PLACE_ID = /^[\w-]{1,200}$/

/**
 * Details for one branch the caller picked. One Places details call. A missing
 * geometry comes back as `coords: null` (not 0,0). Saving the pin is a
 * separate PATCH the caller makes after this.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ placeId: string }> },
) {
  try {
    const user = await requireAuthForApi()
    const { placeId } = await params
    const owned = await readOwnedPlace(user.id, placeId)
    if (owned.response) return owned.response
    const googlePlaceId = request.nextUrl.searchParams.get('googlePlaceId') ?? ''
    if (!PLACE_ID.test(googlePlaceId)) {
      return NextResponse.json({ status: 'error', message: 'googlePlaceId is required' }, { status: 400 })
    }
    const looked = await lookupPin(googlePlaceId)
    return NextResponse.json({ pin: looked.value, unavailable: looked.unavailable })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Error loading a pin:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to load a pin' }, { status: 500 })
  }
}
