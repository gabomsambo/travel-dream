import { NextResponse } from 'next/server'
import { db } from '@/db'
import { places, sources, collections, placesToCollections } from '@/db/schema'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const allPlaces = await db.select().from(places)
    const allSources = await db.select().from(sources)
    const allCollections = await db.select().from(collections)
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
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}
