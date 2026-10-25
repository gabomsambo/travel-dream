/**
 * @jest-environment node
 *
 * Cross-tenant regression tests for the rule an id list cannot enforce:
 *
 *   **Owning a container is not owning the rows it names.**
 *
 * Historically `mass-upload/{cancel,start,status}`, `mass-upload/register` and
 * the details branch of `GET /api/upload/sessions` read source ids out of
 * `upload_sessions.meta.uploadedFiles` and then queried or mutated by those ids
 * with no owner predicate. Checking that the caller owned the *session* was
 * standing in for checking that they owned the *sources*. Worst case was
 * destructive: cancel flipped another user's sources to `cancelled` and called
 * `del()` on their uploaded blobs.
 *
 * Today `status` (and session details) still consume that list and must
 * re-scope every follow-up. `cancel` / `start` scope sources by
 * `meta.uploadInfo.sessionId` through `forUser` instead of walking the list;
 * cancel blob cleanup uses `releaseBlobIfUnreferencedByAnyTenant`. These tests
 * still plant a poisoned `uploadedFiles` list so a regression that reintroduces
 * list-based mutation cannot sneak back.
 *
 * Two things could put a foreign id in that list:
 *
 *   Path A — `PATCH /api/upload/sessions` on your OWN session, writing the ids
 *            directly. Closed at the source: both `POST` and `PATCH` now strip
 *            `uploadedFiles` from caller-supplied metadata. Asserted below, so
 *            that stripping cannot be quietly dropped again.
 *   Path B — a source row survives its session row (`DELETE` without
 *            `cleanup=true`), another caller claims the dangling id through
 *            `POST /api/upload/blob-complete`, and `mass-upload/register`
 *            rebuilds the list from a `json_extract` sweep over all users.
 *
 * The consumer-side tests seed the poisoned list directly rather than through a
 * route, because they are asserting the second line of defence: whatever put a
 * foreign id in the list, the route acting on it must still refuse. That is the
 * whole point of scoping at the row — a producer fixed today is not a guarantee
 * about the producer added tomorrow.
 *
 * Every assertion runs the real handler against a real seeded database — mocks
 * of the Drizzle chain assert the shape of a WHERE clause, which is exactly the
 * evidence that looked like proof here and was not. See
 * `../helpers/tenant-fixture`; it must be imported first, because it pins
 * TURSO_DATABASE_URL to a local file before `@/db` can pick up the production
 * URL that `jest.setup.js`'s dotenv call leaves in the environment.
 */
import {
  ALICE,
  FIXTURE,
  apiRequest,
  assertLocalDatabase,
  readCell,
  resetTenantFixture,
  setSessionUploadedFiles,
  useUniqueUuids,
} from '../helpers/tenant-fixture';

jest.mock('@vercel/blob', () => ({ del: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/blob-url', () => ({
  isAllowedBlobUrl: () => true,
  BLOB_URL_REJECTED_MESSAGE: 'rejected',
}));
jest.mock('@/lib/auth-helpers', () => ({
  requireAuthForApi: jest.fn(),
  getCurrentUser: jest.fn(),
  isAuthError: jest.fn((e: unknown) => e instanceof Error && e.message === 'Unauthorized'),
}));

import { del } from '@vercel/blob';
import { requireAuthForApi } from '@/lib/auth-helpers';

const BOB_BLOB = FIXTURE.bobSourceBlob;

const sourceStatus = (id: string) =>
  readCell('SELECT processing_status FROM sources WHERE id = ?', [id]);

const sessionMeta = (id: string) =>
  readCell('SELECT meta FROM upload_sessions WHERE id = ?', [id]).then(String);

const execute = (sql: string, args: unknown[] = []) => {
  const { client } = require('@/db');
  return client.execute({ sql, args });
};

beforeAll(() => {
  assertLocalDatabase();
  // jest.setup.js pins crypto.randomUUID to a constant, which collides on the
  // sources primary key as soon as a test inserts more than one row.
  useUniqueUuids();
});

beforeEach(async () => {
  await resetTenantFixture();
  (requireAuthForApi as jest.Mock).mockResolvedValue(ALICE);
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
});

