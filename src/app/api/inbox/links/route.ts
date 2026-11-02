import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { sourcesToPlaces } from '@/db/schema';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { forUser, type TenantDb } from '@/lib/tenant-db';
import { parseSocialLink } from '@/lib/link-import/url';
import { resolveTikTokShortLink } from '@/lib/link-import/resolve-short-link';
import { enrichLinkDetails } from '@/lib/link-import/details';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import type {
  CanonicalSocialLink,
  LinkDetails,
  LinkProviderRecord,
  LinkResolution,
  LinkSourceMeta,
} from '@/types/link-import';

export const runtime = 'nodejs';

const SaveLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  caption: z.string().max(8_000).optional(),
});

const MAX_EXTRACTION_CONTEXT = 10_000;

type SourceRow = typeof sourcesCurrentSchema.$inferSelect;
type SourceMeta = NonNullable<SourceRow['meta']>;
type ScopedDb = Omit<TenantDb, 'findOwned' | 'transaction'> | Parameters<
  Parameters<TenantDb['transaction']>[0]
>[0];

function extractionContext(
  link: CanonicalSocialLink,
  caption: string | undefined,
  details: LinkDetails | undefined,
): string {
  const lines = [
    `Social link: ${link.canonicalUrl}`,
    `Platform: ${link.platform}; content type: ${link.kind}`,
    link.placeName || details?.placeName ? `Place mentioned in link: ${link.placeName ?? details?.placeName}` : '',
    link.handle ? `Creator handle: @${link.handle}` : '',
    details?.author && details.author !== `@${link.handle}` ? `Creator: ${details.author}` : '',
    details?.title ? `Post title: ${details.title}` : '',
    caption ? `Pasted caption:\n${caption}` : '',
  ].filter(Boolean);
  return lines.join('\n').slice(0, MAX_EXTRACTION_CONTEXT);
}

function sourceResponse(source: { id: string; uri: string; meta: unknown }, duplicate: boolean, status: number) {
  return NextResponse.json(
    { status: 'success', sourceId: source.id, url: source.uri, meta: source.meta, duplicate },
    { status },
  );
}

function scheduleProcessing(): void {
  try {
    after(async () => {
      try {
        await dispatchProcessors('link-save', 'grow');
      } catch (error) {
        console.error('[Inbox Links] Failed to trigger processing:', error);
      }
    });
  } catch (error) {
    // The queue cron is the safety net if this response has no after() scope.
    console.error('[Inbox Links] Could not schedule processing trigger:', error);
  }
}

function candidateUris(parsed: CanonicalSocialLink, link: CanonicalSocialLink): string[] {
  return [...new Set([link.canonicalUrl, link.originalUrl, parsed.canonicalUrl, parsed.originalUrl])];
}

function metaUrlMatch(candidateUrls: string[]) {
  const clauses = candidateUrls.flatMap((url) => [
    sql`json_extract(${sourcesCurrentSchema.meta}, '$.link.originalUrl') = ${url}`,
    sql`json_extract(${sourcesCurrentSchema.meta}, '$.link.canonicalUrl') = ${url}`,
  ]);
  return or(...clauses);
}

function existingLinkMatch(candidateUrls: string[], postId: string | undefined) {
  const uriOrMetaMatch = and(
    eq(sourcesCurrentSchema.type, 'url'),
    or(
      inArray(sourcesCurrentSchema.uri, candidateUrls),
      metaUrlMatch(candidateUrls),
    ),
  );
  // A short link that is still unresolved has no postId. Pasting the canonical
  // /@user/video/<id> (or /photo/<id>) URL in that window may create a second
  // source for the same post; we accept that rather than adding background
  // resolution machinery.
  if (!postId) return uriOrMetaMatch;
  return or(
    uriOrMetaMatch,
    and(
      eq(sourcesCurrentSchema.type, 'url'),
      sql`json_extract(${sourcesCurrentSchema.meta}, '$.link.postId') = ${postId}`,
    ),
  );
}

