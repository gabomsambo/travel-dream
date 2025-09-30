import { PageHeader } from "@/components/layout/page-header"
import { InboxClient } from "@/components/inbox/inbox-client"
import { ScreenshotActions } from "@/components/inbox/screenshot-actions"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Image, FileText, Clock, CheckCircle, AlertCircle } from "lucide-react"
import { getSourcesByType, getPlacesByStatus, getInboxStats } from "@/lib/db-queries"
import { Suspense } from "react"


interface ScreenshotSource {
  id: string
  uri: string
  ocrText: string | null
  meta: any
  createdAt: string
}

function ScreenshotCard({ source }: { source: ScreenshotSource }) {
  const uploadInfo = source.meta?.uploadInfo
  const ocrStatus = uploadInfo?.ocrStatus || 'unknown'
  const thumbnailPath = uploadInfo?.thumbnailPath
  const originalName = uploadInfo?.originalName || 'Unknown'
  const confidence = uploadInfo?.ocrConfidence

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">OCR Complete</Badge>
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>
      case 'failed':
        return <Badge variant="destructive">OCR Failed</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Thumbnail */}
        {thumbnailPath ? (
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-gray-100">
            <img
              src={thumbnailPath}
              alt={originalName}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video w-full rounded-lg bg-gray-100 flex items-center justify-center">
            <Image className="h-8 w-8 text-gray-400" />
          </div>
        )}

        {/* File Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{originalName}</span>
            {getStatusIcon(ocrStatus)}
          </div>

          <div className="flex items-center gap-2">
            {getStatusBadge(ocrStatus)}
            {confidence && (
              <Badge variant="outline" className="text-xs">
                {Math.round(confidence)}% confidence
              </Badge>
            )}
          </div>

          {/* OCR Text Preview */}
          {source.ocrText && (
            <div className="mt-2">
              <div className="flex items-center gap-1 mb-1">
                <FileText className="h-3 w-3 text-gray-500" />
                <span className="text-xs text-gray-500">Extracted Text</span>
              </div>
              <p className="text-xs text-gray-700 line-clamp-3">
                {source.ocrText.substring(0, 150)}
                {source.ocrText.length > 150 && '...'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ScreenshotGrid({ sources }: { sources: ScreenshotSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="text-center py-12">
        <Image className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">No screenshots found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sources.map((source) => (
        <ScreenshotCard key={source.id} source={source} />
      ))}
    </div>
  )
}

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
