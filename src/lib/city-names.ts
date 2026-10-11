/**
 * City-name matching that does not rewrite stored rows.
 *
 * New saves ask Google for English locality names (`GOOGLE_PLACES_LANGUAGE`).
 * Places already stored keep whatever spelling they have. Comparisons use a
 * folded key — trim, case-fold, strip diacritics — and then a small alias map
 * of exonyms whose spellings still differ after folding (Lisboa / Lisbon,
 * München / Munich, Roma / Rome). Diacritic-only pairs such as São Paulo /
 * Sao Paulo are covered by folding and are not listed.
 *
 * The map is exonyms, not historical renames (Bombay / Mumbai, Peking /
 * Beijing stay distinct). Matching is on the city string. Callers that also
 * compare country — the "Also in {city}" rail, library city chapters, the
 * most-saved panel — keep Rome, Georgia apart from Roma, Italy. A city-only
 * filter treats those as one city, which is the same axis the old exact
 * filter used, widened by the alias.
 */

/** BCP-47 language for Google Places autocomplete and details. */
export const GOOGLE_PLACES_LANGUAGE = 'en';

/**
 * English canonical name, plus the other spellings that mean that city.
 * The canonical is always included so a stored English name matches too.
 */
export const CITY_ALIAS_GROUPS: readonly { canonical: string; names: readonly string[] }[] = [
  { canonical: 'Lisbon', names: ['Lisbon', 'Lisboa'] },
  { canonical: 'Munich', names: ['Munich', 'München', 'Muenchen'] },
  { canonical: 'Rome', names: ['Rome', 'Roma'] },
  { canonical: 'Florence', names: ['Florence', 'Firenze'] },
  { canonical: 'Venice', names: ['Venice', 'Venezia'] },
  { canonical: 'Naples', names: ['Naples', 'Napoli'] },
  { canonical: 'Milan', names: ['Milan', 'Milano'] },
  { canonical: 'Turin', names: ['Turin', 'Torino'] },
  { canonical: 'Genoa', names: ['Genoa', 'Genova'] },
  { canonical: 'Prague', names: ['Prague', 'Praha'] },
  { canonical: 'Vienna', names: ['Vienna', 'Wien'] },
  { canonical: 'Cologne', names: ['Cologne', 'Köln', 'Koeln'] },
  { canonical: 'Brussels', names: ['Brussels', 'Bruxelles', 'Brussel'] },
  { canonical: 'Geneva', names: ['Geneva', 'Genève', 'Geneve', 'Genf'] },
  { canonical: 'Copenhagen', names: ['Copenhagen', 'København', 'Kobenhavn'] },
  { canonical: 'Moscow', names: ['Moscow', 'Moskva'] },
  { canonical: 'Warsaw', names: ['Warsaw', 'Warszawa'] },
  { canonical: 'Athens', names: ['Athens', 'Athina', 'Athinai'] },
  { canonical: 'Seville', names: ['Seville', 'Sevilla'] },
  { canonical: 'The Hague', names: ['The Hague', 'Den Haag', "'s-Gravenhage"] },
  { canonical: 'Antwerp', names: ['Antwerp', 'Antwerpen'] },
  { canonical: 'Bruges', names: ['Bruges', 'Brugge'] },
  { canonical: 'Ghent', names: ['Ghent', 'Gent'] },
  { canonical: 'Krakow', names: ['Krakow', 'Kraków', 'Cracow'] },
  { canonical: 'Bucharest', names: ['Bucharest', 'București', 'Bucuresti'] },
  { canonical: 'Nuremberg', names: ['Nuremberg', 'Nürnberg', 'Nuernberg'] },
  { canonical: 'Gothenburg', names: ['Gothenburg', 'Göteborg', 'Goteborg'] },
  { canonical: 'Hanover', names: ['Hanover', 'Hannover'] },
  { canonical: 'Mexico City', names: ['Mexico City', 'Ciudad de México', 'Ciudad de Mexico'] },
  { canonical: 'Padua', names: ['Padua', 'Padova'] },
  { canonical: 'Belgrade', names: ['Belgrade', 'Beograd'] },
];

/** Folded alias spelling → folded canonical key. */
const ALIAS_KEY = new Map<string, string>();
/** Folded canonical key → English display name. */
const CANONICAL_BY_KEY = new Map<string, string>();