describe('Path A — a foreign source id planted in the caller\'s own session', () => {
  // Alice may legitimately write whatever she likes into her own session's
  // metadata. Every assertion below is about what the handlers do with it.
  beforeEach(async () => {
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource]);
  });

  it('PATCH cannot plant a foreign source id in the list', async () => {
    // Updating your own session is legitimate and still succeeds; what it may
    // not do is set `uploadedFiles`, which the handler strips from metadata.
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.aliceSource]);

    const { PATCH } = require('@/app/api/upload/sessions/route');
    const res = await PATCH(
      apiRequest(`http://t/api/upload/sessions?sessionId=${FIXTURE.aliceSession}`, 'PATCH', {
        metadata: { uploadedFiles: [FIXTURE.bobSource], label: 'renamed' },
      })
    );

    expect(res.status).toBe(200);
    const meta = await sessionMeta(FIXTURE.aliceSession);
    expect(meta).not.toContain(FIXTURE.bobSource);
    expect(meta).toContain(FIXTURE.aliceSource);
    expect(meta).toContain('renamed');
  });

  it('mass-upload/status reports nothing about the foreign source', async () => {
    const { GET } = require('@/app/api/mass-upload/status/route');
    const body = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();

    expect(body.status).toBe('success');
    expect(body.counts.uploaded).toBe(0);
    expect(Object.values(body.counts as Record<string, number>)).toEqual(
      Array(Object.keys(body.counts).length).fill(0)
    );
    expect(body.placesCreated).toBe(0);
    expect(body.failedErrors).toEqual([]);
  });

  it('GET /api/upload/sessions?details=true does not dereference it into source rows', async () => {
    const { GET } = require('@/app/api/upload/sessions/route');
    const body = await (
      await GET(
        apiRequest(`http://t/api/upload/sessions?sessionId=${FIXTURE.aliceSession}&details=true`)
      )
    ).json();

    // `uri` is the blob URL and `ocrText` is the OCR'd contents of a travel
    // screenshot — booking references, addresses, confirmation numbers.
    expect(JSON.stringify(body.session.sources ?? [])).not.toContain(FIXTURE.bobSourceOcr);
    expect(JSON.stringify(body.session.sources ?? [])).not.toContain(BOB_BLOB);
  });

  it('mass-upload/start does not requeue it', async () => {
    // Start scopes by meta.uploadInfo.sessionId (and forUser), not uploadedFiles.
    // Alice's own source for this session still queues; Bob's must not.
    const { POST } = require('@/app/api/mass-upload/start/route');
    const body = await (
      await POST(
        apiRequest('http://t/api/mass-upload/start', 'POST', { sessionId: FIXTURE.aliceSession })
      )
    ).json();

    expect(body.queued).toBe(1);
    expect(await sourceStatus(FIXTURE.aliceSource)).toBe('queued');
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
  });

  it('mass-upload/cancel neither cancels it nor deletes its blob', async () => {
    const { POST } = require('@/app/api/mass-upload/cancel/route');
    const body = await (
      await POST(
        apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
      )
    ).json();

    expect(body.cancelled).toBe(1);
    expect(await sourceStatus(FIXTURE.aliceSource)).toBe('cancelled');
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
    expect(JSON.stringify((del as jest.Mock).mock.calls)).not.toContain(BOB_BLOB);
  });
});

