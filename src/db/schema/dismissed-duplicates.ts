import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const dismissedDuplicates = sqliteTable('dismissed_duplicates', {
  id: text('id').primaryKey().$defaultFn(() => `dis_${crypto.randomUUID()}`),

  placeId1: text('place_id_1').notNull(),
  placeId2: text('place_id_2').notNull(),

  reason: text('reason'),

  dismissedAt: text('dismissed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pairIdx: index('dismissed_duplicates_pair_idx').on(table.placeId1, table.placeId2),
}));
