import { PageHeader } from "@/components/layout/page-header"
import { InboxClient } from "@/components/inbox/inbox-client"
import { ScreenshotGrid } from "@/components/inbox/screenshot-grid"
import { ProcessingBanner } from "@/components/mass-upload/processing-banner"
import { Badge } from "@/components/adapters/badge"
import { ArrowRight, Info, CloudUpload, Images } from "lucide-react"
import Link from "next/link"
import { getSourcesByType, getPlacesByStatus, getInboxStats } from "@/lib/db-queries"
import { countScreenshotStatuses } from "@/lib/inbox-screenshot-status"
import { Suspense } from "react"
import { auth } from "@/lib/auth"

export default async function InboxPage() {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }
  const userId = session.user.id

  // Fetch real data from database
  const [places, screenshots, inboxStats] = await Promise.all([
    getPlacesByStatus('inbox', userId),
    getSourcesByType('screenshot', userId),
    getInboxStats(userId)
  ])

  const totalPlaces = places.length
  const totalScreenshots = screenshots.length

  const screenshotStatusCounts = countScreenshotStatuses(screenshots)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={`${totalPlaces} places and ${totalScreenshots} screenshots to review`}
      />

      <ProcessingBanner />

      {totalPlaces > 0 && (
        <Link
          href="/review"
          className="group flex flex-col gap-5 overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm transition hover:bg-primary/95 sm:flex-row sm:items-center sm:p-6"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-foreground/15">
            <Images className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/75">Up next</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">Review {totalPlaces} {totalPlaces === 1 ? 'place' : 'places'}</h2>
            <p className="mt-1 text-sm text-primary-foreground/80">Go through your screenshots one place at a time.</p>
          </div>
          <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-background px-4 text-sm font-semibold text-foreground transition group-hover:translate-x-0.5">
            Start review <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </span>
        </Link>
      )}

      {/* Screenshots Section */}
      {totalScreenshots > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Screenshots</h2>
            <div className="flex gap-2">
              <Badge variant="secondary">{totalScreenshots} Total</Badge>
              <Badge variant="default">{screenshotStatusCounts.done} Processed</Badge>
              {screenshotStatusCounts.reading > 0 && (
                <Badge variant="outline">{screenshotStatusCounts.reading} Processing</Badge>
              )}
              {screenshotStatusCounts.failed > 0 && (
                <Badge variant="destructive">{screenshotStatusCounts.failed} Failed</Badge>
              )}
            </div>
          </div>

          {/* Info hint */}
          <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Screenshots are processed automatically. Review the extracted places below,
              then delete screenshots — a copy is saved with each place.
            </span>
          </div>

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
          <CloudUpload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Your inbox is empty</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Upload travel screenshots and let AI extract places with coordinates automatically.
          </p>
          <Link
            href="/mass-upload"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CloudUpload className="mr-2 h-4 w-4" />
            Mass Upload Screenshots
          </Link>
        </div>
      )}
    </div>
  )
}
