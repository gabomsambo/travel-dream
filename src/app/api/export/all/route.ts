import { NextResponse } from 'next/server'
import { places, sources, collections, placesToCollections } from '@/db/schema'
import { forUser } from '@/lib/tenant-db'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireAuthForApi()
    const tdb = forUser(user.id)

    const allPlaces = await tdb.select(places)
    const allSources = await tdb.select(sources)
    const allCollections = await tdb.select(collections)
    // Membership rows are owned transitively, through the collection they sit
    // in — `places_to_collections` has no user_id of its own, and it carries the
    // user-authored per-place `note`. `selectVia` scopes it to the caller's
    // collections and returns the table's own flat shape, so the exported JSON
    // keeps the five columns it has always had.
    const placesToCollectionsData = await tdb.selectVia(placesToCollections)

    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      data: {
        places: allPlaces,
        sources: allSources,
        collections: allCollections,
        placesToCollections: placesToCollectionsData,
      },
      stats: {
        totalPlaces: allPlaces.length,
        totalSources: allSources.length,
        totalCollections: allCollections.length,
      },
    }

    return NextResponse.json(exportData)
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}
