export default function Loading() {
  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="h-9 w-2/3 bg-muted animate-pulse rounded-md mb-3" />
      <div className="h-5 w-1/3 bg-muted animate-pulse rounded-md mb-6" />
      <div className="aspect-video w-full bg-muted animate-pulse rounded-lg mb-6" />
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <div className="h-5 w-full bg-muted animate-pulse rounded-md" />
          <div className="h-5 w-5/6 bg-muted animate-pulse rounded-md" />
          <div className="h-5 w-4/6 bg-muted animate-pulse rounded-md" />
          <div className="h-32 w-full bg-muted animate-pulse rounded-lg mt-4" />
        </div>
        <div className="space-y-3">
          <div className="h-24 w-full bg-muted animate-pulse rounded-lg" />
          <div className="h-24 w-full bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  )
}
