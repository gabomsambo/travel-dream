import { db } from '@/db';

// ID generation functions with prefixes
export function generateSourceId(): string {
  return `src_${crypto.randomUUID()}`;
}

export function generatePlaceId(): string {
  return `plc_${crypto.randomUUID()}`;
}

export function generateCollectionId(): string {
  return `col_${crypto.randomUUID()}`;
}

// Keeps the driver's own error (its class and `code`) reachable through the
// friendlier message, so callers can still tell a locked database or a dropped
// connection apart from a constraint violation.
function rethrowable(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}

// Error handling wrapper for database operations
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Database error in ${context}:`, error);

    if (error instanceof Error) {
      // Handle specific SQLite errors
      if (error.message.includes('UNIQUE constraint failed')) {
        throw rethrowable(`Duplicate entry: ${error.message}`, error);
      }

      if (error.message.includes('FOREIGN KEY constraint failed')) {
        throw rethrowable(`Referenced entity does not exist: ${error.message}`, error);
      }

      if (error.message.includes('NOT NULL constraint failed')) {
        throw rethrowable(`Required field missing: ${error.message}`, error);
      }
    }

    throw rethrowable(
      `Database operation failed in ${context}: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

// Transaction helper
export async function withTransaction<T>(
  operation: (tx: any) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await operation(tx);
  });
}

// Batch operation helper (for handling SQLite parameter limits)
export async function batchOperation<T>(
  items: T[],
  operation: (batch: T[]) => Promise<void>,
  batchSize: number = 500
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await operation(batch);
  }
}

// Validation helpers
export function validatePlaceKind(kind: string): boolean {
  const validKinds = [
    'city', 'neighborhood', 'landmark', 'museum', 'gallery', 'viewpoint',
    'park', 'beach', 'natural', 'stay', 'hostel', 'hotel', 'restaurant',
    'cafe', 'bar', 'club', 'market', 'shop', 'experience', 'tour',
    'thermal', 'festival', 'transit', 'tip'
  ];
  return validKinds.includes(kind);
}

export function validateSourceType(type: string): boolean {
  const validTypes = ['screenshot', 'url', 'note'];
  return validTypes.includes(type);
}

export function validatePlaceStatus(status: string): boolean {
  const validStatuses = ['inbox', 'library', 'archived'];
  return validStatuses.includes(status);
}

// Coordinate validation
export function validateCoordinates(coords: { lat: number; lon: number }): boolean {
  return (
    coords.lat >= -90 && coords.lat <= 90 &&
    coords.lon >= -180 && coords.lon <= 180
  );
}

// Text sanitization
export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// Array deduplication
export function deduplicateArray<T>(array: T[]): T[] {
  return [...new Set(array)];
}
