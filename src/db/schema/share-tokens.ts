import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

/**
 * Personal share tokens: what lets an iPhone Shortcut save a shared link into
 * its owner's Inbox without a browser session.
 *
 * Only the SHA-256 of the token is stored. The raw token is shown once, when it
 * is created, and cannot be recovered from this table. `token_prefix` is the
 * first few characters of the raw token, kept so the settings list can tell two
 * tokens apart without revealing either.
 *
 * `scope` is what the token may do. The only scope is `link-import`
 * (`POST /api/share/links`); no session route accepts a token at all.
 *
 * Revoking sets `revoked_at` instead of deleting the row, so a revoked token
 * still resolves to "revoked" rather than "unknown" and the Shortcut can say so.
 *
 * Its own table rather than columns on `users`: an unapplied migration here can
 * only break share tokens, not sign-in.
 */
export const shareTokens = sqliteTable('share_tokens', {
  id: text('id').primaryKey().$defaultFn(() => `stk_${crypto.randomUUID()}`),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenPrefix: text('token_prefix').notNull(),
  scope: text('scope').default('link-import').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
}, (table) => ({
  tokenHashIdx: uniqueIndex('share_tokens_token_hash_idx').on(table.tokenHash),
  userIdx: index('share_tokens_user_idx').on(table.userId),
}));

export type ShareToken = typeof shareTokens.$inferSelect;
