/** @jest-environment node */
import { ALICE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture'
import { createPlacesFromPipeline } from '@/lib/db-mutations'
import type { PipelinePlace } from '@/types/extraction-pipeline'

type Exec = (query: { sql: string; args?: unknown[] }) => Promise<{ rows: Array<{ coords: string | null }> }>

function execute(sql: string, args: unknown[] = []) {
  const { client } = require('@/db') as { client: { execute: Exec } }
  return client.execute({ sql, args })
}

function pipelinePlace(coords: PipelinePlace['coords']): PipelinePlace {
  return {
    name: 'Null Island Cafe',
    kind: 'cafe',
    city: 'London',
    country: 'United Kingdom',
    admin: null,
    description: null,
    tags: null,
    vibes: null,
    confidence: 0.9,
    price_level: null,
    best_time: null,
    activities: null,
    cuisine: null,
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
    coords,
    address: null,
    googlePlaceId: 'ChIJ_null_island',
  }
}

describe('createPlacesFromPipeline refuses a 0,0 pin', () => {
  beforeAll(async () => {
    assertLocalDatabase()
    await resetTenantFixture()
    await execute(
      `INSERT INTO sources (id,user_id,type,uri,processing_status,meta,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['src_null_island', ALICE.id, 'screenshot', 'https://example.test/null-island.jpg', 'completed',
        JSON.stringify({ uploadInfo: { originalName: 'null-island.jpg' } }),
        '2026-10-18T12:00:00.000Z', '2026-10-18T12:00:00.000Z'],
    )
  })

  it('stores null when enrichment would have written {lat: 0, lon: 0}', async () => {
    await createPlacesFromPipeline([pipelinePlace({ lat: 0, lon: 0 })], 'src_null_island', ALICE.id)
    const stored = await execute(`SELECT coords FROM places WHERE name = ?`, ['Null Island Cafe'])
    expect(stored.rows[0].coords).toBeNull()
  })
})
