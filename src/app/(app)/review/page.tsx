import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getPlaceById } from '@/lib/db-queries'
import { loadReviewPostcard, loadReviewQueue } from '@/lib/review-queue'
import { ReviewQueue } from '@/components/review/review-queue'

interface ReviewPageProps {
  searchParams: Promise<{ placeId?: string | string[]; from?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await auth()
  if (!session?.user?.id) return null

  const params = await searchParams
  const requestedPlaceId = firstParam(params.placeId)
  const continuingQueue = firstParam(params.from) === 'queue'
  const queue = await loadReviewQueue(session.user.id, requestedPlaceId)
  let postcard = queue.postcard

  if (requestedPlaceId && !queue.entries.some((entry) => entry.placeId === requestedPlaceId)) {
    if (continuingQueue) {
      postcard = await loadReviewPostcard(session.user.id, requestedPlaceId)
    } else {
      const place = await getPlaceById(requestedPlaceId, session.user.id)
      if (place) redirect(`/place/${encodeURIComponent(place.id)}`)
    }
  }

  return (
    <ReviewQueue
      entries={queue.entries}
      postcard={postcard}
      trips={queue.trips}
      initialPlaceId={requestedPlaceId}
    />
  )
}
