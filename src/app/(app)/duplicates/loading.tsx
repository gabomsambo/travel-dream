export default function Loading() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-md mb-2" />
        <div className="h-5 w-96 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  )
}
