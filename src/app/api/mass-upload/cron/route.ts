import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, sql } from 'drizzle-orm';
import { geminiExtractionService } from '@/lib/mass-upload/gemini-extraction-service';
import { googlePlacesEnrichmentService } from '@/lib/mass-upload/google-places-enrichment';
import { getQueuedSources } from '@/lib/db-queries';
import { createPlacesFromPipeline } from '@/lib/db-mutations';
import sharp from 'sharp';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;

export async function GET(request: NextRequest) {
  // ── Auth: Verify Vercel Cron secret ────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[MassUpload Cron] CRON_SECRET environment variable is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Observability: warn if Gemini env config looks wrong ───────────────
  if (process.env.GEMINI_VISION_ENABLED !== 'true') {
    console.warn('[MassUpload Cron] GEMINI_VISION_ENABLED is not set to "true" — check environment configuration');
  }

  let processed = 0;
  let failed = 0;
  let placesCreated = 0;

  try {
    // ── Recover stale sources stuck in extracting/enriching ─────────────
    const STALE_THRESHOLD_MS = 150 * 1000; // 2.5 minutes (must exceed maxDuration of 120s)
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

    const staleSources = await db.select()
      .from(sourcesCurrentSchema)
      .where(and(
        sql`${sourcesCurrentSchema.processingStatus} IN ('extracting', 'enriching')`,
        sql`${sourcesCurrentSchema.processingStartedAt} < ${staleThreshold}`
      ));

    for (const stale of staleSources) {
      const attempts = stale.processingAttempts ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        await db.update(sourcesCurrentSchema)
          .set({
            processingStatus: 'failed',
            processingError: 'Timed out after maximum retry attempts',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sourcesCurrentSchema.id, stale.id));
      } else {
        await db.update(sourcesCurrentSchema)
          .set({
            processingStatus: 'queued',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sourcesCurrentSchema.id, stale.id));
      }
    }

    if (staleSources.length > 0) {
      console.log(`[MassUpload Cron] Recovered ${staleSources.length} stale source(s)`);
    }

    // ── Fetch queued sources ─────────────────────────────────────────────
    const queued = await getQueuedSources(BATCH_SIZE);

    if (queued.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0, remaining: 0, placesCreated: 0 });
    }

    for (const source of queued) {
      // ── Atomic claim (optimistic lock) ───────────────────────────────
      const claimed = await db.update(sourcesCurrentSchema)
        .set({
          processingStatus: 'extracting',
          processingStartedAt: new Date().toISOString(),
          processingAttempts: sql`${sourcesCurrentSchema.processingAttempts} + 1`,
          updatedAt: new Date().toISOString(),
        })
        .where(and(
          eq(sourcesCurrentSchema.id, source.id),
          eq(sourcesCurrentSchema.processingStatus, 'queued')
        ))
        .returning();

      if (claimed.length === 0) continue; // Another invocation grabbed it

      const claimedSource = claimed[0];

      // Guard: must have userId
      if (!claimedSource.userId) {
        await db.update(sourcesCurrentSchema)
          .set({ processingStatus: 'failed', processingError: 'No userId on source', updatedAt: new Date().toISOString() })
          .where(eq(sourcesCurrentSchema.id, source.id));
        failed++;
        continue;
      }

      try {
        // ── Step 1: Fetch image from Vercel Blob ───────────────────────
        const imageRes = await fetch(source.uri);
        if (!imageRes.ok) throw new Error(`Blob fetch failed: ${imageRes.status}`);
        const buffer = Buffer.from(await imageRes.arrayBuffer());

        // ── Step 1.5: Generate thumbnail and upload to Vercel Blob ────
        let thumbnailUrl: string | undefined;
        try {
          const thumbnailBuffer = await sharp(buffer)
            .resize(400, 400, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 80 })
            .toBuffer();
          const thumbKey = `thumbnails/${claimedSource.userId}/${source.id}_thumb.jpg`;
          const thumbBlob = await put(thumbKey, thumbnailBuffer, {
            access: 'public',
            contentType: 'image/jpeg',
          });
          thumbnailUrl = thumbBlob.url;
        } catch (thumbErr) {
          console.warn(`[MassUpload Cron] Thumbnail generation failed for ${source.id}:`, thumbErr);
          // Non-fatal — continue processing without thumbnail
        }

        // ── Step 2: Gemini extraction ──────────────────────────────────
        const meta = source.meta as { uploadInfo?: { originalName?: string } } | null;
        const fileName = meta?.uploadInfo?.originalName || source.id;
        const extraction = await geminiExtractionService.extractFromImage(buffer, fileName);

        // ── Step 3: Update status → enriching ──────────────────────────
        await db.update(sourcesCurrentSchema)
          .set({ processingStatus: 'enriching', updatedAt: new Date().toISOString() })
          .where(eq(sourcesCurrentSchema.id, source.id));

        // ── Step 4: Google Places enrichment ───────────────────────────
        const enrichedPlaces = await googlePlacesEnrichmentService.enrichPlaces(extraction.places);

        // ── Step 5: Create places in DB ────────────────────────────────
        if (enrichedPlaces.length > 0) {
          const created = await createPlacesFromPipeline(
            enrichedPlaces, source.id, claimedSource.userId
          );
          placesCreated += created.length;
        }

        // ── Step 6: Mark completed (with thumbnail path in meta) ───────
        const currentMeta = claimedSource.meta as Record<string, unknown> | null;
        const currentUploadInfo = (currentMeta?.uploadInfo as Record<string, unknown>) ?? {};
        const updatedMeta = thumbnailUrl
          ? { ...currentMeta, uploadInfo: { ...currentUploadInfo, thumbnailPath: thumbnailUrl } }
          : currentMeta;

        await db.update(sourcesCurrentSchema)
          .set({
            processingStatus: 'completed',
            processingError: null,
            meta: updatedMeta,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sourcesCurrentSchema.id, source.id));

        processed++;
        console.log(`[MassUpload Cron] Processed source ${source.id}: ${enrichedPlaces.length} places`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[MassUpload Cron] Failed source ${source.id}:`, msg);

        // Retry logic: currentAttempts is the POST-increment value from .returning()
        // With MAX_ATTEMPTS=3: attempts 1,2 → retry, attempt 3+ → fail
        const currentAttempts = claimedSource.processingAttempts ?? 0;
        if (currentAttempts >= MAX_ATTEMPTS) {
          await db.update(sourcesCurrentSchema)
            .set({
              processingStatus: 'failed',
              processingError: msg,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(sourcesCurrentSchema.id, source.id));
        } else {
          await db.update(sourcesCurrentSchema)
            .set({
              processingStatus: 'queued',
              processingError: msg,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(sourcesCurrentSchema.id, source.id));
        }

        failed++;
      }
    }

    // Count remaining queued sources
    const remaining = await db.select({ count: sql<number>`count(*)` })
      .from(sourcesCurrentSchema)
      .where(eq(sourcesCurrentSchema.processingStatus, 'queued'));
    const remainingCount = remaining[0]?.count ?? 0;

    return NextResponse.json({ processed, failed, remaining: remainingCount, placesCreated });

  } catch (error) {
    console.error('[MassUpload Cron] Fatal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron failed' },
      { status: 500 }
    );
  }
}
