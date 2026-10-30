"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { beginMutation, revalidateIndex, type PendingMutation } from "@/lib/library/index-store"
import type { IndexPatch } from "@/lib/library/index-patch"

/**
 * How an edit made on the Library reaches the page.
 *
 * A library that arrives as a cached index patches the copy in the browser and
 * fetches the index again in the background, so an archive does not cost the
 * whole library over the wire. A library small enough to ride in the page has
 * nothing worth patching, and re-renders the page from the server as it always
 * did. Components that edit places ask for this and do not care which they got.
 */
export interface LibrarySync {
  /**
   * Shows `patch` now. Call `commit()` when the server has taken the edit and
   * `rollback()` when it has not, so a refused edit comes off the screen again.
   */
  begin: (patch: IndexPatch) => PendingMutation
  /** The server already has the edit: show it. */
  apply: (patch: IndexPatch) => void
  /** Something changed that no patch describes (or may have): bring the library up to date. */
  revalidate: () => void
}

const LibrarySyncContext = React.createContext<LibrarySync | null>(null)

/**
 * The indexed Library on screen, if there is one. An editor outside its tree (the
 * header's Add place) cannot reach its provider, but a place added from there
 * belongs in the cached index just the same.
 */
let onScreen: LibrarySync | null = null

/** Edits made on the page, with the server rendering the new page, or on the Library on screen when there is an indexed one. */
function useFallbackSync(): LibrarySync {
  const router = useRouter()
  // Read at call time, so the sync (and the callbacks built on it) stays the same object from render to render.
  const latest = React.useRef(router)
  latest.current = router
  return React.useMemo<LibrarySync>(() => {
    const refresh = () => latest.current.refresh()
    return {
      begin: (patch) => onScreen?.begin(patch) ?? { commit: refresh, rollback: () => undefined },
      apply: (patch) => (onScreen ? onScreen.apply(patch) : refresh()),
      revalidate: () => (onScreen ? onScreen.revalidate() : refresh()),
    }
  }, [])
}

export function useLibrarySync(): LibrarySync {
  const provided = React.useContext(LibrarySyncContext)
  const fallback = useFallbackSync()
  return provided ?? fallback
}

/** Edits patch this user's cached index. */
export function LibrarySyncProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const value = React.useMemo<LibrarySync>(
    () => ({
      begin: (patch) => beginMutation(userId, patch),
      apply: (patch) => beginMutation(userId, patch).commit(),
      revalidate: () => revalidateIndex(userId),
    }),
    [userId]
  )
  React.useEffect(() => {
    onScreen = value
    return () => {
      if (onScreen === value) onScreen = null
    }
  }, [value])
  return <LibrarySyncContext.Provider value={value}>{children}</LibrarySyncContext.Provider>
}
