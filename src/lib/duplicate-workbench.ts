import {
  CERTAINTY_LABEL,
  certaintyWord,
  dismissPairsForCluster,
  pairHasHardAgainst,
  type CertaintyWord,
  type QueueCluster,
  type QueuePlace,
} from '@/lib/duplicate-certainty';
import {
  calculateLocationDistance,
  calculateNameSimilarity,
  type DuplicateGroupEdge,
} from '@/lib/duplicate-detection';
import {
  hasValidCoords,
  MERGE_OVERRIDE_FIELD_LABELS,
  MERGE_OVERRIDE_FIELDS,
  mergePlaceFields,
  scalarFieldContributor,
  type MergeFieldOverrides,
  type MergeOverrideField,
} from '@/lib/place-merge';
import type { Place } from '@/types/database';

/** Pins this close together are the same pin, not a choice. */
export const SAME_PIN_METRES = 100;

export type Pair = { placeId1: string; placeId2: string };

export function formatApart(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km apart`;
  }
  return `${Math.round(metres)} m apart`;
}

/** Kept record first, then the others in payload order. Card numbers follow this. */
export function orderMembers(places: QueuePlace[], keptId: string): QueuePlace[] {
  const kept = places.find((place) => place.id === keptId);
  return kept ? [kept, ...places.filter((place) => place.id !== keptId)] : places;
}

export function edgeFor(cluster: QueueCluster, a: string, b: string): DuplicateGroupEdge | undefined {
  return cluster.edges?.find((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
}

function placesOf(cluster: QueueCluster, edge: DuplicateGroupEdge): [QueuePlace, QueuePlace] | null {
  const a = cluster.places.find((place) => place.id === edge.a);
  const b = cluster.places.find((place) => place.id === edge.b);
  return a && b ? [a, b] : null;
}

/** The certainty word of one pair, read as if it were a group of two. Null when the pair is not a direct match. */
export function pairWord(cluster: QueueCluster, edge: DuplicateGroupEdge): CertaintyWord | null {
  if (!edge.included) return null;
  const pair = placesOf(cluster, edge);
  if (!pair) return null;
  return certaintyWord({
    cluster_id: `${edge.a}+${edge.b}`,
    places: pair,
    avgConfidence: edge.score,
    edges: [edge],
  });
}

function pairFact(edge: DuplicateGroupEdge): string {
  if (edge.distanceM !== null) return formatApart(edge.distanceM);
  if (edge.factors.name >= 0.95) return 'same name';
  return 'no location to compare';
}

function hardReason(edge: DuplicateGroupEdge): string {
  if (edge.distanceM !== null && edge.distanceM > 500) return formatApart(edge.distanceM);
  return edge.against.find((text) => text !== 'Names differ') ?? 'Different places';
}

export type Tone = 'for' | 'weak' | 'against';

/** Who matches whom, one plain line per pair: "1 and 2 · Likely · 54 m apart". */
export function linkLines(cluster: QueueCluster, order: QueuePlace[]): Array<{ key: string; text: string; tone: Tone }> {
  const number = new Map(order.map((place, index) => [place.id, index + 1]));
  return (cluster.edges ?? [])
    .map((edge) => {
      const pair = placesOf(cluster, edge);
      const [first, second] = [number.get(edge.a) ?? 0, number.get(edge.b) ?? 0].sort((x, y) => x - y);
      const label = `${first} and ${second}`;
      if (pair && pairHasHardAgainst(edge, pair[0], pair[1])) {
        return { key: `${first}:${second}`, sort: first * 100 + second, text: `${label} · ${hardReason(edge)}`, tone: 'against' as Tone };
      }
      const word = pairWord(cluster, edge);
      return word
        ? { key: `${first}:${second}`, sort: first * 100 + second, text: `${label} · ${CERTAINTY_LABEL[word]} · ${pairFact(edge)}`, tone: 'for' as Tone }
        : { key: `${first}:${second}`, sort: first * 100 + second, text: `${label} · Not a direct match`, tone: 'weak' as Tone };
    })
    .sort((x, y) => x.sort - y.sort)
    .map(({ key, text, tone }) => ({ key, text, tone }));
}

/** The lines under one card: who it matches, who it does not, and how far. */
export function cardLines(cluster: QueueCluster, order: QueuePlace[], memberId: string): Array<{ text: string; tone: Tone }> {
  const number = new Map(order.map((place, index) => [place.id, index + 1]));
  const lines: Array<{ text: string; tone: Tone }> = [];
  const mine = (cluster.edges ?? []).filter((edge) => edge.a === memberId || edge.b === memberId);
  const other = (edge: DuplicateGroupEdge) => (edge.a === memberId ? edge.b : edge.a);

  const against = mine.filter((edge) => {
    const pair = placesOf(cluster, edge);
    return pair !== null && pairHasHardAgainst(edge, pair[0], pair[1]);
  });
  const links = mine.filter((edge) => edge.included && !against.includes(edge)).sort((a, b) => b.score - a.score);
  const linkedTo = new Set(links.map(other));

  if (links.length > 0 && linkedTo.size === 1 && against.length > 0 && order.length > 2) {
    lines.push({ text: `Only linked through #${number.get(other(links[0]))}`, tone: 'weak' });
  } else if (links.length > 0) {
    lines.push({ text: `Matches #${number.get(other(links[0]))} · ${pairFact(links[0])}`, tone: 'for' });
  }
  for (const edge of against) {
    lines.push({ text: `${hardReason(edge)} from #${number.get(other(edge))}`, tone: 'against' });
  }
  for (const edge of mine) {
    if (edge.included || against.includes(edge)) continue;
    lines.push({ text: `Not a direct match with #${number.get(other(edge))}`, tone: 'weak' });
  }
  return lines;
}

