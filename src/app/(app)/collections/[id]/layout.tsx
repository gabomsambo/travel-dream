import { notFound } from 'next/navigation'
import { getCollectionWithPlaces } from '@/lib/db-queries'
import { CollectionMapProvider } from '@/components/collections/collection-map-context'
import { auth } from '@/lib/auth'

interface CollectionLayoutProps {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export default async function CollectionLayout({ params, children }: CollectionLayoutProps) {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }
  const userId = session.user.id

  const { id } = await params
  const collection = await getCollectionWithPlaces(id, userId)

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
