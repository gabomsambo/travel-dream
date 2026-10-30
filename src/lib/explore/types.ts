import type { AttributionMeta } from '@/db/schema/attachments';
import type { BestTime } from './best-time';

/**
 * One city the user has saved in: the places, the slug for `/explore/atlas/[country]/[city]`,
 * and a chosen cover for the tiles.
 */
export interface CityGroup {
  city: string;
  country: string;
  slug: string;
  places: ExplorePlace[];
  cover: string | null;
}

/** One country: cities, places, and the cover that opens the country page. */
export interface CountryGroup {
  country: string;
  slug: string;
  flag: string;
  places: ExplorePlace[];
  cities: CityGroup[];
  cover: string | null;
}

/** The narrow projection Explore renders. Built server-side from a scoped query. */
export interface ExplorePlace {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  country: string | null;
  description: string | null;
  notes: string | null;
  vibes: string[];
  bestTimeText: string | null;
  bestTime: BestTime;
  recommendedBy: string | null;
  visitStatus: 'not_visited' | 'visited' | 'planned';
  priority: number;
  ratingSelf: number;
  priceLevel: string | null;
  createdAt: string;
  /** When the owner went (visited) or plans to go (planned). Optional: older fixtures omit them. */
  lastVisited?: string | null;
  plannedVisit?: string | null;
  lat: number | null;
  lon: number | null;
  /** Primary photo first. Empty when the place has no photo yet. */
  photos: ExplorePhoto[];
  /**
   * How many photos the place has when `photos` holds fewer (the Library's index
   * carries only the first). Quick look asks for the rest when it opens.
   */
  photoCount?: number;
}

/**
 * One photo at two sizes: `uri` is the full asset (tiles, covers, heroes — Photo
 * right-sizes via `sizes`); `thumb` is the ~400px square for boxes up to ~160px
 * when `use="thumb"`. A photo with no thumbnail of its own uses `uri` for both.
 */
export interface ExplorePhoto {
  thumb: string;
  uri: string;
  attribution?: AttributionMeta | null;
  source?: string;
}

export type RailShape = 'poster' | 'landscape' | 'hero';

/** The "Browse all" shelf a rail is filed under. */
export type RailGroup = 'timing' | 'people' | 'moods' | 'food' | 'list';

export interface Rail {
  /** Stable, URL-safe id — the full-rail page is /explore/r/[id]. */
  id: string;
  title: string;
  /** Small all-caps line above the title ("BECAUSE IT'S OCTOBER"). */
  eyebrow: string;
  /** One sentence for the full-rail page header. */
  blurb: string;
  shape: RailShape;
  group: RailGroup;
  places: ExplorePlace[];
}

export interface TripNudge {
  city: string;
  country: string;
  /** The atlas slugs for this city, stable across spellings; also the dismissal key. */
  citySlug: string;
  countrySlug: string;
  placeIds: string[];
  photos: string[];
  /** Broad kinds of place saved there ("Eat & drink", "Outdoors"), most common first. */
  kinds: string[];
  /** An existing collection already holding most of these places, if any. */
  existingCollection: { id: string; name: string } | null;
}

export interface ExploreCollection {
  id: string;
  name: string;
  /** The collection's own one-liner, when the owner wrote one. */
  description?: string | null;
  placeIds: string[];
}

/** What crosses the server/client boundary: ids only, resolved against the provider's place map. */
export type RailRef = Omit<Rail, 'places'> & { placeIds: string[]; captions: Record<string, string> };

/** One "Browse all" tile. The cover is chosen on the server, so no place crosses with it. */
export interface BrowseRail {
  id: string;
  title: string;
  group: RailGroup;
  count: number;
  cover: string | null;
  /** The name and kind that draw the tile's art when no place in the rail has a photo. */
  fallback: { name: string; kind: string } | null;
}

/** One billboard pick: a place plus the reason it is today's pick. */
export interface FeaturedPick {
  placeId: string;
  reason: string;
}
