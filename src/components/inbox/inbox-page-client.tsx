'use client'

import { useSyncExternalStore } from 'react'
import { InboxScreen } from '@/components/inbox/inbox-screen'
import { buildInboxScreen, type InboxPlaceAddedAnotherWay } from '@/lib/inbox-page-model'
import type { InboxUploadBatch } from '@/types/inbox-uploads'
import type { InboxLinkItem } from '@/lib/inbox-link-items'
import type { ShareNotice } from '@/lib/link-import/shared-url'

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
  linkItems = [],
  highlightLinkId,
  shareNotice,
}: {
  uploads: InboxUploadBatch[]
  toReviewPlaceIds: string[]
  addedAnotherWay: InboxPlaceAddedAnotherWay[]
  uploadId?: string
  linkItems?: InboxLinkItem[]
  highlightLinkId?: string
  shareNotice?: ShareNotice
}) {
  const nowMs = useSyncExternalStore(subscribe, browserNow, () => null)
  const model = buildInboxScreen({
    uploads,
    toReviewPlaceIds,
    addedAnotherWay,
    now: nowMs === null ? null : new Date(nowMs),
    uploadId,
  })
  return <InboxScreen model={model} linkItems={linkItems} highlightLinkId={highlightLinkId} shareNotice={shareNotice} />
}
