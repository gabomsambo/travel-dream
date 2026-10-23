/**
 * Turns `GET /api/inbox/uploads` plus hand-added inbox places into the Inbox
 * page: the hero, one card per open upload, earlier one-liners, and the
 * per-screenshot detail. No I/O. Later PRs wire Try again, Dismiss, Add by
 * hand, and "Add the N that look right"; this model leaves those unwired.
 */
import type {
  InboxUploadBatch,
  InboxUploadPlace,
  InboxUploadScreenshot,
} from '@/types/inbox-uploads';

export interface InboxThumb {
  src: string;
  alt: string;
}

export interface InboxAction {
  label: string;
  href?: string;
  disabled?: boolean;
  warn?: boolean;
}

export type InboxRowTone = 'new' | 'ok' | 'info' | 'quiet' | 'check';

export interface InboxOutcomeRow {
  id: string;
  tone: InboxRowTone;
  count: number;
  label: string;
  detail: string;
  note?: string;
  actions: InboxAction[];
}

export interface InboxUploadCard {
  sessionId: string;
  heading: string;
  meta: string;
  pill?: { tone: InboxRowTone; label: string };
  thumbs: InboxThumb[];
  rows: InboxOutcomeRow[];
  showAllHref: string;
  screenshotCount: number;
}

export interface InboxEarlierLine {
  sessionId: string;
  when: string;
  screenshotCount: number;
  summary: string;
  thumbs: InboxThumb[];
  href: string;
}

export interface InboxReadingTile {
  id: string;
  imageUrl: string | null;
  alt: string;
  label: string;
  waiting: boolean;
  spinning: boolean;
}

export interface InboxReadingCard {
  sessionId: string;
  heading: string;
  tiles: InboxReadingTile[];
  footer: string;
  showAllHref: string;
}

export interface InboxChip {
  id: string;
  label: string;
  count: number;
}

export type InboxShotKind =
  | 'new'
  | 'library'
  | 'added'
  | 'before'
  | 'noPlace'
  | 'unreadable'
  | 'reading'
  | 'cancelled'
  | 'archived';

export interface InboxShotPlace {
  id: string;
  name: string;
  inLibrary: boolean;
}

export interface InboxShotRow {
  id: string;
  kind: InboxShotKind;
  kinds: InboxShotKind[];
  imageUrl: string | null;
  alt: string;
  title: string;
  line: string;
  places: InboxShotPlace[];
  actions: InboxAction[];
}

export interface InboxLink {
  label: string;
  href: string;
}

export type InboxHero =
  | {
      kind: 'review';
      title: string;
      line: string;
      cta: InboxLink;
      sub?: InboxLink;
      images: InboxThumb[];
    }
  | {
      kind: 'reading';
      title: string;
      line: string;
      read: number;
      total: number;
      sessionId: string;
      images: InboxThumb[];
      cta?: InboxLink;
    }
  | { kind: 'attention'; title: string; line: string; images: InboxThumb[] }
  | { kind: 'caught-up'; title: string; line: string; library?: InboxLink; upload: InboxLink }
  | { kind: 'first' };

export interface InboxAddedAnotherWay {
  count: number;
  names: string;
  href: string;
}

export interface InboxHomeModel {
  view: 'home';
  description: string;
  hero: InboxHero;
  live: boolean;
  reading: InboxReadingCard | null;
  uploadsHeading: string | null;
  uploads: InboxUploadCard[];
  addedAnotherWay: InboxAddedAnotherWay | null;
  earlierHeading: string | null;
  earlier: InboxEarlierLine[];
  dock: InboxLink | null;
  enterHref: string | null;
}

export interface InboxDetailModel {
  view: 'detail';
  sessionId: string;
  title: string;
  subtitle: string;
  chips: InboxChip[];
  rows: InboxShotRow[];
  dock: InboxLink | null;
  enterHref: string | null;
  live: boolean;
}

export type InboxScreenModel = InboxHomeModel | InboxDetailModel;

export interface InboxPlaceAddedAnotherWay {
  id: string;
  name: string;
}

export interface BuildInboxScreenInput {
  uploads: InboxUploadBatch[];
  toReviewPlaceIds: string[];
  addedAnotherWay: InboxPlaceAddedAnotherWay[];
  now: Date | null;
  uploadId?: string | null;
}

const HOME_DESCRIPTION = 'What happened to your uploads, and what is left to do.';

export function coveredUploadPlaceIds(uploads: InboxUploadBatch[]): string[] {
  const ids: string[] = [];
  for (const upload of uploads) {
    const rows = upload.rows;
    ids.push(
      ...rows.toReview.placeIds,
      ...rows.added.placeIds,
      ...rows.notAPlace.placeIds,
      ...rows.alreadyInLibrary.placeIds
    );
  }
  return ids;
}

