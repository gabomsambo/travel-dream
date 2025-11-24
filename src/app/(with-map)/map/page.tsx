import { searchPlaces, getAllCollections } from '@/lib/db-queries'
import { MapPageClient } from '@/components/map/map-page-client'

export default async function MapPage() {
  const [places, collections] = await Promise.all([
    searchPlaces({ status: 'library', hasCoords: true }),
    getAllCollections()
  ])

  return <MapPageClient places={places} collections={collections} />
}
