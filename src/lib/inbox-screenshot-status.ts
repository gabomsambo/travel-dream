/**
 * Inbox screenshot status: mass-upload pipeline `processing_status` with legacy
 * `uploadInfo.ocrStatus` fallback when the row never entered the pipeline.
 */

export type ScreenshotDisplayStatus = 'waiting' | 'reading' | 'done' | 'failed';

export type InboxScreenshotSource = {
  processingStatus?: string | null;
  meta?: {
    uploadInfo?: {
      ocrStatus?: string;
    };
  } | null;
};

const MASS_UPLOAD_PIPELINE_STATUSES = new Set([
  'uploaded',
  'queued',
  'extracting',
  'enriching',
  'completed',
  'failed',
  'stalled',
  'cancelled',
]);

function mapOcrStatus(ocrStatus: string | undefined): ScreenshotDisplayStatus {
  switch (ocrStatus) {
    case 'completed':
      return 'done';
    case 'processing':
      return 'reading';
    case 'failed':
      return 'failed';
    default:
      return 'waiting';
  }
}

function mapPipelineStatus(processingStatus: string): ScreenshotDisplayStatus {
  switch (processingStatus) {
    case 'completed':
      return 'done';
    case 'extracting':
    case 'enriching':
    case 'processing':
      return 'reading';
    case 'failed':
      return 'failed';
    case 'uploaded':
    case 'queued':
    case 'pending':
    case 'stalled':
    case 'cancelled':
    default:
      return 'waiting';
  }
}

export function resolveScreenshotDisplayStatus(
  source: InboxScreenshotSource
): ScreenshotDisplayStatus {
  const processingStatus = source.processingStatus ?? 'pending';

  if (MASS_UPLOAD_PIPELINE_STATUSES.has(processingStatus)) {
    return mapPipelineStatus(processingStatus);
  }

  if (processingStatus !== 'pending') {
    return mapPipelineStatus(processingStatus);
  }

  return mapOcrStatus(source.meta?.uploadInfo?.ocrStatus);
}

export function screenshotStatusLabel(status: ScreenshotDisplayStatus): string {
  switch (status) {
    case 'done':
      return 'Done';
    case 'reading':
      return 'Reading…';
    case 'failed':
      return "Couldn't read";
    case 'waiting':
      return 'Waiting';
  }
}

export type ScreenshotStatusCounts = Record<ScreenshotDisplayStatus, number>;

export function countScreenshotStatuses(
  sources: InboxScreenshotSource[]
): ScreenshotStatusCounts {
  const counts: ScreenshotStatusCounts = {
    waiting: 0,
    reading: 0,
    done: 0,
    failed: 0,
  };
  for (const source of sources) {
    counts[resolveScreenshotDisplayStatus(source)] += 1;
  }
  return counts;
}
