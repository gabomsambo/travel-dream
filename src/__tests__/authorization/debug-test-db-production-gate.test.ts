/**
 * @jest-environment node
 *
 * GET /api/test-db is a debug endpoint: it enumerates `sqlite_master`, probes
 * every table and reports which database credentials are configured. It must
 * refuse in production for every caller, signed in or not.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { all: jest.fn() },
  testConnection: jest.fn(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-queries', () => ({
  getPlaceStats: jest.fn().mockResolvedValue({ total: 0 }),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { GET } from '@/app/api/test-db/route';
import { db, testConnection } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createMockUser } from '../helpers/mass-upload-helpers';

const mockDb = db as unknown as { all: jest.Mock };
const mockTestConnection = testConnection as jest.Mock;
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = env.NODE_ENV;

describe('GET /api/test-db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(createMockUser());
    mockTestConnection.mockResolvedValue(true);
    mockDb.all.mockResolvedValue([{ name: 'places' }, { name: 'users' }]);
  });

  afterEach(() => {
    env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('refuses in production, before touching auth or the database', async () => {
    env.NODE_ENV = 'production';

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
    expect(mockRequireAuth).not.toHaveBeenCalled();
    expect(mockTestConnection).not.toHaveBeenCalled();
    expect(mockDb.all).not.toHaveBeenCalled();
  });

  it('still answers a signed-in caller outside production', async () => {
    env.NODE_ENV = 'development';

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.database.tables).toEqual(['places', 'users']);
  });
});
