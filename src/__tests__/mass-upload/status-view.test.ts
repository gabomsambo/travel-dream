/**
 * @jest-environment node
 */
import {
  computeEta,
  emptyMassUploadCounts,
  isSessionComplete,
  type MassUploadStatusCounts,
} from '@/lib/mass-upload/status-view';

const timing = { startMs: 0, initialCompleted: 100 };
const nowMs = 60_000;

function counts(partial: Partial<MassUploadStatusCounts>): MassUploadStatusCounts {
  return { ...emptyMassUploadCounts, ...partial };
}

describe('computeEta', () => {
  it('stays empty while the only remaining screenshots are still trying', () => {
    const waiting = counts({ completed: 497, stalled: 3 });
    const eta = computeEta(waiting, 500, timing, nowMs);

    expect(isSessionComplete(waiting, 500)).toBe(false);
    expect(eta.estimatedMinutesRemaining).toBeNull();
    expect(eta.processingRate).toBe(0);
    expect(eta.timing).toEqual(timing);
  });

  it('estimates while a screenshot is queued, extracting, or enriching', () => {
    for (const key of ['queued', 'extracting', 'enriching'] as const) {
      const eta = computeEta(counts({ completed: 400, [key]: 10 }), 410, timing, nowMs);
      expect(eta.estimatedMinutesRemaining).toBeGreaterThanOrEqual(1);
    }
  });

  it('estimates while stalled screenshots sit beside work that is still running', () => {
    const eta = computeEta(
      counts({ completed: 490, stalled: 3, queued: 7 }),
      500,
      timing,
      nowMs
    );
    expect(eta.estimatedMinutesRemaining).toBeGreaterThanOrEqual(1);
    expect(eta.processingRate).toBeGreaterThan(0);
  });
});
