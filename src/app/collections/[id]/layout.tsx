import { notFound } from 'next/navigation'
import { getCollectionWithPlaces } from '@/lib/db-queries'
import { CollectionMapProvider } from '@/components/collections/collection-map-context'

interface CollectionLayoutProps {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export default async function CollectionLayout({ params, children }: CollectionLayoutProps) {
  const { id } = await params
  const collection = await getCollectionWithPlaces(id)

  if (!collection) {
    notFound()
  }

  const collectionWithTypedTransport = {
    ...collection,
    transportMode: (collection.transportMode || 'drive') as 'drive' | 'walk',
  }

  return (
    <CollectionMapProvider
      initialCollection={collectionWithTypedTransport}
      initialTransportMode={collectionWithTypedTransport.transportMode}
    >
      {children}
    </CollectionMapProvider>
  )
}
