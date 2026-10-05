import { notFound } from 'next/navigation'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { PlacePage } from '@/components/places/place-view/place-page'
import { getCurrentUser } from '@/lib/auth-helpers'

export default async function PlaceRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string | string[] }>
}) {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const { id } = await params
  const query = await searchParams
  const edit = Array.isArray(query.edit) ? query.edit[0] : query.edit
  const place = await getPlaceWithRelations(id, user.id)

  if (!place) {
    notFound()
  }

  return <PlacePage place={place} startInEdit={edit === '1'} />
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
