"use client"

import { useEffect } from "react"
import { useUIRefresh, getUIRefreshEnabled } from "@/lib/feature-flags"

export function UIRefreshProvider({ children }: { children: React.ReactNode }) {
  const [uiRefreshEnabled] = useUIRefresh()

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (uiRefreshEnabled) {
        document.documentElement.setAttribute('data-ui-refresh', 'true')
      } else {
        document.documentElement.removeAttribute('data-ui-refresh')
      }
    }
  }, [uiRefreshEnabled])

  useEffect(() => {
    if (typeof document !== 'undefined' && getUIRefreshEnabled()) {
      document.documentElement.setAttribute('data-ui-refresh', 'true')
    }
  }, [])

  return <>{children}</>
}
