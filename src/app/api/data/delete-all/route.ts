import { NextResponse } from 'next/server'
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers'
// TODO(tenant-db): migrate to `forUser(user.id)` from '@/lib/tenant-db'.
// Not migrated in the change that introduced the accessor: one transaction
// over five owned tables; needs `tdb.transaction` plus a delete for each.
// Small, and a good next one to take.
// See AGENTS.md § Multi-Tenancy for the rule this exemption suspends.
// eslint-disable-next-line no-restricted-imports -- unmigrated; see the TODO above
import { db } from '@/db'
import { eq, inArray, or, sql } from 'drizzle-orm'
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
import { isAllowedBlobUrl } from '@/lib/blob-url'
import { deleteTikTokPrivateBlobs, isPrivateBlobUrl } from '@/lib/tiktok-private-blob'

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

      // Get all source URIs for this user, plus the thumbnails their meta names
      const userSources = await tx
        .select({
          id: sources.id,
          uri: sources.uri,
          massUploadThumbnail: sql<string | null>`json_extract(${sources.meta}, '$.massUpload.thumbnailUrl')`,
          uploadInfoThumbnail: sql<string | null>`json_extract(${sources.meta}, '$.uploadInfo.thumbnailPath')`,
        })
        .from(sources)
        .where(eq(sources.userId, user.id))
      // A thumbnail is recorded in the source meta, and the attachment carries
      // it only when the source created a new place: a photo linked to an
      // existing place is named by the source row alone.
      blobUrls.push(
        ...userSources
          .flatMap((s) => [s.uri, s.massUploadThumbnail, s.uploadInfoThumbnail])
          .filter((u): u is string => !!u && u.startsWith('https://'))
      )

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

    // Clean up blobs AFTER transaction commits (best-effort, one request per store)
    const uniqueUrls = [...new Set(blobUrls)]
    const privateUrls = uniqueUrls.filter((url) => isPrivateBlobUrl(url))
    const publicUrls = uniqueUrls.filter((url) => !isPrivateBlobUrl(url) && isAllowedBlobUrl(url))

    if (publicUrls.length > 0) {
      try {
        await del(publicUrls)
      } catch (error) {
        console.warn(`[delete-all] Public blob cleanup failed (${publicUrls.length} URLs)`, error)
      }
    }

    if (privateUrls.length > 0) {
      try {
        const outcome = await deleteTikTokPrivateBlobs(privateUrls)
        if (outcome.status === 'skipped') {
          console.warn(`[delete-all] Skipped private TikTok blob cleanup (${outcome.count} URLs): ${outcome.reason}`)
        }
      } catch (error) {
        console.warn(`[delete-all] Private TikTok blob cleanup failed (${privateUrls.length} URLs)`, error)
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
