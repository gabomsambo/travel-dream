/**
 * The atlas drill-down: countries -> cities -> places. Pure functions over the
 * user's own saves, so a missing country or city degrades without breaking the
 * page — the captain's brief is "imagine the data is amazing, because it
 * will be ... have a fallback, but don't let missing data affect your design
 * decisions."
 *
 * `slugify` and `flagFor` live in `geo.ts` because rails and queries use them
 * too; the atlas module layers grouping, covers, season and region on top.
 */
import { flagFor, slugify } from './geo';
import type { CityGroup, CountryGroup, ExplorePlace } from './types';

const SCENIC = new Set(['landmark', 'natural', 'viewpoint', 'beach', 'neighborhood', 'park']);

/**
 * Best cover for a group — a scenic place the owner was most excited about.
 * `avoid` keeps a country from wearing the same photo as its top city.
 * Returns the full image (uri), since the hero is large.
 */
export function coverOf(places: ExplorePlace[], avoid: Set<string> = new Set()): string | null {
  const score = (p: ExplorePlace) => p.priority + (SCENIC.has(p.kind) ? 2 : 0);
  const withPhoto = places.filter((p) => p.photos.length > 0);
  withPhoto.sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt));
  return (
    withPhoto.find((p) => !avoid.has(p.photos[0].uri))?.photos[0].uri ??
    withPhoto[0]?.photos[0].uri ??
    null
  );
}

/** Countries -> cities, both ordered by how much the user has saved there. */
export function buildAtlas(places: ExplorePlace[]): CountryGroup[] {
  const byCountry = new Map<string, ExplorePlace[]>();
  for (const p of places) {
    if (!p.country) continue; // old rows without a country live in "Somewhere" (see atlas page)
    const list = byCountry.get(p.country) ?? [];
    list.push(p);
    byCountry.set(p.country, list);
  }

  const countries: CountryGroup[] = [];
  for (const [country, list] of byCountry) {
    const byCity = new Map<string, ExplorePlace[]>();
    for (const p of list) {
      const city = p.city?.trim() || country;
      const cl = byCity.get(city) ?? [];
      cl.push(p);
      byCity.set(city, cl);
    }
    const cities: CityGroup[] = [...byCity].map(([city, cl]) => ({
      city,
      country,
      slug: slugify(city),
      places: cl,
      cover: coverOf(cl),
    }));
    cities.sort((a, b) => b.places.length - a.places.length || a.city.localeCompare(b.city));
    const cityCovers = new Set(cities.map((c) => c.cover).filter((c): c is string => !!c));
    countries.push({
      country,
      slug: slugify(country),
      flag: flagFor(country),
      places: list,
      cities,
      cover: coverOf(list, cityCovers),
    });
  }
  countries.sort((a, b) => b.places.length - a.places.length || a.country.localeCompare(b.country));
  return countries;
}

/**
 * Region groupings for the atlas index bento. Built off the same country
 * table `flagFor` uses so an unknown country never throws.
 */
const REGION_OF: Record<string, string> = {
  JP: 'Asia', KR: 'Asia', CN: 'Asia', TW: 'Asia', TH: 'Asia', VN: 'Asia', ID: 'Asia', MY: 'Asia', SG: 'Asia', PH: 'Asia',
  KH: 'Asia', LA: 'Asia', IN: 'Asia', NP: 'Asia', LK: 'Asia', MV: 'Asia',
  AE: 'Middle East', JO: 'Middle East', IL: 'Middle East',
  // Europe
  PT: 'Europe', ES: 'Europe', FR: 'Europe', IT: 'Europe', GR: 'Europe', GB: 'Europe', IE: 'Europe', NL: 'Europe', BE: 'Europe',
  DE: 'Europe', AT: 'Europe', CH: 'Europe', CZ: 'Europe', HU: 'Europe', PL: 'Europe', HR: 'Europe', SI: 'Europe', MT: 'Europe',
  IS: 'Europe', NO: 'Europe', SE: 'Europe', DK: 'Europe',
  // Americas
  US: 'North America', CA: 'North America', MX: 'North America', CU: 'North America', CR: 'North America',
  PE: 'South America', AR: 'South America', BR: 'South America', CL: 'South America', CO: 'South America', EC: 'South America', UY: 'South America',
  // Africa & Oceania
  MA: 'Africa', EG: 'Africa', ZA: 'Africa', TZ: 'Africa', KE: 'Africa',
  AU: 'Oceania', NZ: 'Oceania',
  TR: 'Europe', // Atlas keeps Turkey with Europe (its geography file says so).
};

export const REGION_ORDER = ['Europe', 'Asia', 'North America', 'South America', 'Africa', 'Middle East', 'Oceania', 'Elsewhere'];

/**
 * Region for a country. Unknown countries fall back to "Elsewhere" so a typo
 * never crashes the bento grid.
 */
export function regionOf(country: string): string {
  const flag = flagFor(country);
  if (!flag) return 'Elsewhere';
  // The two-letter ISO code lives in the first two regional-indicator codepoints.
  const code = String.fromCharCode(flag.codePointAt(0)! - 0x1f1e6 + 65) + String.fromCharCode(flag.codePointAt(2)! - 0x1f1e6 + 65);
  return REGION_OF[code] ?? 'Elsewhere';
}

/** How many of these (unvisited) places are in season each month, Jan..Dec. */
export function seasonCurve(places: ExplorePlace[]): number[] {
  const counts = Array(12).fill(0) as number[];
  for (const p of places) {
    if (p.visitStatus === 'visited') continue;
    for (const m of p.bestTime.months) counts[m - 1]++;
  }
  return counts;
}