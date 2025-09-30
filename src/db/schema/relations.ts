import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { sources } from './sources';
import { places } from './places';
import { collections } from './collections';

// Join table for sources to places (many-to-many)
export const sourcesToPlaces = sqliteTable('sources_to_places', {
  sourceId: text('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.sourceId, table.placeId] }),
  sourceIdx: index('sources_to_places_source_idx').on(table.sourceId),
  placeIdx: index('sources_to_places_place_idx').on(table.placeId),
}));

// Join table for places to collections (many-to-many with ordering)
export const placesToCollections = sqliteTable('places_to_collections', {
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.placeId, table.collectionId] }),
  placeIdx: index('places_to_collections_place_idx').on(table.placeId),
  collectionIdx: index('places_to_collections_collection_idx').on(table.collectionId),
  orderIdx: index('places_to_collections_order_idx').on(table.collectionId, table.orderIndex),
}));

// Drizzle relations for type-safe queries
export const sourcesRelations = relations(sources, ({ many }) => ({
  sourcesToPlaces: many(sourcesToPlaces),
}));

export const placesRelations = relations(places, ({ many }) => ({
  sourcesToPlaces: many(sourcesToPlaces),
  placesToCollections: many(placesToCollections),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  placesToCollections: many(placesToCollections),
}));

export const sourcesToPlacesRelations = relations(sourcesToPlaces, ({ one }) => ({
  source: one(sources, {
    fields: [sourcesToPlaces.sourceId],
    references: [sources.id],
  }),
  place: one(places, {
    fields: [sourcesToPlaces.placeId],
    references: [places.id],
  }),
}));

export const placesToCollectionsRelations = relations(placesToCollections, ({ one }) => ({
  place: one(places, {
    fields: [placesToCollections.placeId],
    references: [places.id],
  }),
  collection: one(collections, {
    fields: [placesToCollections.collectionId],
    references: [collections.id],
  }),
}));