function pluralKind(kind: string): string {
  return kind.endsWith('s') ? kind : `${kind}s`;
}

function altNameMatch(a: Place, b: Place): string | null {
  const direct = calculateNameSimilarity(a.name, b.name);
  let best: { alt: string; score: number } | null = null;
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const alt of from.altNames ?? []) {
      const score = calculateNameSimilarity(alt, to.name);
      if (score >= 0.8 && score >= direct + 0.05 && (!best || score > best.score)) best = { alt, score };
    }
  }
  return best?.alt ?? null;
}

/** Evidence chips for one pair: for, against, and what we cannot tell. */
export function pairEvidence(edge: DuplicateGroupEdge, a: QueuePlace, b: QueuePlace): { for: string[]; against: string[]; unknown: string[] } {
  const support: string[] = [];
  const unknown: string[] = [];
  if (edge.flags.includes('same Google place')) support.push('Same Google place');

  const alt = altNameMatch(a, b);
  if (alt) support.push(`Its other name is "${alt}"`);
  else if (edge.factors.name >= 0.95) support.push('Same name');
  else if (edge.factors.name > 0.85) support.push('Names nearly identical');
  else if (edge.factors.name > 0.7) support.push('Names very similar');
  else if (edge.factors.name >= 0.5) unknown.push('Names only partly alike');

  if (edge.distanceM !== null && edge.distanceM <= 500) {
    support.push(edge.distanceM <= 10 ? `Same spot (${edge.distanceM} m)` : formatApart(edge.distanceM));
  } else if (edge.distanceM === null) {
    const pins = [a, b].filter((place) => hasValidCoords(place.coords)).length;
    unknown.push(pins === 0 ? 'No location on either' : 'No location on one');
  }

  if (a.kind?.trim() && a.kind === b.kind) support.push(`Both ${pluralKind(a.kind)}`);
  const cityA = a.city?.trim();
  const cityB = b.city?.trim();
  if (cityA && cityB) {
    if (edge.factors.city === 1) support.push(`Both in ${cityA}`);
  } else {
    unknown.push(cityA || cityB ? 'No city on one' : 'No city on either');
  }
  const countryA = a.country?.trim();
  if (countryA && countryA.toLowerCase() === b.country?.trim().toLowerCase()) support.push(`Both in ${countryA}`);

  return { for: support, against: edge.against, unknown };
}

/**
 * Members that start as "Not this one": in a group of three or more, a
 * member other than the kept record with hard evidence against the kept
 * record, or against at least half the others. The reason is shown.
 */
