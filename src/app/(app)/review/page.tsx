import { auth } from '@/lib/auth'
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

  return (
    <ReviewQueue
      items={queue.items}
      trips={queue.trips}
      initialPlaceId={requestedPlaceId}
    />
  )
}