describe('Path A — a mixed list acts on the caller\'s rows only', () => {
  // The strongest form of the test: the fixes must filter the list, not empty
  // the response. Alice's own source is in the same list as Bob's.
  beforeEach(async () => {
    await setSessionUploadedFiles(FIXTURE.aliceSession, [
      FIXTURE.bobSource,
      FIXTURE.aliceSource,
    ]);
  });

  it('status counts only the caller\'s source', async () => {
    const { GET } = require('@/app/api/mass-upload/status/route');
    const body = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();

    expect(body.counts.uploaded).toBe(1);
  });

  it('details returns the caller\'s source and only that one', async () => {
    const { GET } = require('@/app/api/upload/sessions/route');
    const body = await (
      await GET(
        apiRequest(`http://t/api/upload/sessions?sessionId=${FIXTURE.aliceSession}&details=true`)
      )
    ).json();

    expect(body.session.sources.map((s: { id: string }) => s.id)).toEqual([FIXTURE.aliceSource]);
  });

  it('start requeues the caller\'s source and leaves the other alone', async () => {
    const { POST } = require('@/app/api/mass-upload/start/route');
    const body = await (
      await POST(
        apiRequest('http://t/api/mass-upload/start', 'POST', { sessionId: FIXTURE.aliceSession })
      )
    ).json();

    expect(body.queued).toBe(1);
    expect(await sourceStatus(FIXTURE.aliceSource)).toBe('queued');
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
  });

  it('cancel cancels the caller\'s source and releases only the caller\'s blob', async () => {
    const { POST } = require('@/app/api/mass-upload/cancel/route');
    const body = await (
      await POST(
        apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
      )
    ).json();

    expect(body.cancelled).toBe(1);
    expect(await sourceStatus(FIXTURE.aliceSource)).toBe('cancelled');
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');

    const deleted = JSON.stringify((del as jest.Mock).mock.calls);
    expect(deleted).toContain(FIXTURE.aliceSourceBlob);
    expect(deleted).not.toContain(BOB_BLOB);
  });

  it('cancel counts only the caller\'s in-flight sources', async () => {
    await execute("UPDATE sources SET processing_status = 'extracting' WHERE id = ?", [
      FIXTURE.bobSource,
    ]);
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource]);

    const { POST } = require('@/app/api/mass-upload/cancel/route');
    const foreignOnly = await (
      await POST(
        apiRequest('http://t/api/mass-upload/cancel', 'POST', {
          sessionId: FIXTURE.aliceSession,
        })
      )
    ).json();
    expect(foreignOnly.alreadyProcessing).toBe(0);

    await execute("UPDATE sources SET processing_status = 'enriching' WHERE id = ?", [
      FIXTURE.aliceSource,
    ]);
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource, FIXTURE.aliceSource]);
    const mixed = await (
      await POST(
        apiRequest('http://t/api/mass-upload/cancel', 'POST', {
          sessionId: FIXTURE.aliceSession,
        })
      )
    ).json();
    expect(mixed.alreadyProcessing).toBe(1);
  });

  it('status counts places created from only the caller\'s sources', async () => {
    await execute('INSERT INTO sources_to_places (source_id, place_id) VALUES (?, ?)', [
      FIXTURE.bobSource, FIXTURE.bobPlace,
    ]);
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource]);

    const { GET } = require('@/app/api/mass-upload/status/route');
    const foreignOnly = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();
    expect(foreignOnly.placesCreated).toBe(0);

    await execute('INSERT INTO sources_to_places (source_id, place_id) VALUES (?, ?)', [
      FIXTURE.aliceSource, FIXTURE.alicePlace,
    ]);
    await execute('UPDATE sources SET meta = ? WHERE id = ?', [
      JSON.stringify({
        uploadInfo: { sessionId: FIXTURE.aliceSession },
        massUpload: { outcome: { created: [FIXTURE.alicePlace], linked: [] } },
      }),
      FIXTURE.aliceSource,
    ]);
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource, FIXTURE.aliceSource]);
    const mixed = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();
    expect(mixed.placesCreated).toBe(1);
  });

  it('status returns failed errors from only the caller\'s sources', async () => {
    const bobError = 'BOB PRIVATE FAILURE: booking reference exposed';
    const aliceError = 'Alice timeout';
    await execute(
      "UPDATE sources SET processing_status = 'failed', processing_error = ? WHERE id = ?",
      [bobError, FIXTURE.bobSource]
    );
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource]);

    const { GET } = require('@/app/api/mass-upload/status/route');
    const foreignOnly = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();
    expect(foreignOnly.failedErrors).toEqual([]);
    expect(JSON.stringify(foreignOnly)).not.toContain(FIXTURE.bobSource);
    expect(JSON.stringify(foreignOnly)).not.toContain(bobError);

    await execute(
      "UPDATE sources SET processing_status = 'failed', processing_error = ? WHERE id = ?",
      [aliceError, FIXTURE.aliceSource]
    );
    await setSessionUploadedFiles(FIXTURE.aliceSession, [FIXTURE.bobSource, FIXTURE.aliceSource]);
    const mixed = await (
      await GET(apiRequest(`http://t/api/mass-upload/status?sessionId=${FIXTURE.aliceSession}`))
    ).json();
    expect(mixed.failedErrors).toEqual([
      { sourceId: FIXTURE.aliceSource, error: 'Processing timed out after multiple attempts' },
    ]);
    expect(JSON.stringify(mixed)).not.toContain(FIXTURE.bobSource);
    expect(JSON.stringify(mixed)).not.toContain(bobError);
  });
});

