import { requireAuth } from "@/lib/auth-helpers"
import { loadExploreCached } from "@/lib/explore/load"
import { shufflePool, weightedShuffle } from "@/lib/explore/shuffle"
import { ShuffleDeck } from "@/components/explore/shuffle-deck"

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function ShufflePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const user = await requireAuth()
  const { places } = await loadExploreCached(user.id)
  const now = new Date()
  const { title, backHref, pool } = shufflePool(
    places,
    { rail: one(params.rail), country: one(params.country), city: one(params.city) },
    now
  )
  // Random per visit on purpose: a fresh deck every time you open it.
  const deck = weightedShuffle(pool, now).map((p) => p.id)
  return <ShuffleDeck title={title} backHref={backHref} deck={deck} />
}
