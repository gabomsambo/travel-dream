import { buildRails, monthsAgo } from './rails';
import { slugify } from './geo';
import type { ExplorePlace } from './types';

export interface ShuffleScope {
  rail?: string;
  country?: string;
  city?: string;
}

/** Resolves a Shuffle scope from the query string to a title and a pool of places. */
export function shufflePool(
  places: ExplorePlace[],
  scope: ShuffleScope,
  now: Date
): { title: string; backHref: string; pool: ExplorePlace[] } {
  if (scope.rail) {
    const rail = buildRails(places, now).find((r) => r.id === scope.rail);
    if (rail) return { title: rail.title, backHref: `/explore/r/${rail.id}`, pool: rail.places };
  }
  if (scope.country) {
    const countryPlaces = places.filter((p) => p.country && slugify(p.country) === scope.country);
    const countryName = countryPlaces[0]?.country ?? scope.country;
    if (scope.city) {
      const cityPlaces = countryPlaces.filter((p) => p.city && slugify(p.city) === scope.city);
      const cityName = cityPlaces[0]?.city ?? scope.city;
      return {
        title: cityName,
        backHref: `/explore/atlas/${scope.country}/${scope.city}`,
        pool: cityPlaces,
      };
    }
    return { title: countryName, backHref: `/explore/atlas/${scope.country}`, pool: countryPlaces };
  }
  return { title: 'Everything', backHref: '/explore', pool: places };
}

/**
 * Weighted shuffle (Efraimidis–Spirakis): every place can come up, but old,
 * unvisited, photographed saves come up first — Shuffle exists for the
 * "oh right, I forgot I saved that" moment, not for last week's screenshot.
 */
export function weightedShuffle(pool: ExplorePlace[], now: Date, rand: () => number = Math.random): ExplorePlace[] {
  const weight = (p: ExplorePlace) =>
    1 +
    Math.min(monthsAgo(p.createdAt, now), 36) / 6 +
    (p.visitStatus === 'visited' ? 0 : 1.5) +
    (p.photos.length ? 2 : 0);
  return pool
    .map((p) => ({ p, key: Math.pow(rand(), 1 / weight(p)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);
}