describe('register duplicate branch scopes its rebuild sweep', () => {
  it('keeps caller-owned session sources and excludes a foreign source', async () => {
    const duplicateId = 'src_alice_duplicate';
    const now = new Date().toISOString();
    const fetchedBodyHash = '05fe405753166f125559e7c9ac558654f107c7e9';
    await execute(
      `INSERT INTO sources
        (id,user_id,type,uri,hash,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [duplicateId, ALICE.id, 'screenshot', FIXTURE.aliceSourceBlob,
       JSON.stringify({ sha1: fetchedBodyHash }), 'uploaded',
       JSON.stringify({ uploadInfo: { sessionId: 'session_alice_previous' } }), now, now]
    );
    await execute('UPDATE sources SET meta = ? WHERE id = ?', [
      JSON.stringify({ uploadInfo: { sessionId: FIXTURE.aliceSession } }), FIXTURE.bobSource,
    ]);

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: 'https://store.public.blob.vercel-storage.com/alice-duplicate.jpg',
        originalName: 'alice-duplicate.png',
        fileSize: 8,
        mimeType: 'image/png',
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('duplicate');
    const meta = JSON.parse(await sessionMeta(FIXTURE.aliceSession));
    const uploadedFiles = meta.uploadedFiles;
    expect(uploadedFiles).toEqual([FIXTURE.aliceSource]);
    expect(uploadedFiles).not.toContain(FIXTURE.bobSource);
    expect(meta.duplicates).toEqual([
      { originalName: 'alice-duplicate.png', duplicateOf: duplicateId },
    ]);
  });

  it('deletes an unreferenced blob when the open session already has those bytes', async () => {
    const orphan = 'https://store.public.blob.vercel-storage.com/duplicate-orphan.jpg';
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO sources
        (id,user_id,type,uri,hash,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['src_alice_same_bytes', ALICE.id, 'screenshot', FIXTURE.aliceSourceBlob,
       JSON.stringify({ sha1: '05fe405753166f125559e7c9ac558654f107c7e9' }), 'uploaded',
       JSON.stringify({ uploadInfo: { sessionId: 'session_alice_previous' } }), now, now]
    );
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: orphan,
        originalName: 'same-bytes.jpg',
        fileSize: 8,
        mimeType: 'image/jpeg',
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('duplicate');
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(orphan);
  });

  it('leaves another tenant collection cover when the open session already has those bytes', async () => {
    const cover = 'https://store.public.blob.vercel-storage.com/bob-collection-cover.jpg';
    const now = new Date().toISOString();
    await execute('UPDATE collections SET cover_image_url = ? WHERE id = ?', [cover, FIXTURE.bobCollection]);
    await execute(
      `INSERT INTO sources
        (id,user_id,type,uri,hash,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['src_alice_same_bytes', ALICE.id, 'screenshot', FIXTURE.aliceSourceBlob,
       JSON.stringify({ sha1: '05fe405753166f125559e7c9ac558654f107c7e9' }), 'uploaded',
       JSON.stringify({ uploadInfo: { sessionId: 'session_alice_previous' } }), now, now]
    );
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: cover,
        originalName: 'same-bytes.jpg',
        fileSize: 8,
        mimeType: 'image/jpeg',
      })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('duplicate');
    expect(del).not.toHaveBeenCalled();
    expect(await readCell('SELECT cover_image_url FROM collections WHERE id = ?', [FIXTURE.bobCollection])).toBe(cover);
  });
});

