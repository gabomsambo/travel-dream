export default function Loading() {
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="h-9 w-48 bg-muted animate-pulse rounded-md mb-6" />
      <div className="space-y-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
            <div className="h-10 w-full bg-muted animate-pulse rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
