import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { forUser } from '@/lib/tenant-db';
import { parseSocialLink } from '@/lib/link-import/url';
import { isLinkDetails, isLinkProviderResult } from '@/lib/link-import/details';
import { tiktokReaderMessage } from '@/lib/inbox-link-items';
import { tiktokPageProvider, isTikTokImageCdnUrl } from '@/lib/link-import/providers/tiktok-page';
import { TIKTOK_REQUEST_TIMEOUT_MS, TIKTOK_USER_AGENT } from '@/lib/link-import/tiktok-http';
import { isTikTokPhotoImportStale } from '@/lib/link-import/tiktok-photo-import';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { extensionForMimeType } from '@/lib/image-upload';
import {
  deleteTikTokBlob,
  deleteTikTokPrivateBlob,
  isAllowedPrivateBlobUrl,
  putTikTokPrivateBlob,
  tikTokPrivateBlobOptions,
} from '@/lib/tiktok-private-blob';
import type { LinkSourceMeta, TikTokImageRef } from '@/types/link-import';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 100_000_000;
const CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const NO_CAROUSEL_MESSAGE = 'This link has no TikTok photo carousel.';
const GENERIC_FAILURE_MESSAGE = "Couldn't import these photos. Try again.";

/**
 * A failure this route raises on purpose, with copy written for the user. Any
 * other error (database, image decoder, Blob store) is logged and answered
 * with the generic message, so driver internals never reach the browser.
 */
class PhotoImportError extends Error {
  constructor(message: string, readonly status: 400 | 422 | 429 | 502) {
    super(message);
    this.name = 'PhotoImportError';
  }
}

interface ImportedImage {
  url: string;
  bytes: Buffer;
  mimeType: string;
  extension: string;
  width?: number;
  height?: number;
}

type Claim =
  | { status: 'claimed'; source: typeof sourcesCurrentSchema.$inferSelect }
  | { status: 'missing' | 'not-photo' | 'busy' }
  | { status: 'imported'; sourceIds: string[]; count: number };

/** Both post forms can carry a carousel: TikTok serves photo posts under /video/. */
function isTikTokPostKind(kind: string | undefined): boolean {
  return kind === 'tiktok-photo' || kind === 'tiktok-video';
}

