/**
 * @jest-environment node
 *
 * End-to-end walk of the collection cover upload, exercising the real route
 * handlers in the order the browser calls them:
 *
 *   client picks a file
 *     -> POST /api/blob/upload            (mints the client upload token)
 *     -> PUT to the Vercel Blob store     (stubbed here; no network in tests)
 *     -> POST /api/collections/[id]/cover/blob-complete   (persists the URL)
 *
 * The point of the suite is the product rule: this flow must never write to the
 * local filesystem, because everything outside /tmp is read-only on Vercel. Every
 * fs write API is trapped for the duration of the flow, so a single writeFile or
 * mkdir anywhere under the handlers fails the test — that is exactly the bug the
 * old formData route had (mkdir public/uploads/collections/<id> -> EACCES/EROFS).
 */

import { promises as fsPromises } from 'fs';
import fsSync from 'fs';
import path from 'path';

process.env.BLOB_READ_WRITE_TOKEN =
  process.env.BLOB_READ_WRITE_TOKEN || 'vercel_blob_rw_teststore_testsecrettestsecret';

// Jest's node environment exposes a `crypto` global without `subtle`, which
// @vercel/blob uses to sign the client upload token. Node's WebCrypto has it.
if (!globalThis.crypto?.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  isAuthError: jest.fn(() => false),
}));

jest.mock('@/lib/db-queries', () => ({
  getCollectionById: jest.fn(),
}));

jest.mock('@/lib/db-mutations', () => ({
  updateCollection: jest.fn(),
}));

jest.mock('@vercel/blob', () => ({
  del: jest.fn().mockResolvedValue(undefined),
}));

import { POST as BLOB_UPLOAD_TOKEN } from '@/app/api/blob/upload/route';
import { POST as COVER_BLOB_COMPLETE } from '@/app/api/collections/[id]/cover/blob-complete/route';
import { DELETE as COVER_DELETE } from '@/app/api/collections/[id]/cover/route';
import { coverBlobPathname } from '@/lib/image-upload';
import { requireAuthForApi } from '@/lib/auth-helpers';
import { getCollectionById } from '@/lib/db-queries';
import { updateCollection } from '@/lib/db-mutations';
import { del } from '@vercel/blob';

const mockRequireAuth = requireAuthForApi as jest.Mock;
const mockGetCollection = getCollectionById as jest.Mock;
const mockUpdateCollection = updateCollection as jest.Mock;
const mockDel = del as jest.Mock;

const USER = { id: 'user_owner', email: 'owner@example.test', name: 'Owner', image: null };
const COLLECTION_ID = 'col_cover_flow';
const STORE_HOST = 'https://teststore.public.blob.vercel-storage.com';
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/** In-memory stand-in for the collections row this flow reads and writes. */
let collectionRow: { id: string; name: string; coverImageUrl: string | null };

/** In-memory stand-in for the Vercel Blob store. */
const blobStore = new Map<string, { size: number; contentType: string }>();

/** Every fs write attempted while the flow runs. Must stay empty. */
let fsWrites: string[] = [];

const WRITE_APIS = [
  'writeFile',
  'mkdir',
  'appendFile',
  'copyFile',
  'rename',
  'rm',
  'unlink',
  'open',
] as const;

const originals: Record<string, unknown> = {};
let originalCreateWriteStream: typeof fsSync.createWriteStream;
let originalWriteFileSync: typeof fsSync.writeFileSync;
let originalMkdirSync: typeof fsSync.mkdirSync;

function trapFsWrites() {
  for (const api of WRITE_APIS) {
    const promisesApi = fsPromises as unknown as Record<string, unknown>;
    originals[api] = promisesApi[api];
    promisesApi[api] = (...args: unknown[]) => {
      fsWrites.push(`fs.promises.${api}(${String(args[0])})`);
      return Promise.reject(
        Object.assign(new Error(`EROFS: read-only file system, ${api} '${String(args[0])}'`), {
          code: 'EROFS',
        })
      );
    };
  }

  originalCreateWriteStream = fsSync.createWriteStream;
  originalWriteFileSync = fsSync.writeFileSync;
  originalMkdirSync = fsSync.mkdirSync;
  fsSync.createWriteStream = ((p: unknown) => {
    fsWrites.push(`fs.createWriteStream(${String(p)})`);
    throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
  }) as typeof fsSync.createWriteStream;
  fsSync.writeFileSync = ((p: unknown) => {
    fsWrites.push(`fs.writeFileSync(${String(p)})`);
    throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
  }) as typeof fsSync.writeFileSync;
  fsSync.mkdirSync = ((p: unknown) => {
    fsWrites.push(`fs.mkdirSync(${String(p)})`);
    throw Object.assign(new Error('EROFS: read-only file system'), { code: 'EROFS' });
  }) as typeof fsSync.mkdirSync;
}

