/**
 * @jest-environment node
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/photo-sources', () => {
  class ConfigError extends Error {
    constructor(public missingEnv: string) {
      super(`${missingEnv} not configured`);
      this.name = 'ConfigError';
    }
  }
  class RateLimitError extends Error {
    constructor(public retryAfterSec: number) {
      super(`Rate limited; retry after ${retryAfterSec}s`);
      this.name = 'RateLimitError';
    }
  }
  return {
    getAdapter: jest.fn(),
    ConfigError,
    RateLimitError,
    PHOTO_SOURCES: ['google_places', 'wikimedia', 'pexels'],
  };
});

jest.mock('@/lib/photo-sources/google-resolver', () => ({
  resolveGooglePhotoUri: jest.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { GET as searchGET } from '@/app/api/photos/search/route';
import { GET as resolveGET } from '@/app/api/photos/resolve/[attachmentId]/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { getAdapter, ConfigError } from '@/lib/photo-sources';
import { resolveGooglePhotoUri } from '@/lib/photo-sources/google-resolver';
import type { NextRequest } from 'next/server';

const mockDb = db as unknown as {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
};
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockGetAdapter = getAdapter as jest.MockedFunction<typeof getAdapter>;
const mockResolveUri = resolveGooglePhotoUri as jest.MockedFunction<typeof resolveGooglePhotoUri>;

const fakeUser = { id: 'user_1', email: 'u@x', name: 'U', image: null };

function makeSearchReq(qs: string): NextRequest {
  return new Request(`http://localhost:3000/api/photos/search?${qs}`) as unknown as NextRequest;
}

function makeResolveReq(): NextRequest {
  return new Request('http://localhost:3000/api/photos/resolve/att_x?w=600') as unknown as NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue(fakeUser);
});

describe('GET /api/photos/search', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await searchGET(makeSearchReq('source=wikimedia&q=x&placeId=plc_1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on Zod failure (unknown source)', async () => {
    const res = await searchGET(makeSearchReq('source=bad&q=x&placeId=plc_1'));
    expect(res.status).toBe(400);
  });

  it('returns 503 with missingEnv when adapter throws ConfigError', async () => {
    mockGetAdapter.mockReturnValueOnce({
      source: 'pexels',
      search: jest.fn().mockRejectedValue(new ConfigError('PEXELS_API_KEY')),
    });
    const res = await searchGET(makeSearchReq('source=pexels&q=x&placeId=plc_1'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missingEnv).toBe('PEXELS_API_KEY');
  });

  it('returns 200 with items[] on happy wikimedia path', async () => {
    mockGetAdapter.mockReturnValueOnce({
      source: 'wikimedia',
      search: jest.fn().mockResolvedValue({
        items: [{ source: 'wikimedia', sourceId: '100', thumbnailUrl: 'x', fullUrl: 'y', width: 1, height: 1, attribution: { kind: 'wikimedia', authorText: 'A', licenseShortName: 'CC0', licenseUrl: '', descriptionUrl: '' } }],
        nextPage: null,
      }),
    });
    const res = await searchGET(makeSearchReq('source=wikimedia&q=x&placeId=plc_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it('returns 400 for google_places when place has no googlePlaceId', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'plc_1', googlePlaceId: null }]),
        }),
      }),
    });
    const res = await searchGET(makeSearchReq('source=google_places&q=x&placeId=plc_1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Google Places mapping/);
  });
});

describe('GET /api/photos/resolve/[attachmentId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await resolveGET(makeResolveReq(), { params: Promise.resolve({ attachmentId: 'att_x' }) });
    expect(res.status).toBe(401);
  });

  it('returns 404 when attachment not found', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    });
    const res = await resolveGET(makeResolveReq(), { params: Promise.resolve({ attachmentId: 'att_x' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-google source attachments', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([
              { id: 'att_x', source: 'wikimedia', sourceId: '100' },
            ]),
          }),
        }),
      }),
    });
    const res = await resolveGET(makeResolveReq(), { params: Promise.resolve({ attachmentId: 'att_x' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/google_places/);
  });

  it('returns 302 redirect with cache header on happy path', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve([
              { id: 'att_x', source: 'google_places', sourceId: 'places/p/photos/r' },
            ]),
          }),
        }),
      }),
    });
    mockResolveUri.mockResolvedValueOnce('https://lh3.googleusercontent.com/abc');
    const res = await resolveGET(makeResolveReq(), { params: Promise.resolve({ attachmentId: 'att_x' }) });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://lh3.googleusercontent.com/abc');
    expect(res.headers.get('Cache-Control')).toContain('private');
  });
});