export function suggestedOut(cluster: QueueCluster, keptId: string): Map<string, string> {
  const out = new Map<string, string>();
  if (cluster.places.length < 3) return out;
  for (const member of cluster.places) {
    if (member.id === keptId) continue;
    const against = cluster.places.filter((other) => {
      if (other.id === member.id) return false;
      const edge = edgeFor(cluster, member.id, other.id);
      return edge !== undefined && pairHasHardAgainst(edge, member, other);
    });
    const withKept = against.some((other) => other.id === keptId);
    if (!withKept && against.length * 2 < cluster.places.length - 1) continue;
    const first = edgeFor(cluster, member.id, against[0].id)!;
    const names = against.map((other) => other.name);
    const joined = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    out.set(member.id, `Suggested out: ${hardReason(first)} from ${joined}.`);
  }
  return out;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function fieldText(place: Place, field: MergeOverrideField): string {
  if (field === 'coords') {
    const coords = place.coords;
    return hasValidCoords(coords) && coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : '';
  }
  if (field === 'hours') {
    const hours = place.hours;
    if (!hours || typeof hours !== 'object') return '';
    return Object.entries(hours).sort(([x], [y]) => x.localeCompare(y)).map(([day, time]) => `${day}: ${time}`).join(', ');
  }
  const value = place[field];
  return value == null ? '' : String(value).trim();
}

/** Same value for the merge: equal after case and accents, or pins within 100 m. */
function sameValue(field: MergeOverrideField, a: Place, b: Place): boolean {
  if (field === 'coords') {
    if (!a.coords || !b.coords) return false;
    return calculateLocationDistance(a.coords, b.coords) * 1000 <= SAME_PIN_METRES;
  }
  return normalizeText(fieldText(a, field)) === normalizeText(fieldText(b, field));
}

export interface FieldConflict {
  field: MergeOverrideField;
  label: string;
  /** One option per distinct value; `placeId` is the first member holding it. */
  options: Array<{ placeId: string; value: string; memberIds: string[] }>;
  /** The value the merge writes with no pick: the kept record's, else the first filled source's. */
  defaultId: string;
}

/** Fields where the In members hold different values that are not trivially the same. */
export function fieldConflicts(kept: Place, sources: Place[]): FieldConflict[] {
  const conflicts: FieldConflict[] = [];
  for (const field of MERGE_OVERRIDE_FIELDS) {
    const options: FieldConflict['options'] = [];
    const reps: Place[] = [];
    for (const place of [kept, ...sources]) {
      if (!fieldText(place, field)) continue;
      const index = reps.findIndex((rep) => sameValue(field, rep, place));
      if (index >= 0) {
        options[index].memberIds.push(place.id);
        continue;
      }
      reps.push(place);
      options.push({ placeId: place.id, value: fieldText(place, field), memberIds: [place.id] });
    }
    if (options.length < 2) continue;
    const defaultId = scalarFieldContributor(kept, sources, field)?.id ?? options[0].placeId;
    conflicts.push({ field, label: MERGE_OVERRIDE_FIELD_LABELS[field], options, defaultId });
  }
  return conflicts;
}

export interface MergePlan {
  targetId: string;
  sourceIds: string[];
  fieldOverrides?: MergeFieldOverrides;
  conflicts: FieldConflict[];
  /** Chosen place id per conflict field. */
  chosen: Partial<Record<MergeOverrideField, string>>;
  /** What the merge writes onto the kept place: the same `mergePlaceFields` the server runs. */
  result: Place;
}

/**
 * The merge request and its preview from one source. Only In members merge.
 * A pick only becomes an override when it differs from what the server would
 * write anyway, so an untouched column sends no overrides.
 */
export function buildMergePlan(args: {
  places: Place[];
  keptId: string;
  inIds: ReadonlySet<string>;
  picks?: Partial<Record<MergeOverrideField, string>>;
}): MergePlan | null {
  const kept = args.places.find((place) => place.id === args.keptId);
  if (!kept) return null;
  const sources = args.places.filter((place) => place.id !== kept.id && args.inIds.has(place.id));
  const conflicts = fieldConflicts(kept, sources);
  const overrides: MergeFieldOverrides = {};
  const chosen: MergePlan['chosen'] = {};
  for (const conflict of conflicts) {
    const pick = args.picks?.[conflict.field];
    const id = pick && conflict.options.some((option) => option.placeId === pick) ? pick : conflict.defaultId;
    chosen[conflict.field] = id;
    if (id !== conflict.defaultId) overrides[conflict.field] = id;
  }
  const fieldOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
  return {
    targetId: kept.id,
    sourceIds: sources.map((place) => place.id),
    fieldOverrides,
    conflicts,
    chosen,
    result: mergePlaceFields(kept, sources, fieldOverrides),
  };
}

function pairsAmong(ids: string[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) pairs.push({ placeId1: ids[i], placeId2: ids[j] });
  }
  return pairs;
}

