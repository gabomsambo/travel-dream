import { requireAuth } from "@/lib/auth-helpers"
import { editorialFont } from "@/components/explore/fonts"

export const metadata = { title: "Explore" }

// No data is loaded here on purpose: a layout above `loading.tsx` is rendered by
// every link prefetch of an Explore route, so anything it serializes is sent
// from every page of the app. Each page wraps itself in <ExploreScope> with just
// the places it renders.
export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()

  return (
    // Explore runs edge to edge: rails bleed off the right side on purpose.
    // inline-size containment stops the rails' intrinsic width from widening the
    // (app) shell's flex column (it has no min-w-0), which would push the header off-screen.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>{children}</div>
  )
}
