import { InboxScreen } from '@/components/inbox/inbox-screen'
import { editorialFont } from '@/components/explore/fonts'
import { auth } from '@/lib/auth'
import { buildInboxScreen, coveredUploadPlaceIds } from '@/lib/inbox-page-model'
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
  const model = buildInboxScreen({
    uploads: summary.uploads,
    toReviewPlaceIds: summary.toReviewPlaceIds,
    addedAnotherWay,
    now: new Date(),
    uploadId: firstParam(params.upload),
  })

  return (
    <div className={`${editorialFont.variable} -m-3 min-h-full sm:-m-6`}>
      <div className="px-3.5 py-5 sm:px-8 sm:py-8">
        <InboxScreen model={model} />
      </div>
    </div>
  )
}
