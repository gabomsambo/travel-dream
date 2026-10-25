/**
 * @jest-environment node
 *
 * Still trying retries on its own. A stalled screenshot goes back on the queue
 * when its backoff has elapsed, and one more interruption past that cap is the
 * existing failed state (Try again). The fixture import stays first so the
 * suite never opens a remote database.
 */
import {
  ALICE,
  FIXTURE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }));
jest.mock('@/lib/mass-upload/queue-processor', () => ({
  processQueue: jest.fn(),
}));
jest.mock('@/lib/mass-upload/dispatch', () => ({
  dispatchProcessors: jest.fn().mockResolvedValue({
    queued: 0,
    activeWorkers: 0,
    desiredWorkers: 0,
    spawned: 0,
  }),
}));

import { del } from '@vercel/blob';
import { GET } from '@/app/api/mass-upload/cron/route';
import { processQueue } from '@/lib/mass-upload/queue-processor';
import {
  claimNextQueuedSource,
  reclaimExpiredSourceLeases,
  recordSourceInterruption,
} from '@/lib/db-mutations';
import { getInboxUploads } from '@/lib/inbox-uploads';
import { buildInboxScreen, type InboxScreenModel } from '@/lib/inbox-page-model';
import { QUEUE_CONFIG } from '@/lib/mass-upload/queue-config';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const UPLOADED_AT = '2026-10-24T10:00:00.000Z';

function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  return client.execute({ sql, args });
}

function cell(column: string, id = 'src_stall') {
  return readCell(`SELECT ${column} FROM sources WHERE id = ?`, [id]);
}

function cronRequest() {
  return new Request('http://localhost/api/mass-upload/cron', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }) as never;
}

function queueResult(claimed: number) {
  return {
    workerId: 'w_cron',
    claimed,
    completed: 0,
    failed: 0,
    interrupted: 0,
    stalled: 0,
    leaseLost: 0,
    placesCreated: 0,
    claimErrors: 0,
    outcomeErrors: 0,
    reclaimed: { requeued: 0, stalled: 0 },
    remaining: 0,
    stoppedBecause: 'queue-empty' as const,
    elapsedMs: 1,
  };
}

