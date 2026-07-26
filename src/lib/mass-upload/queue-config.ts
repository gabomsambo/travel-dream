/**
 * Tunables for the mass-upload processing queue.
 *
 * The owner's bar is "drop 500 images and walk away": a screenshot that uploaded
 * successfully must never end up `failed` because a run was killed, restarted or
 * raced. Everything here is sized so that:
 *
 *   leaseTtlMs  >  itemMaxBudgetMs  >  itemMinBudgetMs
 *   runBudgetMs >  itemMaxBudgetMs + runSafetyMarginMs
 *
 * i.e. a run never starts an item it cannot finish or cleanly interrupt inside
 * its own clock, and a lease never expires while its owner is still working.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Wall clock Vercel gives the processing functions. Must stay in sync with
 * `maxDuration` in the route files and `vercel.json` — `queue-config.test.ts`
 * fails the build if they drift.
 */
export const MASS_UPLOAD_MAX_DURATION_SECONDS = 300;

export const QUEUE_CONFIG = {
  /** Usable clock for one run, minus the margin below. */
  runBudgetMs: envInt('MASS_UPLOAD_RUN_BUDGET_MS', MASS_UPLOAD_MAX_DURATION_SECONDS * 1000),
  /** Head room kept so the run can always write its own results back. */
  runSafetyMarginMs: envInt('MASS_UPLOAD_RUN_SAFETY_MARGIN_MS', 25_000),
  /** Never claim a new screenshot with less than this much clock left. */
  itemMinBudgetMs: envInt('MASS_UPLOAD_ITEM_MIN_BUDGET_MS', 45_000),
  /** Hard watchdog for one screenshot; the run stays in control of its clock. */
  itemMaxBudgetMs: envInt('MASS_UPLOAD_ITEM_MAX_BUDGET_MS', 180_000),
  /** Screenshots processed concurrently inside one run. */
  itemConcurrency: envInt('MASS_UPLOAD_ITEM_CONCURRENCY', 4),
  /** Genuine failures tolerated before a source is marked `failed`. */
  maxAttempts: envInt('MASS_UPLOAD_MAX_ATTEMPTS', 3),
  /** Interruptions tolerated before a source is parked as `stalled`. */
  maxInterruptions: envInt('MASS_UPLOAD_MAX_INTERRUPTIONS', 5),
  /**
   * How long a claim stays valid. Must exceed itemMaxBudgetMs so a live run is
   * never reclaimed out from under itself.
   */
  leaseTtlMs: envInt('MASS_UPLOAD_LEASE_TTL_MS', 240_000),
  /** Reject absurd images explicitly instead of OOM-killing the function. */
  maxImageBytes: envInt('MASS_UPLOAD_MAX_IMAGE_BYTES', 25 * 1024 * 1024),
  /** Timeout for downloading one screenshot from blob storage. */
  blobFetchTimeoutMs: envInt('MASS_UPLOAD_BLOB_FETCH_TIMEOUT_MS', 30_000),
  /** Parallel processing functions the dispatcher will keep alive. */
  maxWorkers: envInt('MASS_UPLOAD_MAX_WORKERS', 3),
  /** Queue depth one worker is expected to absorb; drives how many to spawn. */
  itemsPerWorker: envInt('MASS_UPLOAD_ITEMS_PER_WORKER', 25),
} as const;

export type QueueConfig = typeof QUEUE_CONFIG;
