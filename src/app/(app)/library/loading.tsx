import { LibrarySkeleton } from "@/components/library/library-skeleton"

export default function LibraryLoading() {
  return (
    <div className="-m-3 [contain:inline-size] sm:-m-6">
      <LibrarySkeleton />
    </div>
  )
}
