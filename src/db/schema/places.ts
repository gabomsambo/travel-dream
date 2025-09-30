import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const places = sqliteTable('places', {
  // Primary key with custom prefix
  id: text('id').primaryKey().$defaultFn(() => `plc_${crypto.randomUUID()}`),
  
  // Basic place information
  name: text('name').notNull(),
  
  // Taxonomy from INITIAL.md
  // city, neighborhood, landmark, museum, gallery, viewpoint, park, beach, natural, 
  // stay, hostel, hotel, restaurant, cafe, bar, club, market, shop, experience, 
  // tour, thermal, festival, transit, tip
  kind: text('kind').notNull(),
  
  // Location information
  city: text('city'),
  country: text('country'), // ISO-3166 code (e.g., 'ES', 'US')
  admin: text('admin'),     // State/region/province
  
  // Coordinates as JSON object { lat: number, lon: number }
  coords: text('coords', { mode: 'json' }).$type<{ lat: number; lon: number }>(),

  // Full address if available
  address: text('address'),

  // Alternative names as typed array
  altNames: text('alt_names', { mode: 'json' }).$type<string[]>().default([]),

  // Tags for categorization as typed array
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),

  // Vibes/atmosphere descriptors as typed array
  // e.g., sunset, rooftop, art-deco, budget, iconic, hidden-gem, photogenic
  vibes: text('vibes', { mode: 'json' }).$type<string[]>().default([]),
  
  // Personal rating (0-5)
  ratingSelf: integer('rating_self').default(0),
  
  // Personal notes
  notes: text('notes'),
  
  // Status in workflow: inbox | library | archived
  status: text('status').notNull().default('inbox'),
  
  // Confidence score from LLM extraction (0.0-1.0)
  confidence: real('confidence').default(0.0),

  // LLM-extracted metadata fields with automatic JSON parsing
  price_level: text('price_level'), // "$", "$$", "$$$", "$$$$"
  best_time: text('best_time'), // "summer", "winter", "year-round", etc.
  activities: text('activities', { mode: 'json' }).$type<string[]>(),
  cuisine: text('cuisine', { mode: 'json' }).$type<string[]>(),
  amenities: text('amenities', { mode: 'json' }).$type<string[]>(),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // Performance indexes for common queries
  cityCountryIdx: index('places_city_country_idx').on(table.city, table.country),
  kindIdx: index('places_kind_idx').on(table.kind),
  statusIdx: index('places_status_idx').on(table.status),
  nameIdx: index('places_name_idx').on(table.name),
  confidenceIdx: index('places_confidence_idx').on(table.confidence),
  createdAtIdx: index('places_created_at_idx').on(table.createdAt),
  
  // Composite indexes for complex queries
  statusKindIdx: index('places_status_kind_idx').on(table.status, table.kind),
  cityKindIdx: index('places_city_kind_idx').on(table.city, table.kind),
}));
