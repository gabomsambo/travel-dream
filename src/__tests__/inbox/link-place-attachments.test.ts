/**
 * @jest-environment node
 *
 * URL sources must not become primary photos. createPlacesFromPipeline used to
 * attach source.uri for every source type, so a TikTok/Instagram page URL was
 * stored as image/jpeg and served as the cover.
 */
import {
  ALICE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

import { createPlacesFromPipeline } from '@/lib/db-mutations';
import type { PipelinePlace } from '@/types/extraction-pipeline';

type ExecResult = { rows: Record<string, unknown>[] };

function client(): { execute: (query: { sql: string; args?: unknown[] }) => Promise<ExecResult> } {
  return (require('@/db') as { client: { execute: (query: { sql: string; args?: unknown[] }) => Promise<ExecResult> } }).client;
}

async function execute(sql: string, args: unknown[] = []): Promise<ExecResult> {
  return client().execute({ sql, args });
}

function pipelinePlace(overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name: 'Manteigaria',
    kind: 'bakery',
    city: 'Lisbon',
    country: 'Portugal',
    admin: null,
    description: null,
    tags: null,
    vibes: null,
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
    coords: { lat: 38.71, lon: -9.14 },
    address: null,
    googlePlaceId: null,
    ...overrides,
  } as PipelinePlace;
}

const SOCIAL_URL = 'https://www.tiktok.com/@creator/video/7694185850497666335';
const SCREENSHOT_URL = 'https://store.public.blob.vercel-storage.com/link-shot.jpg';

beforeAll(() => {
  assertLocalDatabase();
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
});

describe('createPlacesFromPipeline link attachments', () => {
  it('does not store a URL source page as a place photo', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        'src_link_url',
        ALICE.id,
        'url',
        SOCIAL_URL,
        'Pasted caption:\nTry Manteigaria in Lisbon',
        'queued',
        JSON.stringify({ platform: 'tiktok', link: { canonicalUrl: SOCIAL_URL, postId: '7694185850497666335' } }),
        now,
        now,
      ],
    );

    const created = await createPlacesFromPipeline([pipelinePlace()], 'src_link_url', ALICE.id);
    expect(created).toHaveLength(1);
    expect(created.createdCount).toBe(1);

    expect(await readCell(
      `SELECT count(*) FROM attachments WHERE place_id = ? AND uri = ?`,
      [created[0].id, SOCIAL_URL],
    )).toBe(0);
    expect(await readCell(`SELECT count(*) FROM attachments WHERE place_id = ?`, [created[0].id])).toBe(0);
    expect(await readCell(
      `SELECT count(*) FROM sources_to_places WHERE source_id = ? AND place_id = ?`,
      ['src_link_url', created[0].id],
    )).toBe(1);
  });

  it('still attaches screenshot bytes as the primary photo', async () => {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        'src_link_shot',
        ALICE.id,
        'screenshot',
        SCREENSHOT_URL,
        'Manteigaria Lisbon',
        'queued',
        JSON.stringify({ uploadInfo: { originalName: 'shot.jpg', mimeType: 'image/jpeg' } }),
        now,
        now,
      ],
    );

    const created = await createPlacesFromPipeline([pipelinePlace()], 'src_link_shot', ALICE.id);
    expect(created).toHaveLength(1);

    expect(await readCell(
      `SELECT uri FROM attachments WHERE place_id = ? AND is_primary = 1`,
      [created[0].id],
    )).toBe(SCREENSHOT_URL);
  });
});
