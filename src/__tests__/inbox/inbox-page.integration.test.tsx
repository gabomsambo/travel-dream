/**
 * The Inbox page against a real local SQLite file. Places come from
 * `createPlacesFromPipeline`. The fixture import stays first so the suite
 * never opens a remote database.
 */
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn(), head: jest.fn() }));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { InboxScreen } from '@/components/inbox/inbox-screen';
import { createPlacesFromPipeline } from '@/lib/db-mutations';
import { buildInboxScreen, coveredUploadPlaceIds, formatUploadWhen } from '@/lib/inbox-page-model';
import { getInboxPlacesAddedAnotherWay, getInboxUploads } from '@/lib/inbox-uploads';
import { loadReviewQueue } from '@/lib/review-queue';
import type { PipelinePlace } from '@/types/extraction-pipeline';

type Exec = (query: { sql: string; args?: unknown[] }) => Promise<{ rows: Array<Record<string, unknown>> }>;
const execute = (sql: string, args: unknown[] = []) =>
  (require('@/db') as { client: { execute: Exec } }).client.execute({ sql, args });

const NOW = new Date('2026-10-23T15:00:00.000Z');
const TODAY = '2026-10-23T13:13:00.000Z';
const EARLIER = '2026-10-12T15:00:00.000Z';

function place(name: string, overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name, kind: 'landmark', city: 'Lima', country: 'Peru', admin: null, description: null,
    tags: null, vibes: null, confidence: 0.9, price_level: null, best_time: null, activities: null,
    cuisine: null, amenities: null, practicalInfo: null, recommendedBy: null, coords: null,
    address: null, googlePlaceId: null, ...overrides,
  } as PipelinePlace;
}

async function session(id: string, userId: string, startedAt: string, duplicates?: unknown[]): Promise<void> {
  await execute(
    `INSERT INTO upload_sessions (id,user_id,started_at,file_count,completed_count,failed_count,status,meta)
     VALUES (?,?,?,0,0,0,'active',?)`,
    [id, userId, startedAt, JSON.stringify({ uploadedFiles: [], errors: [], ...(duplicates ? { duplicates } : {}) })]
  );
}

async function source(
  id: string,
  userId: string,
  sessionId: string,
  status: string,
  createdAt: string,
  extra: { name?: string; error?: string; places?: PipelinePlace[] } = {}
): Promise<void> {
  await execute(
    `INSERT INTO sources (id,user_id,type,uri,processing_status,processing_error,meta,created_at,updated_at)
     VALUES (?,?,'screenshot',?,?,?,?,?,?)`,
    [
      id,
      userId,
      `https://store.public.blob.vercel-storage.com/${id}.jpg`,
      status,
      extra.error ?? null,
      JSON.stringify({ uploadInfo: { sessionId, originalName: extra.name ?? `${id}.jpg` } }),
      createdAt,
      createdAt,
    ]
  );
  if (extra.places) await createPlacesFromPipeline(extra.places, id, userId);
}

async function screenModel(uploadId?: string) {
  const summary = await getInboxUploads(ALICE.id);
  const addedAnotherWay = await getInboxPlacesAddedAnotherWay(ALICE.id, coveredUploadPlaceIds(summary.uploads));
  return buildInboxScreen({
    uploads: summary.uploads,
    toReviewPlaceIds: summary.toReviewPlaceIds,
    addedAnotherWay,
    now: NOW,
    uploadId,
  });
}

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  await execute('DELETE FROM sources WHERE id = ?', [FIXTURE.aliceSource]);
  await execute('DELETE FROM upload_sessions WHERE id = ?', [FIXTURE.aliceSession]);
});

