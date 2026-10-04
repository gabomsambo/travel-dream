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

const BUSINESS_KINDS = new Set([
  'restaurant', 'cafe', 'bar', 'club', 'hotel', 'hostel', 'stay', 'shop', 'tour', 'experience',
]);

/** Broad families of Google place types, for checking a candidate is the right sort of thing. */
type TypeGroup = 'area' | 'nature' | 'attraction' | 'food' | 'lodging' | 'shop' | 'transit' | 'route';

const AREA_TYPES = new Set([
  'locality', 'country', 'political', 'colloquial_area', 'postal_town', 'neighborhood',
  'archipelago', 'continent', 'island',
]);
const NATURE_TYPES = new Set([
  'natural_feature', 'park', 'national_park', 'state_park', 'hiking_area', 'beach', 'campground',
  'garden', 'botanical_garden', 'nature_preserve', 'wildlife_park', 'wildlife_refuge',
  'mountain_peak', 'lake', 'river', 'island', 'scenic_spot', 'woods',
]);
const ATTRACTION_TYPES = new Set([
  'tourist_attraction', 'historical_landmark', 'historical_place', 'monument', 'museum',
  'art_gallery', 'church', 'place_of_worship', 'hindu_temple', 'mosque', 'synagogue',
  'buddhist_temple', 'cultural_landmark', 'plaza', 'observation_deck', 'amusement_park', 'zoo',
  'aquarium', 'cultural_center', 'performing_arts_theater', 'opera_house', 'concert_hall',
  'castle', 'bridge', 'sculpture', 'visitor_center', 'marina', 'garden', 'park', 'water_park',
  'ski_resort', 'national_park', 'scenic_spot', 'art_studio', 'library', 'planetarium',
]);
const FOOD_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery', 'bakery',
  'coffee_shop', 'night_club', 'pub', 'wine_bar', 'food_court', 'ice_cream_shop',
  'dessert_shop', 'brewery', 'winery', 'tea_house', 'confectionery', 'bar_and_grill',
]);
const LODGING_TYPES = new Set([
  'lodging', 'hotel', 'hostel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'motel',
  'inn', 'campground', 'farmstay', 'cottage', 'private_guest_room', 'extended_stay_hotel',
  'budget_japanese_inn', 'japanese_inn', 'camping_cabin', 'rv_park',
]);
const TRANSIT_TYPES = new Set([
  'airport', 'international_airport', 'ferry_terminal', 'transit_depot', 'heliport',
]);

/** Types that are never a photo of the place, whatever the names say. */
const NEVER_TYPES = new Set(['parking', 'parking_lot', 'parking_garage']);

export function typeGroups(types: string[]): Set<TypeGroup> {
  const groups = new Set<TypeGroup>();
  for (const t of types) {
    if (AREA_TYPES.has(t) || t.startsWith('administrative_area_level_') || t.startsWith('sublocality')) {
      groups.add('area');
    }
    if (NATURE_TYPES.has(t)) groups.add('nature');
    if (ATTRACTION_TYPES.has(t)) groups.add('attraction');
    if (FOOD_TYPES.has(t) || t.endsWith('_restaurant') || t.endsWith('_bar') || t.endsWith('_cafe')) {
      groups.add('food');
    }
    if (LODGING_TYPES.has(t)) groups.add('lodging');
    if (t === 'store' || t.endsWith('_store') || t === 'shopping_mall' || t === 'market' ||
        t === 'supermarket' || t === 'gift_shop' || t === 'flea_market') {
      groups.add('shop');
    }
    if (TRANSIT_TYPES.has(t) || t.endsWith('_station')) groups.add('transit');
    if (t === 'route') groups.add('route');
  }
  return groups;
}

const NATURE_OR_AREA_KINDS = new Set(['natural', 'beach', 'park', 'city', 'neighborhood']);

/** What a candidate for each kind may be. Kinds not listed (experience, tour, ...) are not checked. */
const KIND_GROUPS: Record<string, TypeGroup[]> = {
  city: ['area'],
  neighborhood: ['area', 'attraction', 'route'],
  natural: ['nature', 'area', 'attraction'],
  beach: ['nature', 'area', 'attraction'],
  park: ['nature', 'attraction'],
  viewpoint: ['attraction', 'nature', 'area'],
  landmark: ['attraction', 'nature', 'area'],
  museum: ['attraction'],
  gallery: ['attraction', 'shop'],
  thermal: ['attraction', 'nature', 'lodging'],
  transit: ['transit', 'attraction'],
  market: ['shop', 'food', 'attraction'],
  restaurant: ['food', 'lodging'],
  cafe: ['food', 'lodging', 'shop'],
  bar: ['food', 'lodging'],
  club: ['food', 'lodging'],
  hotel: ['lodging'],
  hostel: ['lodging'],
  stay: ['lodging'],
  shop: ['shop'],
};

/**
 * For a name that is not an exact match: is the candidate the right sort of
 * place? A stored Google id's location always agrees with the place (the
 * place's coordinates came from that same lookup), so this is what stops
 * "Uganda" taking the photo of "The Industrial Court Of Uganda".
 */
