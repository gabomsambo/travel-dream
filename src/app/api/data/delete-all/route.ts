import { NextResponse } from 'next/server'
import { db } from '@/db'
import {
  places,
  sources,
  collections,
  placesToCollections,
  sourcesToPlaces,
  mergeLogs,
  uploadSessions,
  dismissedDuplicates
} from '@/db/schema'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(sourcesToPlaces)
      await tx.delete(placesToCollections)
      await tx.delete(mergeLogs)
      await tx.delete(dismissedDuplicates)
      await tx.delete(uploadSessions)
      await tx.delete(places)
      await tx.delete(sources)
      await tx.delete(collections)
    })

    return NextResponse.json({
      success: true,
      message: 'All data deleted successfully'
    })
  } catch (error) {
    console.error('Delete all data error:', error)
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    )
  }
}
