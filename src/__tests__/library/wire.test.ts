import { decodeIndex, decodeItem, encodeIndex, encodeItem, WIRE_FORMAT } from '@/lib/library/wire'
import { parseBestTime } from '@/lib/explore/best-time'
import { item, photo } from '../helpers/library-items'

const full = item({
  id: 'plc_full',
  name: 'Kōgen Café',
  city: 'Kyoto',
  country: 'Japan',
  description: 'A quiet room',
  notes: 'Go early',
  vibes: ['cozy', 'quiet'],
  bestTimeText: 'November to March',
  bestTime: parseBestTime('November to March', 35),
  recommendedBy: 'Sarah',
  visitStatus: 'planned',
  priority: 3,
  ratingSelf: 4,
  priceLevel: '$$',
  lastVisited: '2024-04-12',
  plannedVisit: '2027-05-01',
  lat: 35.01,
  lon: 135.76,
  photos: [photo],
  tags: ['coffee'],
  address: '1 Street',
  altNames: ['Kogen'],
  cuisine: ['Japanese'],
  activities: ['tasting'],
  amenities: ['wifi'],
  practicalInfo: 'Cash only',
})

const bare = item({ id: 'plc_bare', city: null, country: null })

describe('the index wire format', () => {
  it('round-trips a fully filled place and a bare one exactly', () => {
    expect(decodeItem(JSON.parse(JSON.stringify(encodeItem(full))))).toEqual(full)
    expect(decodeItem(JSON.parse(JSON.stringify(encodeItem(bare))))).toEqual(bare)
  })

  it('leaves out every field that holds its default', () => {
    expect(encodeItem(bare)).toEqual({ id: 'plc_bare', name: 'plc_bare', kind: 'landmark', createdAt: '2025-03-01T10:00:00Z' })
  })

  it('keeps an empty-string city as it was, not as null', () => {
    const odd = item({ id: 'plc_odd', city: '', notes: '' })
    expect(decodeItem(encodeItem(odd))).toMatchObject({ city: '', notes: '' })
  })

  it('works the parsed best time out again from its text, including the southern-hemisphere flip', () => {
    const south = item({ id: 'plc_south', bestTimeText: 'summer', bestTime: parseBestTime('summer', -33), lat: -33, lon: 151 })
    const wire = encodeItem(south)
    expect(wire).not.toHaveProperty('bestTime.months')
    expect(decodeItem(wire).bestTime).toEqual(south.bestTime)
    expect(decodeItem(wire).bestTime.months).toEqual([1, 2, 12])
  })

  it('sends the first photo and a count; quick look fetches the rest', () => {
    const many = item({ id: 'plc_many', photos: [photo, { ...photo, uri: 'https://x/2.jpg' }, { ...photo, uri: 'https://x/3.jpg' }] })
    const wire = encodeItem(many)
    expect(wire.photo).toEqual(photo)
    expect(wire.photoCount).toBe(3)
    const back = decodeItem(wire)
    expect(back.photos).toEqual([photo])
    expect(back.photoCount).toBe(3)
  })

  it('does not claim extra photos for a place with one or none', () => {
    expect(encodeItem(item({ id: 'a', photos: [photo] }))).not.toHaveProperty('photoCount')
    expect(encodeItem(item({ id: 'b', photos: [] }))).not.toHaveProperty('photo')
    expect(decodeItem(encodeItem(item({ id: 'a', photos: [photo] })))).not.toHaveProperty('photoCount')
  })

  it('is much smaller than the places it replaces', () => {
    const places = Array.from({ length: 200 }, (_, i) =>
      item({ id: `plc_${i}`, name: `Place ${i}`, photos: [photo, photo, photo, photo], description: 'A place with a description of some length.' })
    )
    const slim = JSON.stringify(places.map(encodeItem)).length
    expect(slim).toBeLessThan(JSON.stringify(places).length * 0.6)
  })

  it('carries the version and collections, and refuses anything of another shape', () => {
    const collections = [{ id: 'col_1', name: 'Trip', description: null, placeIds: ['plc_full'] }]
    const wire = JSON.parse(JSON.stringify(encodeIndex({ version: 'v1', items: [full], collections })))
    expect(wire.format).toBe(WIRE_FORMAT)
    expect(decodeIndex(wire)).toEqual({ version: 'v1', items: [full], collections })

    expect(decodeIndex({ ...wire, format: WIRE_FORMAT + 1 })).toBeNull()
    expect(decodeIndex({ ...wire, items: 'nope' })).toBeNull()
    expect(decodeIndex({ ...wire, version: 7 })).toBeNull()
    expect(decodeIndex(null)).toBeNull()
    expect(decodeIndex('[]')).toBeNull()
  })
})
