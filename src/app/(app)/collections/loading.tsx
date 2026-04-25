export default function Loading() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <div className="h-9 w-48 bg-muted animate-pulse rounded-md mb-2" />
        <div className="h-5 w-72 bg-muted animate-pulse rounded-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  )
}
