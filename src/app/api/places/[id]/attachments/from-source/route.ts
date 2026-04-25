import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attachments, places } from '@/db/schema';
import type { AttributionMeta } from '@/db/schema/attachments';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { createAttachment } from '@/lib/db-mutations';

export const runtime = 'nodejs';

const GoogleAttributionSchema = z.object({
  kind: z.literal('google_places'),
  authorAttributions: z
    .array(
      z.object({
        displayName: z.string(),
        uri: z.string(),
        photoUri: z.string().optional(),
      }),
    )
    .default([]),
});

const WikimediaAttributionSchema = z.object({
  kind: z.literal('wikimedia'),
  authorText: z.string(),
  licenseShortName: z.string(),
  licenseUrl: z.string(),
  descriptionUrl: z.string(),
});

const PexelsAttributionSchema = z.object({
  kind: z.literal('pexels'),
  photographer: z.string(),
  photographerUrl: z.string(),
  photoUrl: z.string(),
});

const AttributionSchema = z.discriminatedUnion('kind', [
  GoogleAttributionSchema,
  WikimediaAttributionSchema,
  PexelsAttributionSchema,
]);

const BodySchema = z.object({
  source: z.enum(['google_places', 'wikimedia', 'pexels']),
  sourceId: z.string().min(1),
  thumbnailUrl: z.string().url().nullable(),
  fullUrl: z.string().url().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  attribution: AttributionSchema,
  caption: z.string().optional(),
});

const WIKIMEDIA_HOSTS = new Set(['upload.wikimedia.org', 'commons.wikimedia.org']);
const PEXELS_HOSTS = new Set(['images.pexels.com']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId } = await ctx.params;
    const json = await request.json();
    const body = BodySchema.parse(json);

    if (body.attribution.kind !== body.source) {
      return NextResponse.json(
        { error: 'Attribution kind does not match source' },
        { status: 400 },
      );
    }

    // Verify place ownership
    const [place] = await db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.userId, user.id)))
      .limit(1);
    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    // Dedup: same source + sourceId on the same place
    const existing = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.placeId, placeId),
          eq(attachments.source, body.source),
          eq(attachments.sourceId, body.sourceId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({
        status: 'success',
        attachment: existing[0],
        deduped: true,
      });
    }

    // Build URI. attachment.uri must always be a renderable URL.
    const id = `att_${crypto.randomUUID()}`;
    let uri: string;
    let thumbnailUri: string;

    if (body.source === 'google_places') {
      uri = `/api/photos/resolve/${id}`;
      thumbnailUri = `/api/photos/resolve/${id}?w=400`;
    } else {
      if (!body.fullUrl) {
        return NextResponse.json(
          { error: 'fullUrl required for non-google sources' },
          { status: 400 },
        );
      }
      const allowed = body.source === 'wikimedia' ? WIKIMEDIA_HOSTS : PEXELS_HOSTS;
      const fullHost = hostOf(body.fullUrl);
      if (!fullHost || !allowed.has(fullHost)) {
        return NextResponse.json(
          { error: `fullUrl host not allowed for ${body.source} source` },
          { status: 400 },
        );
      }
      if (body.thumbnailUrl) {
        const thumbHost = hostOf(body.thumbnailUrl);
        if (!thumbHost || !allowed.has(thumbHost)) {
          return NextResponse.json(
            { error: `thumbnailUrl host not allowed for ${body.source} source` },
            { status: 400 },
          );
        }
      }
      uri = body.fullUrl;
      thumbnailUri = body.thumbnailUrl ?? body.fullUrl;
    }

    const filename =
      `${body.source}-${body.sourceId}`.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 100);

    const attachment = await createAttachment(
      {
        id,
        placeId,
        type: 'photo',
        uri,
        filename,
        mimeType: 'image/jpeg',
        width: body.width ?? undefined,
        height: body.height ?? undefined,
        thumbnailUri,
        caption: body.caption,
        isPrimary: 0,
        source: body.source,
        sourceId: body.sourceId,
        attribution: body.attribution as AttributionMeta,
      },
      user.id,
    );

    if (!attachment) {
      return NextResponse.json(
        { error: 'Failed to create attachment' },
        { status: 500 },
      );
    }

    // First-photo-as-primary: count after insert; if exactly one photo, mark primary.
    const [{ c: photoCount }] = await db
      .select({ c: sql<number>`count(*)` })
      .from(attachments)
      .where(and(eq(attachments.placeId, placeId), eq(attachments.type, 'photo')));

    if (Number(photoCount) === 1) {
      await db.transaction(async (tx) => {
        await tx
          .update(attachments)
          .set({ isPrimary: 0 })
          .where(eq(attachments.placeId, placeId));
        await tx
          .update(attachments)
          .set({ isPrimary: 1 })
          .where(eq(attachments.id, attachment.id));
      });
    }

    return NextResponse.json({
      status: 'success',
      attachment,
      deduped: false,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 },
      );
    }
    console.error('[from-source] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
