import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { CollectionPlaceItem } from '@/components/collections/collection-place-item'
import { PlaceHero } from '@/components/places/place-view/place-hero'
import type { Place, PlaceWithRelations } from '@/types/database'

jest.mock('@/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/db-queries', () => ({
  searchPlaces: jest.fn(),
  getPlacesByStatus: jest.fn(),
  getPlacesInCollection: jest.fn(),
  getCollectionById: jest.fn(),
}))
jest.mock('@/lib/export-generators/csv-generator', () => ({ generateCSV: jest.fn(async () => 'csv') }))
jest.mock('@/lib/export-generators/xlsx-generator', () => ({ generateXLSX: jest.fn() }))
jest.mock('@/lib/export-generators/pdf-generator', () => ({ generatePDF: jest.fn() }))
jest.mock('@/lib/export-generators/kml-generator', () => ({ generateKML: jest.fn() }))

import { exportData } from '@/lib/export-service'
import { getCollectionById, getPlacesInCollection, searchPlaces } from '@/lib/db-queries'
import { generateCSV } from '@/lib/export-generators/csv-generator'

const searchPlacesMock = searchPlaces as jest.Mock
const getCollectionByIdMock = getCollectionById as jest.Mock
const getPlacesInCollectionMock = getPlacesInCollection as jest.Mock
const generateCSVMock = generateCSV as jest.Mock

function heroPlace(status: string): PlaceWithRelations {
  return {
    id: 'plc_1',
    name: 'Grotta Azzurra',
    kind: 'natural',
    status,
    city: 'Capri',
    country: 'Italy',
    vibes: [],
    visitStatus: 'not_visited',
    priority: 0,
  } as unknown as PlaceWithRelations
}

describe('archived place back control', () => {
  it('says Archive while the place is archived, and Library otherwise', () => {
    const props = { photos: [], onEdit: () => {}, onOpenPhoto: () => {}, onPhotoAttached: () => {} }
    const { rerender } = render(<PlaceHero place={heroPlace('archived')} {...props} />)
    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/archive')
    rerender(<PlaceHero place={heroPlace('library')} {...props} />)
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
  })
})

describe('a trip labels an archived stop', () => {
  it('shows Archived on the stop and keeps it', () => {
    const place = { id: 'plc_1', name: 'Grotta Azzurra', kind: 'natural', status: 'archived', city: 'Capri', country: 'Italy' } as Place
    render(
      <DndContext>
        <CollectionPlaceItem place={place} index={0} />
      </DndContext>
    )
    expect(screen.getByText('Grotta Azzurra')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
})

describe('export does not quietly mix archived places into the library', () => {
  beforeEach(() => {
    searchPlacesMock.mockReset()
    getCollectionByIdMock.mockReset()
    getPlacesInCollectionMock.mockReset()
    generateCSVMock.mockClear()
    searchPlacesMock.mockResolvedValue([{ id: 'p1', name: 'Kept', status: 'library' }])
    getCollectionByIdMock.mockResolvedValue({ id: 'col_1', name: 'Italy', userId: 'user_1' })
    getPlacesInCollectionMock.mockResolvedValue([{ id: 'p2', name: 'Grotta Azzurra', status: 'archived' }])
  })

  it('pins a filtered library export to library when status is omitted', async () => {
    await exportData({ scope: { type: 'library', filters: { city: 'Rome' } }, format: 'csv', preset: 'standard' }, 'user_1')
    expect(searchPlacesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'library', city: 'Rome' }))
  })

  it('labels archived members of a collection export instead of dropping them', async () => {
    await exportData({ scope: { type: 'collection', collectionId: 'col_1' }, format: 'csv', preset: 'standard' }, 'user_1')
    expect(getPlacesInCollectionMock).toHaveBeenCalledWith('col_1', 'user_1')
    const fields = generateCSVMock.mock.calls[0][1] as Array<{ dbField: string }>
    expect(fields.some((f) => f.dbField === 'status')).toBe(true)
  })
})
