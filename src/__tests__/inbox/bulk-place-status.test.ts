/**
 * @jest-environment node
 */
jest.mock('@vercel/blob', () => ({ del: jest.fn(), put: jest.fn() }))

import { ALICE, assertLocalDatabase, readCell, resetTenantFixture } from '../helpers/tenant-fixture'
import { bulkUpdatePlaceStatus } from '@/lib/db-mutations'

async function exec(sql: string, args: unknown[]): Promise<void> {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> }
  }
  await client.execute({ sql, args })
}

async function insertPlaces(ids: string[]): Promise<void> {
  const now = '2024-01-01T00:00:00.000Z'
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40)
    const values = part.map(() => '(?,?,?,?,?,?,?,?)').join(',')
    const args = part.flatMap((id) => [id, ALICE.id, id, 'cafe', 'inbox', 'Lisbon', now, now])
    await exec(
      `INSERT INTO places (id, user_id, name, kind, status, city, created_at, updated_at) VALUES ${values}`,
      args,
    )
  }
}

function sqlText(stmt: unknown): string {
  if (typeof stmt === 'string') return stmt
  if (stmt && typeof stmt === 'object' && 'sql' in stmt) return String((stmt as { sql: unknown }).sql)
  return ''
}

describe('bulkUpdatePlaceStatus', () => {
  beforeAll(() => {
    assertLocalDatabase()
  })

  beforeEach(async () => {
    await resetTenantFixture()
  })

  it('moves the whole list and reports the ids that changed', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `plc_status_${i}`)
    await insertPlaces(ids)

    const result = await bulkUpdatePlaceStatus(ids, 'library', ALICE.id)

    expect(result.updatedCount).toBe(51)
    expect(result.updatedIds.slice().sort()).toEqual(ids.slice().sort())
    expect(await readCell('SELECT status FROM places WHERE id = ?', [ids[0]])).toBe('library')
    expect(await readCell('SELECT status FROM places WHERE id = ?', [ids[50]])).toBe('library')
  })

  it('rolls the whole list back when a later chunk fails', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `plc_status_${i}`)
    await insertPlaces(ids)

    const { client } = require('@/db') as {
      client: {
        execute: (...args: unknown[]) => Promise<unknown>
        transaction: (...args: unknown[]) => Promise<{ execute: (...args: unknown[]) => Promise<unknown> }>
      }
    }
    const originalExecute = client.execute.bind(client)
    const originalTransaction = client.transaction.bind(client)
    let updates = 0
    const failSecondStatusWrite = (stmt: unknown) => {
      if (!/update\s+["'`]?places/i.test(sqlText(stmt))) return
      updates += 1
      if (updates === 2) throw new Error('status write failed')
    }
    client.execute = ((...args: unknown[]) => {
      failSecondStatusWrite(args[0])
      return originalExecute(...args)
    }) as typeof client.execute
    client.transaction = (async (...args: unknown[]) => {
      const tx = await originalTransaction(...args)
      const originalTxExecute = tx.execute.bind(tx)
      tx.execute = ((...txArgs: unknown[]) => {
        failSecondStatusWrite(txArgs[0])
        return originalTxExecute(...txArgs)
      }) as typeof tx.execute
      return tx
    }) as typeof client.transaction

    let thrown: unknown
    try {
      await bulkUpdatePlaceStatus(ids, 'library', ALICE.id)
    } catch (err) {
      thrown = err
    } finally {
      client.execute = originalExecute
      client.transaction = originalTransaction
    }

    const parts: string[] = []
    const seen = new Set<unknown>()
    let current: unknown = thrown
    while (current && typeof current === 'object' && !seen.has(current)) {
      seen.add(current)
      if (current instanceof Error) parts.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    expect(parts.join('\n')).toContain('status write failed')
    expect(updates).toBeGreaterThanOrEqual(2)
    expect(await readCell('SELECT count(*) FROM places WHERE id LIKE ? AND status = ?', ['plc_status_%', 'library'])).toBe(0)
    expect(await readCell('SELECT status FROM places WHERE id = ?', [ids[0]])).toBe('inbox')
    expect(await readCell('SELECT status FROM places WHERE id = ?', [ids[50]])).toBe('inbox')
  })
})
