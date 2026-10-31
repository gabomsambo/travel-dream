import { applyPatch, coverPatchAfterAttach, itemOfPlace, photoOfAttachment, shareStructure, type IndexPatch } from '@/lib/library/index-patch'
import type { Place } from '@/types/database'
import { item, photo } from '../helpers/library-items'

const base = () => ({
  items: [
    item({ id: 'a', photos: [photo] }),
    item({ id: 'b', photos: [photo], photoCount: 3 }),
    item({ id: 'c', visitStatus: 'visited' }),
  ],
  collections: [
    { id: 'col_1', name: 'Trip', description: null, placeIds: ['a', 'b', 'gone'] },
    { id: 'col_2', name: 'Other', description: null, placeIds: ['c'] },
  ],
})

const ids = (c: { items: Array<{ id: string }> }) => c.items.map((p) => p.id)

describe('applyPatch', () => {
  it('removes places, and leaves collections alone unless the places are deleted', () => {
    const c = base()
    const archived = applyPatch(c, { kind: 'remove', ids: ['b'] })
    expect(ids(archived)).toEqual(['a', 'c'])
    expect(archived.collections).toBe(c.collections)

    const purged = applyPatch(c, { kind: 'remove', ids: ['b'], purge: true })
    expect(purged.collections[0].placeIds).toEqual(['a', 'gone'])
    expect(purged.collections[1]).toBe(c.collections[1])
  })

  it('upserts: replaces a place that is there, appends one that is not', () => {
    const c = base()
    const renamed = item({ id: 'a', name: 'New name' })
    const fresh = item({ id: 'z' })
    const next = applyPatch(c, { kind: 'upsert', items: [renamed, fresh] })
    expect(ids(next)).toEqual(['a', 'b', 'c', 'z'])
    expect(next.items[0]).toBe(renamed)
    expect(next.items[1]).toBe(c.items[1])
  })

  it('sets a visit status on the places named, and only changes places that differ', () => {
    const c = base()
    const next = applyPatch(c, { kind: 'visit', ids: ['a', 'c'], status: 'visited' })
    expect(next.items.map((p) => p.visitStatus)).toEqual(['visited', 'not_visited', 'visited'])
    expect(next.items[2]).toBe(c.items[2])
    expect(next.items[1]).toBe(c.items[1])
  })

  it('sets a cover and a photo count; an unchanged cover keeps the photo it had', () => {
    const c = base()
    const newer = { uri: 'https://x/new.jpg', thumb: 'https://x/new-t.jpg' }
    const withCover = applyPatch(c, { kind: 'cover', id: 'a', photo: newer, count: 2 })
    expect(withCover.items[0].photos).toEqual([newer])
    expect(withCover.items[0].photoCount).toBe(2)

    const countOnly = applyPatch(c, { kind: 'cover', id: 'b', count: 4 })
    expect(countOnly.items[1].photos).toBe(c.items[1].photos)
    expect(countOnly.items[1].photoCount).toBe(4)

    // One photo is the default and travels as no count at all.
    const single = applyPatch(c, { kind: 'cover', id: 'b', count: 1 })
    expect('photoCount' in single.items[1]).toBe(false)
  })

  it('adds and removes members of one collection, in order, without duplicates', () => {
    const c = base()
    const next = applyPatch(c, { kind: 'members', id: 'col_1', add: ['a', 'c'], remove: ['gone'] })
    expect(next.collections[0].placeIds).toEqual(['a', 'b', 'c'])
    expect(next.collections[1]).toBe(c.collections[1])
    expect(next.items).toBe(c.items)
  })

  it('adds a collection, or replaces the one with that id', () => {
    const c = base()
    const added = applyPatch(c, { kind: 'collection', collection: { id: 'col_3', name: 'New', description: null, placeIds: [] } })
    expect(added.collections.map((x) => x.id)).toEqual(['col_1', 'col_2', 'col_3'])
    const replaced = applyPatch(c, { kind: 'collection', collection: { id: 'col_2', name: 'Renamed', description: null, placeIds: ['c'] } })
    expect(replaced.collections.map((x) => x.name)).toEqual(['Trip', 'Renamed'])
  })

  const patches: IndexPatch[] = [
    { kind: 'remove', ids: ['a'], purge: true },
    { kind: 'upsert', items: [item({ id: 'z' }), item({ id: 'a', name: 'Again' })] },
    { kind: 'visit', ids: ['a', 'b'], status: 'planned' },
    { kind: 'cover', id: 'b', photo: { uri: 'u', thumb: 't' }, count: 5 },
    { kind: 'members', id: 'col_2', add: ['a'], remove: ['c'] },
    { kind: 'collection', collection: { id: 'col_9', name: 'Nine', description: null, placeIds: ['a'] } },
  ]
  it.each(patches.map((p) => [p.kind, p] as const))('%s: applying it twice is applying it once', (_kind, patch) => {
    const once = applyPatch(base(), patch)
    expect(applyPatch(once, patch)).toEqual(once)
    expect(applyPatch(once, patch)).toBe(once)
  })

  it('answers with the same object when a patch changes nothing', () => {
    const c = base()
    expect(applyPatch(c, { kind: 'remove', ids: ['nobody'] })).toBe(c)
    expect(applyPatch(c, { kind: 'visit', ids: ['c'], status: 'visited' })).toBe(c)
    expect(applyPatch(c, { kind: 'members', id: 'col_1', add: ['a'] })).toBe(c)
    expect(applyPatch(c, { kind: 'cover', id: 'nobody', count: 3 })).toBe(c)
  })
})

