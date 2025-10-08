import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { places } from './places';

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => `att_${crypto.randomUUID()}`),
  placeId: text('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'photo' | 'document' | 'receipt'
  uri: text('uri').notNull(), // Storage path: /uploads/places/[placeId]/[filename]
  filename: text('filename').notNull(),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'), // bytes

  // Image-specific fields
  width: integer('width'),
  height: integer('height'),
  thumbnailUri: text('thumbnail_uri'), // /uploads/places/[placeId]/thumbnails/[filename]

  caption: text('caption'),
  takenAt: text('taken_at'), // ISO date string - when photo was taken
  isPrimary: integer('is_primary').default(0).notNull(), // 0 or 1 (SQLite boolean)

  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  placeIdIdx: index('attachments_place_id_idx').on(table.placeId),
  typeIdx: index('attachments_type_idx').on(table.type),
  primaryIdx: index('attachments_primary_idx').on(table.placeId, table.isPrimary),
}));

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
