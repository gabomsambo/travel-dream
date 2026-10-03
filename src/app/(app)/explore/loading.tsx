// Skeleton for every Explore route: the billboard and three peeking rails.
export default function ExploreLoading() {
  return (
    <div className="space-y-12" aria-busy="true" aria-label="Loading Explore">
      <div className="h-[min(60vh,32rem)] animate-pulse bg-muted" />
      {[0, 1, 2].map((r) => (
        <div key={r} className="space-y-3">
          <div className="mx-4 h-6 w-56 animate-pulse rounded bg-muted sm:mx-8" />
          <div className="flex gap-4 overflow-hidden px-4 sm:px-8">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`shrink-0 animate-pulse rounded-2xl bg-muted ${r === 0 ? "aspect-[4/3] w-[72vw] sm:w-[340px]" : "aspect-[3/4] w-[44vw] sm:w-[210px]"}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
