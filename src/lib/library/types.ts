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

/** A named Library view, as the page reads it: the saved URL query. */
export interface SavedViewRow {
  id: string;
  name: string;
  query: string;
}

export interface LibraryData {
  userId: string;
  items: LibraryItem[];
  collections: ExploreCollection[];
  /** Places still waiting in the Inbox — the "Needs review" shelf links there. */
  inboxCount: number;
  /** Hearted place ids, from the account. May name Inbox places, which the page never shows. */
  heartIds: string[];
  savedViews: SavedViewRow[];
}

/** The four ways the Library can be read. `grid` keeps its old URL value. */
export type LibraryView = 'grid' | 'journal' | 'list' | 'map';

export type GroupMode = 'country' | 'city' | 'collection' | 'shelf' | 'kind' | 'month' | 'saved' | 'none';
