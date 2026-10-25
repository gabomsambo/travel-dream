import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

// Current database schema (without LLM columns that don't exist yet)
export const sourcesCurrentSchema = sqliteTable('sources', {
  // Primary key with custom prefix
  id: text('id').primaryKey().$defaultFn(() => `src_${crypto.randomUUID()}`),

  // Owner of this source. NOT NULL is the database's second check that a row
  // always has an owner; the application already required one.
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

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
      storageType?: 'local' | 'vercel-blob';
      ocrStatus?: string;
      ocrConfidence?: number;
      ocrError?: string;
      uploadedAt?: string;
    };
    // `extraction` and `thumbnailUrl` are paid work cached so a retry never
    // re-charges Gemini or re-uploads a thumbnail. `outcome` records which
    // places this source inserted (`created`) versus attached to an existing
    // place (`linked`). A retry must keep `created` ids out of `linked`.
    massUpload?: {
      extraction?: unknown;
      extractedAt?: string;
      thumbnailUrl?: string;
      outcome?: {
        created: string[];
        linked: Array<{
          placeId: string;
          reason: 'google_place_id' | 'exact_name_city_country';
        }>;
      };
    };
    // Set when the Inbox hides this screenshot. The file stays; nothing is deleted.
    inbox?: {
      dismissedAt?: string;
    };
    // The failed or stalled row a manual retry can still undo, until a worker claims it.
    retry?: {
      previous?: {
        processingStatus: 'failed' | 'stalled';
        processingAttempts: number;
        processingInterruptions: number;
        processingError: string | null;
      };
    };
    llmProcessing?: {
      processed: boolean;
      model: string;
      processedAt: string;
      confidence: number;
      placesExtracted?: number;
      details: {
        processingTimeMs: number;
        costUsd: number;
        errors: string[];
      };
    };
  }>(),

  // Timestamps
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),

  // Mass upload processing queue
  processingStatus: text('processing_status').default('pending'),
  // Values: 'pending' | 'uploaded' | 'queued' | 'extracting' | 'enriching' | 'completed'
  //       | 'failed' (a genuine verdict on the image, or interruptions past the cap)
  //       | 'stalled' (at the interruption cap, with a backoff — the cron queues it again)
  //       | 'cancelled'
  // Genuine processing failures only — a clock-out never consumes an attempt.
  processingAttempts: integer('processing_attempts').default(0),
  // Interrupted runs (function killed, lease expired, watchdog fired). Kept apart
  // from processingAttempts so "we ran out of clock" can never look like "bad image".
  processingInterruptions: integer('processing_interruptions').default(0),
  processingError: text('processing_error'),
  processingStartedAt: text('processing_started_at'),
  // Owner token of the current in-flight run; writes are guarded by it so a
  // reclaimed item can never be finished twice.
  processingLeaseId: text('processing_lease_id'),
  // Earliest time a requeued source may be claimed again (exponential backoff
  // after an interruption or a failure). NULL means "ready now", so pre-existing
  // rows and freshly queued uploads are claimable immediately.
  nextAttemptAt: text('next_attempt_at'),
}, (table) => ({
  // Indexes for performance
  typeIdx: index('sources_type_idx').on(table.type),
  uriIdx: index('sources_uri_idx').on(table.uri),
  createdAtIdx: index('sources_created_at_idx').on(table.createdAt),
  userIdx: index('sources_user_idx').on(table.userId),
  processingStatusIdx: index('sources_processing_status_idx').on(table.processingStatus, table.userId),
}));
