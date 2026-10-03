import { requireAuth } from "@/lib/auth-helpers"
import { loadExploreCached } from "@/lib/explore/load"
import { ExploreProvider } from "@/components/explore/explore-provider"
import { editorialFont } from "@/components/explore/fonts"

export const metadata = { title: "Explore" }

export default async function ExploreLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  const { places, collections } = await loadExploreCached(user.id)

  return (
    // Explore runs edge to edge: rails bleed off the right side on purpose.
    // inline-size containment stops the rails' intrinsic width from widening the
    // (app) shell's flex column (it has no min-w-0), which would push the header off-screen.
    <div className={`${editorialFont.variable} -m-3 min-h-full pb-24 [contain:inline-size] sm:-m-6`}>
      <ExploreProvider places={places} collections={collections}>
        {children}
      </ExploreProvider>
    </div>
  )
}
