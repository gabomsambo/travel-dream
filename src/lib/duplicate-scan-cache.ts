/**
 * In-process cache for the duplicate scan. One map, shared by the scan route
 * and by dismiss, so marking a pair "not duplicates" cannot keep serving the
 * group that was cached before the dismiss.
 */
const duplicateCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function getDuplicateScanCache(key: string): unknown | null {
  const cached = duplicateCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    duplicateCache.delete(key);
    return null;
  }

  return cached.data;
}

export function setDuplicateScanCache(key: string, value: unknown): void {
  duplicateCache.set(key, {
    data: value,
    timestamp: Date.now(),
  });
}

export function clearDuplicateScanCache(): void {
  duplicateCache.clear();
}
