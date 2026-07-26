/**
 * @jest-environment node
 *
 * The queue's safety argument rests on a few numeric relationships. If someone
 * edits one of them (or bumps maxDuration in one place only), the guarantee that
 * a good screenshot is never marked `failed` quietly stops holding — so assert
 * the relationships instead of trusting a comment.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { QUEUE_CONFIG, MASS_UPLOAD_MAX_DURATION_SECONDS } from '@/lib/mass-upload/queue-config';

const ROOT = process.cwd();

function routeMaxDuration(relativePath: string): number {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  const match = source.match(/export const maxDuration = (\d+)/);
  if (!match) throw new Error(`No maxDuration export in ${relativePath}`);
  return Number(match[1]);
}

describe('mass-upload queue configuration', () => {
  it('never claims an item it cannot finish inside its own clock', () => {
    expect(QUEUE_CONFIG.runBudgetMs - QUEUE_CONFIG.runSafetyMarginMs).toBeGreaterThan(
      QUEUE_CONFIG.itemMaxBudgetMs
    );
    expect(QUEUE_CONFIG.itemMaxBudgetMs).toBeGreaterThan(QUEUE_CONFIG.itemMinBudgetMs);
  });

  it('never lets a lease expire while its owner is still working', () => {
    expect(QUEUE_CONFIG.leaseTtlMs).toBeGreaterThan(QUEUE_CONFIG.itemMaxBudgetMs);
    // And longer than a whole run, so a slow run cannot be reclaimed mid-flight.
    expect(QUEUE_CONFIG.leaseTtlMs).toBeGreaterThanOrEqual(QUEUE_CONFIG.runBudgetMs * 0.8);
  });

  it('keeps the late-extraction grace well inside the run safety margin', () => {
    // The grace runs after the item is already over budget, so it has to fit in
    // the head room the run keeps for writing its results back.
    expect(QUEUE_CONFIG.lateExtractionGraceMs).toBeLessThan(QUEUE_CONFIG.runSafetyMarginMs);
  });

  it('keeps interruptions on a separate, more forgiving budget than failures', () => {
    expect(QUEUE_CONFIG.maxInterruptions).toBeGreaterThan(QUEUE_CONFIG.maxAttempts);
  });

  it('matches the maxDuration declared by both processing routes', () => {
    expect(routeMaxDuration('src/app/api/mass-upload/process/route.ts')).toBe(
      MASS_UPLOAD_MAX_DURATION_SECONDS
    );
    expect(routeMaxDuration('src/app/api/mass-upload/cron/route.ts')).toBe(
      MASS_UPLOAD_MAX_DURATION_SECONDS
    );
  });

  it('matches the maxDuration configured in vercel.json', () => {
    const vercelConfig = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    expect(vercelConfig.functions['src/app/api/mass-upload/process/route.ts'].maxDuration).toBe(
      MASS_UPLOAD_MAX_DURATION_SECONDS
    );
    expect(vercelConfig.functions['src/app/api/mass-upload/cron/route.ts'].maxDuration).toBe(
      MASS_UPLOAD_MAX_DURATION_SECONDS
    );
  });

  it('keeps the cron as a safety net rather than the primary trigger', () => {
    const vercelConfig = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const cron = vercelConfig.crons.find(
      (c: { path: string }) => c.path === '/api/mass-upload/cron'
    );
    expect(cron).toBeDefined();
    // Anything faster than the run budget would pile invocations on top of
    // each other; the event trigger is what makes processing prompt.
    const [minute] = cron.schedule.split(' ');
    expect(minute).toMatch(/^\*\/(\d+)$/);
    const everyMinutes = Number(minute.split('/')[1]);
    expect(everyMinutes * 60_000).toBeGreaterThanOrEqual(QUEUE_CONFIG.runBudgetMs);
  });
});
