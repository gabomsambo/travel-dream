import { PageHeader } from "@/components/layout/page-header"
import { Loader2 } from "lucide-react"
import { ReviewClient } from "@/components/review/review-client"
import { getPlaceById, getSourcesForPlace, getPlacesByStatus } from "@/lib/db-queries"
import { Suspense } from "react"

interface ReviewPageProps {
  searchParams: Promise<{ placeId?: string }>
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const { placeId } = await searchParams

  if (placeId) {
    const place = await getPlaceById(placeId)
    const sources = place ? await getSourcesForPlace(placeId) : []

    return (
      <div className="space-y-6">
        <PageHeader
          title="Review & Edit Place"
          description="Review the OCR source and edit extracted place data"
        />

        {place ? (
          <ReviewClient initialPlace={place} initialSources={sources} />
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Place not found</p>
          </div>
        )}
      </div>
    )
  }

  const inboxPlaces = await getPlacesByStatus('inbox')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Places"
        description="Review and edit extracted places before confirming to library"
      />

      <Suspense fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading places...</span>
        </div>
      }>
        <ReviewClient initialPlaces={inboxPlaces} />
      </Suspense>
    </div>
  )
}
