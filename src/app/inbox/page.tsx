import { PageHeader } from "@/components/layout/page-header"
import { InboxClient } from "@/components/inbox/inbox-client"
import { ScreenshotActions } from "@/components/inbox/screenshot-actions"
import { ScreenshotGrid } from "@/components/inbox/screenshot-grid"
import { Badge } from "@/components/ui/badge"
import { Image } from "lucide-react"
import { getSourcesByType, getPlacesByStatus, getInboxStats } from "@/lib/db-queries"
import { Suspense } from "react"

export default async function InboxPage() {
  // Fetch real data from database
  const [places, screenshots, inboxStats] = await Promise.all([
    getPlacesByStatus('inbox'),
    getSourcesByType('screenshot'),
    getInboxStats()
  ])

  const totalPlaces = places.length
  const totalScreenshots = screenshots.length

  // Screenshot stats
  const completedOCR = screenshots.filter(s => s.meta?.uploadInfo?.ocrStatus === 'completed').length
  const processingOCR = screenshots.filter(s => s.meta?.uploadInfo?.ocrStatus === 'processing').length
  const failedOCR = screenshots.filter(s => s.meta?.uploadInfo?.ocrStatus === 'failed').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={`${totalPlaces} places and ${totalScreenshots} screenshots to review`}
      />

      {/* Screenshots Section */}
      {totalScreenshots > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Screenshots</h2>
            <div className="flex gap-2">
              <Badge variant="secondary">{totalScreenshots} Total</Badge>
              <Badge variant="default">{completedOCR} Processed</Badge>
              {processingOCR > 0 && (
                <Badge variant="outline">{processingOCR} Processing</Badge>
              )}
              {failedOCR > 0 && (
                <Badge variant="destructive">{failedOCR} Failed</Badge>
              )}
            </div>
          </div>

          {/* LLM Processing Controls */}
          <ScreenshotActions screenshots={screenshots} />

          <ScreenshotGrid sources={screenshots} />
        </div>
      )}

      {/* Enhanced Places Section with Client-side functionality */}
      {totalPlaces > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Places</h2>
            <div className="flex gap-2">
              <Badge variant="secondary">{inboxStats.total} Total</Badge>
              <Badge variant="default">{inboxStats.byConfidence.high} High Confidence</Badge>
              <Badge variant="outline">{inboxStats.needsReview} Need Review</Badge>
            </div>
          </div>

          <Suspense fallback={<div>Loading places...</div>}>
            <InboxClient initialPlaces={places} initialStats={inboxStats} />
          </Suspense>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Places</h2>
          </div>

          <Suspense fallback={<div>Loading places...</div>}>
            <InboxClient initialPlaces={[]} initialStats={inboxStats} />
          </Suspense>
        </div>
      )}

      {/* Empty State for when no screenshots and no places */}
      {totalPlaces === 0 && totalScreenshots === 0 && (
        <div className="text-center py-12">
          <Image className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Inbox is empty</h3>
          <p className="text-gray-500">Upload some screenshots or add places to get started.</p>
        </div>
      )}
    </div>
  )
}