function releaseFsWrites() {
  const promisesApi = fsPromises as unknown as Record<string, unknown>;
  for (const api of WRITE_APIS) promisesApi[api] = originals[api];
  fsSync.createWriteStream = originalCreateWriteStream;
  fsSync.writeFileSync = originalWriteFileSync;
  fsSync.mkdirSync = originalMkdirSync;
}

function tokenRequest(pathname: string, contentType: string): Request {
  return new Request('http://localhost:3000/api/blob/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname,
        callbackUrl: 'http://localhost:3000/api/blob/upload',
        multipart: false,
        clientPayload: null,
        contentType,
      },
    }),
  }) as unknown as Request;
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

/** Stands in for the browser's direct PUT to the blob store. */
function putToBlobStore(pathname: string, file: { size: number; type: string }): string {
  blobStore.set(pathname, { size: file.size, contentType: file.type });
  return `${STORE_HOST}/${pathname}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  fsWrites = [];
  collectionRow = { id: COLLECTION_ID, name: 'ZZ-TEST-cover', coverImageUrl: null };
  mockRequireAuth.mockResolvedValue(USER);
  mockGetCollection.mockImplementation(async (id: string, userId: string) =>
    id === collectionRow.id && userId === USER.id ? { ...collectionRow } : undefined
  );
  mockUpdateCollection.mockImplementation(
    async (id: string, patch: { coverImageUrl: string | null }) => {
      collectionRow = { ...collectionRow, ...patch };
      return { ...collectionRow };
    }
  );
  trapFsWrites();
});

afterEach(() => {
  releaseFsWrites();
});

describe('collection cover upload lands on Vercel Blob, never on local disk', () => {
  it('walks the whole browser flow and writes nothing to the filesystem', async () => {
    const file = { name: 'my-holiday-snap.JPEG', type: 'image/jpeg', size: 84_213 };

    // 1. Client derives the blob key from the MIME type, never from file.name.
    const pathname = coverBlobPathname(COLLECTION_ID, file.type, '1700000000000')!;
    expect(pathname).toBe(`collections/${COLLECTION_ID}/cover-1700000000000.jpg`);

    // 2. Server mints a client upload token for that key.
    const tokenRes = await BLOB_UPLOAD_TOKEN(tokenRequest(pathname, file.type) as never);
    const tokenBody = await tokenRes.json();
    expect(tokenRes.status).toBe(200);
    expect(tokenBody.type).toBe('blob.generate-client-token');
    expect(typeof tokenBody.clientToken).toBe('string');

    // 3. Browser PUTs straight to the blob store (no bytes through our server).
    const blobUrl = putToBlobStore(pathname, file);

    // 4. Server persists the resulting URL against the caller's own collection.
    const completeRes = await COVER_BLOB_COMPLETE(
      jsonRequest(
        `http://localhost:3000/api/collections/${COLLECTION_ID}/cover/blob-complete`,
        { blobUrl }
      ) as never,
      { params: Promise.resolve({ id: COLLECTION_ID }) }
    );
    const completeBody = await completeRes.json();

    expect(completeRes.status).toBe(200);
    expect(completeBody).toMatchObject({ status: 'success', coverImageUrl: blobUrl });

    // The persisted row now points at the blob store, not at /uploads/...
    expect(collectionRow.coverImageUrl).toBe(blobUrl);
    expect(collectionRow.coverImageUrl).toMatch(/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//);
    expect(collectionRow.coverImageUrl).not.toMatch(/^\/uploads\//);

    // The object exists in the store under the collection's own prefix.
    expect(blobStore.has(pathname)).toBe(true);

    // Nothing was written to disk anywhere in the flow.
    expect(fsWrites).toEqual([]);

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '  cover upload transcript',
        `  picked file                : ${file.name} (${file.type}, ${file.size} bytes)`,
        `  blob key from MIME         : ${pathname}`,
        `  POST /api/blob/upload      : ${tokenRes.status} ${tokenBody.type}`,
        `  PUT  <blob store>          : stored ${pathname}`,
        `  POST .../cover/blob-complete: ${completeRes.status} ${completeBody.status}`,
        `  collections.coverImageUrl  : ${collectionRow.coverImageUrl}`,
        `  filesystem writes attempted: ${fsWrites.length}`,
        '',
      ].join('\n')
    );
  });

  it('leaves public/uploads untouched', async () => {
    const before = fsSync.existsSync(UPLOADS_DIR)
      ? fsSync.readdirSync(path.join(UPLOADS_DIR)).sort()
      : null;

    const pathname = coverBlobPathname(COLLECTION_ID, 'image/png', '1700000000001')!;
    const blobUrl = putToBlobStore(pathname, { size: 1024, type: 'image/png' });
    await COVER_BLOB_COMPLETE(
      jsonRequest(
        `http://localhost:3000/api/collections/${COLLECTION_ID}/cover/blob-complete`,
        { blobUrl }
      ) as never,
      { params: Promise.resolve({ id: COLLECTION_ID }) }
    );

    const after = fsSync.existsSync(UPLOADS_DIR)
      ? fsSync.readdirSync(path.join(UPLOADS_DIR)).sort()
      : null;

    // Either the directory does not exist at all, or its contents are unchanged.
    expect(after).toEqual(before);
    expect(fsSync.existsSync(path.join(UPLOADS_DIR, 'collections', COLLECTION_ID))).toBe(false);
    expect(fsWrites).toEqual([]);
  });

  it('replaces a cover it owns and reclaims the old blob', async () => {
    const previous = `${STORE_HOST}/collections/${COLLECTION_ID}/cover-1700000000000.jpg`;
    collectionRow.coverImageUrl = previous;

    const pathname = coverBlobPathname(COLLECTION_ID, 'image/webp', '1700000000002')!;
    const blobUrl = putToBlobStore(pathname, { size: 2048, type: 'image/webp' });

    await COVER_BLOB_COMPLETE(
      jsonRequest(
        `http://localhost:3000/api/collections/${COLLECTION_ID}/cover/blob-complete`,
        { blobUrl }
      ) as never,
      { params: Promise.resolve({ id: COLLECTION_ID }) }
    );

    expect(collectionRow.coverImageUrl).toBe(blobUrl);
    expect(mockDel).toHaveBeenCalledWith(previous);
    expect(fsWrites).toEqual([]);
  });

  it('clearing a cover set from a place photo keeps the attachment blob', async () => {
    const attachmentBlob = `${STORE_HOST}/places/plc_1/photo.jpg`;
    collectionRow.coverImageUrl = attachmentBlob;

    const res = await COVER_DELETE(
      new Request(
        `http://localhost:3000/api/collections/${COLLECTION_ID}/cover`,
        { method: 'DELETE' }
      ) as never,
      { params: Promise.resolve({ id: COLLECTION_ID }) }
    );

    expect(res.status).toBe(200);
    expect(collectionRow.coverImageUrl).toBeNull();
    expect(mockDel).not.toHaveBeenCalled();
  });
});

describe('POST /api/blob/upload refuses keys and types the cover flow would never produce', () => {
  it.each([
    ['a traversal segment', 'collections/../../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a backslash path', 'collections\\col_1\\cover.jpg'],
  ])('rejects %s without minting a token', async (_label, pathname) => {
    const res = await BLOB_UPLOAD_TOKEN(tokenRequest(pathname, 'image/jpeg') as never);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Invalid upload path');
    expect(body.clientToken).toBeUndefined();
  });

  it.each([
    ['html', 'text/html'],
    ['svg, which can carry script', 'image/svg+xml'],
    ['a php handler', 'application/x-httpd-php'],
  ])('gives the client no blob key for %s', (_label, mimeType) => {
    expect(coverBlobPathname(COLLECTION_ID, mimeType, '1')).toBeNull();
  });
});
