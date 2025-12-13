import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const sources = sqliteTable('sources', {
  // Primary key with custom prefix
  id: text('id').primaryKey().$defaultFn(() => `src_${crypto.randomUUID()}`),

  // Owner of this source (nullable for migration, enforced in application)
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),

  // Source type: 'screenshot' | 'url' | 'note'
  type: text('type').notNull(),
  
  // URI: file path or URL
  uri: text('uri').notNull(),
  
  // Hash for deduplication (JSON field)
  hash: text('hash', { mode: 'json' }).$type<{
    phash?: string;  // Perceptual hash for images
    sha1: string;    // Content hash
  }>(),
  
  // OCR extracted text
  ocrText: text('ocr_text'),
  
  // Language code (BCP-47)
  lang: text('lang').default('en'),
  
  // Metadata (JSON field)
  meta: text('meta', { mode: 'json' }).$type<{
    platform?: string;    // e.g., 'tiktok', 'instagram', 'blog'
    author?: string;       // Creator handle or name
    capturedAt?: string;   // When the content was captured
    title?: string;        // Original title if available
    description?: string;  // Original description
    uploadInfo?: {
      sessionId: string;
      originalName: string;
      fileSize: number;
      dimensions: { width: number; height: number };
      mimeType: string;
      storedPath: string;
      thumbnailPath?: string;
      ocrStatus: 'pending' | 'processing' | 'completed' | 'failed';
      ocrConfidence?: number;
      uploadedAt: string;
    };
  }>(),

  // LLM processing tracking
  llmProcessed: integer('llm_processed').default(0).notNull(),
  llmProcessedAt: text('llm_processed_at'),
  llmModel: text('llm_model'),
  llmConfidence: real('llm_confidence'),
  llmExtractionDetails: text('llm_extraction_details', { mode: 'json' }).$type<{
    nameExtraction?: number;      // 0.95 - How sure about the name
    geoMatch?: number;           // 0.87 - Found it on maps
    categoryDetection?: number;  // 0.92 - Correctly identified as "restaurant"
    languageConsistency?: number; // 0.88 - Text language matches location
    overall?: number;            // 0.90 - Weighted average
    processingTimeMs?: number;   // Time taken for LLM processing
    costUsd?: number;           // Cost of LLM processing
    errors?: string[];          // Any processing errors
  }>(),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  // Indexes for performance
  typeIdx: index('sources_type_idx').on(table.type),
  uriIdx: index('sources_uri_idx').on(table.uri),
  createdAtIdx: index('sources_created_at_idx').on(table.createdAt),
  llmProcessedIdx: index('sources_llm_processed_idx').on(table.llmProcessed),
  llmConfidenceIdx: index('sources_llm_confidence_idx').on(table.llmConfidence),
}));

export const uploadSessions = sqliteTable('upload_sessions', {
  id: text('id').primaryKey().$defaultFn(() => `session_${crypto.randomUUID()}`),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(),
  fileCount: integer('file_count').notNull().default(0),
  completedCount: integer('completed_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  status: text('status').$type<'active' | 'completed' | 'cancelled'>().notNull().default('active'),
  meta: text('meta', { mode: 'json' }).$type<{
    uploadedFiles: string[];
    processingQueue: string[];
    errors: Array<{ fileId: string; error: string }>;
  }>(),
}, (table) => ({
  statusIdx: index('upload_sessions_status_idx').on(table.status),
  startedAtIdx: index('upload_sessions_started_at_idx').on(table.startedAt),
  userIdx: index('upload_sessions_user_idx').on(table.userId),
}));
