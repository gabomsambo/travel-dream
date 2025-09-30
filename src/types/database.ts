import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { sources, places, collections, sourcesToPlaces, placesToCollections } from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';

// Select types (for queries)
export type Source = InferSelectModel<typeof sourcesCurrentSchema>;
export type Place = InferSelectModel<typeof places>;
export type Collection = InferSelectModel<typeof collections>;
export type SourceToPlace = InferSelectModel<typeof sourcesToPlaces>;
export type PlaceToCollection = InferSelectModel<typeof placesToCollections>;

// Insert types (for mutations)
export type NewSource = InferInsertModel<typeof sourcesCurrentSchema>;
export type NewPlace = InferInsertModel<typeof places>;
export type NewCollection = InferInsertModel<typeof collections>;
export type NewSourceToPlace = InferInsertModel<typeof sourcesToPlaces>;
export type NewPlaceToCollection = InferInsertModel<typeof placesToCollections>;

// Taxonomy from INITIAL.md - used for validation and UI
export const PLACE_KINDS = [
  'city',
  'neighborhood', 
  'landmark',
  'museum',
  'gallery',
  'viewpoint',
  'park',
  'beach',
  'natural',
  'stay',
  'hostel',
  'hotel',
  'restaurant',
  'cafe',
  'bar',
  'club',
  'market',
  'shop',
  'experience',
  'tour',
  'thermal',
  'festival',
  'transit',
  'tip'
] as const;

export type PlaceKind = typeof PLACE_KINDS[number];

// Source types
export const SOURCE_TYPES = ['screenshot', 'url', 'note'] as const;
export type SourceType = typeof SOURCE_TYPES[number];

// Place status workflow
export const PLACE_STATUSES = ['inbox', 'library', 'archived'] as const;
export type PlaceStatus = typeof PLACE_STATUSES[number];

// Common tag/vibe examples for reference
export const COMMON_TAGS = [
  'sunset',
  'rooftop', 
  'art-deco',
  'budget',
  'iconic',
  'hidden-gem',
  'photogenic',
  'solo-friendly',
  'rainy-day',
  'late-night',
  'local-favorite',
  'instagram-worthy',
  'romantic',
  'family-friendly',
  'accessible',
  'outdoor',
  'indoor',
  'historic',
  'modern',
  'traditional'
] as const;

// Extended place type with relations
export type PlaceWithSources = Place & {
  sources?: Source[];
};

export type PlaceWithCollections = Place & {
  collections?: Collection[];
};

export type CollectionWithPlaces = Collection & {
  places?: Place[];
};