describe('shareStructure', () => {
  it('is the previous content itself when the new content holds the same data', () => {
    const prev = base()
    const next = JSON.parse(JSON.stringify(base()))
    expect(shareStructure(prev, next)).toBe(prev)
  })

  it('reuses the places that did not change and takes the ones that did', () => {
    const prev = base()
    const next = JSON.parse(JSON.stringify(base()))
    next.items[1].name = 'Changed'
    const shared = shareStructure(prev, next)
    expect(shared.items[0]).toBe(prev.items[0])
    expect(shared.items[1]).toBe(next.items[1])
    expect(shared.items[2]).toBe(prev.items[2])
    expect(shared.collections).toBe(prev.collections)
  })

  it('takes new places and drops removed ones', () => {
    const prev = base()
    const next = { items: [prev.items[0], item({ id: 'new' })], collections: prev.collections }
    const shared = shareStructure(prev, next)
    expect(ids(shared)).toEqual(['a', 'new'])
    expect(shared.items[0]).toBe(prev.items[0])
  })

  it('notices a collection change', () => {
    const prev = base()
    const next = JSON.parse(JSON.stringify(base()))
    next.collections[1].placeIds.push('a')
    const shared = shareStructure(prev, next)
    expect(shared.items).toBe(prev.items)
    expect(shared.collections).toBe(next.collections)
  })
})

describe('coverPatchAfterAttach', () => {
  const attachment = { uri: 'https://x/full.jpg', thumbnailUri: 'https://x/thumb.jpg', attribution: null, source: 'pexels', isPrimary: 0 }

  it('adds one to the count and leaves the cover when the new photo is not primary', () => {
    const place = item({ id: 'a', photos: [photo], photoCount: 2 })
    expect(coverPatchAfterAttach(place, attachment, false)).toEqual({ kind: 'cover', id: 'a', photo: undefined, count: 3 })
  })

  it('makes the new photo the cover when it became primary, with both sizes', () => {
    const place = item({ id: 'a', photos: [photo] })
    expect(coverPatchAfterAttach(place, { ...attachment, isPrimary: 1 }, false)).toEqual({
      kind: 'cover',
      id: 'a',
      photo: { uri: 'https://x/full.jpg', thumb: 'https://x/thumb.jpg', attribution: null, source: 'pexels' },
      count: 2,
    })
  })

  it('makes it the cover for a place that had none, primary or not', () => {
    const place = item({ id: 'a', photos: [] })
    const patch = coverPatchAfterAttach(place, attachment, false)
    expect(patch).toMatchObject({ kind: 'cover', photo: { uri: 'https://x/full.jpg' }, count: 1 })
  })

  it('does nothing for a photo that was already attached', () => {
    expect(coverPatchAfterAttach(item({ id: 'a' }), attachment, true)).toBeNull()
  })

  it('falls back to the full image for a missing thumbnail, and drops pre-Blob uploads', () => {
    expect(photoOfAttachment({ ...attachment, thumbnailUri: null })?.thumb).toBe('https://x/full.jpg')
    expect(photoOfAttachment({ ...attachment, uri: '/uploads/old.jpg' })).toBeNull()
  })
})

describe('itemOfPlace', () => {
  const row = {
    id: 'plc_new',
    name: 'Cafe Nuevo',
    kind: 'cafe',
    city: 'Lisbon',
    country: 'Portugal',
    description: null,
    notes: 'good flat white',
    vibes: ['cosy'],
    best_time: 'summer',
    recommendedBy: null,
    visitStatus: 'not_visited',
    priority: null,
    ratingSelf: 0,
    price_level: '$$',
    createdAt: '2026-10-31T10:00:00.000Z',
    coords: { lat: 38.7, lon: -9.1 },
    lastVisited: null,
    plannedVisit: null,
    tags: null,
    address: null,
    altNames: [],
    cuisine: null,
    activities: null,
    amenities: null,
    practicalInfo: null,
  } as unknown as Place

  it('reads a freshly created row the way the library index reads a stored one', () => {
    const p = itemOfPlace(row)
    expect(p).toMatchObject({
      id: 'plc_new',
      name: 'Cafe Nuevo',
      city: 'Lisbon',
      vibes: ['cosy'],
      bestTimeText: 'summer',
      priceLevel: '$$',
      priority: 0,
      visitStatus: 'not_visited',
      lat: 38.7,
      lon: -9.1,
      photos: [],
      tags: [],
      cuisine: [],
    })
    expect(p.bestTime.months.length).toBeGreaterThan(0)
  })

  it('does not pin a place at 0,0', () => {
    const p = itemOfPlace({ ...row, coords: { lat: 0, lon: 0 } } as unknown as Place)
    expect(p.lat).toBeNull()
    expect(p.lon).toBeNull()
  })
})
