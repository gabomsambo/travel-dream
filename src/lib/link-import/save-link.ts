import 'server-only';
import { after } from 'next/server';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { sourcesToPlaces } from '@/db/schema';
import { forUser, type TenantDb } from '@/lib/tenant-db';
import { parseSocialLink } from '@/lib/link-import/url';
import { resolveTikTokShortLink } from '@/lib/link-import/resolve-short-link';
import { enrichLinkDetails } from '@/lib/link-import/details';
import { extractionContext } from '@/lib/link-import/extraction-context';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import type {
  CanonicalSocialLink,
  LinkDetails,
  LinkProviderRecord,
  LinkResolution,
  LinkSourceMeta,
} from '@/types/link-import';

/**
 * Saving one shared TikTok or Instagram link into a user's Inbox queue.
 *
 * Every way a link comes in goes through `saveSocialLink`: the Inbox's own
 * Save-a-link form (`POST /api/inbox/links`, session), the iPhone Shortcut
 * (`POST /api/share/links`, personal share token) and the Android/desktop
 * share sheet (`GET /share-target`, session). Callers authenticate first and
 * pass the user id; everything here is scoped through `forUser(userId)`.
 */

type SourceRow = typeof sourcesCurrentSchema.$inferSelect;
type SourceMeta = NonNullable<SourceRow['meta']>;
type ScopedDb = Omit<TenantDb, 'findOwned' | 'transaction'> | Parameters<
  Parameters<TenantDb['transaction']>[0]
>[0];

export interface SavedLinkSource {
  id: string;
  uri: string;
  meta: unknown;
}

export type SaveLinkResult =
  | { ok: true; source: SavedLinkSource; duplicate: boolean }
  | { ok: false; reason: 'unsupported' };

export const UNSUPPORTED_LINK_MESSAGE =
  'Paste a TikTok or Instagram post, reel, place, or share link.';

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
    sql`EXISTS (
      SELECT 1 FROM json_each(json_extract(${sourcesCurrentSchema.meta}, '$.link.aliasUrls')) AS alias
      WHERE alias.value = ${url}
    )`,
  ]);
  return or(...clauses);
}

function mergeAliasUrls(
  prior: LinkSourceMeta | undefined,
  candidates: string[],
  originalUrl: string,
  canonicalUrl: string,
): string[] | undefined {
  const identityUrls = new Set([originalUrl, canonicalUrl]);
  const merged = new Set<string>();
  for (const url of prior?.aliasUrls ?? []) {
    if (!identityUrls.has(url)) merged.add(url);
  }
  for (const url of candidates) {
    if (!identityUrls.has(url)) merged.add(url);
  }
  return merged.size > 0 ? [...merged] : undefined;
}