/**
 * Pairs remembered as different when the group is resolved. Each member
 * marked Not this one is paired with every In member. "Not duplicates" also
 * pairs the In members; with everyone In that is today's included-edge set.
 */
export function resolvePairs(cluster: QueueCluster, inIds: ReadonlySet<string>, resolution: 'merge' | 'dismiss'): Pair[] {
  const ins = cluster.places.filter((place) => inIds.has(place.id)).map((place) => place.id);
  const outs = cluster.places.filter((place) => !inIds.has(place.id)).map((place) => place.id);
  const pairs: Pair[] = [];
  if (resolution === 'dismiss') {
    pairs.push(...(outs.length === 0 ? dismissPairsForCluster(cluster) : pairsAmong(ins)));
  }
  for (const out of outs) {
    for (const member of ins) pairs.push({ placeId1: out, placeId2: member });
  }
  return pairs;
}

export interface CompareRow {
  label: string;
  values: string[];
  differs: boolean;
  empty: boolean;
}

function listText(value: unknown): string {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).join(', ') : '';
}

/** Every field side by side. Rows that differ come first, rows empty on every member last. */
export function compareRows(places: QueuePlace[]): CompareRow[] {
  const statusLabel = (place: QueuePlace) => (place.status === 'library' ? 'Library' : place.status === 'inbox' ? 'Inbox' : place.status ?? '');
  const count = (n: number | undefined, noun: string) => (n ? `${n} ${noun}${n === 1 ? '' : 's'}` : '');
  const columns: Array<[string, (place: QueuePlace) => string]> = [
    ...MERGE_OVERRIDE_FIELDS.map((field): [string, (place: QueuePlace) => string] => [MERGE_OVERRIDE_FIELD_LABELS[field], (place) => fieldText(place, field)]),
    ['Status', statusLabel],
    ['Other names', (place) => listText(place.altNames)],
    ['Notes', (place) => place.notes?.trim() ?? ''],
    ['Tags', (place) => listText(place.tags)],
    ['Vibes', (place) => listText(place.vibes)],
    ['Cuisine', (place) => listText(place.cuisine)],
    ['Activities', (place) => listText(place.activities)],
    ['Amenities', (place) => listText(place.amenities)],
    ['Photos', (place) => count(place.photoCount, 'photo')],
    ['Screenshots', (place) => count(place.screenshotCount, 'screenshot')],
  ];
  const rows = columns.map(([label, read]) => {
    const values = places.map(read);
    const distinct = new Set(values.map(normalizeText));
    return { label, values, differs: distinct.size > 1, empty: values.every((value) => !value) };
  });
  const rank = (row: CompareRow) => (row.differs ? 0 : row.empty ? 2 : 1);
  return rows.sort((a, b) => rank(a) - rank(b));
}

/**
 * Compare-all-fields starts open for Maybe, Possible, and Probably not, and
 * for any group with a conflict other than the name or evidence against.
 */
export function compareStartsOpen(cluster: QueueCluster, conflicts: FieldConflict[]): boolean {
  const word = certaintyWord(cluster);
  if (word === 'maybe' || word === 'possible' || word === 'probably-not') return true;
  if (conflicts.some((conflict) => conflict.field !== 'name')) return true;
  return (cluster.edges ?? []).some((edge) => edge.against.length > 0);
}
