import type { BestTime } from './best-time';

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
  lat: number | null;
  lon: number | null;
  /** Primary photo first. Empty when the place has no photo yet. */
  photos: ExplorePhoto[];
}

/**
 * One photo at the two sizes Explore renders it: `thumb` for rails, tiles and
 * covers, `uri` for the hero billboard and the quick-look sheet. A photo with no
 * thumbnail of its own is the full image at both sizes.
 */
export interface ExplorePhoto {
  thumb: string;
  uri: string;
}

export type RailShape = 'poster' | 'landscape';

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
  placeIds: string[];
}

/** What crosses the server/client boundary: ids only, resolved against the provider's place map. */
export type RailRef = Omit<Rail, 'places'> & { placeIds: string[]; captions: Record<string, string> };

/** One billboard pick: a place plus the reason it is today's pick. */
export interface FeaturedPick {
  placeId: string;
  reason: string;
}
