import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const dismissedDuplicates = sqliteTable('dismissed_duplicates', {
  id: text('id').primaryKey().$defaultFn(() => `dis_${crypto.randomUUID()}`),

  // Owner of this dismissal (nullable for migration backfill, enforced in application)
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),

  placeId1: text('place_id_1').notNull(),
  placeId2: text('place_id_2').notNull(),

  reason: text('reason'),

  dismissedAt: text('dismissed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pairIdx: index('dismissed_duplicates_pair_idx').on(table.placeId1, table.placeId2),
  userIdx: index('dismissed_duplicates_user_idx').on(table.userId),
  userPairIdx: index('dismissed_duplicates_user_pair_idx').on(table.userId, table.placeId1, table.placeId2),
}));
