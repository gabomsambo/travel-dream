import { notFound } from 'next/navigation'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { PlaceFullView } from '@/components/places/place-full-view'
import { getCurrentUser } from '@/lib/auth-helpers'

export default async function PlaceEditPage({
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

  return <PlaceFullView initialPlace={place} />
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
    title: place ? `Edit ${place.name} - Travel Dreams` : 'Place Not Found',
    description: place?.description || 'Edit place details',
  }
}
