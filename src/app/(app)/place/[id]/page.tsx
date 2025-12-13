import { notFound } from 'next/navigation'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { PlaceFullView } from '@/components/places/place-full-view'
import { auth } from '@/lib/auth'

export default async function PlaceEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }
  const userId = session.user.id

  const { id } = await params
  const place = await getPlaceWithRelations(id, userId)

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
  const session = await auth()
  if (!session?.user?.id) {
    return { title: 'Place | Travel Dreams' }
  }

  const { id } = await params
  const place = await getPlaceWithRelations(id, session.user.id)

  return {
    title: place ? `Edit ${place.name} - Travel Dreams` : 'Place Not Found',
    description: place?.description || 'Edit place details',
  }
}
