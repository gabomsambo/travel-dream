import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { eq, and, sql } from 'drizzle-orm';
import { geminiExtractionService } from '@/lib/mass-upload/gemini-extraction-service';
import { googlePlacesEnrichmentService } from '@/lib/mass-upload/google-places-enrichment';
import { getQueuedSources } from '@/lib/db-queries';
import { createPlacesFromPipeline } from '@/lib/db-mutations';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH_SIZE = 3;
const MAX_ATTEMPTS = 3;

export async function GET(request: NextRequest) {
  // ── Auth: Verify Vercel Cron secret ────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let processed = 0;
  let failed = 0;
  let placesCreated = 0;

  try {
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

        // ── Step 6: Mark completed ─────────────────────────────────────
        await db.update(sourcesCurrentSchema)
          .set({
            processingStatus: 'completed',
            processingError: null,
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
