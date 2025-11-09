import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { DayBucket } from '@/types/database';

export const collections = sqliteTable('collections', {
  // Primary key with custom prefix
  id: text('id').primaryKey().$defaultFn(() => `col_${crypto.randomUUID()}`),

  // Collection information
  name: text('name').notNull(),
  description: text('description'),

  // Smart collection filters (JSON field)
  // Allows for dynamic collections based on criteria
  filters: text('filters', { mode: 'json' }).$type<{
    city?: string;
    country?: string;
    tags?: string[];
    kinds?: string[];
    vibes?: string[];
    status?: string;
    minRating?: number;
    hasCoords?: boolean;
  }>(),

  // Transport mode for routing (drive or walk)
  transportMode: text('transport_mode').default('drive').notNull(),

  // Day planning fields
  dayBuckets: text('day_buckets', { mode: 'json' })
    .notNull()
    .$type<DayBucket[]>()
    .default(sql`'[]'`),

  unscheduledPlaceIds: text('unscheduled_place_ids', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .default(sql`'[]'`),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // Indexes for performance
  nameIdx: index('collections_name_idx').on(table.name),
  createdAtIdx: index('collections_created_at_idx').on(table.createdAt),
}));
