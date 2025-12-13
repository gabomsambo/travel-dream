import { searchPlaces, getAllCollections } from '@/lib/db-queries'
import { MapPageClient } from '@/components/map/map-page-client'
import { auth } from '@/lib/auth'

export default async function MapPage() {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }
  const userId = session.user.id

  const [places, collections] = await Promise.all([
    searchPlaces({ userId, status: 'library', hasCoords: true }),
    getAllCollections(userId)
  ])

  return <MapPageClient places={places} collections={collections} />
}
