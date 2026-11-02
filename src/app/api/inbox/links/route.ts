import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { forUser } from '@/lib/tenant-db';
import { parseSocialLink } from '@/lib/link-import/url';
import { resolveTikTokShortLink } from '@/lib/link-import/resolve-short-link';
import { enrichLinkDetails } from '@/lib/link-import/details';
import { dispatchProcessors } from '@/lib/mass-upload/dispatch';
import type { CanonicalSocialLink, LinkResolution, LinkSourceMeta } from '@/types/link-import';

export const runtime = 'nodejs';

const SaveLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  caption: z.string().max(8_000).optional(),
});

const MAX_EXTRACTION_CONTEXT = 10_000;

function extractionContext(
  link: CanonicalSocialLink,
  caption: string | undefined,
  details: LinkSourceMeta['details'],
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
    const sameCanonicalLink = and(
      eq(sourcesCurrentSchema.type, 'url'),
      eq(sourcesCurrentSchema.uri, link.canonicalUrl),
    );
    const existing = await tdb.select(sourcesCurrentSchema, sameCanonicalLink).limit(1);
    if (existing[0]) return sourceResponse(existing[0], true, 200);

    const caption = parsedBody.data.caption?.trim() || undefined;
    const enrichment = await enrichLinkDetails(link);
    const details = enrichment.details;
    const metaLink: LinkSourceMeta = {
      originalUrl: parsedLink.link.originalUrl,
      canonicalUrl: link.canonicalUrl,
      platform: link.platform,
      kind: link.kind,
      ...(link.handle ? { handle: link.handle } : {}),
      ...(link.postId ? { postId: link.postId } : {}),
      ...(link.placeId ? { placeId: link.placeId } : {}),
      ...(link.placeName || details.placeName ? { placeName: link.placeName ?? details.placeName } : {}),
      needsResolution: link.needsResolution,
      resolution,
      ...(caption ? { captionText: caption } : {}),
      ...(Object.keys(details).length > 0 ? { details } : {}),
      providers: enrichment.providers,
    };
    const meta = {
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
      const concurrent = await tx.select(sourcesCurrentSchema, sameCanonicalLink).limit(1);
      if (concurrent[0]) return { source: concurrent[0], duplicate: true };
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
      return { source, duplicate: false };
    });

    if (!saved.duplicate) scheduleProcessing();
    return sourceResponse(saved.source, saved.duplicate, saved.duplicate ? 200 : 201);
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