function safeCdnUrl(value: string): URL | null {
  if (!isTikTokImageCdnUrl(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function readImageBytes(response: Response): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new PhotoImportError('TikTok image is too large', 422);
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new PhotoImportError('TikTok image is too large', 422);
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function downloadImage(ref: TikTokImageRef, fetcher: typeof fetch = fetch): Promise<ImportedImage> {
  let current = ref.url;
  for (let hop = 0; hop <= 2; hop += 1) {
    const checked = safeCdnUrl(current);
    if (!checked) throw new PhotoImportError('TikTok image host is not allowed', 422);
    const response = await fetcher(checked, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIKTOK_REQUEST_TIMEOUT_MS),
      headers: {
        'user-agent': TIKTOK_USER_AGENT,
        accept: 'image/jpeg,image/png,image/webp',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? safeCdnUrl(new URL(location, checked).toString()) : null;
      if (!next || hop === 2) throw new PhotoImportError('TikTok image redirect was not allowed', 422);
      current = next.toString();
      continue;
    }
    if (!response.ok) throw new PhotoImportError(`TikTok image returned HTTP ${response.status}`, 502);
    const mimeType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!CONTENT_TYPES.has(mimeType)) throw new PhotoImportError('TikTok image type is not allowed', 422);
    const extension = extensionForMimeType(mimeType);
    if (!extension || !['jpg', 'png', 'webp'].includes(extension)) throw new PhotoImportError('TikTok image type is not allowed', 422);
    const bytes = await readImageBytes(response);
    if (bytes.byteLength === 0) throw new PhotoImportError('TikTok image was empty', 502);
    // Bytes the decoder cannot read are a mismatch too, not an internal error.
    const metadata = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata().catch(() => null);
    const expectedFormat = extension === 'jpg' ? 'jpeg' : extension;
    if (!metadata || metadata.format !== expectedFormat) throw new PhotoImportError('TikTok image contents did not match its type', 502);
    return {
      url: current,
      bytes,
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
      extension,
      ...(metadata.width ? { width: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height } : {}),
    };
  }
  throw new PhotoImportError('TikTok image redirect limit reached', 502);
}

function scheduleQueue(): void {
  try {
    after(async () => {
      try {
        await dispatchProcessors('tiktok-photo-import', 'grow');
      } catch (error) {
        console.error('[TikTok Photo Import] Failed to trigger queue:', error);
      }
    });
  } catch (error) {
    console.error('[TikTok Photo Import] Could not schedule queue trigger:', error);
  }
}

async function setImportState(
  userId: string,
  sourceId: string,
  state: NonNullable<LinkSourceMeta['tiktokPhotoImport']>,
): Promise<void> {
  const tdb = forUser(userId);
  const [source] = await tdb.select(sourcesCurrentSchema, eq(sourcesCurrentSchema.id, sourceId)).limit(1);
  if (!source?.meta?.link) return;
  await tdb.update(
    sourcesCurrentSchema,
    {
      meta: {
        ...source.meta,
        link: { ...source.meta.link, tiktokPhotoImport: state },
      },
      updatedAt: new Date().toISOString(),
    },
    eq(sourcesCurrentSchema.id, sourceId),
  );
}

async function claimImport(userId: string, sourceId: string): Promise<Claim> {
  const tdb = forUser(userId);
  return tdb.transaction(async (tx) => {
    const [source] = await tx.select(sourcesCurrentSchema, eq(sourcesCurrentSchema.id, sourceId)).limit(1);
    if (!source) return { status: 'missing' };
    const link = source.meta?.link;
    // TikTok serves a photo post under its /video/ id, so the saved URL alone
    // cannot tell a carousel from a video: the fresh page read decides.
    if (source.type !== 'url' || link?.platform !== 'tiktok' || !isTikTokPostKind(link.kind)) {
      return { status: 'not-photo' };
    }
    const prior = link.tiktokPhotoImport;
    if (prior?.status === 'imported') {
      return { status: 'imported', sourceIds: prior.sourceIds ?? [], count: prior.count ?? 0 };
    }
    if (prior?.status === 'importing' && !isTikTokPhotoImportStale(prior.requestedAt, Date.now())) {
      return { status: 'busy' };
    }

    await tx.update(sourcesCurrentSchema, {
      meta: {
        ...source.meta,
        link: {
          ...link,
          tiktokPhotoImport: { status: 'importing', requestedAt: new Date().toISOString() },
        },
      },
      updatedAt: new Date().toISOString(),
    }, eq(sourcesCurrentSchema.id, sourceId));
    return { status: 'claimed', source };
  });
}

function userKey(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 24);
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ sourceId: string }> },
) {
  let claim: Claim | undefined;
  let uploadedUrls: string[] = [];
  let userId: string | undefined;
  let sourceId: string | undefined;
  try {
    const user = await requireAuthForApi();
    userId = user.id;
    ({ sourceId } = await context.params);
    if (!sourceId || sourceId.length > 128) {
      return NextResponse.json({ error: 'Invalid Inbox link' }, { status: 400 });
    }
    const requestedSourceId = sourceId;
    if (process.env.TIKTOK_PAGE_FETCH_ENABLED !== 'true') {
      return NextResponse.json({ error: "Couldn't read TikTok while the page reader is off." }, { status: 503 });
    }
    if (!tikTokPrivateBlobOptions()) {
      return NextResponse.json({ error: 'Private photo storage is not configured.' }, { status: 503 });
    }

    claim = await claimImport(user.id, requestedSourceId);
    if (claim.status === 'missing') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (claim.status === 'not-photo') return NextResponse.json({ error: NO_CAROUSEL_MESSAGE }, { status: 400 });
    if (claim.status === 'busy') return NextResponse.json({ error: 'Photo import is already running.' }, { status: 409 });
    if (claim.status === 'imported') {
      return NextResponse.json({ imported: claim.count, sourceIds: claim.sourceIds, alreadyImported: true });
    }
    if (claim.status !== 'claimed') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const storedLink = claim.source.meta?.link;
    const parsed = storedLink?.canonicalUrl ? parseSocialLink(storedLink.canonicalUrl) : null;
    if (!parsed?.supported || parsed.link.platform !== 'tiktok' || !isTikTokPostKind(parsed.link.kind)) {
      throw new PhotoImportError(NO_CAROUSEL_MESSAGE, 400);
    }
    const output = await tiktokPageProvider.getDetails(parsed.link, {
      userId: user.id,
      forceRefresh: true,
      waitForSlot: true,
    });
    const providerResult = isLinkProviderResult(output) ? output : undefined;
    const details = isLinkDetails(output) ? output : providerResult?.details;
    const refs = providerResult?.transient?.imageRefs ?? [];
    if (!details || providerResult?.reason) {
      const reason = providerResult?.reason;
      if (reason) console.warn('[TikTok Photo Import] Page read failed:', reason);
      // A spent daily allowance is not a transient failure: say so plainly and
      // answer 429 so the tap is not retried until the window rolls. The link
      // itself stays saved, so nothing is lost by not queueing the import.
      throw new PhotoImportError(
        tiktokReaderMessage(reason, false) ?? "Couldn't read TikTok.",
        reason === 'daily_limit' ? 429 : 502,
      );
    }
    if (details.contentKind !== 'photo' || refs.length === 0) throw new PhotoImportError(NO_CAROUSEL_MESSAGE, 400);
    if (refs.length > MAX_IMAGES) throw new PhotoImportError('TikTok carousel has too many images to import at once', 422);

    const now = Date.now();
    const freshRefs = refs.filter((ref) => !ref.expiresAt || ref.expiresAt > now);
    if (freshRefs.length === 0) throw new PhotoImportError('TikTok image links have expired; try again', 502);

    const images: ImportedImage[] = [];
    let totalBytes = 0;
    for (const ref of freshRefs) {
      const image = await downloadImage(ref);
      totalBytes += image.bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new PhotoImportError('TikTok carousel is too large to import', 422);
      images.push(image);
    }

    const handle = (details.authorHandle ?? parsed.link.handle ?? storedLink?.handle ?? '').replace(/^@/, '');
    if (!handle) throw new PhotoImportError('TikTok creator handle is missing', 502);
    const postUrl = storedLink?.canonicalUrl ?? parsed.link.canonicalUrl;
    const ids = images.map(() => `src_${randomUUID()}`);
    const rows: Array<Omit<typeof sourcesCurrentSchema.$inferInsert, 'userId'>> = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const filename = `@${handle}-${parsed.link.postId}-${index + 1}.${image.extension}`;
      const blob = await putTikTokPrivateBlob(
        `tiktok-imports/${userKey(user.id)}/${parsed.link.postId}/${index + 1}.${image.extension}`,
        image.bytes,
        image.mimeType,
      );
      if (!isAllowedPrivateBlobUrl(blob.url)) {
        // A misconfigured store can answer with a public URL: remove the upload
        // so the user's photos are not left behind in a bucket they cannot see.
        // This is one of the two places private-store URLs are accepted; the
        // public allow-list in `src/lib/blob-url.ts` never admits them.
        await deleteTikTokBlob(blob.url).catch((cleanupError) => {
          console.warn('[TikTok Photo Import] Failed to remove an image from a non-private store:', cleanupError);
        });
        throw new Error('Private Blob destination was not allowed');
      }
      uploadedUrls.push(blob.url);
      const createdAt = new Date().toISOString();
      rows.push({
        id: ids[index],
        type: 'screenshot',
        uri: blob.url,
        hash: { sha1: createHash('sha1').update(image.bytes).digest('hex') },
        ocrText: null,
        lang: 'en',
        meta: {
          url: postUrl,
          title: details.title,
          author: `@${handle}`,
          platform: 'TikTok',
          filename,
          size: image.bytes.byteLength,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          uploadInfo: {
            originalName: filename,
            fileSize: image.bytes.byteLength,
            mimeType: image.mimeType,
            storageType: 'vercel-blob',
            uploadedAt: createdAt,
          },
          tiktokPhotoImport: {
            postId: parsed.link.postId ?? '',
            postUrl,
            handle,
            index,
          },
        },
        createdAt,
        updatedAt: createdAt,
        processingStatus: 'queued',
        processingAttempts: 0,
        processingInterruptions: 0,
        processingError: null,
        processingStartedAt: null,
        processingLeaseId: null,
        nextAttemptAt: null,
      });
    }

    const tdb = forUser(user.id);
    await tdb.transaction(async (tx) => {
      const [currentParent] = await tx.select(sourcesCurrentSchema, eq(sourcesCurrentSchema.id, requestedSourceId)).limit(1);
      if (!currentParent?.meta?.link) throw new PhotoImportError('Inbox link was removed during photo import', 502);
      await tx.insertMany(sourcesCurrentSchema, rows);
      await tx.update(sourcesCurrentSchema, {
        meta: {
          ...currentParent.meta,
          link: {
            ...currentParent.meta.link,
            tiktokPhotoImport: { status: 'imported', requestedAt: new Date().toISOString(), sourceIds: ids, count: ids.length },
          },
        },
        updatedAt: new Date().toISOString(),
      }, eq(sourcesCurrentSchema.id, requestedSourceId));
    });

    uploadedUrls = [];
    scheduleQueue();
    return NextResponse.json({ imported: ids.length, sourceIds: ids });
  } catch (error) {
    if (uploadedUrls.length > 0) {
      await Promise.all(uploadedUrls.map((url) => deleteTikTokPrivateBlob(url).catch((cleanupError) => {
        console.warn('[TikTok Photo Import] Failed to remove unregistered private image:', cleanupError);
      })));
    }
    if (claim?.status === 'claimed' && userId && sourceId) {
      await setImportState(userId, sourceId, { status: 'failed', requestedAt: new Date().toISOString() }).catch(() => undefined);
    }
    if (isAuthError(error)) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof PhotoImportError) {
      console.warn('[TikTok Photo Import] Failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[TikTok Photo Import] Unexpected failure:', error);
    return NextResponse.json({ error: GENERIC_FAILURE_MESSAGE }, { status: 502 });
  }
}
