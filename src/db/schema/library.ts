import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { places } from './places';

/**
 * A heart on a place, saved to the account so it follows the user across
 * devices (it used to live only in one browser's localStorage).
 *
 * Its own table rather than a column on `places` on purpose: `places` is read
 * by almost every query in the app, so a column there that production had not
 * been migrated for would take place pages, the Inbox and the queue down with
 * it. An unapplied migration here can only break the Library's hearts.
 *
 * `place_id` must be a place the same user owns — the table cannot express
 * that, so every write filters the ids through the caller's places first.
 */
export const placeHearts = sqliteTable('place_hearts', {
  id: text('id').primaryKey().$defaultFn(() => `hrt_${crypto.randomUUID()}`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userPlaceIdx: uniqueIndex('place_hearts_user_place_idx').on(table.userId, table.placeId),
  placeIdx: index('place_hearts_place_idx').on(table.placeId),
}));

/**
 * A named Library view: the page's own URL query (search, filters, shelf,
 * grouping, sort, view), saved so it shows up as a shelf. Stored as the query
 * string the page already reads, so a saved view and a shared link are the
 * same thing and old views keep working as the page learns new parameters.
 */
export const savedViews = sqliteTable('saved_views', {
  id: text('id').primaryKey().$defaultFn(() => `svw_${crypto.randomUUID()}`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: text('query').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdx: index('saved_views_user_idx').on(table.userId),
}));

export type PlaceHeart = typeof placeHearts.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
