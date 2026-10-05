import { Suspense } from "react"
import { LibraryClient } from "@/components/library/library-client"
import { LibrarySkeleton } from "@/components/library/library-skeleton"
import { editorialFont } from "@/components/explore/fonts"
import { loadLibrary } from "@/lib/library/load"
import { auth } from "@/lib/auth"

export const metadata = { title: "Library" }

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  const data = await loadLibrary(session.user.id)

  return (
    // Edge to edge like Explore and the Postcard: the cover bleeds under the
    // shell's padding, and inline-size containment keeps wide rows from
    // widening the (app) column.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      {/* useSearchParams in the client needs a Suspense boundary to prerender. */}
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryClient data={data} />
      </Suspense>
    </div>
  )
}
