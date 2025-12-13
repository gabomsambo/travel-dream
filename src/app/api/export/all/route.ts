import { NextResponse } from 'next/server'
import { db } from '@/db'
import { places, sources, collections, placesToCollections } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireAuthForApi()
    const allPlaces = await db.select().from(places).where(eq(places.userId, user.id))
    const allSources = await db.select().from(sources).where(eq(sources.userId, user.id))
    const allCollections = await db.select().from(collections).where(eq(collections.userId, user.id))
    const placesToCollectionsData = await db.select().from(placesToCollections)

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