describe('cancel follows the session id, and a closed register will not delete a foreign blob', () => {
  it('cancels an uploaded source that is not in the session snapshot yet', async () => {
    const { POST } = require('@/app/api/mass-upload/cancel/route');
    const body = await (
      await POST(
        apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
      )
    ).json();

    expect(body.cancelled).toBe(1);
    expect(await sourceStatus(FIXTURE.aliceSource)).toBe('cancelled');
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
    expect(await readCell('SELECT status FROM upload_sessions WHERE id = ?', [FIXTURE.aliceSession])).toBe('cancelled');
    expect(JSON.stringify((del as jest.Mock).mock.calls)).not.toContain(BOB_BLOB);
  });

  async function insertAliceUpload(id: string, uri: string) {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO sources
        (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, ALICE.id, 'screenshot', uri, 'uploaded',
       JSON.stringify({ uploadInfo: { sessionId: FIXTURE.aliceSession } }), now, now]
    );
  }

  it('deletes the caller\'s unreferenced upload and leaves another tenant\'s screenshot', async () => {
    const orphan = 'https://store.public.blob.vercel-storage.com/alice-cancel-orphan.jpg';
    await insertAliceUpload('src_alice_orphan', orphan);
    await insertAliceUpload('src_alice_borrowed', FIXTURE.bobSourceBlob);
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/cancel/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
    );

    expect(response.status).toBe(200);
    expect(del).toHaveBeenCalledWith(orphan);
    expect(del).not.toHaveBeenCalledWith(FIXTURE.bobSourceBlob);
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(FIXTURE.bobSourceBlob);
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
    expect(await sourceStatus('src_alice_borrowed')).toBe('cancelled');
  });

  it('leaves another tenant attachment when cancelling a source that stored its url', async () => {
    const photo = 'https://store.public.blob.vercel-storage.com/bob-place-photo.jpg';
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO attachments
        (id,place_id,type,uri,filename,thumbnail_uri,is_primary,source,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['att_bob_private', FIXTURE.bobPlace, 'photo', photo, 'bob.jpg', null, 1, 'upload', now]
    );
    await insertAliceUpload('src_alice_photo', photo);
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/cancel/route');
    await POST(
      apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
    );

    expect(del).not.toHaveBeenCalledWith(photo);
    expect(await readCell('SELECT uri FROM attachments WHERE id = ?', ['att_bob_private'])).toBe(photo);
  });

  it('leaves another tenant collection cover when cancelling a source that stored its url', async () => {
    const cover = 'https://store.public.blob.vercel-storage.com/bob-collection-cover.jpg';
    await execute('UPDATE collections SET cover_image_url = ? WHERE id = ?', [cover, FIXTURE.bobCollection]);
    await insertAliceUpload('src_alice_cover', cover);
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/cancel/route');
    await POST(
      apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: FIXTURE.aliceSession })
    );

    expect(del).not.toHaveBeenCalledWith(cover);
    expect(await readCell('SELECT cover_image_url FROM collections WHERE id = ?', [FIXTURE.bobCollection])).toBe(cover);
  });

  it('returns 409 and leaves another tenant\'s blob in place', async () => {
    await execute('UPDATE upload_sessions SET status = ? WHERE id = ?', ['cancelled', FIXTURE.aliceSession]);
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: FIXTURE.bobSourceBlob,
        originalName: 'not-bobs.jpg',
        fileSize: 8,
        mimeType: 'image/jpeg',
      })
    );

    expect(response.status).toBe(409);
    expect(del).not.toHaveBeenCalled();
    expect(await readCell('SELECT uri FROM sources WHERE id = ?', [FIXTURE.bobSource])).toBe(FIXTURE.bobSourceBlob);
    expect(await sourceStatus(FIXTURE.bobSource)).toBe('uploaded');
  });

  it('returns 409 and deletes a blob no tenant references', async () => {
    await execute('UPDATE upload_sessions SET status = ? WHERE id = ?', ['cancelled', FIXTURE.aliceSession]);
    (del as jest.Mock).mockClear();
    const orphan = 'https://store.public.blob.vercel-storage.com/closed-orphan.jpg';

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: orphan,
        originalName: 'orphan.jpg',
        fileSize: 8,
        mimeType: 'image/jpeg',
      })
    );

    expect(response.status).toBe(409);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(orphan);
  });

  it('returns 409 and leaves another tenant collection cover in place', async () => {
    const cover = 'https://store.public.blob.vercel-storage.com/bob-collection-cover.jpg';
    await execute('UPDATE collections SET cover_image_url = ? WHERE id = ?', [cover, FIXTURE.bobCollection]);
    await execute('UPDATE upload_sessions SET status = ? WHERE id = ?', ['cancelled', FIXTURE.aliceSession]);
    (del as jest.Mock).mockClear();

    const { POST } = require('@/app/api/mass-upload/register/route');
    const response = await POST(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: FIXTURE.aliceSession,
        blobUrl: cover,
        originalName: 'not-the-cover.jpg',
        fileSize: 8,
        mimeType: 'image/jpeg',
      })
    );

    expect(response.status).toBe(409);
    expect(del).not.toHaveBeenCalled();
    expect(await readCell('SELECT cover_image_url FROM collections WHERE id = ?', [FIXTURE.bobCollection])).toBe(cover);
  });
});

