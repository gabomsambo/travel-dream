/**
 * @jest-environment node
 *
 * `blobUrl` arrives from the client and is fetched server-side (and stored as
 * `sources.uri`, which the privileged cron fetches again). It must be pinned to
 * the blob store before either happens.
 */

// ── Module mocks (BEFORE imports) ──────────────────────────────────────
jest.mock('@/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn((err: unknown) => err instanceof Error && err.message === 'Unauthorized'),
}));

jest.mock('@/lib/db-utils', () => ({
  withErrorHandling: jest.fn(async (fn: () => Promise<unknown>) => fn()),
  withTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      }),
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ id: 'src_test-new' }]),
        }),
      }),
    })
  ),
  generateSourceId: jest.fn().mockReturnValue('src_test-new'),
}));

jest.mock('@/lib/db-mutations', () => ({
  createSource: jest.fn().mockResolvedValue({ id: 'src_test-new' }),
  createAttachment: jest.fn().mockResolvedValue({ id: 'att_test-new' }),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { isAllowedBlobUrl } from '@/lib/blob-url';
import { POST as REGISTER_POST } from '@/app/api/mass-upload/register/route';
import { POST as UPLOAD_BLOB_COMPLETE } from '@/app/api/upload/blob-complete/route';
import { POST as ATTACHMENT_BLOB_COMPLETE } from '@/app/api/places/[id]/attachments/blob-complete/route';
import { db } from '@/db';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { createSource, createAttachment } from '@/lib/db-mutations';
import { createMockUser, createMockSession } from '../helpers/mass-upload-helpers';
import { mockSelect } from '../helpers/authz-helpers';

const mockDb = db as unknown as { select: jest.Mock };
const mockRequireAuth = requireAuthForApi as jest.MockedFunction<typeof requireAuthForApi>;
const mockCreateSource = createSource as jest.Mock;
const mockCreateAttachment = createAttachment as jest.Mock;

const CALLER = createMockUser({ id: 'user_caller' });
const ALLOWED = 'https://teststore.public.blob.vercel-storage.com/a.jpg';
// Off-store URLs the server must refuse to fetch or persist
const OFF_STORE = 'https://example.com/a.jpg';
const INTERNAL = 'http://127.0.0.1/a.jpg';
const LOOKALIKE = 'https://public.blob.vercel-storage.com.example.com/a.jpg';

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('isAllowedBlobUrl', () => {
  it('accepts a Vercel Blob store URL', () => {
    expect(isAllowedBlobUrl(ALLOWED)).toBe(true);
  });

  it.each([
    ['an arbitrary external host', OFF_STORE],
    ['a loopback address', INTERNAL],
    ['a suffix look-alike host', LOOKALIKE],
    ['a non-https scheme', 'http://teststore.public.blob.vercel-storage.com/a.jpg'],
    ['a malformed URL', 'not-a-url'],
  ])('rejects %s', (_label, url) => {
    expect(isAllowedBlobUrl(url)).toBe(false);
  });

  it('accepts a host named in BLOB_ALLOWED_HOSTS', () => {
    const previous = process.env.BLOB_ALLOWED_HOSTS;
    process.env.BLOB_ALLOWED_HOSTS = 'my-store.example.net';
    try {
      expect(isAllowedBlobUrl('https://my-store.example.net/a.jpg')).toBe(true);
      expect(isAllowedBlobUrl(OFF_STORE)).toBe(false);
    } finally {
      process.env.BLOB_ALLOWED_HOSTS = previous;
    }
  });
});

describe('POST /api/mass-upload/register', () => {
  const body = {
    sessionId: 'session_test-1',
    blobUrl: ALLOWED,
    originalName: 'photo.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }) as unknown as typeof fetch;
    mockDb.select
      // 1. session lookup  2. duplicate-hash lookup (no duplicate)
      .mockReturnValueOnce(mockSelect([createMockSession({ userId: CALLER.id })]).chain)
      .mockReturnValue(mockSelect([]).chain);
  });

  it.each([
    ['an off-store host', OFF_STORE],
    ['a loopback address', INTERNAL],
    ['a suffix look-alike host', LOOKALIKE],
  ])('rejects %s with 400 without fetching it', async (_label, blobUrl) => {
    const res = await REGISTER_POST(
      jsonRequest('http://localhost:3000/api/mass-upload/register', { ...body, blobUrl })
    );

    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('still accepts a real blob URL', async () => {
    const res = await REGISTER_POST(
      jsonRequest('http://localhost:3000/api/mass-upload/register', body)
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(ALLOWED);
  });
});

describe('POST /api/upload/blob-complete', () => {
  const body = {
    sessionId: 'session_test-1',
    blobUrl: ALLOWED,
    originalName: 'photo.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
    mockDb.select.mockReturnValue(mockSelect([createMockSession({ userId: CALLER.id })]).chain);
  });

  it('rejects an off-store URL with 400 and stores nothing', async () => {
    const res = await UPLOAD_BLOB_COMPLETE(
      jsonRequest('http://localhost:3000/api/upload/blob-complete', { ...body, blobUrl: OFF_STORE })
    );

    expect(res.status).toBe(400);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });
});

describe('POST /api/places/[id]/attachments/blob-complete', () => {
  const body = {
    blobUrl: ALLOWED,
    originalName: 'photo.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(CALLER);
    mockDb.select.mockReturnValue(mockSelect([{ id: 'plc_1', userId: CALLER.id }]).chain);
  });

  it('rejects an off-store URL with 400 and stores nothing', async () => {
    const res = await ATTACHMENT_BLOB_COMPLETE(
      jsonRequest('http://localhost:3000/api/places/plc_1/attachments/blob-complete', {
        ...body,
        blobUrl: OFF_STORE,
      }),
      { params: Promise.resolve({ id: 'plc_1' }) }
    );

    expect(res.status).toBe(400);
    expect(mockCreateAttachment).not.toHaveBeenCalled();
  });

  it('still accepts a real blob URL for the place owner', async () => {
    const res = await ATTACHMENT_BLOB_COMPLETE(
      jsonRequest('http://localhost:3000/api/places/plc_1/attachments/blob-complete', body),
      { params: Promise.resolve({ id: 'plc_1' }) }
    );

    expect(res.status).toBe(200);
    expect(mockCreateAttachment).toHaveBeenCalledTimes(1);
  });
});
