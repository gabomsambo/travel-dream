'use client'

import { useSyncExternalStore } from 'react'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { buildInboxScreen, type InboxPlaceAddedAnotherWay } from '@/lib/inbox-page-model'
import type { InboxUploadBatch } from '@/types/inbox-uploads'

function subscribe(): () => void {
  return () => {}
}

export function InboxPageClient({
  uploads,
  toReviewPlaceIds,
  addedAnotherWay,
  uploadId,
}: {
  uploads: InboxUploadBatch[]
  toReviewPlaceIds: string[]
  addedAnotherWay: InboxPlaceAddedAnotherWay[]
  uploadId?: string
}) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false)
  if (!ready) return null
  const model = buildInboxScreen({
    uploads,
    toReviewPlaceIds,
    addedAnotherWay,
    now: new Date(),
    uploadId,
  })
  return <InboxScreen model={model} />
}
