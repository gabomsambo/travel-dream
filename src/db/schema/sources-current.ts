import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Current database schema (without LLM columns that don't exist yet)
export const sourcesCurrentSchema = sqliteTable('sources', {
  // Primary key with custom prefix
  id: text('id').primaryKey().$defaultFn(() => `src_${crypto.randomUUID()}`),

  // Source type: 'screenshot' | 'url' | 'note'
  type: text('type').notNull(),

  // URI: file path or URL
  uri: text('uri').notNull(),

  // Hash for deduplication with automatic JSON parsing
  hash: text('hash', { mode: 'json' }).$type<{ phash?: string; sha1: string }>(),

  // OCR extracted text
  ocrText: text('ocr_text'),

  // Language code (BCP-47)
  lang: text('lang').default('en'),

  // Metadata with automatic JSON parsing
  meta: text('meta', { mode: 'json' }).$type<{
    filename?: string;
    size?: number;
    mimeType?: string;
    width?: number;
    height?: number;
    timestamp?: string;
    url?: string;
    title?: string;
    author?: string;
    platform?: string;
    uploadInfo?: {
      sessionId?: string;
      filename?: string;
      originalName?: string;
      fileSize?: number;
      dimensions?: { width: number; height: number };
      mimeType?: string;
      storedPath?: string;
      thumbnailPath?: string;
      ocrStatus?: string;
      ocrConfidence?: number;
      ocrError?: string;
      uploadedAt?: string;
    };
  }>(),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // Indexes for performance
  typeIdx: index('sources_type_idx').on(table.type),
  uriIdx: index('sources_uri_idx').on(table.uri),
  createdAtIdx: index('sources_created_at_idx').on(table.createdAt),
}));