async function seedReady(): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO places (id,user_id,name,kind,status,city,country,google_place_id,created_at,updated_at)
     VALUES ('plc_pancakes',?, 'Pancake House','restaurant','library','London','United Kingdom','g-pancakes',?,?)`,
    [ALICE.id, now, now]
  );
  await session('session_earlier', ALICE.id, EARLIER);
  await source('src_earlier', ALICE.id, 'session_earlier', 'completed', '2026-10-12T15:01:00.000Z', {
    name: 'earlier.jpg',
    places: [place('Plaza de Armas', { city: 'Cusco', country: 'Peru' })],
  });
  await execute(`UPDATE places SET status = 'library' WHERE name = 'Plaza de Armas'`);

  await session('session_today', ALICE.id, TODAY, [
    { originalName: 'IMG_2912.jpg', duplicateOf: 'src_earlier' },
  ]);
  await source('src_today_places', ALICE.id, 'session_today', 'completed', '2026-10-23T13:14:00.000Z', {
    name: 'coro.jpg',
    places: [
      place('Medanos de Coro', { city: 'Coro', country: 'Venezuela' }),
      place('Pancake House', { city: 'London', country: 'United Kingdom', googlePlaceId: 'g-pancakes' }),
    ],
  });
  await source('src_today_empty', ALICE.id, 'session_today', 'completed', '2026-10-23T13:15:00.000Z', {
    name: 'IMG_3024.jpg',
  });
  await source('src_today_failed', ALICE.id, 'session_today', 'failed', '2026-10-23T13:16:00.000Z', {
    name: 'IMG_3017.jpg',
    error: '503 Service Unavailable: model overloaded',
  });
}

describe('inbox page', () => {
  it('is the drop zone when nothing has been uploaded', async () => {
    render(<InboxScreen model={await screenModel()} />);
    expect(screen.getByRole('heading', { name: 'Drop your travel screenshots' })).toBeInTheDocument();
    expect(screen.queryByText(/drop screenshots here/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload screenshots' })).toHaveAttribute('href', '/mass-upload');
    expect(screen.getByRole('link', { name: 'Choose screenshots' })).toHaveAttribute('href', '/mass-upload');
    expect(screen.queryByText(/Bob Secret/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Review/ })).not.toBeInTheDocument();
  });

  it('reports one open upload, hides empty rows, and keeps finished uploads to a line', async () => {
    await seedReady();
    render(<InboxScreen model={await screenModel()} />);

    expect(screen.getByRole('heading', { name: '1 new place to review' })).toBeInTheDocument();
    expect(screen.getByText(/From 1 upload today/)).toBeInTheDocument();
    expect(screen.getByText(/about 1 minute/)).toBeInTheDocument();
    expect(screen.queryByText(/or just the newest upload/)).not.toBeInTheDocument();

    expect(screen.getByText('new place to review')).toBeInTheDocument();
    expect(screen.getByText('Medanos de Coro')).toBeInTheDocument();
    expect(screen.getByText(/We added this screenshot to Pancake House/)).toBeInTheDocument();
    const skippedAt = formatUploadWhen(EARLIER, NOW).sentence;
    expect(screen.getByText(`IMG_2912.jpg was already in your ${skippedAt} upload, so we skipped it.`)).toBeInTheDocument();
    expect(screen.getByText(/IMG_3024.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/AI service was unavailable/)).toBeInTheDocument();
    expect(screen.getByText('2 needs you')).toBeInTheDocument();

    expect(screen.queryByText(/that look right/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add by hand' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();

    const reviewAll = screen.getAllByRole('link', { name: 'Review 1 place' });
    for (const link of reviewAll) {
      expect(link).toHaveAttribute('href', '/review');
    }
    expect(screen.getByRole('link', { name: 'Review 1' })).toHaveAttribute(
      'href',
      '/review?upload=session_today'
    );
    expect(screen.getByRole('link', { name: 'See them' })).toHaveAttribute('href', '/place/plc_pancakes');

    const earlier = formatUploadWhen(EARLIER, NOW).earlier;
    expect(screen.getByText(new RegExp(`${earlier} · 1 screenshot`))).toBeInTheDocument();
    expect(screen.getByText(/1 added/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/inbox?upload=session_earlier');
    expect(screen.queryByText(/Bob Secret/i)).not.toBeInTheDocument();
  });

  it('filters one upload down to a single screenshot outcome', async () => {
    await seedReady();
    render(<InboxScreen model={await screenModel('session_today')} />);

    expect(screen.getByRole('heading', { name: /Today,/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review 1 place' })).toHaveAttribute('href', '/review?upload=session_today');
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toMatch(
      /^\/review\?upload=session_today&placeId=/
    );
    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'No place 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Couldn't read 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'No place 1' }));
    expect(screen.getByText('IMG_3024.jpg')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Medanos de Coro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add by hand' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /that look right/i })).not.toBeInTheDocument();
  });

  it('becomes a progress card while an upload is still reading', async () => {
    await seedReady();
    await session('session_reading', ALICE.id, '2026-10-23T14:00:00.000Z', [
      { originalName: 'again.jpg', duplicateOf: 'src_earlier' },
    ]);
    await source('src_reading_done', ALICE.id, 'session_reading', 'completed', '2026-10-23T14:01:00.000Z', {
      places: [place('Reading Place', { city: 'Lisbon', country: 'Portugal' })],
    });
    await source('src_reading_wait', ALICE.id, 'session_reading', 'queued', '2026-10-23T14:02:00.000Z');

    render(<InboxScreen model={await screenModel()} />);

    expect(screen.getByText('Reading your screenshots')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 of 3 read' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel the rest' })).toBeInTheDocument();
    const waiting = screen.getAllByRole('link', { name: 'Review 2 places while you wait' });
    expect(waiting).toHaveLength(2);
    for (const link of waiting) {
      expect(link).toHaveAttribute('href', '/review');
    }
    expect(waiting.some((link) => link.closest('.fixed'))).toBe(true);
    expect(waiting.some((link) => !link.closest('.fixed'))).toBe(true);
    expect(screen.getByText('So far: 1 new place · 1 uploaded before')).toBeInTheDocument();
    expect(screen.getByText('While you wait')).toBeInTheDocument();
    expect(screen.getByText('Medanos de Coro')).toBeInTheDocument();
  });

  it('says all caught up when every upload is finished', async () => {
    await session('session_done', ALICE.id, TODAY);
    await source('src_done', ALICE.id, 'session_done', 'completed', '2026-10-23T13:20:00.000Z', {
      places: [place('Done Place', { city: 'Oslo', country: 'Norway' })],
    });
    await execute(`UPDATE places SET status = 'library' WHERE name = 'Done Place'`);

    render(<InboxScreen model={await screenModel()} />);
    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Every place from your uploads has a home.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "See today's places in your Library" })).toHaveAttribute('href', '/library');
    expect(screen.queryByRole('link', { name: /Review \d/ })).not.toBeInTheDocument();
    expect(screen.getByText('Recent uploads')).toBeInTheDocument();
  });

  it('lists inbox places that no upload owns, and not another user', async () => {
    const newer = '2026-10-23T14:00:00.000Z';
    const older = '2026-10-23T09:00:00.000Z';
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_hand_new', ALICE.id, 'Newer Cafe', 'cafe', 'inbox', newer, newer]
    );
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_hand_old', ALICE.id, 'Older Cafe', 'cafe', 'inbox', older, older]
    );
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_bob_hand', BOB.id, 'Bob Secret Inbox', 'cafe', 'inbox', newer, newer]
    );

    const model = await screenModel();
    expect(model.view).toBe('home');
    if (model.view !== 'home') return;
    expect(model.addedAnotherWay?.names).toBe('Newer Cafe and Older Cafe');
    render(<InboxScreen model={model} />);
    expect(screen.getByText('Added another way')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/review?placeId=plc_hand_old');
    expect(screen.queryByText('Bob Secret Inbox')).not.toBeInTheDocument();
  });

  it('opens a screenshot review on the earlier inbox place, not the created id', async () => {
    const earlier = '2026-10-23T10:00:01.000Z';
    const later = '2026-10-23T12:00:02.000Z';
    await session('session_multi', ALICE.id, '2026-10-23T12:00:00.000Z');
    await source('src_multi', ALICE.id, 'session_multi', 'completed', '2026-10-23T12:00:00.000Z');
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_later', ALICE.id, 'Created Later', 'cafe', 'inbox', later, later]
    );
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_earlier', ALICE.id, 'Linked Earlier', 'cafe', 'inbox', earlier, earlier]
    );
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_multi', 'plc_later']);
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_multi', 'plc_earlier']);
    await execute(`UPDATE sources SET meta = json_set(meta, '$.massUpload', json(?)) WHERE id = ?`, [
      JSON.stringify({ outcome: { created: ['plc_later'], linked: [{ placeId: 'plc_earlier', reason: 'google_place_id' }] } }),
      'src_multi',
    ]);

    render(<InboxScreen model={await screenModel('session_multi')} />);
    expect(screen.getByRole('link', { name: 'Review 2 places' })).toHaveAttribute('href', '/review?upload=session_multi');
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/review?upload=session_multi&placeId=plc_earlier'
    );
  });

  it('opens an older screenshot on the place a later shot in the upload ranks first', async () => {
    const placeAt = '2026-10-23 10:00:00';
    await session('session_sib', ALICE.id, '2026-10-23T10:00:00.000Z');
    await source('src_old', ALICE.id, 'session_sib', 'completed', '2026-10-23 11:00:00', { name: 'older.jpg' });
    await source('src_new', ALICE.id, 'session_sib', 'completed', '2026-10-23T10:00:00.000Z', { name: 'newer.jpg' });
    for (const [id, name] of [['plc_a', 'Aye'], ['plc_b', 'Bee']] as const) {
      await execute(
        `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
        [id, ALICE.id, name, 'cafe', 'inbox', placeAt, placeAt]
      );
    }
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_old', 'plc_a']);
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_old', 'plc_b']);
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_new', 'plc_b']);

    const queue = await loadReviewQueue(ALICE.id, undefined, 'session_sib');
    expect(queue.entries.map((entry) => entry.placeId)).toEqual(['plc_b', 'plc_a']);

    render(<InboxScreen model={await screenModel('session_sib')} />);
    expect(screen.getByRole('link', { name: 'Review 2 places' })).toHaveAttribute('href', '/review?upload=session_sib');
    const older = screen.getByRole('link', { name: 'Aye' }).closest('.grid');
    expect(older).not.toBeNull();
    expect(within(older as HTMLElement).getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/review?upload=session_sib&placeId=plc_b'
    );
  });

  it('opens added another way on the queued source, ahead of an older sourceless place', async () => {
    const handAt = '2026-10-23T08:00:00.000Z';
    const ayeAt = '2026-10-23T09:00:00.000Z';
    const beeAt = '2026-10-23T11:00:00.000Z';
    const shotAt = '2026-10-23T12:00:00.000Z';
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_hand_old', ALICE.id, 'Older Cafe', 'cafe', 'inbox', handAt, handAt]
    );
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_src_a', ALICE.id, 'Aye', 'cafe', 'inbox', ayeAt, ayeAt]
    );
    await execute(
      `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['plc_src_b', ALICE.id, 'Bee', 'cafe', 'inbox', beeAt, beeAt]
    );
    await source('src_b', ALICE.id, 'session_dropped', 'pending', shotAt);
    await source('src_a', ALICE.id, 'session_dropped', 'pending', shotAt);
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_b', 'plc_src_b']);
    await execute(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_a', 'plc_src_a']);

    const model = await screenModel();
    expect(model.view).toBe('home');
    if (model.view !== 'home') return;
    expect(model.addedAnotherWay?.names).toBe('Bee, Aye and Older Cafe');
    expect(model.addedAnotherWay?.href).toBe('/review?placeId=plc_src_a');
  });
});
