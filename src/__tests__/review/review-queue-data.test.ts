/** @jest-environment node */
import { ALICE, BOB, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture'
import { loadReviewPostcard, loadReviewQueue } from '@/lib/review-queue'

type Exec = (query: { sql: string; args: unknown[] }) => Promise<unknown>

function dbExec(): Exec {
  const { client } = require('@/db') as { client: { execute: Exec } }
  return (query) => client.execute(query)
}

describe('loadReviewQueue with real SQLite data', () => {
  beforeAll(async () => {
    assertLocalDatabase()
    await resetTenantFixture()

    const execute = dbExec()
    const run = (sql: string, args: unknown[] = []) => execute({ sql, args })

    await run(
      `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['src_alice_old', ALICE.id, 'screenshot', 'https://example.test/alice-old.jpg', 'completed',
       JSON.stringify({ uploadInfo: { originalName: 'old-list.jpg' } }), '2026-10-18T10:00:00.000Z', '2026-10-18T10:00:00.000Z']
    )
    await run(
      `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['src_alice_new', ALICE.id, 'screenshot', 'https://example.test/alice-new.jpg', 'completed',
       JSON.stringify({ uploadInfo: { originalName: 'new-list.jpg' } }), '2026-10-18T12:00:00.000Z', '2026-10-18T12:00:00.000Z']
    )

    for (const [id, name, createdAt] of [
      ['plc_alice_new_1', 'First in new screenshot', '2026-10-18T12:00:01.000Z'],
      ['plc_alice_new_2', 'Second in new screenshot', '2026-10-18T12:00:02.000Z'],
      ['plc_alice_old_1', 'Place in old screenshot', '2026-10-18T10:00:01.000Z'],
    ]) {
      await run(
        `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?)`,
        [id, ALICE.id, name, 'cafe', 'inbox', createdAt, createdAt]
      )
    }
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_new', 'plc_alice_new_1'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_new', 'plc_alice_new_2'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_new', 'plc_alice'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_new', 'plc_bob_secret'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_old', 'plc_alice_old_1'])
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary) VALUES (?,?,?,?,?,?)`,
      ['att_new_1', 'plc_alice_new_1', 'photo', 'https://example.test/alice-new.jpg', 'new-list.jpg', 1],
    )
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary,created_at) VALUES (?,?,?,?,?,?,?)`,
      ['att_new_1_extra', 'plc_alice_new_1', 'photo', 'https://example.test/breakfast-extra.jpg', 'extra.jpg', 0, '2026-10-18T12:00:05.000Z'],
    )
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary) VALUES (?,?,?,?,?,?)`,
      ['att_new_2_shot', 'plc_alice_new_2', 'photo', 'https://example.test/alice-new.jpg', 'new-list.jpg', 0],
    )
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary) VALUES (?,?,?,?,?,?)`,
      ['att_new_2_real', 'plc_alice_new_2', 'photo', 'https://example.test/gails-real.jpg', 'gails.jpg', 1],
    )
    await run(
      `INSERT INTO attachments (id,place_id,type,uri,filename,is_primary) VALUES (?,?,?,?,?,?)`,
      ['att_old_1', 'plc_alice_old_1', 'photo', 'https://example.test/alice-old.jpg', 'old-list.jpg', 1],
    )

    await run(`UPDATE places SET status = 'inbox' WHERE id = ?`, ['plc_bob_secret'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_bob_1', 'plc_bob_secret'])
  })

  it('keeps screenshots together in deterministic order and returns only the caller tenant', async () => {
    const queue = await loadReviewQueue(ALICE.id)

    expect(queue.entries.map((entry) => entry.placeId)).toEqual([
      'plc_alice_new_1',
      'plc_alice_new_2',
      'plc_alice_old_1',
    ])
    expect(queue.entries.map((entry) => entry.screenshotUrl)).toEqual([
      'https://example.test/alice-new.jpg',
      'https://example.test/alice-new.jpg',
      'https://example.test/alice-old.jpg',
    ])
    expect(queue.entries[0]).toMatchObject({
      screenshotUrl: 'https://example.test/alice-new.jpg',
      screenshotName: 'new-list.jpg',
      uploadLabel: 'new-list.jpg',
    })
    expect(queue.entries.every((entry) => entry.userId === ALICE.id && !('source' in entry))).toBe(true)
    expect(queue.entries.some((entry) => entry.userId === BOB.id)).toBe(false)
    expect(queue.postcard?.place.id).toBe('plc_alice_new_1')
    expect(queue.postcard?.place.sources.map((source) => source.id)).toEqual(['src_alice_new'])
    const photos = queue.postcard?.place.attachments.filter((attachment) => attachment.type === 'photo') ?? []
    expect(photos.map((photo) => photo.uri)).toEqual(expect.arrayContaining([
      'https://example.test/alice-new.jpg',
      'https://example.test/breakfast-extra.jpg',
    ]))
    expect(photos.find((photo) => photo.isPrimary === 1)?.uri).toBe('https://example.test/alice-new.jpg')
    expect(queue.postcard?.screenshot).toMatchObject({
      sourceId: 'src_alice_new',
      url: 'https://example.test/alice-new.jpg',
      name: 'new-list.jpg',
      softCover: true,
    })
    expect(queue.postcard?.screenshot?.siblings.map((sibling) => sibling.placeId)).toEqual([
      'plc_alice_new_1',
      'plc_alice_new_2',
      'plc_alice',
    ])
    expect(JSON.stringify(queue.postcard?.screenshot)).not.toContain('Bob')
    expect(JSON.stringify(queue.postcard?.screenshot)).not.toContain('plc_bob')
    expect(queue.postcard?.alsoIn).toEqual([])
    expect(queue.trips.map((trip) => trip.id)).toEqual(['col_alice'])
  })

  it('keeps OCR text and extraction caches off the queue payload', async () => {
    const execute = dbExec()
    await execute({
      sql: `UPDATE sources SET ocr_text = ?, meta = json_set(COALESCE(meta, '{}'), '$.massUpload.extraction', json(?)) WHERE id = ?`,
      args: ['ocr-secret-body', JSON.stringify({ name: 'secret-gemini-place' }), 'src_alice_new'],
    })

    const queue = await loadReviewQueue(ALICE.id)
    const payload = JSON.stringify(queue.entries)

    expect(payload).not.toContain('ocr-secret-body')
    expect(payload).not.toContain('secret-gemini-place')
    expect(JSON.stringify(queue.postcard?.screenshot)).not.toContain('ocr-secret-body')
    expect(JSON.stringify(queue.postcard?.screenshot)).not.toContain('secret-gemini-place')
    expect(queue.entries[0]).toMatchObject({
      screenshotName: 'new-list.jpg',
      uploadLabel: 'new-list.jpg',
    })
    expect(queue.postcard?.place.id).toBe('plc_alice_new_1')
  })

  it('loads relations for the requested place and not once per inbox row', async () => {
    const { client } = require('@/db') as {
      client: { execute: (query: unknown) => Promise<unknown> }
    }
    const original = client.execute.bind(client)
    let queries = 0
    client.execute = (query: unknown) => {
      queries += 1
      return original(query)
    }
    try {
      queries = 0
      const focused = await loadReviewQueue(ALICE.id, 'plc_alice_old_1')
      expect(focused.entries.map((entry) => entry.placeId)).toEqual([
        'plc_alice_new_1',
        'plc_alice_new_2',
        'plc_alice_old_1',
      ])
      expect(focused.postcard?.place.id).toBe('plc_alice_old_1')
      expect(focused.postcard?.place.sources.map((source) => source.id)).toEqual(['src_alice_old'])
      expect(focused.entries.every((entry) => !('alsoIn' in entry) && !('place' in entry))).toBe(true)
      // A per-place relations load is about six statements, so three inbox rows
      // would clear this. The list itself stays a handful of scoped reads.
      expect(queries).toBeGreaterThan(0)
      expect(queries).toBeLessThanOrEqual(16)
    } finally {
      client.execute = original
    }
  })

  it('treats a shared screenshot as a soft cover only when that file is the cover', async () => {
    const withOwnPhoto = await loadReviewPostcard(ALICE.id, 'plc_alice_new_2')
    expect(withOwnPhoto?.screenshot?.softCover).toBe(false)
    expect(withOwnPhoto?.screenshot?.siblings.map((sibling) => sibling.name)).not.toContain('Bob Secret Hideaway')

    const alone = await loadReviewPostcard(ALICE.id, 'plc_alice_old_1')
    expect(alone?.screenshot?.softCover).toBe(false)
    expect(alone?.screenshot?.siblings).toEqual([
      expect.objectContaining({ placeId: 'plc_alice_old_1', name: 'Place in old screenshot' }),
    ])
  })

  it('walks an older upload of P1 and P2 without the newest upload P3', async () => {
    const execute = dbExec()
    const run = (sql: string, args: unknown[] = []) => execute({ sql, args })
    const olderAt = '2026-10-01T10:00:00.000Z'
    const newerAt = '2026-10-02T12:00:00.000Z'
    try {
      await run(
        `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        ['src_scope_older', ALICE.id, 'screenshot', 'https://example.test/older.jpg', 'completed',
         JSON.stringify({ uploadInfo: { sessionId: 'session_scope_older', originalName: 'older.jpg' } }),
         olderAt, olderAt]
      )
      await run(
        `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
        ['src_scope_newer', ALICE.id, 'screenshot', 'https://example.test/newer.jpg', 'completed',
         JSON.stringify({ uploadInfo: { sessionId: 'session_scope_newer', originalName: 'newer.jpg' } }),
         newerAt, newerAt]
      )
      for (const [id, name, createdAt] of [
        ['plc_scope_p1', 'Older place one', '2026-10-01T10:00:01.000Z'],
        ['plc_scope_p2', 'Older place two', '2026-10-01T10:00:02.000Z'],
        ['plc_scope_p3', 'Newest place', '2026-10-02T12:00:01.000Z'],
      ]) {
        await run(
          `INSERT INTO places (id,user_id,name,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
          [id, ALICE.id, name, 'cafe', 'inbox', createdAt, createdAt]
        )
      }
      await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_scope_older', 'plc_scope_p1'])
      await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_scope_older', 'plc_scope_p2'])
      await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_scope_newer', 'plc_scope_p3'])

      const older = await loadReviewQueue(ALICE.id, 'plc_scope_p1', 'session_scope_older')
      expect(older.entries.map((entry) => entry.placeId)).toEqual(['plc_scope_p1', 'plc_scope_p2'])
      expect(older.postcard?.place.id).toBe('plc_scope_p1')

      const olderFromSecond = await loadReviewQueue(ALICE.id, 'plc_scope_p2', 'session_scope_older')
      expect(olderFromSecond.entries.map((entry) => entry.placeId)).toEqual(['plc_scope_p1', 'plc_scope_p2'])
      expect(olderFromSecond.postcard?.place.id).toBe('plc_scope_p2')

      const newest = await loadReviewQueue(ALICE.id, 'plc_scope_p3', 'session_scope_newer')
      expect(newest.entries.map((entry) => entry.placeId)).toEqual(['plc_scope_p3'])
      expect(newest.postcard?.place.id).toBe('plc_scope_p3')

      const deepLink = await loadReviewQueue(ALICE.id, 'plc_scope_p1')
      expect(deepLink.postcard?.place.id).toBe('plc_scope_p1')
      expect(deepLink.entries.map((entry) => entry.placeId)).toEqual(expect.arrayContaining([
        'plc_scope_p1',
        'plc_scope_p2',
        'plc_scope_p3',
      ]))
      expect(deepLink.entries.length).toBeGreaterThan(3)
    } finally {
      await run(`DELETE FROM sources_to_places WHERE source_id IN (?,?)`, ['src_scope_older', 'src_scope_newer'])
      await run(`DELETE FROM places WHERE id IN (?,?,?)`, ['plc_scope_p1', 'plc_scope_p2', 'plc_scope_p3'])
      await run(`DELETE FROM sources WHERE id IN (?,?)`, ['src_scope_older', 'src_scope_newer'])
    }
  })
})