/** Fill gaps only — prior non-empty fields win, matching mergeLinkDetails. */
function fillLinkDetails(prior: LinkDetails | undefined, next: LinkDetails): LinkDetails {
  const merged: LinkDetails = {};
  for (const source of [prior, next]) {
    if (!source) continue;
    for (const key of Object.keys(source) as Array<keyof LinkDetails>) {
      const value = source[key];
      if (value && !merged[key]) Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

function providerHasDetails(record: LinkProviderRecord): boolean {
  return record.status === 'ok' && Boolean(record.details && Object.keys(record.details).length > 0);
}

/** Keep richer successful provider history across duplicate refreshes. */
function mergeProviderHistory(
  prior: LinkProviderRecord[] | undefined,
  next: LinkProviderRecord[],
): LinkProviderRecord[] {
  if (!prior?.length) return next;
  if (!next.length) return prior;

  const byName = new Map<string, LinkProviderRecord>();
  for (const record of prior) byName.set(record.provider, record);
  for (const record of next) {
    const existing = byName.get(record.provider);
    if (!existing) {
      byName.set(record.provider, record);
      continue;
    }
    if (providerHasDetails(existing) && !providerHasDetails(record)) continue;
    if (providerHasDetails(existing) && providerHasDetails(record)) {
      byName.set(record.provider, {
        ...record,
        details: fillLinkDetails(existing.details, record.details ?? {}),
        status: 'ok',
        ...(existing.cachedResponse && !record.cachedResponse
          ? { cachedResponse: existing.cachedResponse }
          : {}),
      });
      continue;
    }
    byName.set(record.provider, record);
  }

  const names = [...new Set([...prior.map((r) => r.provider), ...next.map((r) => r.provider)])];
  return names.map((name) => byName.get(name)!);
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
  const originalUrl = prior?.originalUrl ?? parsed.originalUrl;
  const aliasUrls = mergeAliasUrls(
    prior,
    [parsed.originalUrl, parsed.canonicalUrl, link.originalUrl, link.canonicalUrl],
    originalUrl,
    canonicalUrl,
  );
  const mergedDetails = fillLinkDetails(prior?.details, details);

  return {
    originalUrl,
    canonicalUrl,
    ...(aliasUrls ? { aliasUrls } : {}),
    platform: link.platform,
    kind,
    ...(handle ? { handle } : {}),
    ...(postId ? { postId } : {}),
    ...(placeId ? { placeId } : {}),
    ...(placeName ? { placeName } : {}),
    needsResolution,
    resolution: nextResolution,
    ...(captionText ? { captionText } : {}),
    ...(Object.keys(mergedDetails).length > 0 ? { details: mergedDetails } : {}),
    providers: mergeProviderHistory(prior?.providers, providers),
    ...(prior?.tiktokPhotoImport ? { tiktokPhotoImport: prior.tiktokPhotoImport } : {}),
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
  const enrichment = await enrichLinkDetails(link, undefined, { userId: tdb.userId });
  const details = enrichment.details;
  const priorMeta = (existing.meta ?? {}) as SourceMeta;
  const priorLink = priorMeta.link;
  const priorCaption = priorLink?.captionText;
  const mergedCaption = caption || priorCaption || details.caption;
  const hasPlaces = await sourceHasLinkedPlaces(tdb, existing.id);
  const requeue = shouldRequeueExisting(
    existing.processingStatus,
    priorCaption,
    mergedCaption,
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
  const mergedDetails = metaLink.details;
  const preserveResolvedIdentity =
    link.needsResolution &&
    priorLink != null &&
    priorLink.needsResolution === false &&
    priorLink.kind !== 'tiktok-short';
  let nextMeta: SourceMeta = {
    ...priorMeta,
    url: preserveResolvedIdentity ? priorLink.canonicalUrl : link.canonicalUrl,
    platform: link.platform,
    ...(mergedDetails?.title ? { title: mergedDetails.title } : {}),
    ...(mergedDetails?.author || link.handle || priorMeta.author
      ? {
          author:
            mergedDetails?.author ??
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
  const ocrText = extractionContext(contextLink, mergedCaption, mergedDetails);
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

/**
 * Save `url` (and an optional pasted caption) as a queued `type: 'url'` source
 * for `userId`, or refresh the existing source for the same post. Throws only
 * on an unexpected failure; an unsupported URL is a result, not an error.
 */
export async function saveSocialLink(
  userId: string,
  input: { url: string; caption?: string },
): Promise<SaveLinkResult> {
  const parsedLink = parseSocialLink(input.url);
  if (!parsedLink.supported) return { ok: false, reason: 'unsupported' };

  let link = parsedLink.link;
  let resolution: LinkResolution = link.needsResolution
    ? { status: 'unresolved', error: 'not-canonical' }
    : { status: 'not-needed' };
  if (link.needsResolution) {
    const resolved = await resolveTikTokShortLink(link);
    link = resolved.link;
    resolution = resolved.resolution;
  }

  const caption = input.caption?.trim() || undefined;
  const tdb = forUser(userId);
  const urls = candidateUris(parsedLink.link, link);
  const existing = await findExistingLink(tdb, urls, link.postId);
  if (existing) {
    const refreshed = await refreshExistingLink(tdb, existing, parsedLink.link, link, resolution, caption);
    if (refreshed.requeued) scheduleProcessing();
    return { ok: true, source: refreshed.source, duplicate: true };
  }

  const enrichment = await enrichLinkDetails(link, undefined, { userId });
  const details = enrichment.details;
  const effectiveCaption = caption || details.caption;
  const metaLink = buildLinkMeta(
    parsedLink.link,
    link,
    resolution,
    effectiveCaption,
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
  const ocrText = extractionContext(link, effectiveCaption, details);
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
    const refreshed = await refreshExistingLink(tdb, saved.source, parsedLink.link, link, resolution, caption);
    if (refreshed.requeued) scheduleProcessing();
    return { ok: true, source: refreshed.source, duplicate: true };
  }

  scheduleProcessing();
  return { ok: true, source: saved.source, duplicate: false };
}
