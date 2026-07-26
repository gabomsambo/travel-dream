/**
 * @jest-environment node
 *
 * `createPlacesFromPipeline` used to issue up to two dedup SELECTs per extracted
 * place. A screenshot with ten places meant twenty sequential round trips, which
 * is what pushed heavy runs past the function time limit. These tests pin the
 * batched shape AND the dedup semantics it has to preserve.
 */

jest.mock('@/db', () => ({ db: {} }));
jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: (op: () => Promise<unknown>) => op(),
  withTransaction: (op: (tx: unknown) => Promise<unknown>) => op(mockTx),
  generateSourceId: () => 'src_generated',
  generatePlaceId: () => `plc_generated_${++generatedCount}`,
  generateCollectionId: () => 'col_generated',
}));
jest.mock('@vercel/blob', () => ({ del: jest.fn() }));

let generatedCount = 0;
type SelectCall = { table: string; rows: unknown[] };

const selectCalls: SelectCall[] = [];
const insertedByTable: Record<string, unknown[]> = {};
let existingPlaces: Array<Record<string, unknown>> = [];
let sourceRow: Record<string, unknown> | null = null;

/**
 * Minimal drizzle-shaped transaction: enough to observe how many SELECTs the
 * function issues and what it inserts.
 */
const mockTx = {
  select: () => ({
    from: (table: { _: { name: string } }) => {
      const name = tableName(table);
      const rows =
        name === 'sources' ? (sourceRow ? [sourceRow] : []) : name === 'places' ? existingPlaces : [];
      selectCalls.push({ table: name, rows });
      const result = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
      result.where = () => {
        const withLimit = Promise.resolve(rows) as Promise<unknown[]> & Record<string, unknown>;
        withLimit.limit = () => Promise.resolve(rows);
        return withLimit;
      };
      return result;
    },
  }),
  insert: (table: { _: { name: string } }) => ({
    values: (vals: unknown) => {
      const name = tableName(table);
      const list = Array.isArray(vals) ? vals : [vals];
      insertedByTable[name] = [...(insertedByTable[name] ?? []), ...list];
      const chain = Promise.resolve(
        list.map((v) => ({ ...(v as object) }))
      ) as Promise<unknown[]> & Record<string, unknown>;
      chain.onConflictDoNothing = () => Promise.resolve(list);
      chain.returning = () => Promise.resolve(list.map((v) => ({ ...(v as object) })));
      return chain;
    },
  }),
};

function tableName(table: unknown): string {
  const symbols = Object.getOwnPropertySymbols(table as object);
  for (const sym of symbols) {
    const value = (table as Record<symbol, unknown>)[sym];
    if (typeof value === 'string') return value;
  }
  return String((table as { _?: { name?: string } })?._?.name ?? 'unknown');
}

import { createPlacesFromPipeline } from '@/lib/db-mutations';
import type { PipelinePlace } from '@/types/extraction-pipeline';

function pipelinePlace(overrides: Partial<PipelinePlace> = {}): PipelinePlace {
  return {
    name: 'Test Place',
    kind: 'restaurant',
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
    coords: { lat: 1, lon: 2 },
    address: '1 Street',
    googlePlaceId: null,
    ...overrides,
  } as PipelinePlace;
}

describe('createPlacesFromPipeline batching', () => {
  beforeEach(() => {
    selectCalls.length = 0;
    for (const key of Object.keys(insertedByTable)) delete insertedByTable[key];
    existingPlaces = [];
    generatedCount = 0;
    sourceRow = {
      id: 'src_1',
      uri: 'https://store.public.blob.vercel-storage.com/shot.jpg',
      userId: 'user_1',
      meta: { uploadInfo: { originalName: 'shot.jpg', mimeType: 'image/jpeg' } },
    };
  });

  it('uses a fixed number of lookups regardless of how many places a screenshot has', async () => {
    const ten = Array.from({ length: 10 }, (_, i) =>
      pipelinePlace({ name: `Place ${i}`, googlePlaceId: `g_${i}` })
    );

    await createPlacesFromPipeline(ten, 'src_1', 'user_1');

    // 1 source lookup + 1 by googlePlaceId + 1 by name — not 1 + 2 per place.
    expect(selectCalls).toHaveLength(3);
    expect(selectCalls.filter((c) => c.table === 'places')).toHaveLength(2);
  });

  it('scales lookups flat: 30 places cost the same number of queries as 10', async () => {
    const thirty = Array.from({ length: 30 }, (_, i) =>
      pipelinePlace({ name: `Place ${i}`, googlePlaceId: `g_${i}` })
    );

    await createPlacesFromPipeline(thirty, 'src_1', 'user_1');

    expect(selectCalls).toHaveLength(3);
  });

  it('reuses an existing place matched by googlePlaceId instead of inserting', async () => {
    existingPlaces = [
      { id: 'plc_existing', name: 'Anything', city: 'Lisbon', country: 'Portugal', googlePlaceId: 'g_1' },
    ];

    const created = await createPlacesFromPipeline(
      [pipelinePlace({ name: 'Different Name', googlePlaceId: 'g_1' })],
      'src_1',
      'user_1'
    );

    expect(created[0].id).toBe('plc_existing');
    expect(insertedByTable['places']).toBeUndefined();
    expect(insertedByTable['sources_to_places']).toHaveLength(1);
  });

  it('reuses an existing place matched by name + city + country, case-insensitively', async () => {
    existingPlaces = [
      { id: 'plc_existing', name: 'TEST PLACE', city: 'LISBON', country: 'PORTUGAL', googlePlaceId: null },
    ];

    const created = await createPlacesFromPipeline(
      [pipelinePlace({ name: 'test place', city: 'lisbon', country: 'portugal' })],
      'src_1',
      'user_1'
    );

    expect(created[0].id).toBe('plc_existing');
    expect(insertedByTable['places']).toBeUndefined();
  });

  it('does not treat a same-named place in another city as a duplicate', async () => {
    existingPlaces = [
      { id: 'plc_existing', name: 'Test Place', city: 'Porto', country: 'Portugal', googlePlaceId: null },
    ];

    const created = await createPlacesFromPipeline([pipelinePlace()], 'src_1', 'user_1');

    expect(created[0].id).not.toBe('plc_existing');
    expect(insertedByTable['places']).toHaveLength(1);
  });

  it('dedupes places repeated inside one screenshot (batch-local dedup)', async () => {
    const created = await createPlacesFromPipeline(
      [pipelinePlace(), pipelinePlace(), pipelinePlace({ name: 'Other Place' })],
      'src_1',
      'user_1'
    );

    expect(created).toHaveLength(3);
    expect(insertedByTable['places']).toHaveLength(2); // the repeat was not inserted twice
    expect(insertedByTable['sources_to_places']).toHaveLength(2); // and only linked once
  });

  it('attaches the screenshot to each newly created place exactly once', async () => {
    await createPlacesFromPipeline(
      [pipelinePlace({ name: 'A' }), pipelinePlace({ name: 'B' })],
      'src_1',
      'user_1'
    );

    expect(insertedByTable['attachments']).toHaveLength(2);
    expect(insertedByTable['attachments']?.every((a) => (a as { isPrimary: number }).isPrimary === 1)).toBe(true);
  });

  it('refuses to write places for a source the user does not own', async () => {
    sourceRow = null;

    await expect(createPlacesFromPipeline([pipelinePlace()], 'src_1', 'user_1')).rejects.toThrow(
      /not found or unauthorized/
    );
  });
});