for (const group of CITY_ALIAS_GROUPS) {
  const key = foldCityName(group.canonical);
  CANONICAL_BY_KEY.set(key, group.canonical);
  for (const name of group.names) {
    ALIAS_KEY.set(foldCityName(name), key);
  }
}

/**
 * Comparison fold: trim, collapse whitespace, lowercase, strip diacritics.
 * The stored value is not modified; this is only a key.
 */
export function foldCityName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Folded key, redirected through the alias map when the spelling is known. */
export function cityMatchKey(name: string): string {
  const folded = foldCityName(name);
  return ALIAS_KEY.get(folded) ?? folded;
}

/** English canonical when `name` is a known exonym; otherwise null. */
export function canonicalCityName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  return CANONICAL_BY_KEY.get(cityMatchKey(name)) ?? null;
}

/**
 * Label for a grouped city. Known exonyms show the English canonical.
 * Everything else keeps the stored spelling (trimmed).
 */
export function cityGroupLabel(name: string): string {
  return canonicalCityName(name) ?? name.trim().replace(/\s+/g, ' ');
}

/** True when both strings name the same city under folding and aliases. */
export function citiesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return cityMatchKey(a) === cityMatchKey(b);
}

/**
 * Alias match scoped to one country. A missing country matches only a missing
 * country, the same scope as the "Also in {city}" query, so Rome, Georgia
 * stays apart from Roma, Italy.
 */
export function citiesMatchInCountry(
  a: { city?: string | null; country?: string | null },
  b: { city?: string | null; country?: string | null },
): boolean {
  const countryA = a.country ? a.country : null;
  const countryB = b.country ? b.country : null;
  return citiesMatch(a.city, b.city) && countryA === countryB;
}

/**
 * Raw stored spellings that match `query`. Values are returned unchanged so a
 * SQL `IN` can use them without writing anything back.
 */
export function storedCitiesMatching(
  stored: Iterable<string | null | undefined>,
  query: string,
): string[] {
  if (!query.trim()) return [];
  const key = cityMatchKey(query);
  const out = new Set<string>();
  for (const raw of stored) {
    if (raw == null || raw === '') continue;
    if (cityMatchKey(raw) === key) out.add(raw);
  }
  return [...out];
}

/**
 * One row per city match-key. The label is the English canonical when the
 * alias map has one, otherwise the most common stored spelling.
 */
export function collapseCityCounts(
  cities: Iterable<string | null | undefined>,
): Array<{ city: string; count: number }> {
  const groups = new Map<string, { labels: Map<string, number>; count: number }>();
  for (const raw of cities) {
    const stored = raw?.trim();
    if (!stored) continue;
    const key = cityMatchKey(stored);
    const group = groups.get(key) ?? { labels: new Map<string, number>(), count: 0 };
    group.count += 1;
    const label = cityGroupLabel(stored);
    group.labels.set(label, (group.labels.get(label) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      city: [...group.labels].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0],
      count: group.count,
    }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** Filter-dropdown labels: one per match-key, alphabetical. */
export function cityFilterLabels(cities: Iterable<string | null | undefined>): string[] {
  return collapseCityCounts(cities)
    .map((row) => row.city)
    .sort((a, b) => a.localeCompare(b));
}

export interface CityTally {
  city: string;
  country: string;
  count: number;
}

/**
 * Group places by folded city plus country. Country stays its own axis so
 * the same exonym in two countries does not merge. The city label follows
 * `collapseCityCounts`.
 */
export function tallyCities(
  rows: Iterable<{ city: string | null | undefined; country?: string | null }>,
): CityTally[] {
  const buckets = new Map<string, { city: string; country: string; labels: Map<string, number>; count: number }>();
  for (const row of rows) {
    const stored = row.city?.trim();
    if (!stored) continue;
    const country = row.country?.trim() ?? '';
    const key = `${cityMatchKey(stored)}|${country.toLowerCase()}`;
    const bucket = buckets.get(key) ?? {
      city: cityGroupLabel(stored),
      country,
      labels: new Map<string, number>(),
      count: 0,
    };
    bucket.count += 1;
    if (!bucket.country && country) bucket.country = country;
    const label = cityGroupLabel(stored);
    bucket.labels.set(label, (bucket.labels.get(label) ?? 0) + 1);
    bucket.city = [...bucket.labels].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map(({ city, country, count }) => ({ city, country, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
