import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { places } from './places';

export const placeLinks = sqliteTable('place_links', {
  id: text('id').primaryKey().$defaultFn(() => `lnk_${crypto.randomUUID()}`),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),

  url: text('url').notNull(),
  title: text('title'), // Auto-fetched from meta tags or user input
  description: text('description'),
  type: text('type'), // 'website' | 'social' | 'booking' | 'review' | 'article'
  platform: text('platform'), // 'instagram', 'tiktok', 'youtube', 'google_maps', 'tripadvisor', 'blog', etc.

  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  placeIdIdx: index('place_links_place_id_idx').on(table.placeId),
  typeIdx: index('place_links_type_idx').on(table.type),
  platformIdx: index('place_links_platform_idx').on(table.platform),
}));

export type PlaceLink = typeof placeLinks.$inferSelect;
export type NewPlaceLink = typeof placeLinks.$inferInsert;
