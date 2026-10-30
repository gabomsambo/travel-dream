"use client"

import * as React from "react"
import { ExploreProvider } from "@/components/explore/explore-provider"
import { firstScreenItems, type IndexedSeed } from "@/lib/library/first-screen"
import { useLibraryIndex } from "@/lib/library/index-store"
import type { LibraryData } from "@/lib/library/types"
import { LibraryFirstScreen } from "./library-first-screen"
import { LibraryPage } from "./library-client"
import { LibrarySyncProvider } from "./library-sync"

/**
 * A library too big to ride in the page: the server's first screen paints at
 * once, the index (every place) is fetched by its version, and the full page
 * takes over when it arrives. Hearts, saved views and the inbox count come with
 * the page, so they are always current and never part of the cached index.
 */
export function LibraryIndexed({ seed }: { seed: IndexedSeed }) {
  const { index, error, retry } = useLibraryIndex(seed.userId, seed.version)
  const data = React.useMemo<LibraryData | null>(
    () =>
      index && {
        userId: seed.userId,
        items: index.items,
        collections: index.collections,
        inboxCount: seed.inboxCount,
        heartIds: seed.heartIds,
        savedViews: seed.savedViews,
      },
    [index, seed.userId, seed.inboxCount, seed.heartIds, seed.savedViews]
  )
  const preview = React.useMemo(() => firstScreenItems(seed), [seed])

  // One provider across the swap, so a quick look opened on the first screen stays open.
  return (
    <LibrarySyncProvider userId={seed.userId}>
      <ExploreProvider places={data ? data.items : preview} collections={data ? data.collections : []}>
        {data ? (
          <>
            {error && (
              <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-8" role="status">
                Couldn&apos;t refresh your library.{" "}
                <button type="button" onClick={retry} className="font-medium text-foreground underline underline-offset-4">
                  Try again
                </button>
              </p>
            )}
            <LibraryPage data={data} />
          </>
        ) : (
          <LibraryFirstScreen seed={seed} error={error} onRetry={retry} />
        )}
      </ExploreProvider>
    </LibrarySyncProvider>
  )
}
