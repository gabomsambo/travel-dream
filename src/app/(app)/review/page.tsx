import { auth } from '@/lib/auth'
import { loadReviewQueue } from '@/lib/review-queue'
import { ReviewQueue } from '@/components/review/review-queue'

interface ReviewPageProps {
  searchParams: Promise<{ placeId?: string | string[]; upload?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const session = await auth()
  if (!session?.user?.id) return null

  const params = await searchParams
  const requestedPlaceId = firstParam(params.placeId)
  const requestedUpload = firstParam(params.upload)?.trim() || undefined
  const queue = await loadReviewQueue(session.user.id, requestedPlaceId, requestedUpload)

  return (
    <ReviewQueue
      key={requestedUpload ?? ''}
      entries={queue.entries}
      postcard={queue.postcard}
      trips={queue.trips}
      initialPlaceId={requestedPlaceId}
      uploadSessionId={requestedUpload}
    />
  )
}
