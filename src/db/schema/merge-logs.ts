import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const mergeLogs = sqliteTable('merge_logs', {
  id: text('id').primaryKey().$defaultFn(() => `mrg_${crypto.randomUUID()}`),

  targetId: text('target_id').notNull(),

  sourceIds: text('source_ids', { mode: 'json' }).$type<string[]>().notNull(),

  mergedData: text('merged_data', { mode: 'json' }).$type<object>(),

  sourceSnapshots: text('source_snapshots', { mode: 'json' }).$type<object[]>(),

  confidence: real('confidence').notNull(),

  performedBy: text('performed_by').default('user').notNull(),

  performedAt: text('performed_at').default(sql`CURRENT_TIMESTAMP`).notNull(),

  undone: integer('undone', { mode: 'boolean' }).default(false).notNull(),
  undonAt: text('undon_at'),
}, (table) => ({
  targetIdx: index('merge_logs_target_idx').on(table.targetId),
  performedAtIdx: index('merge_logs_performed_at_idx').on(table.performedAt),
  undoneIdx: index('merge_logs_undone_idx').on(table.undone),
}));
