import { requireAuth } from "@/lib/auth-helpers"
import { loadExploreCached } from "@/lib/explore/load"
import { buildRails, homeRails, toRailRef } from "@/lib/explore/rails"
import { pickFeatured } from "@/lib/explore/featured"
import { buildTripNudges } from "@/lib/explore/trip-nudges"
import { buildAtlas } from "@/lib/explore/atlas"
import { ExploreHero } from "@/components/explore/explore-hero"
import { RailRow } from "@/components/explore/rail-row"
import { TripMoment } from "@/components/explore/trip-moment"
import { BrowseAll } from "@/components/explore/browse-all"
import { ExploreEmpty } from "@/components/explore/explore-empty"
import { AtlasStrip } from "@/components/explore/atlas-strip"
import { TopCitiesRail } from "@/components/explore/top-cities-rail"

export default async function ExplorePage() {
  const user = await requireAuth()
  const { places, collections } = await loadExploreCached(user.id)
  if (places.length === 0) return <ExploreEmpty />

  const now = new Date()
  const all = buildRails(places, now)
  const rails = homeRails(all).map((r) => toRailRef(r, now))
  const nudges = buildTripNudges(places, collections)
  const countries = new Set(places.map((p) => p.country).filter(Boolean)).size
  const cities = new Set(places.filter((p) => p.city).map((p) => `${p.country}/${p.city}`)).size
  const firstName = user.name?.split(" ")[0]
  const atlas = buildAtlas(places)
  // The top-10 rail sorts every city across the atlas, deduped.
  const cityGroups = atlas.flatMap((c) => c.cities).sort((a, b) => b.places.length - a.places.length).slice(0, 10)

  // Rails come first (the captain's ask). The first one sits over the hero's
  // fading photo; trip moments interrupt the rest so the page has a rhythm
  // instead of a dozen identical rows.
  const [first, ...rest] = rails
  const blocks: React.ReactNode[] = []
  rest.forEach((rail, i) => {
    blocks.push(<RailRow key={rail.id} rail={rail} />)
    if (i === 1 && nudges[0]) blocks.push(<TripMoment key="trip-0" nudge={nudges[0]} />)
    if (i === 6 && nudges[1]) blocks.push(<TripMoment key="trip-1" nudge={nudges[1]} />)
  })

  return (
    <div className="space-y-10 sm:space-y-14">
      <div>
        <ExploreHero
          picks={pickFeatured(places, now)}
          greeting={`Where to next${firstName ? `, ${firstName}` : ""}?`}
          stats={`${places.length} places · ${countries} ${countries === 1 ? "country" : "countries"} · ${cities} ${cities === 1 ? "city" : "cities"}`}
        />
        {first && <RailRow rail={first} className="relative z-10 -mt-14 sm:-mt-20" />}
      </div>
      <AtlasStrip countries={atlas.slice(0, 12)} total={atlas.length} />
      {blocks}
      {cityGroups.length > 0 && <TopCitiesRail cities={cityGroups} />}
      <BrowseAll rails={all.map((r) => ({ id: r.id, title: r.title, group: r.group, placeIds: r.places.map((p) => p.id) }))} />
    </div>
  )
}
