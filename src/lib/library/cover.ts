/**
 * What the Library cover reads out of the whole library: which photos make the
 * collage, and the numbers in its sentence. Pure and client-safe, so the server
 * can work them out for the first screen with the same code the page runs once
 * the whole library is on the client.
 */
import { flagFor } from "@/lib/explore/geo"
import { groupBySlug } from "@/lib/explore/atlas"
import { tallyCities } from "@/lib/city-names"
import type { LibraryItem } from "./types"

const SCENIC = new Set(["landmark", "natural", "viewpoint", "beach", "neighborhood", "park"])

export interface CoverPhoto {
  id: string
  src: string
  thumb: string
}

/** Up to `n` cover photos, one country at a time first so the collage reads as a journey. */
export function coverPhotos(items: LibraryItem[], n: number): CoverPhoto[] {
  const score = (p: LibraryItem) => p.priority + (SCENIC.has(p.kind) ? 2 : 0) + (p.visitStatus === "visited" ? 1 : 0)
  const ranked = items.filter((p) => p.photos.length).sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt))
  const picked: LibraryItem[] = []
  const countries = new Set<string>()
  for (const p of ranked) {
    const c = p.country?.trim().toLowerCase() ?? ""
    if (countries.has(c)) continue
    countries.add(c)
    picked.push(p)
    if (picked.length === n) break
  }
  for (const p of ranked) {
    if (picked.length === n) break
    if (!picked.includes(p)) picked.push(p)
  }
  return picked.map((p) => ({ id: p.id, src: p.photos[0].uri, thumb: p.photos[0].thumb }))
}

export interface CoverStats {
  total: number
  countries: number
  cities: number
  been: number
  planned: number
  dreaming: number
  /** Every country, most-saved first, with whether you've been. */
  passport: Array<{ country: string; flag: string; been: boolean }>
}

export function coverStats(items: LibraryItem[]): CoverStats {
  const located = items.filter((p) => p.country?.trim())
  const groups = groupBySlug(located, (p) => p.country!.trim()).sort((a, b) => b.places.length - a.places.length)
  const cities = tallyCities(items)
  return {
    total: items.length,
    countries: groups.length,
    cities: cities.length,
    been: items.filter((p) => p.visitStatus === "visited").length,
    planned: items.filter((p) => p.visitStatus === "planned").length,
    dreaming: items.filter((p) => p.visitStatus === "not_visited").length,
    passport: groups.map((g) => ({
      country: g.name,
      flag: flagFor(g.name),
      been: g.places.some((p) => p.visitStatus === "visited"),
    })),
  }
}
