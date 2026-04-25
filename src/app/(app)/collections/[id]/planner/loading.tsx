export default function Loading() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="h-9 w-64 bg-muted animate-pulse rounded-md mb-6" />
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="h-12 w-24 bg-muted animate-pulse rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-1/2 bg-muted animate-pulse rounded-md" />
              <div className="h-24 w-full bg-muted animate-pulse rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