describe('Path B — claiming a dangling session id cannot absorb foreign sources', () => {
  // A source row can outlive its session row: DELETE /api/upload/sessions
  // without cleanup=true removes the session and leaves the sources tagged with
  // its id. blob-complete then lets any caller create a session under that
  // client-supplied id, so register's json_extract sweep must be owner-scoped.
  const ORPHANED_SESSION = 'session_bob_deleted';
  const BOB_ORPHAN = 'src_bob_orphan';
  const BOB_ORPHAN_BLOB = 'https://store.public.blob.vercel-storage.com/bob-orphan.jpg';

  beforeEach(async () => {
    const { client } = require('@/db');
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT OR REPLACE INTO sources
              (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        BOB_ORPHAN, 'user_bob', 'screenshot', BOB_ORPHAN_BLOB, 'BOB ORPHAN OCR', 'uploaded',
        JSON.stringify({ uploadInfo: { sessionId: ORPHANED_SESSION } }), now, now,
      ],
    });
    await client.execute({
      sql: 'DELETE FROM upload_sessions WHERE id = ?',
      args: [ORPHANED_SESSION],
    });
  });

  async function claimAndRegister() {
    const { POST: blobComplete } = require('@/app/api/upload/blob-complete/route');
    const claimed = await blobComplete(
      apiRequest('http://t/api/upload/blob-complete', 'POST', {
        sessionId: ORPHANED_SESSION,
        blobUrl: 'https://store.public.blob.vercel-storage.com/alice-1.jpg',
        originalName: 'alice-1.png',
        fileSize: 10,
        mimeType: 'image/png',
      })
    );
    expect(claimed.status).toBe(200);

    const { POST: register } = require('@/app/api/mass-upload/register/route');
    const registered = await register(
      apiRequest('http://t/api/mass-upload/register', 'POST', {
        sessionId: ORPHANED_SESSION,
        blobUrl: 'https://store.public.blob.vercel-storage.com/alice-2.jpg',
        originalName: 'alice-2.png',
        fileSize: 10,
        mimeType: 'image/png',
      })
    );
    expect(registered.status).toBe(200);
    return (await registered.json()).sourceId as string;
  }

  it('register\'s rebuild sweep never names a source it does not own', async () => {
    const registeredId = await claimAndRegister();

    const meta = await sessionMeta(ORPHANED_SESSION);
    expect(meta).not.toContain(BOB_ORPHAN);
    // …but it does still name the caller's own uploads in that session.
    expect(meta).toContain(registeredId);
  });

  it('cancel through the claimed session leaves the foreign source untouched', async () => {
    await claimAndRegister();

    const { POST } = require('@/app/api/mass-upload/cancel/route');
    await POST(
      apiRequest('http://t/api/mass-upload/cancel', 'POST', { sessionId: ORPHANED_SESSION })
    );

    expect(await sourceStatus(BOB_ORPHAN)).toBe('uploaded');
    expect(JSON.stringify((del as jest.Mock).mock.calls)).not.toContain(BOB_ORPHAN_BLOB);
  });
});
