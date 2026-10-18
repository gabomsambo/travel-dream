/** @jest-environment node */
import { ALICE, BOB, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture'
import { loadReviewQueue } from '@/lib/review-queue'

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
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_alice_old', 'plc_alice_old_1'])

    await run(`UPDATE places SET status = 'inbox' WHERE id = ?`, ['plc_bob_secret'])
    await run(`INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)`, ['src_bob_1', 'plc_bob_secret'])
  })

  it('keeps screenshots together in deterministic order and returns only the caller tenant', async () => {
    const queue = await loadReviewQueue(ALICE.id)

    expect(queue.items.map((item) => item.place.id)).toEqual([
      'plc_alice_new_1',
      'plc_alice_new_2',
      'plc_alice_old_1',
    ])
    expect(queue.items.map((item) => item.source?.id)).toEqual([
      'src_alice_new',
      'src_alice_new',
      'src_alice_old',
    ])
    expect(queue.items[0]).toMatchObject({
      screenshotUrl: 'https://example.test/alice-new.jpg',
      screenshotName: 'new-list.jpg',
      uploadLabel: 'new-list.jpg',
    })
    expect(queue.items.every((item) => item.place.userId === ALICE.id && item.source?.userId === ALICE.id)).toBe(true)
    expect(queue.items.some((item) => item.place.userId === BOB.id || item.source?.userId === BOB.id)).toBe(false)
    expect(queue.trips.map((trip) => trip.id)).toEqual(['col_alice'])
  })
})
