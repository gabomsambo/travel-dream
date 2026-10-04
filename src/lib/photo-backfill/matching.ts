/**
 * Match-quality rules for the place-photo backfill. Pure functions, so every
 * accept/reject decision can be logged and unit-tested.
 *
 * The bar is "a wrong photo is worse than none": a candidate is accepted only
 * when its name agrees with the place AND its location agrees with what the
 * place already knows (coordinates, or failing that its city/country).
 */
import type { GooglePlaceWithPhotos } from '@/lib/photo-sources/google-places';
import type { PhotoSearchItem } from '@/lib/photo-sources/types';

export interface BackfillPlace {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  country: string | null;
  admin: string | null;
  address: string | null;
  coords: { lat: number; lon: number } | null;
  googlePlaceId: string | null;
  altNames: string[];
}

export interface MatchVerdict {
  accepted: boolean;
  matchedName: string;
  similarity: number;
  /** Kilometres from the place's own coordinates, when both sides have them. */
  distanceKm: number | null;
  reason: string;
}

/** Minimum name similarity, on a 0-1 scale, for any candidate. */
export const MIN_NAME_SIMILARITY = 0.75;

const STOPWORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'de', 'del', 'la', 'el', 'le', 'les', 'los', 'las', 'da', 'do',
  'di', 'du', 'des', 'y', 'e', 'et',
]);

/** Kinds where a Wikimedia photo of the place is plausible. Businesses are Google-only. */
const WIKIMEDIA_KINDS = new Set([
  'city', 'neighborhood', 'landmark', 'museum', 'gallery', 'viewpoint', 'park', 'beach',
  'natural', 'thermal', 'transit', 'market', 'festival',
]);

/** Google types that mark a business; such a candidate never stands in for a non-business kind. */
const BUSINESS_TYPES = new Set([
  'lodging', 'hotel', 'restaurant', 'food', 'cafe', 'bar', 'store', 'night_club',
  'travel_agency', 'real_estate_agency', 'shopping_mall', 'meal_takeaway',
]);
const BUSINESS_KINDS = new Set([
  'restaurant', 'cafe', 'bar', 'club', 'hotel', 'hostel', 'stay', 'shop', 'tour', 'experience',
]);

/** Wikimedia files that depict something other than the place itself. */
const WIKIMEDIA_REJECT = /\b(map|maps|flag|logo|coat of arms|locator|diagram|plan|seal|emblem|sign)\b/;

/** How far, in km, a match may sit from the place's coordinates, by kind. */
export function radiusKmForKind(kind: string): number {
  switch (kind) {
    case 'natural':
      return 60;
    case 'city':
      return 40;
    case 'park':
    case 'experience':
    case 'tour':
    case 'festival':
      return 25;
    case 'beach':
    case 'thermal':
      return 15;
    case 'neighborhood':
      return 8;
    case 'landmark':
    case 'viewpoint':
    case 'transit':
      return 5;
    case 'museum':
    case 'gallery':
    case 'market':
      return 2;
    default:
      return 1.5;
  }
}

export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return a === b ? 1 : 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      hits++;
      counts.set(g, n - 1);
    }
  }
  return (2 * hits) / (A.length + B.length);
}

/**
 * 0-1 similarity between two place names. Exact (after normalising accents and
 * punctuation) is 1; one name's words all appearing in the other is 0.9 (so
 * "Torres del Paine" matches "Torres del Paine National Park", as long as the
 * shorter name is at least 30% of the longer one's words); otherwise the
 * character-bigram Dice coefficient.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokens(a);
  const tb = tokens(b);
  const setA = new Set(ta);
  const setB = new Set(tb);
  // The shorter name must also be a fair share of the longer one, so a generic
  // word or two ("W Management") does not match a long unrelated listing.
  const contained = (small: string[], big: Set<string>) =>
    small.length > 0 &&
    small.join('').length >= 4 &&
    small.length / big.size >= 0.3 &&
    small.every((t) => big.has(t));
  const score = dice(na, nb);
  if (contained(ta, setB) || contained(tb, setA)) return Math.max(score, 0.9);
  return score;
}

export function bestNameSimilarity(place: BackfillPlace, candidate: string): number {
  return Math.max(
    nameSimilarity(place.name, candidate),
    ...place.altNames.map((alt) => nameSimilarity(alt, candidate)),
  );
}

export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Does free text (an address, a caption) name the place's city, region or country? */
function mentionsArea(place: BackfillPlace, text: string, skipName = true): boolean {
  const hay = ` ${normalizeName(text)} `;
  const own = normalizeName(place.name);
  return [place.city, place.admin, place.country].some((area) => {
    if (!area) return false;
    const n = normalizeName(area);
    if (!n || (skipName && n === own)) return false;
    return hay.includes(` ${n} `);
  });
}

