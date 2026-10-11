"use client"

import * as React from "react"
import { bindHeartUi, heartSet, seedAccountHearts, writeHearts } from "@/lib/explore/dreams"

/** Account hearts for the Library. A later `heartIds` snapshot replaces idle places. */
export function useLibraryHearts({ heartIds }: { heartIds: string[] }) {
  const [hearts, setHearts] = React.useState(() => new Set(heartIds))

  React.useLayoutEffect(() => {
    bindHeartUi(() => setHearts(heartSet()))
    return () => bindHeartUi(null)
  }, [])

  React.useLayoutEffect(() => {
    seedAccountHearts(heartIds)
    setHearts(heartSet())
  }, [heartIds])

  const setMany = React.useCallback((ids: string[], on: boolean) => writeHearts(ids, on), [])
  return { hearts, setHearts: setMany }
}
