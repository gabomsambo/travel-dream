import { getQueueStats } from '@/lib/db-queries';
import { QUEUE_CONFIG } from './queue-config';

/**
 * Event-driven fan-out for the mass-upload queue.
 *
 * Uploading starts processing immediately instead of waiting for the next cron
 * tick, and the cron becomes a safety net that tops the worker pool back up if a
 * trigger was ever missed. The two paths share this function, so a missed
 * trigger and a duplicated trigger both converge on the same worker count.
 */

/**
 * What a dispatcher is allowed to do to the worker pool.
 *
 * `grow` — the safety-net cron and upload-start bring the pool up to what the
 * queue needs.
 *
 * `replace` — a run chaining at the end of its own life may only hand its slot
 * on: at most ONE successor, and only while there is claimable work left.
 * Without that, every generation of workers re-read an almost empty pool (their
 * own leases are already released) and each spawned a full pool of its own, so
 * 3 workers became 9 and 9 became 27.
 */
export type DispatchMode = 'grow' | 'replace';

export interface DispatchResult {
  mode: DispatchMode;
  queued: number;
  activeWorkers: number;
  inFlight: number;
  /** Claimable depth the live runs are not already holding under a lease. */
  uncovered: number;
  desiredWorkers: number;
  spawned: number;
  skippedReason?: string;
}

/**
 * Where to send worker triggers.
 *
 * `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` are normally the production domain in
 * every Vercel environment, so a preview deployment that trusted them would POST
 * its own work — with the shared CRON_SECRET — at production. Outside
 * production, the deployment's own URL wins; `MASS_UPLOAD_BASE_URL` overrides
 * everything (the load-test harness points it at localhost).
 */
function resolveBaseUrl(): string | null {
  const trim = (url: string) => url.replace(/\/+$/, '');
  const explicit = process.env.MASS_UPLOAD_BASE_URL;
  if (explicit) return trim(explicit);

  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (deploymentUrl && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return deploymentUrl;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return trim(configured);
  return deploymentUrl;
}

/**
 * Make sure enough processing functions are running for the current queue depth.
 * Returns without spawning when the queue is empty or already covered.
 *
 * `maxWorkers` bounds ONE growing dispatcher's spawn decision, not the global
 * number of concurrent processing functions: dispatchers deciding at the same
 * moment (the safety-net cron and upload-start) can each spawn up to that many.
 * Correctness is unaffected — leases mean no item is processed twice — and the
 * owner accepted that flat overshoot as a cost tradeoff rather than paying for a
 * durable worker-slot record. What is NOT accepted is the pool multiplying
 * across worker generations, which is why chaining runs dispatch in `replace`
 * mode.
 */
export async function dispatchProcessors(
  reason: string,
  mode: DispatchMode
): Promise<DispatchResult> {
  const cutoff = new Date(Date.now() - QUEUE_CONFIG.leaseTtlMs).toISOString();
  const { queued, activeWorkers, inFlight } = await getQueueStats(cutoff);

  // Items held under an unexpired lease are capacity that is already committed;
  // spawning for them would just add runs that claim nothing.
  const uncovered = Math.max(0, queued - inFlight);
  const desiredWorkers =
    uncovered === 0
      ? 0
      : Math.min(QUEUE_CONFIG.maxWorkers, Math.ceil(uncovered / QUEUE_CONFIG.itemsPerWorker));
  const missing = Math.max(0, desiredWorkers - activeWorkers);
  const spawnCount = mode === 'replace' ? Math.min(1, missing) : missing;

  const result: DispatchResult = {
    mode,
    queued,
    activeWorkers,
    inFlight,
    uncovered,
    desiredWorkers,
    spawned: 0,
  };
  if (spawnCount === 0) return result;

  const baseUrl = resolveBaseUrl();
  const cronSecret = process.env.CRON_SECRET;
  if (!baseUrl || !cronSecret) {
    // The cron safety net still drains the queue, just less promptly.
    result.skippedReason = !baseUrl ? 'no base url configured' : 'CRON_SECRET not configured';
    console.warn(`[MassUpload dispatch] cannot trigger workers (${result.skippedReason})`);
    return result;
  }

  const triggers = Array.from({ length: spawnCount }, async (_, i) => {
    try {
      // The worker answers 202 immediately and drains in after(), so a trigger
      // that hangs is a broken trigger — never something the caller's own run
      // budget should be spent on.
      const res = await fetch(`${baseUrl}/api/mass-upload/process`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cronSecret}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: `${reason}#${i}` }),
        signal: AbortSignal.timeout(QUEUE_CONFIG.workerTriggerTimeoutMs),
      });
      try {
        await res.arrayBuffer();
      } catch {
        // Nothing in the acknowledgement is used; releasing it is best effort.
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.warn(`[MassUpload dispatch] worker trigger failed:`, err);
      return false;
    }
  });

  result.spawned = (await Promise.all(triggers)).filter(Boolean).length;
  console.log(
    `[MassUpload dispatch] reason=${reason} mode=${mode} queued=${queued} inFlight=${inFlight} ` +
      `uncovered=${uncovered} active=${activeWorkers} desired=${desiredWorkers} spawned=${result.spawned}`
  );
  return result;
}
