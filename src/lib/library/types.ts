import type { ExploreCollection, ExplorePlace } from '@/lib/explore/types';

/**
 * One place on the Library page: Explore's projection (photos at both sizes,
 * parsed best time, coordinates, visit dates) plus the fields only the
 * Library's search index, tag filter and export read.
 *
 * Client-safe: this module holds types only, so a client component can import
 * it without pulling the database into its bundle.
 */
export interface LibraryItem extends ExplorePlace {
  tags: string[];
  address: string | null;
  altNames: string[];
  cuisine: string[];
  activities: string[];
  amenities: string[];
  practicalInfo: string | null;
}

export interface LibraryData {
  items: LibraryItem[];
  collections: ExploreCollection[];
  /** Places still waiting in the Inbox — the "Needs review" shelf links there. */
  inboxCount: number;
}

/** The four ways the Library can be read. `grid` keeps its old URL value. */
export type LibraryView = 'grid' | 'journal' | 'list' | 'map';

export type GroupMode = 'country' | 'city' | 'collection' | 'shelf' | 'kind' | 'month' | 'saved' | 'none';
