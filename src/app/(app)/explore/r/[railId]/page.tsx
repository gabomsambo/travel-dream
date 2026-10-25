import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth-helpers"
import { loadExploreCached } from "@/lib/explore/load"
import { findRail, toRailRef } from "@/lib/explore/rails"
import { RailGridPage } from "@/components/explore/rail-grid-page"
import { ExploreScope } from "@/components/explore/explore-scope"

export default async function RailPage({ params }: { params: Promise<{ railId: string }> }) {
  const { railId } = await params
  const user = await requireAuth()
  const { places, collections } = await loadExploreCached(user.id)
  const now = new Date()
  const rail = findRail(places, railId, now)
  if (!rail) notFound()
  const ref = toRailRef(rail, now)
  return (
    <ExploreScope places={places} ids={ref.placeIds} collections={collections}>
      <RailGridPage rail={ref} />
    </ExploreScope>
  )
}
