/** Inbox opens the mass-upload drop sheet. `/mass-upload` redirects here. */
export const UPLOAD_SHEET_HREF = '/inbox?sheet=1';

export const OPEN_UPLOAD_SHEET_EVENT = 'td:open-upload-sheet';

export function openUploadSheet(files?: File[]): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_UPLOAD_SHEET_EVENT, { detail: { files: files ?? [] } }));
}

/** Where a finished upload's toast and "View results" go. */
export function uploadResultsHref(sessionId: string, anythingLeft: boolean): string {
  if (!anythingLeft) return '/library';
  return `/inbox?upload=${encodeURIComponent(sessionId)}`;
}

export interface UploadLeftoverRows {
  toReview: { places: readonly unknown[] };
  noPlaceFound: { sourceIds: readonly unknown[] };
  couldNotRead: { sourceIds: readonly unknown[] };
  stillReading: { sourceIds: readonly unknown[] };
}

/** Unknown batches stay on the Inbox. The Library is only when nothing is left. */
export function anythingLeftInUpload(upload: { rows: UploadLeftoverRows } | undefined): boolean {
  if (!upload) return true;
  const { rows } = upload;
  return rows.toReview.places.length > 0
    || rows.noPlaceFound.sourceIds.length > 0
    || rows.couldNotRead.sourceIds.length > 0
    || rows.stillReading.sourceIds.length > 0;
}