function buildLinkMeta(
  parsed: CanonicalSocialLink,
  link: CanonicalSocialLink,
  resolution: LinkResolution,
  caption: string | undefined,
  details: LinkDetails,
  providers: LinkProviderRecord[],
  prior?: LinkSourceMeta,
): LinkSourceMeta {
  const captionText = caption || prior?.captionText;
  const preserveResolvedIdentity =
    link.needsResolution &&
    prior != null &&
    prior.needsResolution === false &&
    prior.kind !== 'tiktok-short';

  const canonicalUrl = preserveResolvedIdentity ? prior.canonicalUrl : link.canonicalUrl;
  const kind = preserveResolvedIdentity ? prior.kind : link.kind;
  const needsResolution = preserveResolvedIdentity ? prior.needsResolution : link.needsResolution;
  const nextResolution = preserveResolvedIdentity ? prior.resolution : resolution;
  const placeName = preserveResolvedIdentity
    ? prior.placeName ?? link.placeName ?? details.placeName
    : link.placeName ?? details.placeName ?? prior?.placeName;
  const handle = preserveResolvedIdentity
    ? prior.handle ?? link.handle
    : link.handle ?? prior?.handle;
  const postId = preserveResolvedIdentity
    ? prior.postId ?? link.postId
    : link.postId ?? prior?.postId;
  const placeId = preserveResolvedIdentity
    ? prior.placeId ?? link.placeId
    : link.placeId ?? prior?.placeId;

  return {
    originalUrl: prior?.originalUrl ?? parsed.originalUrl,
    canonicalUrl,
    platform: link.platform,
    kind,
    ...(handle ? { handle } : {}),
    ...(postId ? { postId } : {}),
    ...(placeId ? { placeId } : {}),
    ...(placeName ? { placeName } : {}),
    needsResolution,
    resolution: nextResolution,
    ...(captionText ? { captionText } : {}),
    ...(Object.keys(details).length > 0 ? { details } : prior?.details ? { details: prior.details } : {}),
    providers: providers.length > 0 ? providers : prior?.providers ?? [],
  };
}

function metaWithoutCachedExtraction(meta: SourceMeta): SourceMeta {
  if (!meta.massUpload) return meta;
  const { extraction: _extraction, extractedAt: _extractedAt, ...kept } = meta.massUpload;
  if (Object.keys(kept).length === 0) {
    const { massUpload: _massUpload, ...rest } = meta;
    return rest;
  }
  return { ...meta, massUpload: kept };
}

function shouldRequeueExisting(
  status: string | null | undefined,
  priorCaption: string | undefined,
  caption: string | undefined,
  hasPlaces: boolean,
): boolean {
  if (status === 'failed' || status === 'stalled') return true;
  if (status === 'completed' && !hasPlaces) return true;
  const captionChanged = Boolean(caption) && caption !== priorCaption;
  if (captionChanged) return true;
  return false;
}

async function findExistingLink(
  db: ScopedDb,
  candidateUrls: string[],
  postId: string | undefined,
): Promise<SourceRow | undefined> {
  const [row] = await db.select(sourcesCurrentSchema, existingLinkMatch(candidateUrls, postId)).limit(1);
  return row;
}

async function sourceHasLinkedPlaces(db: ScopedDb, sourceId: string): Promise<boolean> {
  const [row] = await db
    .selectVia(sourcesToPlaces, eq(sourcesToPlaces.sourceId, sourceId))
    .limit(1);
  return Boolean(row);
}

