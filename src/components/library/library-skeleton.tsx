/** The Library's shape while it loads: cover, search pill, shelves, a chapter of tiles. */
export function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your library">
      <div className="h-[250px] animate-pulse bg-muted sm:h-[300px]" />
      <div className="-mt-[26px] px-4 sm:-mt-[34px] sm:px-8">
        <div className="h-[50px] rounded-full border bg-card shadow-sm sm:h-[60px]" />
      </div>
      <div className="flex gap-2 px-4 pt-5 sm:px-8">
        {["w-16", "w-24", "w-20", "w-16"].map((w, i) => (
          <div key={i} className={`h-8 animate-pulse rounded-full bg-muted ${w}`} />
        ))}
      </div>
      <div className="px-4 pt-10 sm:px-8">
        <div className="mb-4 h-12 w-56 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
