import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { db } from '@/db'
import { eq, inArray } from 'drizzle-orm'
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
    const user = await requireAuthForApi()

    await db.transaction(async (tx) => {
      // Get all place IDs for this user
      const userPlaces = await tx
        .select({ id: places.id })
        .from(places)
        .where(eq(places.userId, user.id))
      const placeIds = userPlaces.map(p => p.id)

      // Get all source IDs for this user
      const userSources = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(eq(sources.userId, user.id))
      const sourceIds = userSources.map(s => s.id)

      // Get all collection IDs for this user
      const userCollections = await tx
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.userId, user.id))
      const collectionIds = userCollections.map(c => c.id)

      // Delete junction table records (only those related to user's places/sources/collections)
      if (placeIds.length > 0) {
        await tx.delete(sourcesToPlaces).where(inArray(sourcesToPlaces.placeId, placeIds))
        await tx.delete(placesToCollections).where(inArray(placesToCollections.placeId, placeIds))
        await tx.delete(mergeLogs).where(inArray(mergeLogs.targetId, placeIds))
        await tx.delete(dismissedDuplicates).where(inArray(dismissedDuplicates.placeId1, placeIds))
      }

      // Delete upload sessions for this user
      await tx.delete(uploadSessions).where(eq(uploadSessions.userId, user.id))

      // Delete main records for this user only
      await tx.delete(places).where(eq(places.userId, user.id))
      await tx.delete(sources).where(eq(sources.userId, user.id))
      await tx.delete(collections).where(eq(collections.userId, user.id))
    })

    return NextResponse.json({
      success: true,
      message: 'All your data deleted successfully'
    })
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Delete all data error:', error)
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    )
  }
}
