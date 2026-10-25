/**
 * Response of `GET /api/inbox/uploads`: the signed-in user's mass uploads,
 * one entry per batch (upload session), newest first, each with the outcome
 * rows the Inbox upload card shows. Every row is always present; a row with
 * nothing in it has empty arrays, and the UI hides it.
 */

export type InboxPlaceStatus = 'inbox' | 'library' | 'archived';

export interface InboxUploadPlace {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  status: InboxPlaceStatus;
  createdAt: string;
  /** Screenshots in this batch that produced or were added to this place. */
  sourceIds: string[];
}

/** A row that names places (and the screenshots behind them). */
export interface InboxUploadPlaceRow {
  placeIds: string[];
  sourceIds: string[];
  places: InboxUploadPlace[];
}

/** A row that names screenshots only. */
export interface InboxUploadSourceRow {
  sourceIds: string[];
}

export interface InboxUploadSkipped {
  /** File name of the screenshot that was dropped and not kept. */
  originalName: string;
  /** The earlier screenshot it matched, when the caller still owns it. */
  duplicateOfSourceId: string | null;
  duplicateOfSessionId: string | null;
  duplicateOfUploadedAt: string | null;
}

export interface InboxUploadUnreadable {
  sourceId: string;
  /** `stalled` = interrupted repeatedly, never a verdict on the image. */
  status: 'failed' | 'stalled';
  /** Plain-language reason (same mapping as the Mass Upload status). */
  error: string;
  /** Genuine read attempts already spent. A stall does not increment this. */
  attempts: number;
}

/** What a screenshot's cached read can prefill on Add by hand. */
export interface InboxHandAdd {
  name: string;
  kind: string | null;
  city: string | null;
  country: string | null;
  admin: string | null;
  description: string | null;
}

export type InboxScreenshotOutcome =
  | 'places'
  | 'noPlaceFound'
  | 'couldNotRead'
  | 'stillReading'
  | 'cancelled';

export interface InboxUploadScreenshot {
  sourceId: string;
  /** Raw `sources.created_at`, compared as stored when ordering Review. */
  createdAt: string;
  name: string | null;
  /** Thumbnail when one was made, else the screenshot itself. */
  imageUrl: string | null;
  /** Raw `sources.processing_status`. */
  processingStatus: string;
  outcome: InboxScreenshotOutcome;
  /** Places this screenshot created (`created`) or was added to (`linked`). */
  createdPlaceIds: string[];
  linkedPlaceIds: string[];
  /**
   * First place the cached read named, when it named one. Empty reads are null.
   * Add by hand uses this; a retry must not wipe the cache it came from.
   */
  handAdd?: InboxHandAdd | null;
  /**
   * True when the source predates `meta.massUpload.outcome`, so created vs
   * linked was inferred from the screenshot's photo on each place.
   */
  outcomeDerived: boolean;
}

export interface InboxUploadBatch {
  sessionId: string;
  /** ISO time the batch started. */
  uploadedAt: string;
  /** Screenshots dropped into this batch, including skipped re-uploads. */
  screenshotCount: number;
  /** Distinct places this batch's screenshots produced or were added to. */
  placesRead: number;
  /** Of those, how many this batch created. */
  newPlaces: number;
  rows: {
    /** Still in the Inbox, whether this batch created the place or linked the screenshot to it. */
    toReview: InboxUploadPlaceRow & {
      /**
       * How many of these places Review marks "Check this"
       * (`reviewChecks`: no pin, no city, low confidence, or a tip).
       */
      checkCount: number;
    };
    /** Created by this batch and since added to the Library. */
    added: InboxUploadPlaceRow;
    /** Archived ("Not a place"), whether this batch created the place or linked the screenshot to it. */
    notAPlace: InboxUploadPlaceRow;
    /** Library places this batch added its screenshot to. */
    alreadyInLibrary: InboxUploadPlaceRow;
    /** Re-uploads that were skipped. */
    uploadedBefore: { items: InboxUploadSkipped[] };
    noPlaceFound: InboxUploadSourceRow;
    couldNotRead: InboxUploadSourceRow & { items: InboxUploadUnreadable[] };
    /** Uploaded, queued, extracting or enriching. */
    stillReading: InboxUploadSourceRow;
    cancelled: InboxUploadSourceRow;
  };
  screenshots: InboxUploadScreenshot[];
  /** True when any screenshot's outcome was inferred (see `outcomeDerived`). */
  outcomeDerived: boolean;
  /**
   * Screenshots hidden from the Inbox. Counted in `screenshotCount` and named
   * in the finished-upload line; they are not an outcome row.
   */
  dismissedCount: number;
}

export interface InboxUploadsResponse {
  status: 'success';
  uploads: InboxUploadBatch[];
  /** Inbox place ids across every batch, each id once, newest batch first. */
  toReviewPlaceIds: string[];
}
