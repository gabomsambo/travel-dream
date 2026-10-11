import { Suspense } from "react"
import { ArchiveClient } from "@/components/archive/archive-client"
import { editorialFont } from "@/components/explore/fonts"
import { loadArchive } from "@/lib/archive/load"
import { auth } from "@/lib/auth"

export const metadata = { title: "Archive" }

function ArchiveSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 sm:px-8">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-10 animate-pulse rounded-full bg-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

export default async function ArchivePage() {
  const session = await auth()
  if (!session?.user?.id) {
    return null
  }

  const places = await loadArchive(session.user.id)

  return (
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      <Suspense fallback={<ArchiveSkeleton />}>
        <ArchiveClient places={places} />
      </Suspense>
    </div>
  )
}
