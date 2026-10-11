/**
 * @jest-environment node
 *
 * Merge, dismiss, and hard-dedup fixes against a real local SQLite file.
 * The fixture import must stay first so `@/db` never opens a remote database.
 */
import {
  ALICE,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  apiRequest,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: (error: unknown) => error instanceof Error && error.message === 'Unauthorized',
}));
jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

import { requireAuthForApi } from '@/lib/auth-helpers';
import { bulkMergePlaces, createPlacesFromPipeline } from '@/lib/db-mutations';
import { computeMergedPlace } from '@/lib/duplicate-target-selector';
import { MERGE_OVERRIDE_FIELDS, pickMergedPlaceFields, type MergeFieldOverrides, type MergeOverrideField } from '@/lib/place-merge';
import type { Place } from '@/types/database';
import type { PipelinePlace } from '@/types/extraction-pipeline';

const mockAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

type Exec = { execute: (q: string | { sql: string; args?: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };

function client(): Exec {
  return (require('@/db') as { client: Exec }).client;
}

async function db() {
  return (require('@/db') as { db: any }).db;
}

const now = '2026-10-11T12:00:00.000Z';

async function insertPlace(row: Record<string, unknown>): Promise<Place> {
  const { places } = require('@/db/schema') as typeof import('@/db/schema');
  const { eq } = require('drizzle-orm') as typeof import('drizzle-orm');
  const database = await db();
  await database.insert(places).values({
    userId: ALICE.id,
    createdAt: now,
    updatedAt: now,
    altNames: [],
    tags: [],
    vibes: [],
    confidence: 0.5,
    ratingSelf: 0,
    ...row,
  });
  const [saved] = await database.select().from(places).where(eq(places.id, row.id as string));
  return saved as Place;
}

describe('duplicate merge fixes', () => {
  beforeAll(() => {
    useUniqueUuids();
  });

  beforeEach(async () => {
    assertLocalDatabase();
    mockAuth.mockResolvedValue({ ...ALICE });
    // These tables reference users/places and are not part of the shared fixture
    // reset. Clear them first so that reset can delete its users.
    for (const table of ['reservations', 'place_links', 'merge_logs', 'dismissed_duplicates']) {
      try {
        await client().execute(`DELETE FROM ${table}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('no such table')) throw error;
      }
    }
    await resetTenantFixture();
  });

  it('fills empty fields, unions lists, keeps library, and moves photos, reservations, and links', async () => {
    const { attachments, reservations, placeLinks, collections, placesToCollections } =
      require('@/db/schema') as typeof import('@/db/schema');
    const database = await db();

    const target = await insertPlace({
      id: 'plc_keep',
      name: 'Keep Me',
      kind: 'cafe',
      status: 'inbox',
      description: null,
      address: null,
      city: null,
      country: null,
      admin: null,
      coords: null,
      website: null,
      phone: null,
      hours: null,
      price_level: null,
      best_time: null,
      practicalInfo: null,
      googlePlaceId: null,
      activities: [],
      cuisine: [],
      amenities: [],
      tags: ['kept-tag'],
      vibes: [],
      altNames: [],
      notes: 'kept note',
      confidence: 0.4,
      ratingSelf: 1,
    });
    const absorbed = await insertPlace({
      id: 'plc_absorb',
      name: 'Absorb Me',
      kind: 'restaurant',
      status: 'library',
      description: 'A full description of the absorbed place.',
      address: '1 Rua Augusta',
      city: 'Lisbon',
      country: 'Portugal',
      admin: 'Lisboa',
      coords: { lat: 38.7139, lon: -9.1394 },
      website: 'https://example.test/absorb',
      phone: '+351210000000',
      hours: { monday: '9-17' },
      price_level: '$$',
      best_time: 'summer',
      practicalInfo: 'Bring cash',
      googlePlaceId: 'ChIJ_absorb_full',
      activities: ['walk'],
      cuisine: ['portuguese', 'kept-tag'],
      amenities: ['wifi'],
      tags: ['source-tag', 'Kept-Tag'],
      vibes: ['cozy'],
      altNames: ['Absorb'],
      notes: 'absorb note',
      confidence: 0.95,
      ratingSelf: 5,
    });

    await database.insert(collections).values({
      id: 'col_shared',
      userId: ALICE.id,
      name: 'Shared',
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(collections).values({
      id: 'col_only',
      userId: ALICE.id,
      name: 'Only absorbed',
      createdAt: now,
      updatedAt: now,
    });
    await database.insert(placesToCollections).values([
      { placeId: 'plc_keep', collectionId: 'col_shared', orderIndex: 0, isPinned: 0, note: 'KEEP NOTE' },
      { placeId: 'plc_absorb', collectionId: 'col_shared', orderIndex: 1, isPinned: 1, note: 'ABSORB NOTE' },
      { placeId: 'plc_absorb', collectionId: 'col_only', orderIndex: 0, isPinned: 0, note: 'ONLY ON ABSORBED' },
    ]);
    await database.insert(attachments).values([
      {
        id: 'att_keep',
        placeId: 'plc_keep',
        type: 'photo',
        uri: 'https://example.test/keep.jpg',
        filename: 'keep.jpg',
        isPrimary: 1,
        source: 'upload',
      },
      {
        id: 'att_absorb',
        placeId: 'plc_absorb',
        type: 'photo',
        uri: 'https://example.test/absorb.jpg',
        filename: 'absorb.jpg',
        isPrimary: 1,
        source: 'upload',
      },
    ]);
    await database.insert(reservations).values({
      id: 'rsv_absorb',
      placeId: 'plc_absorb',
      reservationDate: '2026-11-01',
      status: 'confirmed',
    });
    await database.insert(placeLinks).values({
      id: 'lnk_absorb',
      placeId: 'plc_absorb',
      url: 'https://example.test/link',
      title: 'Article',
    });

    const preview = computeMergedPlace(target, [absorbed]);
    const result = await bulkMergePlaces(
      [{ targetId: 'plc_keep', sourceIds: ['plc_absorb'], confidence: 0.91 }],
      ALICE.id
    );

    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);

    const { places, eq } = { ...(require('@/db/schema') as typeof import('@/db/schema')), ...(require('drizzle-orm') as typeof import('drizzle-orm')) };
    const [saved] = await database.select().from(places).where(eq(places.id, 'plc_keep'));

    expect(pickMergedPlaceFields(saved as Place)).toEqual(pickMergedPlaceFields(preview));
    expect(saved.status).toBe('library');
    expect(saved.kind).toBe('cafe');
    expect(saved.city).toBe('Lisbon');
    expect(saved.description).toBe('A full description of the absorbed place.');
    expect(saved.googlePlaceId).toBe('ChIJ_absorb_full');
    expect(saved.confidence).toBe(0.95);
    expect(saved.ratingSelf).toBe(5);
    expect(saved.tags).toEqual(expect.arrayContaining(['kept-tag', 'source-tag']));
    expect(saved.notes).toContain('kept note');
    expect(saved.notes).toContain('absorb note');

    expect(await readCell('SELECT status FROM places WHERE id = ?', ['plc_absorb'])).toBe('archived');
    expect(await readCell('SELECT place_id FROM attachments WHERE id = ?', ['att_absorb'])).toBe('plc_keep');
    expect(await readCell('SELECT is_primary FROM attachments WHERE id = ?', ['att_absorb'])).toBe(0);
    expect(await readCell('SELECT is_primary FROM attachments WHERE id = ?', ['att_keep'])).toBe(1);
    expect(await readCell('SELECT place_id FROM reservations WHERE id = ?', ['rsv_absorb'])).toBe('plc_keep');
    expect(await readCell('SELECT place_id FROM place_links WHERE id = ?', ['lnk_absorb'])).toBe('plc_keep');
    expect(await readCell(
      'SELECT note FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
      ['plc_keep', 'col_shared']
    )).toBe('KEEP NOTE\n\n---\n\nABSORB NOTE');
    expect(await readCell(
      'SELECT note FROM places_to_collections WHERE place_id = ? AND collection_id = ?',
      ['plc_keep', 'col_only']
    )).toBe('ONLY ON ABSORBED');
    expect(await readCell(
      'SELECT COUNT(*) FROM places_to_collections WHERE place_id = ?',
      ['plc_absorb']
    )).toBe(0);

    const log = JSON.parse(String(await readCell('SELECT merged_data FROM merge_logs')));
    expect(log.movedRelations.attachmentIds).toEqual(expect.arrayContaining(['att_absorb']));
    expect(log.movedRelations.reservationIds).toEqual(['rsv_absorb']);
    expect(log.movedRelations.placeLinkIds).toEqual(['lnk_absorb']);
    expect(log.status).toBe('library');
  });

  it('persists a field override the same way the preview shows it', async () => {
    const target = await insertPlace({
      id: 'plc_keep',
      name: 'Keep Me',
      kind: 'cafe',
      status: 'library',
      description: 'Kept description',
      city: 'Lisbon',
      country: 'Portugal',
    });
    const absorbed = await insertPlace({
      id: 'plc_absorb',
      name: 'Absorb Me',
      kind: 'restaurant',
      status: 'inbox',
      description: 'Absorbed description',
      city: 'Lisboa',
      country: 'Portugal',
    });
    const fieldOverrides: MergeFieldOverrides = { description: 'plc_absorb', city: 'plc_absorb' };
    const preview = computeMergedPlace(target, [absorbed], fieldOverrides);

    await bulkMergePlaces(
      [{ targetId: 'plc_keep', sourceIds: ['plc_absorb'], confidence: 0.8, fieldOverrides }],
      ALICE.id
    );

    const { places, eq } = { ...(require('@/db/schema') as typeof import('@/db/schema')), ...(require('drizzle-orm') as typeof import('drizzle-orm')) };
    const database = await db();
    const [saved] = await database.select().from(places).where(eq(places.id, 'plc_keep'));

    expect(pickMergedPlaceFields(saved as Place)).toEqual(pickMergedPlaceFields(preview));
    expect(saved.description).toBe('Absorbed description');
    expect(saved.city).toBe('Lisboa');
    expect(saved.kind).toBe('cafe');
    expect(saved.status).toBe('library');
  });

  it('fills from absorbed places in the order given, and the first value wins until an override', async () => {
    const target = await insertPlace({
      id: 'plc_keep',
      name: 'Keep Me',
      kind: 'cafe',
      status: 'inbox',
      description: null,
      phone: null,
    });
    const first = await insertPlace({
      id: 'plc_first',
      name: 'First',
      kind: 'cafe',
      status: 'inbox',
      description: 'From the first place',
      phone: '+1',
    });
    const second = await insertPlace({
      id: 'plc_second',
      name: 'Second',
      kind: 'cafe',
      status: 'inbox',
      description: 'From the second place',
      phone: '+2',
    });
    const preview = computeMergedPlace(target, [first, second]);

    await bulkMergePlaces(
      [{ targetId: 'plc_keep', sourceIds: ['plc_second', 'plc_first'], confidence: 0.8 }],
      ALICE.id
    );

    const database = await db();
    const { places, eq } = { ...(require('@/db/schema') as typeof import('@/db/schema')), ...(require('drizzle-orm') as typeof import('drizzle-orm')) };
    const [saved] = await database.select().from(places).where(eq(places.id, 'plc_keep'));
    const orderedPreview = computeMergedPlace(target, [second, first]);

    expect(pickMergedPlaceFields(saved as Place)).toEqual(pickMergedPlaceFields(orderedPreview));
    expect(saved.description).toBe('From the second place');
    expect(saved.phone).toBe('+2');
    expect(preview.description).toBe('From the first place');
  });

  it('clears the scan cache on dismiss so a reload does not show the group', async () => {
    await insertPlace({
      id: 'plc_saito_a',
      name: 'Sushi Saito',
      kind: 'restaurant',
      status: 'library',
      city: 'Tokyo',
      country: 'Japan',
      coords: { lat: 35.658, lon: 139.745 },
    });
    await insertPlace({
      id: 'plc_saito_b',
      name: 'Sushi Saito',
      kind: 'restaurant',
      status: 'inbox',
      city: 'Tokyo',
      country: 'Japan',
      coords: { lat: 35.6581, lon: 139.7451 },
    });

    const { GET } = require('@/app/api/places/duplicates/route') as typeof import('@/app/api/places/duplicates/route');
    const { POST } = require('@/app/api/places/dismiss-duplicate/route') as typeof import('@/app/api/places/dismiss-duplicate/route');

    const clustersUrl = 'http://localhost/api/places/duplicates?mode=clusters&minConfidence=0.7';
    const before = await GET(apiRequest(clustersUrl) as never);
    const beforeBody = await before.json() as { clusters: Array<{ places: Array<{ id: string }> }>; cached: boolean };
    expect(before.status).toBe(200);
    expect(beforeBody.cached).toBe(false);
    expect(beforeBody.clusters.some((cluster) =>
      cluster.places.some((place) => place.id === 'plc_saito_a') &&
      cluster.places.some((place) => place.id === 'plc_saito_b')
    )).toBe(true);

    const dismissed = await POST(apiRequest('http://localhost/api/places/dismiss-duplicate', 'POST', {
      pairs: [{ placeId1: 'plc_saito_a', placeId2: 'plc_saito_b' }],
    }) as never);
    expect(dismissed.status).toBe(200);

    const after = await GET(apiRequest(clustersUrl) as never);
    const afterBody = await after.json() as { clusters: Array<{ places: Array<{ id: string }> }>; cached: boolean };
    expect(after.status).toBe(200);
    expect(afterBody.cached).toBe(false);
    expect(afterBody.clusters.some((cluster) =>
      cluster.places.some((place) => place.id === 'plc_saito_a') &&
      cluster.places.some((place) => place.id === 'plc_saito_b')
    )).toBe(false);
  });

  it('attaches a new screenshot to the merge survivor when the matched place was archived by that merge', async () => {
    const { mergeLogs } = require('@/db/schema') as typeof import('@/db/schema');
    const database = await db();

    await insertPlace({
      id: 'plc_survivor',
      name: 'Keep Me',
      kind: 'attraction',
      status: 'library',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      googlePlaceId: 'ChIJ_survivor',
    });
    await insertPlace({
      id: 'plc_archived_merge',
      name: 'Absorb Me',
      kind: 'attraction',
      status: 'archived',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      googlePlaceId: 'ChIJ_absorb',
    });
    await database.insert(mergeLogs).values({
      id: 'mrg_redirect',
      targetId: 'plc_survivor',
      sourceIds: ['plc_archived_merge'],
      confidence: 0.9,
      performedBy: 'user',
      undone: false,
    });
    await client().execute({
      sql: `INSERT INTO sources (id, user_id, type, uri, processing_status, created_at, updated_at)
            VALUES (?, ?, 'screenshot', ?, 'completed', ?, ?)`,
      args: ['src_third', ALICE.id, 'https://example.test/third.jpg', now, now],
    });

    const pipelinePlace: PipelinePlace = {
      name: 'Absorb Me',
      kind: 'landmark',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      admin: null,
      description: null,
      tags: null,
      vibes: null,
      confidence: 0.8,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      practicalInfo: null,
      recommendedBy: null,
      coords: { lat: -25.6, lon: -54.5 },
      address: null,
      googlePlaceId: 'ChIJ_absorb',
    };

    const created = await createPlacesFromPipeline([pipelinePlace], 'src_third', ALICE.id);

    expect(created.map((place) => place.id)).toEqual(['plc_survivor']);
    expect(await readCell(
      'SELECT place_id FROM sources_to_places WHERE source_id = ?',
      ['src_third']
    )).toBe('plc_survivor');
    expect(await readCell(
      'SELECT COUNT(*) FROM places WHERE name = ? AND id NOT IN (?, ?)',
      ['Absorb Me', 'plc_archived_merge', 'plc_survivor']
    )).toBe(0);
  });

  it('still links an archived place that was not merged away', async () => {
    await insertPlace({
      id: 'plc_old_archive',
      name: 'Old Archive',
      kind: 'museum',
      status: 'archived',
      city: 'Oslo',
      country: 'Norway',
      googlePlaceId: 'ChIJ_old',
    });
    await client().execute({
      sql: `INSERT INTO sources (id, user_id, type, uri, processing_status, created_at, updated_at)
            VALUES (?, ?, 'screenshot', ?, 'completed', ?, ?)`,
      args: ['src_old', ALICE.id, 'https://example.test/old.jpg', now, now],
    });

    const created = await createPlacesFromPipeline([{
      name: 'Old Archive',
      kind: 'museum',
      city: 'Oslo',
      country: 'Norway',
      admin: null,
      description: null,
      tags: null,
      vibes: null,
      confidence: 0.7,
      price_level: null,
      best_time: null,
      activities: null,
      cuisine: null,
      amenities: null,
      practicalInfo: null,
      recommendedBy: null,
      coords: null,
      address: null,
      googlePlaceId: 'ChIJ_old',
    }], 'src_old', ALICE.id);

    expect(created[0].id).toBe('plc_old_archive');
    expect(await readCell(
      'SELECT place_id FROM sources_to_places WHERE source_id = ?',
      ['src_old']
    )).toBe('plc_old_archive');
  });

  describe('single-value field picks', () => {
    const keptFilled = {
      name: 'Kept Name',
      kind: 'cafe',
      city: 'Lisbon',
      country: 'Portugal',
      admin: 'Lisboa',
      address: '1 Kept Street',
      coords: { lat: 38.71, lon: -9.14 },
      website: 'https://kept.example',
      phone: '+351111111',
      hours: { monday: '9-17' },
      price_level: '$',
      best_time: 'morning',
      practicalInfo: 'Kept practical',
      description: 'Kept description',
      googlePlaceId: 'ChIJ_kept',
    } satisfies Record<MergeOverrideField, unknown>;

    const absorbedFilled = {
      name: 'Absorbed Name',
      kind: 'restaurant',
      city: 'Porto',
      country: 'Spain',
      admin: 'Porto',
      address: '2 Absorb Street',
      coords: { lat: 41.15, lon: -8.61 },
      website: 'https://absorb.example',
      phone: '+351222222',
      hours: { tuesday: '10-22' },
      price_level: '$$$',
      best_time: 'evening',
      practicalInfo: 'Absorb practical',
      description: 'Absorbed description',
      googlePlaceId: 'ChIJ_absorb',
    } satisfies Record<MergeOverrideField, unknown>;

    const keptEmpty = {
      name: '',
      kind: '',
      city: null,
      country: null,
      admin: null,
      address: null,
      coords: null,
      website: null,
      phone: null,
      hours: null,
      price_level: null,
      best_time: null,
      practicalInfo: null,
      description: null,
      googlePlaceId: null,
    } satisfies Record<MergeOverrideField, unknown>;

    async function mergePair(
      kept: Record<string, unknown>,
      absorbed: Record<string, unknown>,
      fieldOverrides?: MergeFieldOverrides
    ): Promise<{ saved: Place; preview: Place }> {
      const target = await insertPlace({
        id: 'plc_keep',
        status: 'inbox',
        altNames: [],
        tags: [],
        vibes: [],
        activities: [],
        cuisine: [],
        amenities: [],
        notes: null,
        confidence: 0.5,
        ratingSelf: 1,
        ...kept,
      });
      const source = await insertPlace({
        id: 'plc_absorb',
        status: 'inbox',
        altNames: [],
        tags: [],
        vibes: [],
        activities: [],
        cuisine: [],
        amenities: [],
        notes: null,
        confidence: 0.5,
        ratingSelf: 1,
        ...absorbed,
      });
      const preview = computeMergedPlace(target, [source], fieldOverrides);
      const result = await bulkMergePlaces(
        [{
          targetId: target.id,
          sourceIds: [source.id],
          confidence: 0.8,
          fieldOverrides,
        }],
        ALICE.id
      );
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);

      const database = await db();
      const { places, eq } = {
        ...(require('@/db/schema') as typeof import('@/db/schema')),
        ...(require('drizzle-orm') as typeof import('drizzle-orm')),
      };
      const [saved] = await database.select().from(places).where(eq(places.id, target.id));
      return { saved: saved as Place, preview };
    }

    function expectEachScalar(
      saved: Place,
      preview: Place,
      winner: Record<MergeOverrideField, unknown>
    ) {
      expect(pickMergedPlaceFields(saved)).toEqual(pickMergedPlaceFields(preview));
      for (const field of MERGE_OVERRIDE_FIELDS) {
        expect(preview[field]).toEqual(winner[field]);
        expect(saved[field]).toEqual(winner[field]);
      }
    }

    it('fills every empty single-value field, including a blank name, the way the preview shows', async () => {
      const { saved, preview } = await mergePair(keptEmpty, absorbedFilled);

      expectEachScalar(saved, preview, absorbedFilled);
      expect(saved.name).toBe('Absorbed Name');
      expect(saved.altNames).toEqual(['Absorbed Name']);
      expect(preview.altNames).toEqual(saved.altNames);
    });

    it('keeps each single-value field when both places have one, and stores the other name as an alt name', async () => {
      const { saved, preview } = await mergePair(keptFilled, absorbedFilled);

      expectEachScalar(saved, preview, keptFilled);
      expect(saved.name).toBe('Kept Name');
      expect(saved.altNames).toEqual(['Kept Name', 'Absorbed Name']);
      expect(preview.altNames).toEqual(saved.altNames);
    });

    it('persists an overridden pick for every single-value field the way the preview shows', async () => {
      const fieldOverrides = Object.fromEntries(
        MERGE_OVERRIDE_FIELDS.map((field) => [field, 'plc_absorb'])
      ) as MergeFieldOverrides;
      const { saved, preview } = await mergePair(keptFilled, absorbedFilled, fieldOverrides);

      expectEachScalar(saved, preview, absorbedFilled);
      expect(saved.name).toBe('Absorbed Name');
      expect(saved.altNames).toEqual(['Kept Name', 'Absorbed Name']);
      expect(preview.altNames).toEqual(saved.altNames);
    });
  });
});
