import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import type { Source } from '@/types/database';
import type { GeminiExtractionResult } from '@/types/extraction-pipeline';
import {
  cacheSourceProcessingWork,
  claimNextQueuedSource,
  completeSource,
  markSourceEnriching,
  recordSourceFailure,
  recordSourceInterruption,
  reclaimExpiredSourceLeases,
  createPlacesFromPipeline,
} from '@/lib/db-mutations';
import { getQueueDepth } from '@/lib/db-queries';
import { getGeminiExtractionService } from './gemini-extraction-service';
import { getGooglePlacesEnrichmentService, GooglePlacesUnavailableError } from './google-places-enrichment';
import { QUEUE_CONFIG } from './queue-config';

/**
 * A run was cut short. NOT a verdict about the screenshot: the item is requeued
 * with its attempt budget untouched.
 */
export class ProcessingInterrupted extends Error {
  constructor(message: string, readonly cause_: 'watchdog' | 'upstream' | 'deadline' = 'watchdog') {
    super(message);
    this.name = 'ProcessingInterrupted';
  }
}

export interface ProcessQueueResult {
  workerId: string;
  claimed: number;
  completed: number;
  failed: number;
  interrupted: number;
  stalled: number;
  leaseLost: number;
  placesCreated: number;
  reclaimed: { requeued: number; stalled: number };
  remaining: number;
  stoppedBecause: 'queue-empty' | 'deadline' | 'max-items' | 'contended';
  elapsedMs: number;
}

export interface ProcessQueueOptions {
  /** Epoch ms after which no new item is claimed. Defaults to the run budget. */
  deadlineAt?: number;
  /** Upper bound on items claimed by this run. */
  maxItems?: number;
  /** Identifies the run in lease ids and logs. */
  workerId?: string;
  /** Injectable clock (tests). */
  now?: () => number;
}

/**
 * Drain the mass-upload queue until the clock runs out.
 *
 * Safe to run concurrently and safe to re-run: every item is claimed with an
 * atomic compare-and-set, every write back is guarded by the lease id, and work
 * already paid for (Gemini extraction, thumbnail) is cached on the source so a
 * retry never re-charges an upstream API.
 */
export async function processQueue(options: ProcessQueueOptions = {}): Promise<ProcessQueueResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const workerId = options.workerId ?? `w_${randomUUID()}`;
  const deadlineAt =
    options.deadlineAt ?? startedAt + QUEUE_CONFIG.runBudgetMs - QUEUE_CONFIG.runSafetyMarginMs;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;

  const result: ProcessQueueResult = {
    workerId,
    claimed: 0,
    completed: 0,
    failed: 0,
    interrupted: 0,
    stalled: 0,
    leaseLost: 0,
    placesCreated: 0,
    reclaimed: { requeued: 0, stalled: 0 },
    remaining: 0,
    stoppedBecause: 'queue-empty',
    elapsedMs: 0,
  };

  // ── Recover work stranded by a killed run ──────────────────────────────
  const reclaimed = await reclaimExpiredSourceLeases(
    new Date(now() - QUEUE_CONFIG.leaseTtlMs).toISOString(),
    QUEUE_CONFIG.maxInterruptions
  );
  result.reclaimed = { requeued: reclaimed.requeued, stalled: reclaimed.stalled };
  result.stalled += reclaimed.stalled;
  if (reclaimed.requeued + reclaimed.stalled > 0) {
    console.log(
      `[MassUpload ${workerId}] reclaimed ${reclaimed.requeued} interrupted source(s), parked ${reclaimed.stalled} as stalled`
    );
  }

  // ── Drain the queue with a fixed number of lanes ───────────────────────
  let stopped: ProcessQueueResult['stoppedBecause'] | null = null;
  // Reserved synchronously so concurrent lanes cannot overshoot maxItems.
  let reserved = 0;
  const lane = async (): Promise<void> => {
    // Every candidate taken by another run is not an empty queue: with several
    // runs and lanes contending for the same candidate window, a lane that
    // exits on the first lost race leaves work sitting in the queue.
    let contentionRetries = 0;
    while (true) {
      if (reserved >= maxItems) {
        stopped ??= 'max-items';
        return;
      }
      const remainingMs = deadlineAt - now();
      if (remainingMs < QUEUE_CONFIG.itemMinBudgetMs) {
        stopped ??= 'deadline';
        return;
      }

      reserved++;
      const leaseId = `${workerId}:${randomUUID()}`;
      const claim = await claimNextQueuedSource(leaseId);
      const source = claim.source;
      if (!source) {
        reserved--;
        if (claim.contended && contentionRetries < QUEUE_CONFIG.claimContentionRetries) {
          contentionRetries++;
          continue;
        }
        stopped ??= claim.contended ? 'contended' : 'queue-empty';
        return;
      }
      contentionRetries = 0;
      result.claimed++;

      // The watchdog keeps the run in charge of its own clock: an item that
      // would outlive the function is interrupted by us, on our terms, instead
      // of the platform killing the process mid-write.
      const itemBudgetMs = Math.min(
        QUEUE_CONFIG.itemMaxBudgetMs,
        Math.max(QUEUE_CONFIG.itemMinBudgetMs, deadlineAt - now())
      );

      await processOne(source, leaseId, itemBudgetMs, result);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, QUEUE_CONFIG.itemConcurrency) }, () => lane())
  );

  result.stoppedBecause = stopped ?? 'queue-empty';
  result.remaining = await getQueueDepth();
  result.elapsedMs = now() - startedAt;

  console.log(
    `[MassUpload ${workerId}] ${result.completed} completed, ${result.failed} failed, ` +
      `${result.interrupted} interrupted, ${result.stalled} stalled, ${result.placesCreated} places, ` +
      `${result.remaining} remaining (${result.stoppedBecause}, ${result.elapsedMs}ms)`
  );

  return result;
}