export function reviewHref(placeId?: string | null, uploadSessionId?: string | null): string {
  const params = new URLSearchParams();
  if (uploadSessionId) params.set('upload', uploadSessionId);
  if (placeId) params.set('placeId', placeId);
  const query = params.toString();
  return query ? `/review?${query}` : '/review';
}

export function uploadHref(sessionId: string): string {
  return `/inbox?upload=${encodeURIComponent(sessionId)}`;
}

export function buildInboxScreen(input: BuildInboxScreenInput): InboxScreenModel {
  const requested = input.uploadId?.trim();
  if (requested) {
    const batch = input.uploads.find((upload) => upload.sessionId === requested);
    if (batch) return buildDetail(batch, input.now);
  }
  return buildHome(input);
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function joinLimited(items: string[], limit: number): string {
  if (items.length <= limit) return joinAnd(items);
  return `${items.slice(0, limit).join(', ')} +${items.length - limit}`;
}

function joinDots(items: string[], limit: number): string {
  if (items.length <= limit) return items.join(' · ');
  return `${items.slice(0, limit).join(' · ')} +${items.length - limit}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayYearFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function formatUploadWhen(
  iso: string,
  now: Date | null
): { today: boolean; heading: string; earlier: string; sentence: string | null } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { today: false, heading: iso, earlier: iso, sentence: null };
  if (now == null || Number.isNaN(now.getTime())) return { today: false, heading: '', earlier: '', sentence: null };
  const time = timeFormat.format(date);
  if (sameDay(date, now)) {
    const heading = `Today, ${time}`;
    return { today: true, heading, earlier: heading, sentence: `today at ${time}` };
  }
  const day = date.getFullYear() === now.getFullYear() ? dayFormat.format(date) : dayYearFormat.format(date);
  return { today: false, heading: `${day}, ${time}`, earlier: day, sentence: `${day} at ${time}` };
}

function uploadedBeforeLabel(iso: string | null | undefined, now: Date | null): string | null {
  if (!iso) return null;
  return formatUploadWhen(iso, now).sentence;
}

function reviewMinutes(placeCount: number): number {
  if (placeCount <= 0) return 0;
  return Math.max(1, Math.ceil(placeCount / 4));
}

function minutePhrase(minutes: number): string {
  return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`;
}

function placeMap(batch: InboxUploadBatch): Map<string, InboxUploadPlace> {
  const map = new Map<string, InboxUploadPlace>();
  for (const row of [batch.rows.toReview, batch.rows.added, batch.rows.notAPlace, batch.rows.alreadyInLibrary]) {
    for (const place of row.places) map.set(place.id, place);
  }
  return map;
}

function shotPlaces(shot: InboxUploadScreenshot, byId: Map<string, InboxUploadPlace>): InboxUploadPlace[] {
  const seen = new Set<string>();
  const places: InboxUploadPlace[] = [];
  for (const id of [...shot.createdPlaceIds, ...shot.linkedPlaceIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const place = byId.get(id);
    if (place) places.push(place);
  }
  return places;
}

function thumbs(batch: InboxUploadBatch, limit: number): InboxThumb[] {
  const out: InboxThumb[] = [];
  for (const shot of batch.screenshots) {
    if (!shot.imageUrl) continue;
    out.push({ src: shot.imageUrl, alt: shot.name ?? 'Screenshot' });
    if (out.length >= limit) break;
  }
  return out;
}

function sourceName(batch: InboxUploadBatch, sourceId: string): string {
  return batch.screenshots.find((shot) => shot.sourceId === sourceId)?.name ?? 'Screenshot';
}

function locationLine(batch: InboxUploadBatch): string | null {
  const seen = new Set<string>();
  const labels: string[] = [];
  const rows = [batch.rows.toReview, batch.rows.added, batch.rows.notAPlace, batch.rows.alreadyInLibrary];
  for (const row of rows) {
    for (const place of row.places) {
      const label = place.city?.trim() || place.country?.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
    }
  }
  if (labels.length === 0) return null;
  return joinLimited(labels, 3);
}

function isOpen(batch: InboxUploadBatch): boolean {
  const rows = batch.rows;
  return (
    rows.toReview.places.length > 0 ||
    rows.noPlaceFound.sourceIds.length > 0 ||
    rows.couldNotRead.sourceIds.length > 0 ||
    rows.stillReading.sourceIds.length > 0
  );
}

function seeThemHref(places: Array<{ id: string }>): string {
  if (places.length === 1) return `/place/${places[0].id}`;
  return '/library';
}

function placeholderActions(kind: 'noPlace' | 'failed'): InboxAction[] {
  if (kind === 'noPlace') {
    return [
      { label: 'Add by hand', disabled: true },
      { label: 'Dismiss', disabled: true },
    ];
  }
  return [{ label: 'Try again', disabled: true, warn: true }];
}

function outcomeRows(batch: InboxUploadBatch, now: Date | null): InboxOutcomeRow[] {
  const rows = batch.rows;
  const out: InboxOutcomeRow[] = [];
  const failed = rows.couldNotRead.items.filter((item) => item.status === 'failed');
  const stalled = rows.couldNotRead.items.filter((item) => item.status === 'stalled');

  if (rows.toReview.places.length > 0) {
    const count = rows.toReview.places.length;
    const check = rows.toReview.checkCount;
    out.push({
      id: 'to-review',
      tone: 'new',
      count,
      label: count === 1 ? 'new place to review' : 'new places to review',
      detail: joinDots(rows.toReview.places.map((place) => place.name), 5),
      note: check != null && check > 0 ? `${check} to check` : undefined,
      actions: [{
        label: `Review ${count}`,
        href: reviewHref(null, batch.sessionId),
      }],
    });
  }

  if (rows.alreadyInLibrary.places.length > 0) {
    const count = rows.alreadyInLibrary.places.length;
    const shot = rows.alreadyInLibrary.sourceIds.length === 1 ? 'this screenshot' : 'these screenshots';
    out.push({
      id: 'already-in-library',
      tone: 'ok',
      count,
      label: 'already in your Library',
      detail: `We added ${shot} to ${joinLimited(rows.alreadyInLibrary.places.map((place) => place.name), 6)}.`,
      actions: [{ label: 'See them', href: seeThemHref(rows.alreadyInLibrary.places) }],
    });
  }

  if (rows.added.places.length > 0) {
    const count = rows.added.places.length;
    out.push({
      id: 'added',
      tone: 'ok',
      count,
      label: count === 1 ? 'added to your Library' : 'added to your Library',
      detail: joinLimited(rows.added.places.map((place) => place.name), 6),
      actions: [{ label: 'See them', href: seeThemHref(rows.added.places) }],
    });
  }

  if (rows.notAPlace.places.length > 0) {
    out.push({
      id: 'not-a-place',
      tone: 'quiet',
      count: rows.notAPlace.places.length,
      label: 'not a place',
      detail: joinLimited(rows.notAPlace.places.map((place) => place.name), 6),
      actions: [],
    });
  }

  if (rows.uploadedBefore.items.length > 0) {
    const items = rows.uploadedBefore.items;
    const names = items.map((item) => item.originalName);
    let detail: string;
    if (items.length === 1) {
      const when = uploadedBeforeLabel(items[0].duplicateOfUploadedAt, now);
      detail = when
        ? `${items[0].originalName} was already in your ${when} upload, so we skipped it.`
        : `${items[0].originalName} was already uploaded before, so we skipped it.`;
    } else {
      detail = `${joinLimited(names, 4)} were already uploaded before, so we skipped them.`;
    }
    out.push({
      id: 'uploaded-before',
      tone: 'info',
      count: items.length,
      label: 'uploaded before',
      detail,
      actions: [],
    });
  }

  if (rows.noPlaceFound.sourceIds.length > 0) {
    const names = rows.noPlaceFound.sourceIds.map((id) => sourceName(batch, id));
    out.push({
      id: 'no-place',
      tone: 'quiet',
      count: names.length,
      label: 'no place found',
      detail: joinDots(names, 4),
      actions: placeholderActions('noPlace'),
    });
  }

  if (failed.length > 0) {
    out.push({
      id: 'could-not-read',
      tone: 'check',
      count: failed.length,
      label: "couldn't be read",
      detail: failed.map((item) => `${sourceName(batch, item.sourceId)} · ${item.error}`).join(' '),
      actions: placeholderActions('failed'),
    });
  }

  if (stalled.length > 0) {
    out.push({
      id: 'still-trying',
      tone: 'info',
      count: stalled.length,
      label: 'still trying',
      detail: 'A temporary hold. It retries on its own.',
      actions: [],
    });
  }

  if (rows.stillReading.sourceIds.length > 0) {
    out.push({
      id: 'still-reading',
      tone: 'info',
      count: rows.stillReading.sourceIds.length,
      label: 'still reading',
      detail: 'You can leave this page. The bell rings when it is done.',
      actions: [],
    });
  }

  if (rows.cancelled.sourceIds.length > 0) {
    out.push({
      id: 'cancelled',
      tone: 'quiet',
      count: rows.cancelled.sourceIds.length,
      label: 'cancelled',
      detail: 'Stopped before they were read.',
      actions: [],
    });
  }

  return out;
}

function cardMeta(batch: InboxUploadBatch): string {
  const where = locationLine(batch);
  if (batch.placesRead > 0) {
    const read = `${plural(batch.placesRead, 'place')} read`;
    const fresh = batch.newPlaces > 0 ? `, ${batch.newPlaces} of them new` : '';
    return `${where ? `${where} · ` : ''}${read}${fresh}`;
  }
  if (batch.rows.stillReading.sourceIds.length > 0) return 'Still reading';
  return 'No places saved';
}

function cardPill(batch: InboxUploadBatch): InboxUploadCard['pill'] {
  const failed = batch.rows.couldNotRead.items.filter((item) => item.status === 'failed').length;
  const checks = batch.rows.toReview.checkCount;
  const needs = failed + (checks ?? 0);
  if (needs > 0) return { tone: 'check', label: `${needs} needs you` };
  const inLibrary = batch.rows.added.places.length + batch.rows.alreadyInLibrary.places.length;
  if (inLibrary > 0) return { tone: 'ok', label: `${inLibrary} in your Library` };
  if (batch.rows.stillReading.sourceIds.length > 0) return { tone: 'info', label: 'Reading' };
  return undefined;
}

function uploadCard(batch: InboxUploadBatch, now: Date | null): InboxUploadCard {
  const when = formatUploadWhen(batch.uploadedAt, now);
  const count = plural(batch.screenshotCount, 'screenshot');
  return {
    sessionId: batch.sessionId,
    heading: when.heading ? `${when.heading} · ${count}` : count,
    meta: cardMeta(batch),
    pill: cardPill(batch),
    thumbs: thumbs(batch, 5),
    rows: outcomeRows(batch, now),
    showAllHref: uploadHref(batch.sessionId),
    screenshotCount: batch.screenshotCount,
  };
}

function earlierSummary(batch: InboxUploadBatch): string {
  const bits: string[] = [];
  const added = batch.rows.added.places.length;
  const archived = batch.rows.notAPlace.places.length;
  const matched = batch.rows.alreadyInLibrary.places.length;
  const skipped = batch.rows.uploadedBefore.items.length;
  const empty = batch.rows.noPlaceFound.sourceIds.length;
  const failed = batch.rows.couldNotRead.items.filter((item) => item.status === 'failed').length;
  const stalled = batch.rows.couldNotRead.items.filter((item) => item.status === 'stalled').length;
  const cancelled = batch.rows.cancelled.sourceIds.length;
  if (added > 0) bits.push(`${added} added`);
  if (archived > 0) bits.push(`${archived} not a place`);
  if (matched > 0) bits.push(`${matched} already in your Library`);
  if (skipped > 0) bits.push(`${skipped} uploaded before`);
  if (empty > 0) bits.push(`${empty} nothing found`);
  if (failed > 0) bits.push(`${failed} couldn't be read`);
  if (stalled > 0) bits.push(`${stalled} still trying`);
  if (cancelled > 0) bits.push(`${cancelled} cancelled`);
  return bits.length > 0 ? bits.join(' · ') : 'nothing saved';
}

function earlierLine(batch: InboxUploadBatch, now: Date | null): InboxEarlierLine {
  const when = formatUploadWhen(batch.uploadedAt, now);
  return {
    sessionId: batch.sessionId,
    when: when.earlier,
    screenshotCount: batch.screenshotCount,
    summary: earlierSummary(batch),
    thumbs: thumbs(batch, 2),
    href: uploadHref(batch.sessionId),
  };
}

function readingTiles(batch: InboxUploadBatch): InboxReadingTile[] {
  const byId = placeMap(batch);
  const tiles: InboxReadingTile[] = batch.screenshots.map((shot) => {
    const places = shotPlaces(shot, byId);
    const kind = shotKind(shot, places, batch);
    let label = 'Done';
    let waiting = false;
    let spinning = false;
    if (kind === 'reading') {
      label = 'Reading…';
      spinning = true;
    } else if (kind === 'noPlace') label = 'No place found';
    else if (kind === 'unreadable') {
      const item = batch.rows.couldNotRead.items.find((row) => row.sourceId === shot.sourceId);
      label = item?.status === 'stalled' ? 'Still trying' : "Couldn't be read";
    } else if (kind === 'cancelled') label = 'Cancelled';
    else if (kind === 'new' || kind === 'library' || kind === 'added') {
      const inboxCount = places.filter((place) => place.status === 'inbox').length;
      const archivedCount = places.filter((place) => place.status === 'archived').length;
      const { saved, matched } = libraryParts(shot, places, batch);
      const bits: string[] = [];
      if (inboxCount > 0) bits.push(plural(inboxCount, 'new place', 'new places'));
      if (matched.length > 0) bits.push(`${matched.length} in Library`);
      if (saved.length > 0) bits.push(`${plural(saved.length, 'place')} added`);
      if (archivedCount > 0) bits.push(`${plural(archivedCount, 'place')} set aside`);
      label = bits.length > 0 ? `✓ ${bits.join(' · ')}` : `✓ ${plural(places.length, 'place')}`;
    } else if (kind === 'archived') {
      label = `✓ ${plural(places.length, 'place')} set aside`;
    } else if (places.length > 0) label = `✓ ${plural(places.length, 'place')}`;
    if (kind === 'cancelled') waiting = true;
    return {
      id: shot.sourceId,
      imageUrl: shot.imageUrl,
      alt: shot.name ?? 'Screenshot',
      label,
      waiting,
      spinning,
    };
  });
  for (const [index, skipped] of batch.rows.uploadedBefore.items.entries()) {
    tiles.push({
      id: `skip-${index}`,
      imageUrl: null,
      alt: skipped.originalName,
      label: 'Skipped · uploaded before',
      waiting: true,
      spinning: false,
    });
  }
  return tiles;
}

function readingFooter(batch: InboxUploadBatch): string {
  const bits: string[] = [];
  const fresh = batch.rows.toReview.places.length;
  const matched = batch.rows.alreadyInLibrary.places.length;
  const added = batch.rows.added.places.length;
  const archived = batch.rows.notAPlace.places.length;
  const empty = batch.rows.noPlaceFound.sourceIds.length;
  const failed = batch.rows.couldNotRead.items.filter((item) => item.status === 'failed').length;
  const skipped = batch.rows.uploadedBefore.items.length;
  const stalled = batch.rows.couldNotRead.items.filter((item) => item.status === 'stalled').length;
  const cancelled = batch.rows.cancelled.sourceIds.length;
  if (fresh > 0) bits.push(plural(fresh, 'new place', 'new places'));
  if (matched > 0) bits.push(`${matched} already in your Library`);
  if (added > 0) bits.push(`${added} added`);
  if (archived > 0) bits.push(`${archived} not a place`);
  if (skipped > 0) bits.push(`${skipped} uploaded before`);
  if (empty > 0) bits.push(`${empty} no place`);
  if (failed > 0) bits.push(`${failed} couldn't be read`);
  if (stalled > 0) bits.push(`${stalled} still trying`);
  if (cancelled > 0) bits.push(`${cancelled} cancelled`);
  return bits.length > 0 ? `So far: ${bits.join(' · ')}` : 'So far: still reading';
}

function readingCard(batch: InboxUploadBatch, now: Date | null): InboxReadingCard {
  const when = formatUploadWhen(batch.uploadedAt, now);
  return {
    sessionId: batch.sessionId,
    heading: when.heading ? `${when.heading} · so far` : 'So far',
    tiles: readingTiles(batch),
    footer: readingFooter(batch),
    showAllHref: uploadHref(batch.sessionId),
  };
}

function readCount(batch: InboxUploadBatch): number {
  // Skips live beside the screenshots, and they are already decided.
  const waiting = batch.rows.stillReading.sourceIds.length + batch.rows.cancelled.sourceIds.length;
  return Math.max(0, batch.screenshotCount - waiting);
}

function caughtUpLine(uploads: InboxUploadBatch[], now: Date | null): string {
  const today = now
    ? uploads.filter((upload) => {
        const date = new Date(upload.uploadedAt);
        return !Number.isNaN(date.getTime()) && sameDay(date, now);
      })
    : [];
  const scope = today.length > 0 ? today : uploads;
  const prefix = today.length > 0 ? 'Today' : 'So far';
  const screenshots = scope.reduce((sum, upload) => sum + upload.screenshotCount, 0);
  const added = scope.reduce((sum, upload) => sum + upload.rows.added.places.length, 0);
  const matched = scope.reduce((sum, upload) => sum + upload.rows.alreadyInLibrary.places.length, 0);
  const nothing = scope.reduce(
    (sum, upload) => sum + upload.rows.noPlaceFound.sourceIds.length + upload.rows.uploadedBefore.items.length,
    0
  );
  const archived = scope.reduce((sum, upload) => sum + upload.rows.notAPlace.places.length, 0);
  let sentence = `${prefix}: ${plural(screenshots, 'screenshot')}`;
  if (added > 0) sentence += ` became ${plural(added, 'new place', 'new places')} in your Library`;
  sentence += '.';
  const extra: string[] = [];
  if (matched > 0) extra.push(`${plural(matched, 'more matched a place you already had', 'more matched places you already had')}.`);
  const rest: string[] = [];
  if (archived > 0) rest.push(`${archived} not a place`);
  if (nothing > 0) rest.push(`${nothing} had nothing new to save`);
  if (rest.length > 0) extra.push(`${rest.join(', ')}.`);
  return [sentence, ...extra].join(' ');
}

function caughtUpLibrary(uploads: InboxUploadBatch[], now: Date | null): InboxLink | undefined {
  const withPlaces = uploads.filter(
    (upload) => upload.rows.added.places.length + upload.rows.alreadyInLibrary.places.length > 0
  );
  if (withPlaces.length === 0) return undefined;
  const onToday = now != null && withPlaces.some((upload) => {
    const date = new Date(upload.uploadedAt);
    return !Number.isNaN(date.getTime()) && sameDay(date, now);
  });
  return {
    label: onToday ? "See today's places in your Library" : 'See these places in your Library',
    href: '/library',
  };
}

function libraryParts(shot: InboxUploadScreenshot, places: InboxUploadPlace[], batch: InboxUploadBatch): {
  saved: InboxUploadPlace[];
  matched: InboxUploadPlace[];
} {
  const saved: InboxUploadPlace[] = [];
  const matched: InboxUploadPlace[] = [];
  for (const place of places) {
    if (place.status !== 'library') continue;
    if (shot.createdPlaceIds.includes(place.id) || batch.rows.added.placeIds.includes(place.id)) saved.push(place);
    else if (shot.linkedPlaceIds.includes(place.id)) matched.push(place);
  }
  return { saved, matched };
}

function shotKind(shot: InboxUploadScreenshot, places: InboxUploadPlace[], batch: InboxUploadBatch): InboxShotKind {
  if (shot.outcome === 'stillReading') return 'reading';
  if (shot.outcome === 'couldNotRead') return 'unreadable';
  if (shot.outcome === 'cancelled') return 'cancelled';
  if (shot.outcome === 'noPlaceFound') return 'noPlace';
  if (places.some((place) => place.status === 'inbox')) return 'new';
  const { saved, matched } = libraryParts(shot, places, batch);
  if (matched.length > 0) return 'library';
  if (saved.length > 0) return 'added';
  if (places.some((place) => place.status === 'archived')) return 'archived';
  return 'noPlace';
}

function shotFilterKinds(kind: InboxShotKind, shot: InboxUploadScreenshot, places: InboxUploadPlace[], batch: InboxUploadBatch): InboxShotKind[] {
  const { saved, matched } = libraryParts(shot, places, batch);
  if (kind !== 'new' && saved.length > 0 && matched.length > 0) return ['library', 'added'];
  return [kind];
}

function shotLine(kind: InboxShotKind, shot: InboxUploadScreenshot, places: InboxUploadPlace[], batch: InboxUploadBatch): string {
  if (kind === 'reading') return 'Still reading';
  if (kind === 'cancelled') return 'Cancelled before it was read';
  if (kind === 'noPlace') return 'No place found';
  if (kind === 'unreadable') {
    const item = batch.rows.couldNotRead.items.find((row) => row.sourceId === shot.sourceId);
    if (item?.status === 'stalled') return 'Still trying. It will retry on its own.';
    return item?.error || "Couldn't be read";
  }
  if (kind === 'archived') {
    return `${plural(places.length, 'place')} set aside as not a place`;
  }
  const inbox = places.filter((place) => place.status === 'inbox');
  const archived = places.filter((place) => place.status === 'archived');
  const { saved, matched } = libraryParts(shot, places, batch);
  const bits: string[] = [];
  if (kind === 'new') bits.push(`${plural(inbox.length, 'new place', 'new places')} to review`);
  if (saved.length > 0) bits.push(`${plural(saved.length, 'place')} added to your Library`);
  if (matched.length > 0) {
    bits.push(
      kind === 'new'
        ? `${matched.length} already in your Library`
        : `${plural(matched.length, 'place')} already in your Library · this screenshot was added to them`
    );
  }
  if (archived.length > 0) bits.push(`${plural(archived.length, 'place')} set aside as not a place`);
  if (bits.length > 0) return bits.join(' · ');
  return `${plural(places.filter((place) => place.status === 'library').length, 'place')} added to your Library`;
}

function shotActions(kind: InboxShotKind, shot: InboxUploadScreenshot, places: InboxUploadPlace[], batch: InboxUploadBatch): InboxAction[] {
  if (kind === 'new') {
    const first = places.find((place) => place.status === 'inbox');
    return [{ label: 'Review', href: reviewHref(first?.id, batch.sessionId) }];
  }
  if (kind === 'library' || kind === 'added') {
    return [{ label: 'See them', href: seeThemHref(places.filter((place) => place.status === 'library')) }];
  }
  if (kind === 'noPlace') return placeholderActions('noPlace');
  if (kind === 'unreadable') {
    const item = batch.rows.couldNotRead.items.find((row) => row.sourceId === shot.sourceId);
    if (item?.status === 'stalled') return [];
    return placeholderActions('failed');
  }
  return [];
}

function detailRows(batch: InboxUploadBatch, now: Date | null): InboxShotRow[] {
  const byId = placeMap(batch);
  const rows: InboxShotRow[] = batch.screenshots.map((shot) => {
    const places = shotPlaces(shot, byId);
    const kind = shotKind(shot, places, batch);
    const title = places.length === 1
      ? places[0].name
      : places.length > 1
        ? joinDots(places.map((place) => place.name), 3)
        : (shot.name ?? 'Screenshot');
    return {
      id: shot.sourceId,
      kind,
      kinds: shotFilterKinds(kind, shot, places, batch),
      imageUrl: shot.imageUrl,
      alt: shot.name ?? title,
      title,
      line: shotLine(kind, shot, places, batch),
      places: places.map((place) => ({
        id: place.id,
        name: place.name,
        inLibrary: place.status === 'library',
      })),
      actions: shotActions(kind, shot, places, batch),
    };
  });
  batch.rows.uploadedBefore.items.forEach((item, index) => {
    const when = uploadedBeforeLabel(item.duplicateOfUploadedAt, now);
    rows.push({
      id: `skip-${index}`,
      kind: 'before',
      kinds: ['before'],
      imageUrl: null,
      alt: item.originalName,
      title: item.originalName,
      line: when ? `Uploaded before, in your ${when} upload · skipped` : 'Uploaded before · skipped',
      places: [],
      actions: [],
    });
  });
  return rows;
}

function detailChips(rows: InboxShotRow[]): InboxChip[] {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const kind of row.kinds) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  const chips: InboxChip[] = [{ id: 'all', label: `All ${rows.length}`, count: rows.length }];
  const specs: Array<[InboxShotKind, string]> = [
    ['new', 'Found new places'],
    ['library', 'Matched your Library'],
    ['added', 'Added to your Library'],
    ['before', 'Uploaded before'],
    ['noPlace', 'No place'],
    ['unreadable', "Couldn't read"],
  ];
  for (const [id, label] of specs) {
    const count = counts[id] ?? 0;
    if (count > 0) chips.push({ id, label: `${label} ${count}`, count });
  }
  return chips;
}

function detailSubtitle(batch: InboxUploadBatch): string {
  const parts = [plural(batch.screenshotCount, 'screenshot')];
  const fresh = batch.rows.toReview.places.length;
  const matched = batch.rows.alreadyInLibrary.places.length;
  const added = batch.rows.added.places.length;
  const skipped = batch.rows.uploadedBefore.items.length;
  const empty = batch.rows.noPlaceFound.sourceIds.length;
  const failed = batch.rows.couldNotRead.items.filter((item) => item.status === 'failed').length;
  const stalled = batch.rows.couldNotRead.items.filter((item) => item.status === 'stalled').length;
  const reading = batch.rows.stillReading.sourceIds.length;
  const archived = batch.rows.notAPlace.places.length;
  const cancelled = batch.rows.cancelled.sourceIds.length;
  if (fresh > 0) parts.push(plural(fresh, 'new place', 'new places'));
  if (matched > 0) parts.push(`${matched} already in your Library`);
  if (added > 0) parts.push(`${added} added`);
  if (archived > 0) parts.push(`${archived} not a place`);
  if (skipped > 0) parts.push(`${skipped} uploaded before`);
  if (empty > 0) parts.push(`${empty} no place`);
  if (failed > 0) parts.push(`${failed} couldn't be read`);
  if (stalled > 0) parts.push(`${stalled} still trying`);
  if (reading > 0) parts.push(`${reading} still reading`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);
  return parts.join(' · ');
}

function buildDetail(batch: InboxUploadBatch, now: Date | null): InboxDetailModel {
  const when = formatUploadWhen(batch.uploadedAt, now);
  const rows = detailRows(batch, now);
  const count = batch.rows.toReview.places.length;
  const href = count > 0 ? reviewHref(null, batch.sessionId) : null;
  return {
    view: 'detail',
    sessionId: batch.sessionId,
    title: when.heading || plural(batch.screenshotCount, 'screenshot'),
    subtitle: detailSubtitle(batch),
    chips: detailChips(rows),
    rows,
    dock: href ? { label: `Review ${plural(count, 'place')}`, href } : null,
    enterHref: href,
    live: batch.rows.stillReading.sourceIds.length > 0,
  };
}

function heroImages(uploads: InboxUploadBatch[]): InboxThumb[] {
  const images: InboxThumb[] = [];
  for (const upload of uploads) {
    for (const thumb of thumbs(upload, 3)) {
      if (images.some((image) => image.src === thumb.src)) continue;
      images.push(thumb);
      if (images.length >= 3) return images;
    }
  }
  return images;
}

function buildHome(input: BuildInboxScreenInput): InboxHomeModel {
  const { uploads, toReviewPlaceIds, addedAnotherWay, now } = input;
  const description = uploads.length === 0 && addedAnotherWay.length === 0
    ? 'Your screenshots come back here as places.'
    : HOME_DESCRIPTION;

  if (uploads.length === 0 && addedAnotherWay.length === 0) {
    return {
      view: 'home',
      description,
      hero: { kind: 'first' },
      live: false,
      reading: null,
      uploadsHeading: null,
      uploads: [],
      addedAnotherWay: null,
      earlierHeading: null,
      earlier: [],
      dock: { label: 'Choose screenshots', href: '/mass-upload' },
      enterHref: null,
    };
  }

  const readingBatch = uploads.find((upload) => upload.rows.stillReading.sourceIds.length > 0) ?? null;
  const open = uploads.filter((upload) => isOpen(upload) && upload.sessionId !== readingBatch?.sessionId);
  const finished = uploads.filter((upload) => !isOpen(upload));
  const reviewIds = [...toReviewPlaceIds, ...addedAnotherWay.map((place) => place.id)];
  const reviewCount = reviewIds.length;
  const live = readingBatch != null;

  let hero: InboxHero;
  let dock: InboxLink | null = null;
  let enterHref: string | null = null;

  if (readingBatch) {
    const read = readCount(readingBatch);
    const total = readingBatch.screenshotCount;
    const left = readingBatch.rows.stillReading.sourceIds.length;
    const minutes = Math.max(1, Math.round(left * 0.5));
    const wait = reviewCount > 0
      ? { label: `Review ${plural(reviewCount, 'place')} while you wait`, href: reviewHref() }
      : undefined;
    hero = {
      kind: 'reading',
      title: `${read} of ${total} read`,
      line: `${minutes === 1 ? 'About a minute left.' : `About ${minutes} minutes left.`} You can leave this page; the bell will tell you when it is done.`,
      read,
      total,
      sessionId: readingBatch.sessionId,
      images: thumbs(readingBatch, 3),
      cta: wait,
    };
    if (wait) {
      dock = wait;
      enterHref = wait.href;
    }
  } else if (reviewCount > 0) {
    const contributing = uploads.filter((upload) => upload.rows.toReview.places.length > 0);
    const parts: string[] = [];
    if (contributing.length > 0) {
      const allToday = now != null && contributing.every((upload) => sameDay(new Date(upload.uploadedAt), now));
      parts.push(`From ${plural(contributing.length, 'upload')}${allToday ? ' today' : ''}`);
    }
    if (addedAnotherWay.length > 0 && contributing.length > 0) {
      parts.push(`${addedAnotherWay.length} added another way`);
    } else if (addedAnotherWay.length > 0) {
      parts.push('Added another way');
    }
    const minutes = reviewMinutes(reviewCount);
    if (minutes > 0) parts.push(minutePhrase(minutes));
    const checks = contributing
      .map((upload) => upload.rows.toReview.checkCount)
      .filter((count): count is number => count != null);
    const checkTotal = checks.reduce((sum, count) => sum + count, 0);
    if (checks.length > 0 && checkTotal > 0) {
      parts.push(`${checkTotal} ${checkTotal === 1 ? 'is' : 'are'} marked "check this"`);
    }
    const cta = { label: `Review ${plural(reviewCount, 'place')}`, href: reviewHref() };
    const newest = contributing[0];
    hero = {
      kind: 'review',
      title: `${plural(reviewCount, 'new place', 'new places')} to review`,
      line: parts.join(' · '),
      cta,
      sub: contributing.length >= 2 && newest
        ? {
            label: `or just the newest upload (${newest.rows.toReview.places.length})`,
            href: reviewHref(null, newest.sessionId),
          }
        : undefined,
      images: heroImages(contributing.length > 0 ? contributing : uploads),
    };
    dock = cta;
    enterHref = cta.href;
  } else if (open.length > 0) {
    const failed = open.reduce(
      (sum, upload) => sum + upload.rows.couldNotRead.items.filter((item) => item.status === 'failed').length,
      0
    );
    const empty = open.reduce((sum, upload) => sum + upload.rows.noPlaceFound.sourceIds.length, 0);
    const stalled = open.reduce(
      (sum, upload) => sum + upload.rows.couldNotRead.items.filter((item) => item.status === 'stalled').length,
      0
    );
    const problem = failed + empty;
    hero = problem > 0
      ? {
          kind: 'attention',
          title: plural(problem, 'screenshot needs another look', 'screenshots need another look'),
          line: 'No new places to review. The rows below are ones we could not place or could not read.',
          images: heroImages(open),
        }
      : {
          kind: 'attention',
          title: stalled === 1 ? 'Still trying to read 1 screenshot' : `Still trying to read ${stalled} screenshots`,
          line: 'A temporary hold. These retry on their own, and the bell rings when they finish.',
          images: heroImages(open),
        };
  } else {
    hero = {
      kind: 'caught-up',
      title: 'Every place from your uploads has a home.',
      line: caughtUpLine(uploads, now),
      library: caughtUpLibrary(uploads, now),
      upload: { label: 'Upload more', href: '/mass-upload' },
    };
    dock = { label: 'Upload screenshots', href: '/mass-upload' };
  }

  const addedCard = addedAnotherWay.length > 0
    ? {
        count: addedAnotherWay.length,
        names: joinLimited(addedAnotherWay.map((place) => place.name), 6),
        href: reviewHref(addedAnotherWay[0]?.id),
      }
    : null;

  const showEarlier = finished.length > 0;
  const allFinished = !live && reviewCount === 0 && open.length === 0;

  return {
    view: 'home',
    description,
    hero,
    live,
    reading: readingBatch ? readingCard(readingBatch, now) : null,
    uploadsHeading: open.length > 0 ? (live ? 'While you wait' : 'Your uploads') : null,
    uploads: open.map((upload) => uploadCard(upload, now)),
    addedAnotherWay: addedCard,
    earlierHeading: showEarlier ? (allFinished ? 'Recent uploads' : 'Earlier') : null,
    earlier: showEarlier ? finished.map((upload) => earlierLine(upload, now)) : [],
    dock,
    enterHref,
  };
}
