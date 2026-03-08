import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
import { db } from '@/db'
import { eq, inArray, or } from 'drizzle-orm'
import {
  places,
  sources,
  collections,
  placesToCollections,
  sourcesToPlaces,
  mergeLogs,
  uploadSessions,
  dismissedDuplicates,
  attachments
} from '@/db/schema'
import { del } from '@vercel/blob'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    const user = await requireAuthForApi()

    // Collect blob URLs BEFORE deleting records
    const blobUrls: string[] = []

    await db.transaction(async (tx) => {
      // Get all place IDs for this user
      const userPlaces = await tx
        .select({ id: places.id })
        .from(places)
        .where(eq(places.userId, user.id))
      const placeIds = userPlaces.map(p => p.id)

      // Get all source URIs for this user
      const userSources = await tx
        .select({ id: sources.id, uri: sources.uri })
        .from(sources)
        .where(eq(sources.userId, user.id))
      blobUrls.push(...userSources.map(s => s.uri).filter(u => u?.startsWith('https://')))

      // Get all attachment URIs for this user's places
      if (placeIds.length > 0) {
        const userAttachments = await tx
          .select({ uri: attachments.uri, thumbnailUri: attachments.thumbnailUri })
          .from(attachments)
          .where(inArray(attachments.placeId, placeIds))
        blobUrls.push(
          ...userAttachments.map(a => a.uri).filter(u => u?.startsWith('https://')),
          ...userAttachments.map(a => a.thumbnailUri).filter((u): u is string => !!u && u.startsWith('https://'))
        )
      }

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
        await tx.delete(dismissedDuplicates).where(
          or(
            inArray(dismissedDuplicates.placeId1, placeIds),
            inArray(dismissedDuplicates.placeId2, placeIds)
          )
        )
      }

      // Delete upload sessions for this user
      await tx.delete(uploadSessions).where(eq(uploadSessions.userId, user.id))

      // Delete main records for this user only
      await tx.delete(places).where(eq(places.userId, user.id))
      await tx.delete(sources).where(eq(sources.userId, user.id))
      await tx.delete(collections).where(eq(collections.userId, user.id))
    })

    // Clean up blobs AFTER transaction commits (best-effort)
    if (blobUrls.length > 0) {
      try {
        await del(blobUrls)
      } catch (e) {
        console.warn(`[delete-all] Failed to delete ${blobUrls.length} blobs:`, e)
      }
    }

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