/** Process one claimed screenshot, recording exactly one outcome for it. */
async function processOne(
  source: Source,
  leaseId: string,
  budgetMs: number,
  result: ProcessQueueResult
): Promise<void> {
  const watchdog = new AbortController();
  const timer = setTimeout(
    () =>
      watchdog.abort(
        new ProcessingInterrupted(`Item budget of ${budgetMs}ms exceeded`, 'watchdog')
      ),
    budgetMs
  );

  try {
    const placesCreated = await runPipeline(source, leaseId, watchdog.signal);
    const completed = await completeSource(source.id, leaseId);
    if (!completed) {
      // Only reachable if a reclaim beat us; lease TTL > item budget makes this
      // effectively impossible, and the dedup in createPlacesFromPipeline keeps
      // the double-processed result idempotent if it ever happens.
      result.leaseLost++;
      console.warn(`[MassUpload] lease lost while completing ${source.id}`);
      return;
    }
    result.completed++;
    result.placesCreated += placesCreated;
  } catch (error) {
    const interruption = asInterruption(error, watchdog.signal);
    if (interruption) {
      const outcome = await recordSourceInterruption(
        source.id,
        leaseId,
        interruption.message,
        QUEUE_CONFIG.maxInterruptions
      );
      if (outcome === 'lease-lost') result.leaseLost++;
      else if (outcome === 'stalled') result.stalled++;
      else result.interrupted++;
      console.warn(`[MassUpload] ${source.id} interrupted (${outcome}): ${interruption.message}`);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const outcome = await recordSourceFailure(source.id, leaseId, message, QUEUE_CONFIG.maxAttempts);
    if (outcome === 'lease-lost') result.leaseLost++;
    else result.failed++;
    console.error(`[MassUpload] ${source.id} failed (${outcome}): ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns the interruption this error represents, or null if it is a real failure. */
function asInterruption(error: unknown, signal: AbortSignal): ProcessingInterrupted | null {
  if (error instanceof ProcessingInterrupted) return error;
  if (signal.aborted) {
    const reason = signal.reason;
    return reason instanceof ProcessingInterrupted
      ? reason
      : new ProcessingInterrupted('Run was interrupted before finishing', 'watchdog');
  }
  if (error instanceof GooglePlacesUnavailableError) {
    return new ProcessingInterrupted(error.message, 'upstream');
  }
  if (isTransientUpstreamError(error)) {
    return new ProcessingInterrupted(
      `Upstream unavailable: ${error instanceof Error ? error.message : String(error)}`,
      'upstream'
    );
  }
  return null;
}

/**
 * Rate limits and upstream outages are not verdicts about the screenshot. They
 * used to burn attempts and bury good images; now they only requeue.
 */
function isTransientUpstreamError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true;

  // A blob fetch that hits its own AbortSignal.timeout rejects with a
  // TimeoutError the item watchdog knows nothing about — still a clock-out,
  // never a verdict about the image.
  const name = (error as { name?: string })?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return true;

  // Unanchored on purpose: the Gemini SDK and withErrorHandling both wrap the
  // original message ("[GoogleGenerativeAI Error]: ... : fetch failed").
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|502|503|504)\b|overloaded|rate.?limit|quota|too many requests|fetch failed|aborted due to timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network error/i.test(
    message
  );
}

/** Full extraction → enrichment → persistence pipeline for one screenshot. */
async function runPipeline(source: Source, leaseId: string, signal: AbortSignal): Promise<number> {
  if (!source.userId) {
    // Genuine data problem, not a clock problem.
    throw new Error('No userId on source');
  }

  const meta = (source.meta ?? {}) as NonNullable<Source['meta']>;
  const cached = meta.massUpload ?? {};
  let extraction = cached.extraction as GeminiExtractionResult | undefined;
  let thumbnailUrl = cached.thumbnailUrl;

  if (!extraction || !thumbnailUrl) {
    const buffer = await downloadScreenshot(source.uri, signal);

    if (!thumbnailUrl) {
      thumbnailUrl = await generateThumbnail(buffer, source, signal);
    }

    if (!extraction) {
      signal.throwIfAborted();
      const fileName = meta.uploadInfo?.originalName || source.id;
      const pending = getGeminiExtractionService().extractFromImage(buffer, fileName);
      try {
        extraction = await withAbort(pending, signal);
      } catch (err) {
        // The call was already paid for even though we stopped waiting: keep
        // whatever it returns so the retry does not re-charge Gemini. The run's
        // own clock is not extended, and the write is lease-guarded, so it is a
        // no-op once the lease is gone.
        cacheLateExtraction(pending, source.id, leaseId, thumbnailUrl);
        throw err;
      }
      // Persist before enrichment so an interruption after this point never
      // pays Gemini for the same screenshot twice.
      await cacheSourceProcessingWork(source.id, leaseId, { extraction, thumbnailUrl });
    } else if (thumbnailUrl) {
      await cacheSourceProcessingWork(source.id, leaseId, { thumbnailUrl });
    }
  }

  if (!(await markSourceEnriching(source.id, leaseId))) {
    throw new ProcessingInterrupted('Lease lost before enrichment', 'watchdog');
  }

  signal.throwIfAborted();
  const enrichedPlaces = await getGooglePlacesEnrichmentService().enrichPlaces(
    extraction?.places ?? [],
    signal
  );

  if (enrichedPlaces.length === 0) return 0;

  signal.throwIfAborted();
  const created = await createPlacesFromPipeline(enrichedPlaces, source.id, source.userId);
  return created.length;
}

/**
 * Persist an extraction that arrived after we stopped waiting for it. Fire and
 * forget: a late result is a bonus for the next attempt, never something the
 * current run blocks on.
 */
function cacheLateExtraction(
  pending: Promise<GeminiExtractionResult>,
  sourceId: string,
  leaseId: string,
  thumbnailUrl: string | undefined
): void {
  void pending.then(
    (late) =>
      cacheSourceProcessingWork(sourceId, leaseId, { extraction: late, thumbnailUrl }).catch(
        (err) => console.warn(`[MassUpload] could not cache late extraction for ${sourceId}:`, err)
      ),
    () => undefined
  );
}

async function downloadScreenshot(uri: string, signal: AbortSignal): Promise<Buffer> {
  const res = await fetch(uri, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(QUEUE_CONFIG.blobFetchTimeoutMs)]),
  });
  if (!res.ok) {
    // 5xx from blob storage is transient; 404 means the file is genuinely gone.
    if (res.status >= 500 || res.status === 429) {
      throw new ProcessingInterrupted(`Blob fetch failed: ${res.status}`, 'upstream');
    }
    throw new Error(`Screenshot download returned HTTP ${res.status}`);
  }

  const declaredSize = Number(res.headers.get('content-length') ?? 0);
  if (declaredSize > QUEUE_CONFIG.maxImageBytes) {
    throw new Error(`Screenshot too large: ${declaredSize} bytes`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > QUEUE_CONFIG.maxImageBytes) {
    throw new Error(`Screenshot too large: ${buffer.byteLength} bytes`);
  }
  return buffer;
}

/** Thumbnails are a nice-to-have: a failure here must not cost the screenshot. */
async function generateThumbnail(
  buffer: Buffer,
  source: Source,
  signal: AbortSignal
): Promise<string | undefined> {
  try {
    signal.throwIfAborted();
    const thumbnailBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbKey = `thumbnails/${source.userId}/${source.id}_thumb.jpg`;
    const thumbBlob = await put(thumbKey, thumbnailBuffer, {
      access: 'public',
      contentType: 'image/jpeg',
      allowOverwrite: true,
    });
    return thumbBlob.url;
  } catch (err) {
    if (signal.aborted) throw err;
    console.warn(`[MassUpload] thumbnail generation failed for ${source.id}:`, err);
    return undefined;
  }
}

/**
 * Stop waiting on a promise once the watchdog fires. The underlying call may
 * keep running (the Gemini SDK takes no signal), but the run stays in control
 * of its own clock, which is what keeps the platform from killing it mid-write.
 */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
