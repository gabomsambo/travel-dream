import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { AttributionMeta } from '@/db/schema/attachments';
import { requireAuthForApi, isAuthError } from '@/lib/auth-helpers';
import { attachPhotoFromSource } from '@/lib/place-photos';

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

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthForApi();
    const { id: placeId } = await ctx.params;
    const json = await request.json();
    const body = BodySchema.parse(json);

    const result = await attachPhotoFromSource(user.id, placeId, {
      ...body,
      attribution: body.attribution as AttributionMeta,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      status: 'success',
      attachment: result.attachment,
      deduped: result.deduped,
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