function kindMismatch(place: BackfillPlace, candidateName: string, types: string[]): string | null {
  if (types.some((t) => NEVER_TYPES.has(t))) return `candidate is a ${types.find((t) => NEVER_TYPES.has(t))}`;
  const allowed = KIND_GROUPS[place.kind];
  if (!allowed) return null;
  const groups = typeGroups(types);
  if (!allowed.some((g) => groups.has(g))) {
    return `a ${place.kind} cannot be a ${types.filter((t) => t !== 'point_of_interest' && t !== 'establishment').join('/') || 'generic establishment'}`;
  }
  // A name widened into a longer one ("Canada" -> "Canada's Wonderland",
  // "Oregon Coast" -> "Oregon Coast Military Museum") is usually a business or
  // facility named after the place. For a one-word name of any non-business
  // kind, and for any name of a natural or area kind, the wider candidate must
  // itself be a natural feature or an area.
  const placeTokens = tokens(place.name);
  const widened = tokens(candidateName).length > placeTokens.length;
  if (
    widened &&
    !BUSINESS_KINDS.has(place.kind) &&
    (placeTokens.length === 1 || NATURE_OR_AREA_KINDS.has(place.kind)) &&
    !groups.has('area') &&
    !groups.has('nature')
  ) {
    return `${place.kind} name widened to a ${[...groups].join('/') || 'generic establishment'}`;
  }
  return null;
}

/** Wikimedia files that depict something other than the place itself. */
const WIKIMEDIA_REJECT =
  /\b(map|maps|flag|logo|coat|arms|locator|diagram|plan|seal|emblem|sign|graph|chart|srtm|satellite|portrait|woman|women|man|men|inscription|station|airport|exit|stop|parada|visitor|centre|center|banknote|coin|stamp|currency)\b/;

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

/** The comma-separated components of free text (an address, a caption), normalised. */
function componentsOf(text: string): Set<string> {
  return new Set(
    text
      .split(',')
      .map((part) => normalizeName(part))
      .filter(Boolean),
  );
}

/**
 * Does free text (a caption) name the place's city, region or country? Only a
 * full comma-separated component that equals the area after normalisation
 * counts; a component that merely contains the area (a compound toponym such
 * as "New York" containing "York") is not independent confirmation.
 */
function mentionsArea(place: BackfillPlace, text: string, skipName = true): boolean {
  const own = normalizeName(place.name);
  const components = componentsOf(text);
  return [place.city, place.admin, place.country].some((area) => {
    if (!area) return false;
    const n = normalizeName(area);
    if (!n || (skipName && n === own)) return false;
    return components.has(n);
  });
}

/**
 * Strict location confirmation from an address for a place with no
 * coordinates: the country must be one full comma component and the city or
 * region another. No substring, prefix or token containment of any kind counts.
 */
function addressConfirmsArea(place: BackfillPlace, address: string): boolean {
  const components = componentsOf(address);
  const country = place.country ? normalizeName(place.country) : '';
  const region = [place.city, place.admin].some((area) => {
    if (!area) return false;
    const n = normalizeName(area);
    return n.length > 0 && components.has(n);
  });
  return country.length > 0 && components.has(country) && region;
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

  if (similarity < 1) {
    const mismatch = kindMismatch(place, matchedName, candidate.types);
    if (mismatch) return verdict(false, mismatch);
  }

  if (distanceKm !== null) {
    const radius = radiusKmForKind(place.kind);
    return distanceKm <= radius
      ? verdict(true, `within ${radius}km`)
      : verdict(false, `${distanceKm}km away (limit ${radius}km)`);
  }

  if (candidate.formattedAddress && addressConfirmsArea(place, candidate.formattedAddress)) {
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

  // The file must be *about* the place: its title starts with the place's name,
  // optionally after the area ("Verona-Juliet's balcony", "Xi'an Terracotta
  // Army"). A name buried later in the title ("Wal-Mart Supercentre in Vaughan,
  // Ontario, Canada") is incidental.
  const areaTokens = new Set(
    [place.city, place.admin, place.country].flatMap((a) => (a ? tokens(a) : [])),
  );
  const titleTokens = tokens(titleText);
  let start = 0;
  while (
    start < titleTokens.length &&
    !nameTokens.includes(titleTokens[start]) &&
    (areaTokens.has(titleTokens[start]) || /^\d+$/.test(titleTokens[start]))
  ) {
    start++;
  }
  const lead = new Set(titleTokens.slice(start, start + nameTokens.length));
  const similarity = nameTokens.length > 0 && nameTokens.every((t) => lead.has(t)) ? 1 : 0;

  const verdict = (accepted: boolean, reason: string): MatchVerdict => ({
    accepted,
    matchedName,
    similarity,
    distanceKm,
    reason,
  });

  if (!WIKIMEDIA_KINDS.has(place.kind)) return verdict(false, `no stock-free fallback for ${place.kind}`);
  if (nameTokens.join('').length < 4) return verdict(false, 'name too short to match safely');
  if (place.country && normalizeName(place.country) === normalizeName(place.name)) {
    return verdict(false, 'a whole country has no single right photo');
  }
  // Commons PNGs are overwhelmingly charts, maps and portraits, not photos.
  if (!/\.jpe?g$/i.test(matchedName)) return verdict(false, 'not a photograph (jpeg)');
  if (similarity < 1) return verdict(false, 'file title does not start with the place');
  if (WIKIMEDIA_REJECT.test(titleText)) return verdict(false, 'map, chart, person, sign or facility');

  if (distanceKm !== null) {
    const radius = radiusKmForKind(place.kind);
    return distanceKm <= radius
      ? verdict(true, `geotagged within ${radius}km`)
      : verdict(false, `geotagged ${distanceKm}km away (limit ${radius}km)`);
  }
  // Without a geotag, a country alone is too coarse to place the photo.
  if (place.city && mentionsArea({ ...place, country: null }, `${matchedName} ${item.caption ?? ''}`)) {
    return verdict(true, 'title/caption names the place\'s city or region');
  }
  return verdict(false, 'location could not be confirmed');
}

export function wikimediaAllowedFor(kind: string): boolean {
  return WIKIMEDIA_KINDS.has(kind);
}
