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
  country: text('country'), // Country name (e.g., 'Spain', 'United States')
  admin: text('admin'),     // State/region/province
  
  // Coordinates as JSON object { lat: number, lon: number }
  coords: text('coords', { mode: 'json' }).$type<{ lat: number; lon: number }>(),

  // Full address if available
  address: text('address'),

  // Google Place ID for verified locations
  googlePlaceId: text('google_place_id'),

  // Alternative names as typed array
  altNames: text('alt_names', { mode: 'json' }).$type<string[]>().default([]),

  // Description of the place
  description: text('description'),

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

  // Contact & Practical Information
  website: text('website'),
  phone: text('phone'),
  email: text('email'),
  hours: text('hours', { mode: 'json' }).$type<Record<string, string>>(), // {"monday": "9-17", "tuesday": "9-17", "closed": ["sunday"]}

  // Visit Tracking
  visitStatus: text('visit_status').default('not_visited'), // 'not_visited' | 'visited' | 'planned'
  priority: integer('priority').default(0), // 0-5 priority rating
  lastVisited: text('last_visited'), // ISO date string
  plannedVisit: text('planned_visit'), // ISO date string

  // Social Context
  recommendedBy: text('recommended_by'), // "Sarah's Instagram", "Travel blog XYZ", "Friend John"
  companions: text('companions', { mode: 'json' }).$type<string[]>(), // ["Alice", "Bob", "Carol"]

  // Additional Notes
  practicalInfo: text('practical_info'), // "Bring cash only", "Entrance on side street", etc.
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

  // Visit tracking indexes
  visitStatusIdx: index('places_visit_status_idx').on(table.visitStatus),
  priorityIdx: index('places_priority_idx').on(table.priority),
  lastVisitedIdx: index('places_last_visited_idx').on(table.lastVisited),
  plannedVisitIdx: index('places_planned_visit_idx').on(table.plannedVisit),
}));
