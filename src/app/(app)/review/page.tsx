import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getPlaceById } from '@/lib/db-queries'
import { loadReviewQueue } from '@/lib/review-queue'
import { ReviewQueue } from '@/components/review/review-queue'

interface ReviewPageProps {
  searchParams: Promise<{ placeId?: string | string[] }>
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await auth()
  if (!session?.user?.id) return null

  const [{ placeId }, queue] = await Promise.all([
    searchParams,
    loadReviewQueue(session.user.id),
  ])
  const requestedPlaceId = Array.isArray(placeId) ? placeId[0] : placeId

  // An old deep link to a place that has already left the Inbox still opens that place.
  if (requestedPlaceId && !queue.items.some((item) => item.place.id === requestedPlaceId)) {
    const place = await getPlaceById(requestedPlaceId, session.user.id)
    if (place) redirect(`/place/${encodeURIComponent(place.id)}`)
  }

  return (
    <ReviewQueue
      items={queue.items}
      trips={queue.trips}
      initialPlaceId={requestedPlaceId}
    />
  )
}
