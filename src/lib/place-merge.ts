import type { Place } from '@/types/database';

/**
 * Single-value fields a merge may fill or let the user pick.
 * The kept place wins when both sides have a value, unless `fieldOverrides`
 * names another place in the merge for that field.
 *
 * Arrays, notes, confidence, rating, and status have their own rules and are
 * not override keys.
 */
export const MERGE_OVERRIDE_FIELDS = [
  'description',
  'address',
  'coords',
  'website',
  'phone',
  'hours',
  'price_level',
  'best_time',
  'practicalInfo',
  'admin',
  'city',
  'country',
  'kind',
  'googlePlaceId',
] as const;

export type MergeOverrideField = (typeof MERGE_OVERRIDE_FIELDS)[number];

/** place id whose value to use for that field. Unknown ids are ignored. */
export type MergeFieldOverrides = Partial<Record<MergeOverrideField, string>>;

const OVERRIDE_FIELD_SET = new Set<string>(MERGE_OVERRIDE_FIELDS);

export function isMergeOverrideField(field: string): field is MergeOverrideField {
  return OVERRIDE_FIELD_SET.has(field);
}

/** Keep only known fields whose value is a place id string. */
export function sanitizeMergeFieldOverrides(input: unknown): MergeFieldOverrides | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: MergeFieldOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isMergeOverrideField(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isBlankText(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

export function hasValidCoords(coords: Place['coords']): boolean {
  return !!(
    coords &&
    typeof coords === 'object' &&
    'lat' in coords &&
    'lon' in coords &&
    coords.lat !== null &&
    coords.lon !== null
  );
}

function isEmptyHours(hours: Place['hours']): boolean {
  if (hours == null) return true;
  if (typeof hours !== 'object') return true;
  return Object.keys(hours).length === 0;
}

function isEmptyOverrideValue(field: MergeOverrideField, place: Place): boolean {
  switch (field) {
    case 'coords':
      return !hasValidCoords(place.coords);
    case 'hours':
      return isEmptyHours(place.hours);
    case 'description':
    case 'address':
    case 'website':
    case 'phone':
    case 'price_level':
    case 'best_time':
    case 'practicalInfo':
    case 'admin':
    case 'city':
    case 'country':
    case 'kind':
    case 'googlePlaceId':
      return isBlankText(place[field]);
    default:
      return true;
  }
}

function fillText(
  current: string | null | undefined,
  incoming: string | null | undefined
): string | null | undefined {
  if (!isBlankText(current)) return current;
  if (!isBlankText(incoming)) return incoming;
  return current ?? null;
}

/**
 * Case-insensitive union that keeps the first spelling seen.
 * Empty and non-string entries are dropped.
 */
export function unionStrings(...lists: Array<readonly (string | null | undefined)[] | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return Array.from(seen.values());
}

/** Join two notes the way a merge already shows them. Identical text is kept once. */
export function appendNote(
  current: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  const base = current?.trim() ? current : null;
  const extra = incoming?.trim() ? incoming : null;
  if (!extra) return base;
  if (!base) return extra;
  if (base.trim() === extra.trim()) return base;
  return `${base}\n\n---\n\n${extra}`;
}

function takeHigher(current: number | null | undefined, incoming: number | null | undefined): number | null {
  const next = Math.max(current ?? 0, incoming ?? 0);
  if (next > (current ?? 0)) return next;
  return current ?? null;
}

/**
 * The one merge rule shared by the preview and `bulkMergePlaces`.
 *
 * Sources are applied in array order (the order the user chose). Empty
 * single-value fields on the kept place are filled from the first source that
 * has them. Arrays are unioned. Notes are concatenated. Confidence and
 * personal rating keep the higher value. `googlePlaceId` is copied only when
 * the kept place has none. If any place is in Library, the survivor is too.
 *
 * `fieldOverrides` replaces a conflicting single-value field with the named
 * place's value. The place id must be the kept place or one of the sources,
 * and the chosen value must be non-empty.
 */
export function mergePlaceFields(
  target: Place,
  sources: Place[],
  fieldOverrides?: MergeFieldOverrides
): Place {
  const merged: Place = { ...target };
  merged.altNames = unionStrings([target.name], target.altNames);

  for (const source of sources) {
    merged.description = fillText(merged.description, source.description) ?? null;
    merged.address = fillText(merged.address, source.address) ?? null;
    merged.website = fillText(merged.website, source.website) ?? null;
    merged.phone = fillText(merged.phone, source.phone) ?? null;
    merged.price_level = fillText(merged.price_level, source.price_level) ?? null;
    merged.best_time = fillText(merged.best_time, source.best_time) ?? null;
    merged.practicalInfo = fillText(merged.practicalInfo, source.practicalInfo) ?? null;
    merged.admin = fillText(merged.admin, source.admin) ?? null;
    merged.city = fillText(merged.city, source.city) ?? null;
    merged.country = fillText(merged.country, source.country) ?? null;
    merged.kind = fillText(merged.kind, source.kind) || merged.kind;
    merged.googlePlaceId = fillText(merged.googlePlaceId, source.googlePlaceId) ?? null;

    if (!hasValidCoords(merged.coords) && hasValidCoords(source.coords)) {
      merged.coords = source.coords;
    }
    if (isEmptyHours(merged.hours) && !isEmptyHours(source.hours)) {
      merged.hours = source.hours;
    }

    merged.notes = appendNote(merged.notes, source.notes);
    merged.tags = unionStrings(merged.tags, source.tags);
    merged.vibes = unionStrings(merged.vibes, source.vibes);
    merged.activities = unionStrings(merged.activities, source.activities);
    merged.amenities = unionStrings(merged.amenities, source.amenities);
    merged.cuisine = unionStrings(merged.cuisine, source.cuisine);
    merged.altNames = unionStrings(merged.altNames, [source.name], source.altNames);

    merged.confidence = takeHigher(merged.confidence, source.confidence);
    merged.ratingSelf = takeHigher(merged.ratingSelf, source.ratingSelf);
  }

  const allowed = new Map<string, Place>([[target.id, target]]);
  for (const source of sources) allowed.set(source.id, source);

  if (fieldOverrides) {
    for (const field of MERGE_OVERRIDE_FIELDS) {
      const placeId = fieldOverrides[field];
      if (!placeId) continue;
      const chosen = allowed.get(placeId);
      if (!chosen || isEmptyOverrideValue(field, chosen)) continue;
      assignOverride(merged, field, chosen);
    }
  }

  const anyLibrary =
    target.status === 'library' || sources.some((source) => source.status === 'library');
  if (anyLibrary) merged.status = 'library';

  return merged;
}

function assignOverride(merged: Place, field: MergeOverrideField, chosen: Place): void {
  switch (field) {
    case 'description':
      merged.description = chosen.description;
      break;
    case 'address':
      merged.address = chosen.address;
      break;
    case 'coords':
      merged.coords = chosen.coords;
      break;
    case 'website':
      merged.website = chosen.website;
      break;
    case 'phone':
      merged.phone = chosen.phone;
      break;
    case 'hours':
      merged.hours = chosen.hours;
      break;
    case 'price_level':
      merged.price_level = chosen.price_level;
      break;
    case 'best_time':
      merged.best_time = chosen.best_time;
      break;
    case 'practicalInfo':
      merged.practicalInfo = chosen.practicalInfo;
      break;
    case 'admin':
      merged.admin = chosen.admin;
      break;
    case 'city':
      merged.city = chosen.city;
      break;
    case 'country':
      merged.country = chosen.country;
      break;
    case 'kind':
      merged.kind = chosen.kind;
      break;
    case 'googlePlaceId':
      merged.googlePlaceId = chosen.googlePlaceId;
      break;
    default:
      break;
  }
}

/** Fields the preview and the persisted row must agree on. */
export const MERGED_PLACE_FIELDS = [
  'name',
  'kind',
  'city',
  'country',
  'admin',
  'address',
  'coords',
  'website',
  'phone',
  'hours',
  'price_level',
  'best_time',
  'practicalInfo',
  'description',
  'googlePlaceId',
  'activities',
  'cuisine',
  'amenities',
  'tags',
  'vibes',
  'altNames',
  'notes',
  'confidence',
  'ratingSelf',
  'status',
] as const;

export function pickMergedPlaceFields(place: Place): Record<(typeof MERGED_PLACE_FIELDS)[number], unknown> {
  const picked = {} as Record<(typeof MERGED_PLACE_FIELDS)[number], unknown>;
  for (const field of MERGED_PLACE_FIELDS) {
    picked[field] = place[field];
  }
  return picked;
}
