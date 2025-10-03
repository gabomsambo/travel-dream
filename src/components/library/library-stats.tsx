"use client"

interface LibraryStatsProps {
  totalCount: number
  filteredCount: number
}

export function LibraryStats({ totalCount, filteredCount }: LibraryStatsProps) {
  const isFiltered = filteredCount < totalCount

  return (
    <div className="flex items-center gap-2 text-sm">
      {isFiltered ? (
        <p className="text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filteredCount}</span> of{' '}
          <span className="font-semibold">{totalCount}</span> places
        </p>
      ) : (
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{totalCount}</span>{' '}
          {totalCount === 1 ? 'place' : 'places'}
        </p>
      )}
    </div>
  )
}
