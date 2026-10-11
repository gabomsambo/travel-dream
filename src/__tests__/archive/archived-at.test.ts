jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }))

import { ALICE, FIXTURE, readCell, resetTenantFixture } from '../helpers/tenant-fixture'
import { archivePlace, bulkMergePlaces, bulkUpdatePlaceStatus, updatePlace } from '@/lib/db-mutations'
import { searchPlaces } from '@/lib/db-queries'

async function insertPlace(id: string, status: string, kind: string) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> }
  }
  const now = '2024-01-01T00:00:00.000Z'
  await client.execute({
    sql: `INSERT INTO places (id, user_id, name, kind, status, city, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [id, ALICE.id, id, kind, status, 'Lisbon', now, now],
  })
}

describe('archived_at', () => {
  beforeEach(async () => {
    await resetTenantFixture()
  })

  it('stamps every archive path and clears the stamp on restore', async () => {
    await archivePlace(FIXTURE.alicePlace, ALICE.id)
    expect(await readCell('SELECT status FROM places WHERE id = ?', [FIXTURE.alicePlace])).toBe('archived')
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', [FIXTURE.alicePlace])).toEqual(expect.any(String))

    await updatePlace(FIXTURE.alicePlace, { status: 'library' }, ALICE.id)
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', [FIXTURE.alicePlace])).toBeNull()

    await insertPlace('plc_inbox', 'inbox', 'cafe')
    await updatePlace('plc_inbox', { status: 'archived' }, ALICE.id)
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', ['plc_inbox'])).toEqual(expect.any(String))

    await insertPlace('plc_bulk', 'library', 'museum')
    await bulkUpdatePlaceStatus(['plc_bulk'], 'archived', ALICE.id)
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', ['plc_bulk'])).toEqual(expect.any(String))
    await bulkUpdatePlaceStatus(['plc_bulk'], 'library', ALICE.id)
    expect(await readCell('SELECT status FROM places WHERE id = ?', ['plc_bulk'])).toBe('library')
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', ['plc_bulk'])).toBeNull()

    await insertPlace('plc_loser', 'library', 'bar')
    await bulkMergePlaces([{ targetId: FIXTURE.alicePlace, sourceIds: ['plc_loser'], confidence: 1 }], ALICE.id)
    expect(await readCell('SELECT status FROM places WHERE id = ?', ['plc_loser'])).toBe('archived')
    expect(await readCell('SELECT archived_at FROM places WHERE id = ?', ['plc_loser'])).toEqual(expect.any(String))
  })

  it('returns every kind named in a comma-separated kind filter', async () => {
    await insertPlace('plc_cafe', 'archived', 'cafe')
    await insertPlace('plc_museum', 'archived', 'museum')
    await insertPlace('plc_park', 'archived', 'park')
    const rows = await searchPlaces({ userId: ALICE.id, status: 'archived', kind: 'cafe,museum' })
    expect(rows.map((r) => r.id).sort()).toEqual(['plc_cafe', 'plc_museum'])
  })
})
