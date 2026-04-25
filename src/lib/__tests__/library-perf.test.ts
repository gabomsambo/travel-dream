/**
 * Validates the narrowed projection used by /library and /archive routes.
 *
 * Goal: prove searchLibraryPlaces returns objects WITHOUT the dropped columns
 * (hours, companions, admin, googlePlaceId, confidence, website, phone, email,
 * best_time, lastVisited, plannedVisit, recommendedBy, coords) and that the
 * LibraryPlace type structurally satisfies every downstream consumer.
 */

// next/cache: unstable_cache must pass through (return the inner fn invoked)
// so the underlying query runs against the mock db.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
  revalidateTag: jest.fn(),
}));

// Mock @/db with a fresh chain whose terminal `orderBy` is a Jest mock we can
// control. The factory keeps everything self-contained — no closure over outer
// vars that would race with hoisting.
jest.mock('@/db', () => {
  const orderBy = jest.fn();
  const where = jest.fn(() => ({ orderBy }));
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));
  return {
    db: { select },
    __mocks: { select, from, where, orderBy },
  };
});

// Schema modules: lightweight stubs so drizzle-orm operators don't blow up.
jest.mock('@/db/schema', () => ({
  places: new Proxy({}, { get: (_t, prop) => prop }),
  attachments: new Proxy({}, { get: (_t, prop) => prop }),
  sources: {},
  collections: {},
  sourcesToPlaces: {},
  placesToCollections: {},
}));

jest.mock('@/db/schema/sources-current', () => ({
  sourcesCurrentSchema: {},
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((a, b) => ({ op: 'eq', a, b })),
  and: jest.fn((...args) => ({ op: 'and', args })),
  or: jest.fn((...args) => ({ op: 'or', args })),
  like: jest.fn(),
  inArray: jest.fn(),
  desc: jest.fn((x) => ({ op: 'desc', x })),
  asc: jest.fn((x) => ({ op: 'asc', x })),
  sql: jest.fn(),
  gte: jest.fn(),
  lte: jest.fn(),
  between: jest.fn(),
  isNull: jest.fn(),
}));

import { searchLibraryPlaces, type LibraryPlace } from '../db-queries';

// Pull the mock chain back out so individual tests can set return values.
const dbMockExports = jest.requireMock('@/db') as {
  __mocks: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
  };
};
const { select: mockSelect, where: mockWhere, orderBy: mockOrderBy } = dbMockExports.__mocks;

describe('searchLibraryPlaces', () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockWhere.mockClear();
    mockOrderBy.mockClear();
  });

  it('selects only the narrow projection — no dropped columns', async () => {
    mockOrderBy.mockResolvedValueOnce([]);

    await searchLibraryPlaces({ userId: 'user_123', status: 'library' });

    expect(mockSelect).toHaveBeenCalledTimes(1);
    const projection = mockSelect.mock.calls[0][0] as Record<string, unknown>;

    // Dropped columns must NOT appear in the projection.
    const dropped = [
      'hours',
      'companions',
      'admin',
      'googlePlaceId',
      'confidence',
      'website',
      'phone',
      'email',
      'best_time',
      'lastVisited',
      'plannedVisit',
      'recommendedBy',
      'coords',
    ];
    for (const field of dropped) {
      expect(projection).not.toHaveProperty(field);
    }

    // Required columns must be present.
    const required = [
      'id',
      'userId',
      'name',
      'kind',
      'city',
      'country',
      'description',
      'tags',
      'vibes',
      'ratingSelf',
      'notes',
      'status',
      'price_level',
      'visitStatus',
      'priority',
      'address',
      'altNames',
      'cuisine',
      'activities',
      'amenities',
      'practicalInfo',
      'createdAt',
      'updatedAt',
    ];
    for (const field of required) {
      expect(projection).toHaveProperty(field);
    }
  });

  it('filters by userId and status', async () => {
    mockOrderBy.mockResolvedValueOnce([]);
    await searchLibraryPlaces({ userId: 'user_abc', status: 'archived' });

    expect(mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockWhere.mock.calls[0][0];
    expect(whereArg).toMatchObject({ op: 'and' });
  });

  it('returns rows from the underlying query unchanged', async () => {
    const fakeRows: Partial<LibraryPlace>[] = [
      { id: 'plc_1', name: 'Sagrada Familia', kind: 'landmark', status: 'library' },
      { id: 'plc_2', name: 'Park Guell', kind: 'park', status: 'library' },
    ];
    mockOrderBy.mockResolvedValueOnce(fakeRows);

    const result = await searchLibraryPlaces({ userId: 'user_x', status: 'library' });
    expect(result).toEqual(fakeRows);
  });
});

/**
 * Compile-time test: LibraryPlace must contain every field the downstream
 * consumers read. If any of these accesses fail to compile, a consumer is
 * relying on a column the projection drops.
 */
describe('LibraryPlace type — compile-time field coverage', () => {
  it('exposes every field consumed by PlaceCardV2, PlaceListView, and search-service', () => {
    const example: LibraryPlace = {
      id: 'plc_test',
      userId: 'user_test',
      name: 'Test',
      kind: 'restaurant',
      city: 'Barcelona',
      country: 'ES',
      description: 'desc',
      tags: ['a'],
      vibes: ['b'],
      ratingSelf: 4,
      notes: 'n',
      status: 'library',
      price_level: '$$',
      visitStatus: 'visited',
      priority: 3,
      address: '1 Main St',
      altNames: ['alt'],
      cuisine: ['Spanish'],
      activities: ['eating'],
      amenities: ['wifi'],
      practicalInfo: 'cash only',
      createdAt: '2026-04-25T00:00:00Z',
      updatedAt: '2026-04-25T00:00:00Z',
    };

    expect(example.id).toBe('plc_test');
    expect(example.name).toBe('Test');
    expect(example.kind).toBe('restaurant');
    expect(example.city).toBe('Barcelona');
    expect(example.country).toBe('ES');
    expect(example.description).toBe('desc');
    expect(example.tags).toEqual(['a']);
    expect(example.vibes).toEqual(['b']);
    expect(example.ratingSelf).toBe(4);
    expect(example.notes).toBe('n');
    expect(example.status).toBe('library');
    expect(example.price_level).toBe('$$');
    expect(example.visitStatus).toBe('visited');
    expect(example.priority).toBe(3);
    expect(example.address).toBe('1 Main St');
    expect(example.altNames).toEqual(['alt']);
    expect(example.cuisine).toEqual(['Spanish']);
    expect(example.activities).toEqual(['eating']);
    expect(example.amenities).toEqual(['wifi']);
    expect(example.practicalInfo).toBe('cash only');
    expect(example.createdAt).toBeDefined();
    expect(example.updatedAt).toBeDefined();
  });
});
