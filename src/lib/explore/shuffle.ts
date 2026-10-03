import { findRail, monthsAgo } from './rails';
import { groupByCity } from './atlas';
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
): { title: string; backHref: string; pool: ExplorePlace[] } | null {
  if (scope.rail) {
    const rail = findRail(places, scope.rail, now);
    if (!rail) return null;
    return { title: rail.title, backHref: `/explore/r/${rail.id}`, pool: rail.places };
  }
  if (scope.country) {
    const country = groupByCity(places).find((c) => c.slug === scope.country);
    if (scope.city) {
      const city = country?.cities.find((c) => c.slug === scope.city);
      return {
        title: city?.name ?? scope.city,
        backHref: `/explore/atlas/${scope.country}/${scope.city}`,
        pool: city?.places ?? [],
      };
    }
    return {
      title: country?.name ?? scope.country,
      backHref: `/explore/atlas/${scope.country}`,
      pool: country?.places ?? [],
    };
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
