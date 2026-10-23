import { InboxPageClient } from '@/components/inbox/inbox-page-client'
import { editorialFont } from '@/components/explore/fonts'
import { auth } from '@/lib/auth'
import { coveredUploadPlaceIds } from '@/lib/inbox-page-model'
import { getInboxPlacesAddedAnotherWay, getInboxUploads } from '@/lib/inbox-uploads'

export const metadata = { title: 'Inbox' }

interface InboxPageProps {
  searchParams: Promise<{ upload?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const session = await auth()
  if (!session?.user?.id) return null

  const params = await searchParams
  const summary = await getInboxUploads(session.user.id)
  const addedAnotherWay = await getInboxPlacesAddedAnotherWay(
    session.user.id,
    coveredUploadPlaceIds(summary.uploads)
  )
  return (
    <div className={`${editorialFont.variable} -m-3 min-h-full sm:-m-6`}>
      <div className="px-3.5 py-5 sm:px-8 sm:py-8">
        <InboxPageClient
          uploads={summary.uploads}
          toReviewPlaceIds={summary.toReviewPlaceIds}
          addedAnotherWay={addedAnotherWay}
          uploadId={firstParam(params.upload)}
        />
      </div>
    </div>
  )
}