async function refreshExistingLink(
  tdb: TenantDb,
  existing: SourceRow,
  parsed: CanonicalSocialLink,
  link: CanonicalSocialLink,
  resolution: LinkResolution,
  caption: string | undefined,
): Promise<{ source: SourceRow; requeued: boolean }> {
  const enrichment = await enrichLinkDetails(link);
  const details = enrichment.details;
  const priorMeta = (existing.meta ?? {}) as SourceMeta;
  const priorLink = priorMeta.link;
  const priorCaption = priorLink?.captionText;
  const mergedCaption = caption || priorCaption;
  const hasPlaces = await sourceHasLinkedPlaces(tdb, existing.id);
  const requeue = shouldRequeueExisting(
    existing.processingStatus,
    priorCaption,
    caption,
    hasPlaces,
  );
  const metaLink = buildLinkMeta(
    parsed,
    link,
    resolution,
    mergedCaption,
    details,
    enrichment.providers,
    priorLink,
  );
  const preserveResolvedIdentity =
    link.needsResolution &&
    priorLink != null &&
    priorLink.needsResolution === false &&
    priorLink.kind !== 'tiktok-short';
  let nextMeta: SourceMeta = {
    ...priorMeta,
    url: preserveResolvedIdentity ? priorLink.canonicalUrl : link.canonicalUrl,
    platform: link.platform,
    ...(details.title ? { title: details.title } : {}),
    ...(details.author || link.handle || priorMeta.author
      ? {
          author:
            details.author ??
            (preserveResolvedIdentity && priorMeta.author
              ? priorMeta.author
              : link.handle
                ? `@${link.handle}`
                : priorMeta.author),
        }
      : {}),
    link: metaLink,
  };
  if (requeue) nextMeta = metaWithoutCachedExtraction(nextMeta);

  const nextUri = link.needsResolution
    ? existing.uri
    : link.canonicalUrl;
  const contextLink: CanonicalSocialLink = preserveResolvedIdentity
    ? {
        ...link,
        canonicalUrl: priorLink.canonicalUrl,
        kind: priorLink.kind,
        needsResolution: false,
        ...(priorLink.handle ? { handle: priorLink.handle } : {}),
        ...(priorLink.postId ? { postId: priorLink.postId } : {}),
        ...(priorLink.placeId ? { placeId: priorLink.placeId } : {}),
        ...(priorLink.placeName ? { placeName: priorLink.placeName } : {}),
      }
    : link;
  const ocrText = extractionContext(contextLink, mergedCaption, details);
  const now = new Date().toISOString();

  const [updated] = await tdb.update(
    sourcesCurrentSchema,
    {
      uri: nextUri,
      ocrText,
      meta: nextMeta,
      updatedAt: now,
      ...(requeue
        ? {
            processingStatus: 'queued' as const,
            processingAttempts: 0,
            processingInterruptions: 0,
            processingError: null,
            processingStartedAt: null,
            processingLeaseId: null,
            nextAttemptAt: null,
          }
        : {}),
    },
    eq(sourcesCurrentSchema.id, existing.id),
  ).returning();

  return { source: updated ?? { ...existing, uri: nextUri, ocrText, meta: nextMeta }, requeued: requeue };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthForApi();
    const parsedBody = SaveLinkSchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid input', errors: parsedBody.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const parsedLink = parseSocialLink(parsedBody.data.url);
    if (!parsedLink.supported) {
      return NextResponse.json(
        { status: 'error', message: 'Paste a TikTok or Instagram post, reel, place, or share link.' },
        { status: 400 },
      );
    }

    let link = parsedLink.link;
    let resolution: LinkResolution = link.needsResolution
      ? { status: 'unresolved', error: 'not-canonical' }
      : { status: 'not-needed' };
    if (link.needsResolution) {
      const resolved = await resolveTikTokShortLink(link);
      link = resolved.link;
      resolution = resolved.resolution;
    }

    const tdb = forUser(user.id);
    const urls = candidateUris(parsedLink.link, link);
    const existing = await findExistingLink(tdb, urls, link.postId);
    if (existing) {
      const refreshed = await refreshExistingLink(
        tdb,
        existing,
        parsedLink.link,
        link,
        resolution,
        parsedBody.data.caption?.trim() || undefined,
      );
      if (refreshed.requeued) scheduleProcessing();
      return sourceResponse(refreshed.source, true, 200);
    }

    const caption = parsedBody.data.caption?.trim() || undefined;
    const enrichment = await enrichLinkDetails(link);
    const details = enrichment.details;
    const metaLink = buildLinkMeta(
      parsedLink.link,
      link,
      resolution,
      caption,
      details,
      enrichment.providers,
    );
    const meta: SourceMeta = {
      url: link.canonicalUrl,
      platform: link.platform,
      ...(details.title ? { title: details.title } : {}),
      ...(details.author || link.handle ? { author: details.author ?? `@${link.handle}` } : {}),
      link: metaLink,
    };
    const ocrText = extractionContext(link, caption, details);
    const sourceId = `src_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const saved = await tdb.transaction(async (tx) => {
      const concurrent = await findExistingLink(tx, urls, link.postId);
      if (concurrent) return { source: concurrent, duplicate: true as const };
      const [source] = await tx.insert(sourcesCurrentSchema, {
        id: sourceId,
        type: 'url',
        uri: link.canonicalUrl,
        hash: null,
        ocrText,
        lang: 'en',
        meta,
        createdAt: now,
        updatedAt: now,
        processingStatus: 'queued',
        processingAttempts: 0,
        processingInterruptions: 0,
        processingError: null,
        processingStartedAt: null,
        processingLeaseId: null,
        nextAttemptAt: null,
      }).returning();
      return { source, duplicate: false as const };
    });

    if (saved.duplicate) {
      const refreshed = await refreshExistingLink(
        tdb,
        saved.source,
        parsedLink.link,
        link,
        resolution,
        caption,
      );
      if (refreshed.requeued) scheduleProcessing();
      return sourceResponse(refreshed.source, true, 200);
    }

    scheduleProcessing();
    return sourceResponse(saved.source, false, 201);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[Inbox Links] Error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Could not save this link. Please try again.' },
      { status: 500 },
    );
  }
}
