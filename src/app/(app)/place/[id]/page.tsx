import { notFound } from 'next/navigation'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { getExploreCollections, getExplorePlacesInCity } from '@/lib/explore/queries'
import { PlacePage } from '@/components/places/place-view/place-page'
import { getCurrentUser } from '@/lib/auth-helpers'

export default async function PlaceRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const { id } = await params
  const place = await getPlaceWithRelations(id, user.id)

  if (!place) {
    notFound()
  }

  // The trip membership shown in "Your plan" and the "Add to trip" list, plus
  // the user's other saves in this city for the "Also in {city}" rail.
  const [trips, alsoIn] = await Promise.all([
    getExploreCollections(user.id),
    place.city ? getExplorePlacesInCity(user.id, place.city, place.country, place.id) : Promise.resolve([]),
  ])

  return <PlacePage place={place} trips={trips} alsoIn={alsoIn} />
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    return { title: 'Place | Travel Dreams' }
  }

  const { id } = await params
  const place = await getPlaceWithRelations(id, user.id)

  return {
    title: place ? `${place.name} - Travel Dreams` : 'Place Not Found',
    description: place?.description || 'Edit place details',
  }
}