async function seedStall(options: {
  status: string;
  interruptions: number;
  lease?: string | null;
  startedAt?: string | null;
  nextAttemptAt?: string | null;
}) {
  await execute(
    `INSERT INTO upload_sessions (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES ('session_stall',?,?,1,0,0,'active',?)`,
    [ALICE.id, UPLOADED_AT, JSON.stringify({ uploadedFiles: ['src_stall'], errors: [] })]
  );
  await execute(
    `INSERT INTO sources
       (id,user_id,type,uri,processing_status,processing_attempts,processing_interruptions,
        processing_error,processing_lease_id,processing_started_at,next_attempt_at,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'src_stall',
      ALICE.id,
      'https://store.public.blob.vercel-storage.com/src_stall.jpg',
      options.status,
      2,
      options.interruptions,
      'hold',
      options.lease ?? null,
      options.startedAt ?? null,
      options.nextAttemptAt ?? null,
      JSON.stringify({
        uploadInfo: { sessionId: 'session_stall', originalName: 'IMG_hold.jpg' },
      }),
      UPLOADED_AT,
      UPLOADED_AT,
    ]
  );
}

async function inbox(uploadId?: string): Promise<InboxScreenModel> {
  const summary = await getInboxUploads(ALICE.id);
  return buildInboxScreen({
    uploads: summary.uploads,
    toReviewPlaceIds: summary.toReviewPlaceIds,
    addedAnotherWay: [],
    now: NOW,
    uploadId,
  });
}

function tryAgainLabels(model: InboxScreenModel): string[] {
  if (model.view === 'detail') {
    return model.rows.flatMap((row) => row.actions.map((action) => action.label));
  }
  const card = model.uploads.find((upload) => upload.sessionId === 'session_stall');
  return (card?.rows ?? []).flatMap((row) => row.actions.map((action) => action.label));
}

let statusWhenClaimed: unknown = null;

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  (del as jest.Mock).mockClear();
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.GEMINI_VISION_ENABLED = 'true';
  statusWhenClaimed = null;
  (processQueue as jest.Mock).mockImplementation(async () => {
    statusWhenClaimed = await cell('processing_status');
    const claim = await claimNextQueuedSource('lease_stalled');
    return queueResult(claim.source ? 1 : 0);
  });
});

describe('stalled screenshots retry on their own', () => {
  const cap = () => QUEUE_CONFIG.maxInterruptions;

  it('requeues a still-trying screenshot once its wait has elapsed, and a worker claims it', async () => {
    await seedStall({
      status: 'extracting',
      interruptions: cap() - 1,
      lease: 'lease_hold',
      startedAt: UPLOADED_AT,
    });

    const outcome = await recordSourceInterruption('src_stall', 'lease_hold', 'Gemini 503', cap());
    expect(outcome).toBe('stalled');
    expect(await cell('processing_status')).toBe('stalled');
    expect(await cell('processing_lease_id')).toBeNull();
    expect(await cell('processing_attempts')).toBe(2);
    expect(await cell('processing_interruptions')).toBe(cap());
    const waitingUntil = Date.parse(String(await cell('next_attempt_at')));
    expect(waitingUntil).toBeGreaterThan(Date.now());

    const detail = await inbox('session_stall');
    expect(detail.view).toBe('detail');
    if (detail.view !== 'detail') return;
    expect(detail.rows.map((row) => row.line)).toEqual(['Still trying. It will retry on its own.']);
    expect(detail.rows[0].actions).toEqual([]);
    const home = await inbox();
    expect(tryAgainLabels(home)).toEqual([]);
    expect(home.view).toBe('home');
    if (home.view === 'home') {
      const card = home.uploads.find((upload) => upload.sessionId === 'session_stall');
      expect(card?.rows.some((row) => row.id === 'still-trying')).toBe(true);
    }

    const early = await GET(cronRequest());
    expect(early.status).toBe(200);
    expect((await early.json()).stalledRequeued).toBe(0);
    expect(await cell('processing_status')).toBe('stalled');
    expect(await cell('processing_lease_id')).toBeNull();
    expect(Date.parse(String(await cell('next_attempt_at')))).toBe(waitingUntil);

    await execute(
      `UPDATE sources SET next_attempt_at = ? WHERE id = ?`,
      [new Date(Date.now() - 1000).toISOString(), 'src_stall']
    );
    const later = await GET(cronRequest());
    expect(later.status).toBe(200);
    expect((await later.json()).stalledRequeued).toBe(1);
    expect(statusWhenClaimed).toBe('queued');
    expect(await cell('processing_status')).toBe('extracting');
    expect(await cell('processing_lease_id')).toBe('lease_stalled');
    expect(await cell('processing_attempts')).toBe(2);
    expect(await cell('processing_interruptions')).toBe(cap());
    expect(await cell('next_attempt_at')).toBeNull();
    expect(await cell('uri')).toBe('https://store.public.blob.vercel-storage.com/src_stall.jpg');
    expect(await cell('processing_status', FIXTURE.aliceSource)).toBe('uploaded');
    expect(await cell('processing_status', FIXTURE.bobSource)).toBe('uploaded');
    expect(del).not.toHaveBeenCalled();
  });

  it('fails the screenshot once another interruption passes the cap, and the inbox offers try again', async () => {
    await seedStall({
      status: 'extracting',
      interruptions: cap(),
      lease: 'lease_hold',
      startedAt: UPLOADED_AT,
    });

    const outcome = await recordSourceInterruption('src_stall', 'lease_hold', 'Gemini 503', cap());
    expect(outcome).toBe('failed');
    expect(await cell('processing_status')).toBe('failed');
    expect(await cell('processing_attempts')).toBe(2);
    expect(await cell('processing_interruptions')).toBe(cap() + 1);
    expect(await cell('processing_lease_id')).toBeNull();
    expect(await cell('next_attempt_at')).toBeNull();
    expect(await cell('uri')).toBe('https://store.public.blob.vercel-storage.com/src_stall.jpg');

    const detail = await inbox('session_stall');
    expect(detail.view).toBe('detail');
    if (detail.view !== 'detail') return;
    expect(detail.rows.map((row) => row.line)).toEqual(['AI service was unavailable after multiple attempts']);
    expect(tryAgainLabels(detail)).toEqual(['Try again']);
    const home = await inbox();
    expect(tryAgainLabels(home)).toEqual(['Try again']);
    expect(home.view).toBe('home');
    if (home.view === 'home') {
      const card = home.uploads.find((upload) => upload.sessionId === 'session_stall');
      expect(card?.rows.some((row) => row.id === 'still-trying')).toBe(false);
      expect(card?.rows.some((row) => row.id === 'could-not-read')).toBe(true);
    }
    expect(del).not.toHaveBeenCalled();
  });

  it('fails an expired lease the same way once the cap is past', async () => {
    await seedStall({
      status: 'extracting',
      interruptions: cap(),
      lease: 'lease_dead',
      startedAt: '2020-01-01T00:00:00.000Z',
    });

    const reclaimed = await reclaimExpiredSourceLeases(new Date().toISOString(), cap());
    expect(reclaimed.failed).toBe(1);
    expect(reclaimed.stalled).toBe(0);
    expect(reclaimed.requeued).toBe(0);
    expect(reclaimed.ids).toEqual(['src_stall']);
    expect(await cell('processing_status')).toBe('failed');
    expect(await cell('processing_attempts')).toBe(2);
    expect(await cell('processing_interruptions')).toBe(cap() + 1);
    expect(await cell('processing_lease_id')).toBeNull();
    expect(await cell('next_attempt_at')).toBeNull();

    const detail = await inbox('session_stall');
    expect(tryAgainLabels(detail)).toEqual(['Try again']);
    expect(detail.view).toBe('detail');
    if (detail.view === 'detail') {
      expect(detail.rows[0].line).not.toBe('Still trying. It will retry on its own.');
    }
    expect(del).not.toHaveBeenCalled();
  });
});
