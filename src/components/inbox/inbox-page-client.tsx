'use client'

import { useSyncExternalStore } from 'react'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { buildInboxScreen, type InboxPlaceAddedAnotherWay } from '@/lib/inbox-page-model'
import type { InboxUploadBatch } from '@/types/inbox-uploads'

let browserNowMs: number | null = null

function subscribe(): () => void {
  return () => {}
}

function browserNow(): number {
  if (browserNowMs === null) browserNowMs = Date.now()
  return browserNowMs
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
  const nowMs = useSyncExternalStore(subscribe, browserNow, () => null)
  const model = buildInboxScreen({
    uploads,
    toReviewPlaceIds,
    addedAnotherWay,
    now: nowMs === null ? null : new Date(nowMs),
    uploadId,
  })
  return <InboxScreen model={model} />
}
