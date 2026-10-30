"use client"

import * as React from "react"
import { bindHeartUi, heartSet, seedAccountHearts, writeHearts } from "@/lib/explore/dreams"

/**
 * The set the writer now holds, or `prev` itself when nothing changed. The writer publishes
 * again when a save lands; a new, equal Set would re-render the page for no change.
 */
function followWriter(prev: Set<string>): Set<string> {
  const next = heartSet()
  if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev
  return next
}

/** Account hearts for the Library. A later `heartIds` snapshot replaces idle places. */
export function useLibraryHearts({ heartIds }: { heartIds: string[] }) {
  const [hearts, setHearts] = React.useState(() => new Set(heartIds))

  React.useLayoutEffect(() => {
    bindHeartUi(() => setHearts(followWriter))
    return () => bindHeartUi(null)
  }, [])

  React.useLayoutEffect(() => {
    seedAccountHearts(heartIds)
    setHearts(followWriter)
  }, [heartIds])

  const setMany = React.useCallback((ids: string[], on: boolean) => writeHearts(ids, on), [])
  return { hearts, setHearts: setMany }
}
