import { createHash, randomUUID } from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { forUser } from '@/lib/tenant-db';
import { isAllowedBlobUrl } from '@/lib/blob-url';
import { parseSocialLink } from '@/lib/link-import/url';
import { tiktokPageProvider, isTikTokImageCdnUrl } from '@/lib/link-import/providers/tiktok-page';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import { extensionForMimeType } from '@/lib/image-upload';
import { deleteTikTokPrivateBlob, putTikTokPrivateBlob, tikTokPrivateBlobOptions } from '@/lib/tiktok-private-blob';
import type { LinkDetails, LinkProviderResult, LinkSourceMeta, TikTokImageRef } from '@/types/link-import';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 100_000_000;
const USER_AGENT = 'TravelDreamLinkPreview/1.0 (+https://tabidreams.com)';
const CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

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

function isProviderResult(value: unknown): value is LinkProviderResult {
  return !!value && typeof value === 'object' &&
    ('details' in value || 'reason' in value || 'transient' in value || 'empty' in value);
}

function isLinkDetails(value: unknown): value is LinkDetails {
  return !!value && typeof value === 'object' &&
    !('details' in value) && !('reason' in value) && !('transient' in value) && !('empty' in value);
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
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('TikTok image is too large');
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
      throw new Error('TikTok image is too large');
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function downloadImage(ref: TikTokImageRef, fetcher: typeof fetch = fetch): Promise<ImportedImage> {
  let current = ref.url;
  for (let hop = 0; hop <= 2; hop += 1) {
    const checked = safeCdnUrl(current);
    if (!checked) throw new Error('TikTok image host is not allowed');
    const response = await fetcher(checked, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'image/jpeg,image/png,image/webp',
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? safeCdnUrl(new URL(location, checked).toString()) : null;
      if (!next || hop === 2) throw new Error('TikTok image redirect was not allowed');
      current = next.toString();
      continue;
    }
    if (!response.ok) throw new Error(`TikTok image returned HTTP ${response.status}`);
    const mimeType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!CONTENT_TYPES.has(mimeType)) throw new Error('TikTok image type is not allowed');
    const extension = extensionForMimeType(mimeType);
    if (!extension || !['jpg', 'png', 'webp'].includes(extension)) throw new Error('TikTok image type is not allowed');
    const bytes = await readImageBytes(response);
    if (bytes.byteLength === 0) throw new Error('TikTok image was empty');
    const metadata = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    const expectedFormat = extension === 'jpg' ? 'jpeg' : extension;
    if (metadata.format !== expectedFormat) throw new Error('TikTok image contents did not match its type');
    return {
      url: current,
      bytes,
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
      extension,
      ...(metadata.width ? { width: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height } : {}),
    };
  }
  throw new Error('TikTok image redirect limit reached');
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
    if (source.type !== 'url' || link?.platform !== 'tiktok' || link.kind !== 'tiktok-photo') {
      return { status: 'not-photo' };
    }
    const prior = link.tiktokPhotoImport;
    if (prior?.status === 'imported') {
      return { status: 'imported', sourceIds: prior.sourceIds ?? [], count: prior.count ?? 0 };
    }
    const requestedAt = prior?.requestedAt ? Date.parse(prior.requestedAt) : 0;
    if (prior?.status === 'importing' && Number.isFinite(requestedAt) && Date.now() - requestedAt < 10 * 60 * 1000) {
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
    if (claim.status === 'not-photo') return NextResponse.json({ error: 'This link has no TikTok photo carousel.' }, { status: 400 });
    if (claim.status === 'busy') return NextResponse.json({ error: 'Photo import is already running.' }, { status: 409 });
    if (claim.status === 'imported') {
      return NextResponse.json({ imported: claim.count, sourceIds: claim.sourceIds, alreadyImported: true });
    }
    if (claim.status !== 'claimed') return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const storedLink = claim.source.meta?.link;
    const parsed = storedLink?.canonicalUrl ? parseSocialLink(storedLink.canonicalUrl) : null;
    if (!parsed?.supported || parsed.link.platform !== 'tiktok' || parsed.link.kind !== 'tiktok-photo') {
      throw new Error('Saved TikTok photo link is invalid');
    }
    const output = await tiktokPageProvider.getDetails(parsed.link, { userId: user.id, forceRefresh: true });
    const providerResult = isProviderResult(output) ? output : undefined;
    const details = isLinkDetails(output) ? output : providerResult?.details;
    const refs = providerResult?.transient?.imageRefs ?? [];
    if (!details || providerResult?.reason) {
      const reason = providerResult?.reason;
      throw new Error(reason && reason !== 'disabled' ? `TikTok page read failed: ${reason}` : "Couldn't read TikTok.");
    }
    if (details.contentKind !== 'photo' || refs.length === 0) throw new Error('No TikTok carousel images were found');
    if (refs.length > MAX_IMAGES) throw new Error('TikTok carousel has too many images to import at once');

    const now = Date.now();
    const freshRefs = refs.filter((ref) => !ref.expiresAt || ref.expiresAt > now);
    if (freshRefs.length === 0) throw new Error('TikTok image links have expired; try again');

    const images: ImportedImage[] = [];
    let totalBytes = 0;
    for (const ref of freshRefs) {
      const image = await downloadImage(ref);
      totalBytes += image.bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('TikTok carousel is too large to import');
      images.push(image);
    }

    const handle = (details.authorHandle ?? parsed.link.handle ?? storedLink?.handle ?? '').replace(/^@/, '');
    if (!handle) throw new Error('TikTok creator handle is missing');
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
      if (!isAllowedBlobUrl(blob.url) || !blob.url.includes('.private.blob.vercel-storage.com/')) {
        if (blob.url.includes('.private.blob.vercel-storage.com/')) {
          await deleteTikTokPrivateBlob(blob.url).catch(() => undefined);
        }
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
      if (!currentParent?.meta?.link) throw new Error('Inbox link was removed during photo import');
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
    const message = error instanceof Error ? error.message : "Couldn't read TikTok.";
    console.warn('[TikTok Photo Import] Failed:', message);
    const status = /too large|too many images|type is not allowed|host is not allowed|redirect was not allowed/i.test(message) ? 422 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
