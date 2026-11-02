import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or, sql } from 'drizzle-orm';
import { attachments, collections } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { forUser } from '@/lib/tenant-db';
import { isAllowedBlobUrl } from '@/lib/blob-url';
import { getTikTokPrivateBlob, isPrivateBlobUrl, tikTokPrivateBlobOptions } from '@/lib/tiktok-private-blob';

export const runtime = 'nodejs';

/** Stream a private TikTok import only when the current user owns a reference to it. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const blobUrl = request.nextUrl.searchParams.get('url')?.trim();
    if (!blobUrl || blobUrl.length > 2048 || !isAllowedBlobUrl(blobUrl) || !isPrivateBlobUrl(blobUrl)) {
      return NextResponse.json({ error: 'Invalid private Blob URL' }, { status: 400 });
    }

    const tdb = forUser(user.id);
    const [source] = await tdb.select(
      sourcesCurrentSchema,
      and(
        eq(sourcesCurrentSchema.type, 'screenshot'),
        or(
          eq(sourcesCurrentSchema.uri, blobUrl),
          sql`json_extract(${sourcesCurrentSchema.meta}, '$.massUpload.thumbnailUrl') = ${blobUrl}`,
          sql`json_extract(${sourcesCurrentSchema.meta}, '$.uploadInfo.thumbnailPath') = ${blobUrl}`,
        ),
      ),
    ).limit(1);
    const [attachment] = await tdb.selectVia(
      attachments,
      or(eq(attachments.uri, blobUrl), eq(attachments.thumbnailUri, blobUrl)),
    ).limit(1);
    const [collection] = await tdb.select(
      collections,
      eq(collections.coverImageUrl, blobUrl),
    ).limit(1);

    if (!source && !attachment && !collection) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!tikTokPrivateBlobOptions()) {
      return NextResponse.json({ error: 'Private image storage unavailable' }, { status: 503 });
    }

    const blob = await getTikTokPrivateBlob(blobUrl, request.headers.get('if-none-match'));
    if (!blob) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (blob.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: blob.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': blob.blob.contentType,
        'Content-Length': String(blob.blob.size),
        'ETag': blob.blob.etag,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Cookie',
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[photos/private] error:', error);
    return NextResponse.json({ error: 'Private image unavailable' }, { status: 502 });
  }
}
