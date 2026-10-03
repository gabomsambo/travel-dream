import Link from "next/link"
import { Compass } from "lucide-react"

export function ExploreEmpty() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <Compass className="h-6 w-6" />
      </span>
      <h1 className="font-editorial text-4xl">Nothing to explore yet</h1>
      <p className="text-sm text-muted-foreground">
        Drop in a few screenshots of places you want to go. Explore turns them into themed rows to wander through.
      </p>
      <Link href="/mass-upload" className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
        Upload screenshots
      </Link>
    </div>
  )
}
