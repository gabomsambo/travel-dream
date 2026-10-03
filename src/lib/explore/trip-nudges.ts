import { sectionOf } from './sections';
import type { ExploreCollection, ExplorePlace, TripNudge } from './types';

/** A city becomes a trip suggestion once this many unvisited places pile up there. */
export const TRIP_THRESHOLD = 5;

export function buildTripNudges(
  places: ExplorePlace[],
  collections: ExploreCollection[],
  threshold = TRIP_THRESHOLD
): TripNudge[] {
  const byCity = new Map<string, ExplorePlace[]>();
  for (const p of places) {
    if (!p.city || !p.country || p.visitStatus === 'visited') continue;
    const key = `${p.country}::${p.city}`;
    byCity.set(key, [...(byCity.get(key) ?? []), p]);
  }

  const nudges: TripNudge[] = [];
  for (const list of byCity.values()) {
    if (list.length < threshold) continue;
    const ids = new Set(list.map((p) => p.id));
    // If a collection already holds half of this city, the nudge is "keep
    // planning that", not "start another one".
    const existing = collections
      .map((c) => ({ c, overlap: c.placeIds.filter((id) => ids.has(id)).length }))
      .filter((x) => x.overlap >= Math.ceil(list.length / 2) || (x.overlap >= 2 && x.c.placeIds.length > 0 && x.overlap / x.c.placeIds.length >= 0.8))
      .sort((a, b) => b.overlap - a.overlap)[0];
    const sorted = [...list].sort((a, b) => b.priority - a.priority);
    const kindCounts = new Map<string, number>();
    for (const p of list) {
      const title = sectionOf(p.kind).title;
      kindCounts.set(title, (kindCounts.get(title) ?? 0) + 1);
    }
    nudges.push({
      city: list[0].city!,
      country: list[0].country!,
      placeIds: sorted.map((p) => p.id),
      photos: sorted.filter((p) => p.photos.length).slice(0, 3).map((p) => p.photos[0].thumb),
      kinds: [...kindCounts].sort((a, b) => b[1] - a[1]).map(([title]) => title),
      existingCollection: existing ? { id: existing.c.id, name: existing.c.name } : null,
    });
  }
  return nudges.sort((a, b) => b.placeIds.length - a.placeIds.length);
}