function round(n: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Judge one Google place against the place we are finding a photo for. */
export function judgeGoogleCandidate(
  place: BackfillPlace,
  candidate: GooglePlaceWithPhotos,
): MatchVerdict {
  const matchedName = candidate.displayName ?? '';
  const similarity = round(bestNameSimilarity(place, matchedName));
  const distanceKm =
    place.coords && candidate.location
      ? round(haversineKm(place.coords, candidate.location), 3)
      : null;
  const verdict = (accepted: boolean, reason: string): MatchVerdict => ({
    accepted,
    matchedName,
    similarity,
    distanceKm,
    reason,
  });

  if (!matchedName) return verdict(false, 'candidate has no name');
  if (similarity < MIN_NAME_SIMILARITY) return verdict(false, 'name differs');

  if (
    !BUSINESS_KINDS.has(place.kind) &&
    similarity < 1 &&
    candidate.types.some((t) => BUSINESS_TYPES.has(t))
  ) {
    return verdict(false, `business (${candidate.types.join(',')}) for a ${place.kind}`);
  }

  if (distanceKm !== null) {
    const radius = radiusKmForKind(place.kind);
    return distanceKm <= radius
      ? verdict(true, `within ${radius}km`)
      : verdict(false, `${distanceKm}km away (limit ${radius}km)`);
  }

  if (candidate.formattedAddress && mentionsArea(place, candidate.formattedAddress, false)) {
    return verdict(true, 'address names the place\'s area');
  }
  return verdict(false, 'location could not be confirmed');
}

/** Judge one Wikimedia Commons file as a photo of the place. */
export function judgeWikimediaItem(place: BackfillPlace, item: PhotoSearchItem): MatchVerdict {
  const matchedName = item.title ?? '';
  const titleText = normalizeName(matchedName.replace(/\.[a-z0-9]+$/i, ''));
  const distanceKm =
    place.coords && item.coords ? round(haversineKm(place.coords, item.coords), 3) : null;
  const nameTokens = tokens(place.name);
  const titleTokens = new Set(titleText.split(' '));
  const similarity = nameTokens.length > 0 && nameTokens.every((t) => titleTokens.has(t)) ? 1 : 0;
  const verdict = (accepted: boolean, reason: string): MatchVerdict => ({
    accepted,
    matchedName,
    similarity,
    distanceKm,
    reason,
  });

  if (!WIKIMEDIA_KINDS.has(place.kind)) return verdict(false, `no stock-free fallback for ${place.kind}`);
  if (nameTokens.join('').length < 4) return verdict(false, 'name too short to match safely');
  if (similarity < 1) return verdict(false, 'file title does not name the place');
  if (WIKIMEDIA_REJECT.test(titleText)) return verdict(false, 'map, flag, logo or sign');

  if (distanceKm !== null) {
    const radius = radiusKmForKind(place.kind);
    return distanceKm <= radius
      ? verdict(true, `geotagged within ${radius}km`)
      : verdict(false, `geotagged ${distanceKm}km away (limit ${radius}km)`);
  }
  if (mentionsArea(place, `${matchedName} ${item.caption ?? ''}`)) {
    return verdict(true, 'title/caption names the place\'s area');
  }
  return verdict(false, 'location could not be confirmed');
}

export function wikimediaAllowedFor(kind: string): boolean {
  return WIKIMEDIA_KINDS.has(kind);
}
