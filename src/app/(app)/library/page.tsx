import { Suspense } from "react"
import { LibraryClient } from "@/components/library/library-client"
import { LibraryIndexed } from "@/components/library/library-indexed"
import { LibrarySkeleton } from "@/components/library/library-skeleton"
import { editorialFont } from "@/components/explore/fonts"
import { paramsFrom } from "@/lib/library/first-screen"
import { loadLibrarySeed } from "@/lib/library/seed"
import { auth } from "@/lib/auth"

export const metadata = { title: "Library" }

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  const seed = await loadLibrarySeed(session.user.id, paramsFrom(await searchParams))

  return (
    <>
      {/* The index is fetched as soon as the document is parsed, not after the page has hydrated. */}
      {seed.mode === "indexed" && (
        <link rel="preload" as="fetch" crossOrigin="anonymous" href={`/api/library/index?v=${encodeURIComponent(seed.version)}`} />
      )}
      {/* Edge to edge like Explore and the Postcard: the cover bleeds under the
          shell's padding, and inline-size containment keeps wide rows from
          widening the (app) column. */}
      <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
        {/* useSearchParams in the client needs a Suspense boundary to prerender. */}
        <Suspense fallback={<LibrarySkeleton />}>
          {seed.mode === "inline" ? <LibraryClient data={seed.data} /> : <LibraryIndexed seed={seed} />}
        </Suspense>
      </div>
    </>
  )
}
