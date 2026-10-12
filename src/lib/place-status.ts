/**
 * Clock that rides along with a place's status.
 *
 * Archiving stamps `archived_at` with the moment of the write. Any other
 * status clears it. Callers must not invent a date for rows that were
 * archived before the column existed — those stay null and the Archive
 * page says "Saved" instead of pretending.
 */
export function archivedAtForStatus(status: string, now: string): string | null {
  return status === 'archived' ? now : null
}
