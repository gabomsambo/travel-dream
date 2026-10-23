import { NextRequest, NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { readOwnedPlace } from '@/lib/review/place-access'
import { lookupBranches } from '@/lib/review/places-lookup'

function defaultQuery(place: { name: string; city: string | null; country: string | null }): string {
  return [place.name, place.city, place.country].filter((part) => part && part.trim()).join(', ')
}

/**
 * Branch / place search. One Places autocomplete call per request, and only
 * when the caller asked. With no `q`, the query is this place's own name.
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
    const supplied = request.nextUrl.searchParams.get('q')
    const query = (supplied === null ? defaultQuery(owned.place) : supplied).slice(0, 200)
    const looked = await lookupBranches(query)
    return NextResponse.json({ candidates: looked.value, unavailable: looked.unavailable })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Error searching places:', error)
    return NextResponse.json({ status: 'error', message: 'Failed to search places' }, { status: 500 })
  }
}
