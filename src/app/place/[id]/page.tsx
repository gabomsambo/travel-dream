import { notFound } from 'next/navigation'
import { getPlaceWithRelations } from '@/lib/db-queries'
import { PlaceFullView } from '@/components/places/place-full-view'

export default async function PlaceEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const place = await getPlaceWithRelations(id)

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
  const { id } = await params
  const place = await getPlaceWithRelations(id)

  return {
    title: place ? `Edit ${place.name} - Travel Dreams` : 'Place Not Found',
    description: place?.description || 'Edit place details',
  }
}
