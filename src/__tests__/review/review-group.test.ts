import {
  extractionOrderByPlaceId,
  groupCountLabel,
  namesFromExtraction,
  namesFromPlaces,
  placeHasPin,
  resolveBatchTripId,
  reviewQuote,
  screenshotTitle,
  suggestBatchTrip,
} from '@/lib/review-group'

describe('review group ordering', () => {
  it('reads place names from the cached extraction and ignores everything else', () => {
    expect(namesFromPlaces([
      { name: ' Second ' },
      { description: 'do-not-leak' },
      'cached',
      { name: '' },
    ])).toEqual(['Second'])
    expect(namesFromPlaces('[{"name":"Gail\'s Bakery","raw":"secret"}]')).toEqual(["Gail's Bakery"])
    expect(namesFromExtraction({
      places: [{ name: 'Polar Museum' }],
      rawResponse: 'do-not-leak-raw',
    })).toEqual(['Polar Museum'])
    expect(namesFromExtraction({ name: 'secret-gemini-place' })).toEqual([])
    expect(namesFromPlaces('not-json')).toEqual([])
  })

  it('orders places by the extraction list, then created time', () => {
    const order = extractionOrderByPlaceId(
      ['Second', 'Library only', 'First'],
      [
        { id: 'first', name: 'First', createdAt: '2026-10-18T12:00:02.000Z' },
        { id: 'second', name: ' second ', createdAt: '2026-10-18T12:00:01.000Z' },
        { id: 'extra', name: 'Extra', createdAt: '2026-10-18T12:00:03.000Z' },
      ],
    )
    expect(order.get('second')).toBe(0)
    expect(order.get('first')).toBe(2)
    expect(order.has('extra')).toBe(false)
    expect(order.has('Library only')).toBe(false)
  })

  it('gives duplicate names extraction slots in created-at order', () => {
    const order = extractionOrderByPlaceId(
      ['Cafe', 'Cafe'],
      [
        { id: 'later', name: 'Cafe', createdAt: '2026-10-18T12:00:02.000Z' },
        { id: 'earlier', name: 'Cafe', createdAt: '2026-10-18T12:00:01.000Z' },
      ],
    )
    expect(order.get('earlier')).toBe(0)
    expect(order.get('later')).toBe(1)
  })
})

describe('review group row text', () => {
  it('treats a null pin and the 0,0 fallback as no pin', () => {
    expect(placeHasPin(null)).toBe(false)
    expect(placeHasPin({ lat: 0, lon: 0 })).toBe(false)
    expect(placeHasPin({ lat: 51.5, lon: -0.1 })).toBe(true)
  })

  it('keeps the post quote to one capped line', () => {
    expect(reviewQuote('  King\'s Road \n pancakes  ')).toBe("King's Road pancakes")
    expect(reviewQuote('  ')).toBeNull()
    expect(reviewQuote('a'.repeat(200))?.endsWith('…')).toBe(true)
    expect(reviewQuote('a'.repeat(200))?.length).toBeLessThanOrEqual(180)
  })

  it('labels a screenshot from its file name and the shared city', () => {
    expect(screenshotTitle('IMG_2917.PNG')).toBe('IMG_2917')
    expect(screenshotTitle(null)).toBe('This screenshot')
    expect(groupCountLabel(4, ['London', 'London', null])).toBe('4 places · London')
    expect(groupCountLabel(2, ['London', 'Tromsø'])).toBe('2 places')
  })
})

describe('batch trip suggestion', () => {
  const trips = [
    { id: 'col_london', name: 'London long weekend', cities: ['London'] },
    { id: 'col_norway', name: 'Norway in winter', cities: ['Tromsø'] },
    { id: 'col_name_only', name: 'Ica desert', cities: [] },
  ]

  it('suggests the trip whose places share the city, and nothing on a tie, a miss, or a name alone', () => {
    expect(suggestBatchTrip(trips, ['London', 'London', null])).toBe('col_london')
    expect(suggestBatchTrip(trips, ['Ica'])).toBeNull()
    expect(suggestBatchTrip(trips, ['London', 'Tromsø'])).toBeNull()
    expect(suggestBatchTrip(trips, [null, null])).toBeNull()
    expect(suggestBatchTrip(trips, ['Paris'])).toBeNull()
    expect(suggestBatchTrip(
      [{ id: 'col_name', name: 'London long weekend', cities: [] }],
      ['London'],
    )).toBeNull()
  })

  it('counts one city per place, so three Londons beat a one-place London long weekend', () => {
    expect(suggestBatchTrip([
      { id: 'col_weekend', name: 'London long weekend', cities: ['London'] },
      { id: 'col_more', name: 'Spring notes', cities: ['London', 'London', 'London'] },
    ], ['London'])).toBe('col_more')
  })

  it('folds city case and space, so mixed London spellings do not outrank a larger trip', () => {
    expect(suggestBatchTrip([
      { id: 'col_mixed', name: 'Aaa mixed', cities: ['London', 'london'] },
      { id: 'col_same', name: 'Zzz same', cities: ['London', 'London', ' London '] },
    ], ['London'])).toBe('col_same')
  })

  it('breaks an equal place count by trip name', () => {
    expect(suggestBatchTrip([
      { id: 'col_z', name: 'Alpha', cities: ['London', 'London'] },
      { id: 'col_a', name: 'Zebra', cities: ['London', 'london'] },
    ], ['London'])).toBe('col_z')
  })

  it('does not match a city that is only part of another word', () => {
    expect(suggestBatchTrip(
      [{ id: 'col_derry', name: 'Londonderry weekend', cities: [] }],
      ['London'],
    )).toBeNull()
  })

  it('keeps an explicit choice and follows the suggestion until one is made', () => {
    const ids = trips.map((trip) => trip.id)
    expect(resolveBatchTripId(null, 'col_london', ids)).toBe('col_london')
    expect(resolveBatchTripId('none', 'col_london', ids)).toBeNull()
    expect(resolveBatchTripId('col_norway', 'col_london', ids)).toBe('col_norway')
    expect(resolveBatchTripId('col_gone', 'col_london', ids)).toBeNull()
  })
})
