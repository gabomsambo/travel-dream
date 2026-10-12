import { citiesMatch } from '@/lib/city-names';
import {
  calculateNameSimilarity,
  checkAlternativeNames,
  type DuplicateCluster,
  type DuplicateGroupEdge,
  type DuplicateLeftOut,
} from '@/lib/duplicate-detection';
import { recommendMergeTarget } from '@/lib/duplicate-target-selector';
import type { Place } from '@/types/database';

/**
 * Score bands for the duplicates queue.
 *
 * A shared `duplicatePageBand` from the scoring change is not on this branch.
 * These are the one copy the queue uses: Possible is 0.60–0.70, To review
 * starts at 0.70, and Certain is a same Google place or a Very likely match
 * at 0.95 or above.
 */
export const DUPLICATE_PAGE_BAND = {
  possibleMin: 0.6,
  reviewMin: 0.7,
  likelyMin: 0.8,
  veryLikelyMin: 0.9,
  certainMin: 0.95,
  closeMetres: 100,
  farMetres: 2000,
  exactName: 0.95,
} as const;

export type CertaintyWord =
  | 'same'
  | 'very-likely'
  | 'likely'
  | 'maybe'
  | 'probably-not'
  | 'possible';

export const CERTAINTY_LABEL: Record<CertaintyWord, string> = {
  same: 'Same place',
  'very-likely': 'Very likely',
  likely: 'Likely',
  maybe: 'Maybe',
  'probably-not': 'Probably not',
  possible: 'Possible',
};

const WORD_RANK: Record<CertaintyWord, number> = {
  same: 6,
  'very-likely': 5,
  likely: 4,
  maybe: 3,
  'probably-not': 2,
  possible: 1,
};

export interface QueuePlaceFields {
  screenshotCount: number;
  hasPhoto: boolean;
  photoUrl: string | null;
}

export type QueuePlace = Place & Partial<QueuePlaceFields>;

/** A review or possible group, plus the queue fields the page reads. */
export interface QueueCluster {
  id?: string;
  cluster_id: string;
  places: QueuePlace[];
  avgConfidence: number;
  weakestIncludedScore?: number;
  edges?: DuplicateGroupEdge[];
  leftOut?: DuplicateLeftOut[];
  mergedOn?: string | null;
}

export interface DismissedPairView {
  placeId1: string;
  placeId2: string;
  name1: string;
  name2: string;
  city1: string | null;
  city2: string | null;
  dismissedAt: string;
}

export interface MergedGroupView {
  id: string;
  keptPlaceId: string;
  keptName: string;
  performedAt: string;
  placeCount: number;
}

function hasCoords(place: { coords?: { lat: number; lon: number } | null }): boolean {
  const coords = place.coords;
  return Boolean(coords && typeof coords.lat === 'number' && typeof coords.lon === 'number');
}

function kindsClash(a: QueuePlace, b: QueuePlace): boolean {
  const kindA = a.kind?.trim();
  const kindB = b.kind?.trim();
  return Boolean(kindA && kindB && kindA !== kindB);
}

function countriesClash(a: QueuePlace, b: QueuePlace): boolean {
  const countryA = a.country?.trim();
  const countryB = b.country?.trim();
  return Boolean(countryA && countryB && countryA.toLowerCase() !== countryB.toLowerCase());
}

function citiesClash(a: QueuePlace, b: QueuePlace): boolean {
  return Boolean(a.city?.trim() && b.city?.trim() && !citiesMatch(a.city, b.city));
}

/** The name match came through an alt name, not the two display names. */
function altNameHit(a: QueuePlace, b: QueuePlace): boolean {
  const direct = calculateNameSimilarity(a.name, b.name);
  const via = checkAlternativeNames(a, b);
  return via >= direct + 0.05 && via >= 0.8;
}

function edgePool(edges: DuplicateGroupEdge[]): DuplicateGroupEdge[] {
  const included = edges.filter((edge) => edge.included);
  return included.length > 0 ? included : edges;
}

/** Edges of the maximum spanning tree, strongest first. The last one is the bottleneck. */
function spanningTreeEdges(edges: DuplicateGroupEdge[]): DuplicateGroupEdge[] {
  const pool = edgePool(edges);
  if (pool.length === 0) return [];

  const sorted = [...pool].sort((a, b) => b.score - a.score || a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const link = (a: string, b: string): boolean => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return false;
    if (rootA > rootB) [rootA, rootB] = [rootB, rootA];
    parent.set(rootB, rootA);
    return true;
  };

  const nodes = new Set<string>();
  for (const edge of pool) {
    nodes.add(edge.a);
    nodes.add(edge.b);
  }

  const tree: DuplicateGroupEdge[] = [];
  for (const edge of sorted) {
    if (!link(edge.a, edge.b)) continue;
    tree.push(edge);
    if (tree.length >= nodes.size - 1) break;
  }
  return tree;
}

/**
 * Lightest edge on the maximum spanning tree: the weakest link the members
 * still need in order to stay one group. A redundant weaker edge does not
 * set the word.
 */
export function bottleneckEdge(edges: DuplicateGroupEdge[]): DuplicateGroupEdge | null {
  const pool = edgePool(edges);
  if (pool.length === 0) return null;
  const tree = spanningTreeEdges(edges);
  if (tree.length > 0) return tree[tree.length - 1];
  return [...pool].sort((a, b) => b.score - a.score || a.a.localeCompare(b.a) || a.b.localeCompare(b.b))[0];
}

function sameGoogleOnEdge(
  edge: DuplicateGroupEdge,
  places: QueuePlace[],
): { shares: boolean; id: string | null } {
  const placeA = places.find((place) => place.id === edge.a);
  const placeB = places.find((place) => place.id === edge.b);
  const idA = placeA?.googlePlaceId?.trim() ?? '';
  const idB = placeB?.googlePlaceId?.trim() ?? '';
  if (idA && idB && idA !== idB) return { shares: false, id: null };
  if (idA && idA === idB) return { shares: true, id: idA };
  if (edge.flags.includes('same Google place')) return { shares: true, id: null };
  return { shares: false, id: null };
}

/** True when every spanning-tree edge is the same one Google place. */
function sharesOneGooglePlace(edges: DuplicateGroupEdge[], places: QueuePlace[]): boolean {
  if (edges.length === 0) return false;
  let shared: string | null = null;
  for (const edge of edges) {
    const match = sameGoogleOnEdge(edge, places);
    if (!match.shares) return false;
    if (match.id && shared && match.id !== shared) return false;
    if (match.id) shared = match.id;
  }
  if (!shared) return true;
  return edges.every((edge) => sameGoogleOnEdge(edge, places).id === shared);
}

function bandOnly(score: number): CertaintyWord {
  if (score >= DUPLICATE_PAGE_BAND.veryLikelyMin) return 'likely';
  if (score >= DUPLICATE_PAGE_BAND.likelyMin) return 'likely';
  if (score >= DUPLICATE_PAGE_BAND.reviewMin) return 'maybe';
  return 'possible';
}

/**
 * Certainty word for one group, from its bottleneck edge, adjusted by evidence.
 * Same place means every spanning-tree edge shares one Google place. Different
 * cities, countries, or a pin more than 2 km away read "Probably not". No pin
 * on either side plus a name that is not exact reads "Maybe" even when the
 * score is high. A close pin or an alt-name hit moves a 0.70–0.80 pair up to
 * "Likely".
 */
export function certaintyWord(cluster: QueueCluster): CertaintyWord {
  const edge = cluster.edges && cluster.edges.length > 0 ? bottleneckEdge(cluster.edges) : null;
  if (!edge) return bandOnly(cluster.weakestIncludedScore ?? cluster.avgConfidence ?? 0);

  const placeA = cluster.places.find((place) => place.id === edge.a);
  const placeB = cluster.places.find((place) => place.id === edge.b);
  if (!placeA || !placeB) return bandOnly(edge.score);

  const tree = spanningTreeEdges(cluster.edges ?? []);
  if (sharesOneGooglePlace(tree.length > 0 ? tree : [edge], cluster.places)) return 'same';

  if (edge.score < DUPLICATE_PAGE_BAND.reviewMin) return 'possible';

  const far = (edge.distanceM !== null && edge.distanceM > DUPLICATE_PAGE_BAND.farMetres)
    || edge.flags.includes('far apart');
  if (citiesClash(placeA, placeB) || countriesClash(placeA, placeB) || far) return 'probably-not';

  const missingPins = edge.distanceM === null && !hasCoords(placeA) && !hasCoords(placeB);
  if (missingPins && edge.factors.name < DUPLICATE_PAGE_BAND.exactName) return 'maybe';
  if (kindsClash(placeA, placeB)) return 'maybe';

  const near = edge.distanceM !== null && edge.distanceM <= DUPLICATE_PAGE_BAND.closeMetres;
  if (edge.score >= DUPLICATE_PAGE_BAND.veryLikelyMin && near && edge.against.length === 0) {
    return 'very-likely';
  }
  if (edge.score >= DUPLICATE_PAGE_BAND.likelyMin) return 'likely';
  if (near || altNameHit(placeA, placeB)) return 'likely';
  return 'maybe';
}

/**
 * Page-wide merge only. Same Google place, or Very likely with the bottleneck
 * at or above 0.95 (which already required pins within 100 m and nothing against).
 */
export function isCertainGroup(cluster: QueueCluster): boolean {
  const word = certaintyWord(cluster);
  if (word === 'same') return true;
  if (word !== 'very-likely') return false;
  const edge = cluster.edges ? bottleneckEdge(cluster.edges) : null;
  return edge !== null && edge.score >= DUPLICATE_PAGE_BAND.certainMin;
}

export function certainGroups<T extends QueueCluster>(clusters: T[]): T[] {
  return clusters.filter(isCertainGroup);
}

export function unionGroupsSharingPlace<T extends QueueCluster>(clusters: T[]): T[] {
  if (clusters.length <= 1) return clusters;

  const parent = clusters.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (cursor !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const link = (left: number, right: number) => {
    const rootA = find(left);
    const rootB = find(right);
    if (rootA === rootB) return;
    if (rootA > rootB) parent[rootA] = rootB;
    else parent[rootB] = rootA;
  };

  const owner = new Map<string, number>();
  for (let index = 0; index < clusters.length; index++) {
    for (const place of clusters[index].places) {
      const previous = owner.get(place.id);
      if (previous === undefined) owner.set(place.id, index);
      else link(previous, index);
    }
  }

  const grouped = new Map<number, number[]>();
  for (let index = 0; index < clusters.length; index++) {
    const root = find(index);
    const members = grouped.get(root);
    if (members) members.push(index);
    else grouped.set(root, [index]);
  }

  const unions: T[] = [];
  for (const indexes of grouped.values()) {
    if (indexes.length === 1) {
      unions.push(clusters[indexes[0]]);
      continue;
    }
    const members = indexes.map((index) => clusters[index]);
    const places: T['places'] = [];
    const seen = new Set<string>();
    for (const member of members) {
      for (const place of member.places) {
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        places.push(place);
      }
    }
    const clusterId = [...seen].sort().join('+');
    unions.push({
      ...members[0],
      id: clusterId,
      cluster_id: clusterId,
      places,
      avgConfidence: Math.min(...members.map((member) => member.avgConfidence)),
    });
  }
  return unions;
}

export function distinctPlaceCount(groups: QueueCluster[]): number {
  const ids = new Set<string>();
  for (const cluster of groups) {
    for (const place of cluster.places) ids.add(place.id);
  }
  return ids.size;
}

export function dismissPairsForCluster(cluster: QueueCluster): Array<{ placeId1: string; placeId2: string }> {
  const pairs: Array<{ placeId1: string; placeId2: string }> = [];
  const seen = new Set<string>();
  const push = (placeId1: string, placeId2: string) => {
    if (!placeId1 || !placeId2 || placeId1 === placeId2) return;
    const key = placeId1 < placeId2 ? `${placeId1}:${placeId2}` : `${placeId2}:${placeId1}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ placeId1, placeId2 });
  };

  if (cluster.edges && cluster.edges.length > 0) {
    for (const edge of cluster.edges) push(edge.a, edge.b);
    return pairs;
  }

  for (let i = 0; i < cluster.places.length; i++) {
    for (let j = i + 1; j < cluster.places.length; j++) {
      push(cluster.places[i].id, cluster.places[j].id);
    }
  }
  return pairs;
}

export function sortQueueGroups<T extends QueueCluster>(clusters: T[]): T[] {
  return [...clusters].sort((a, b) => {
    const byWord = WORD_RANK[certaintyWord(b)] - WORD_RANK[certaintyWord(a)];
    if (byWord !== 0) return byWord;
    const scoreA = a.edges && a.edges.length > 0 ? (bottleneckEdge(a.edges)?.score ?? 0) : a.avgConfidence;
    const scoreB = b.edges && b.edges.length > 0 ? (bottleneckEdge(b.edges)?.score ?? 0) : b.avgConfidence;
    return scoreB - scoreA || a.cluster_id.localeCompare(b.cluster_id);
  });
}

function pairWasDismissed(dismissed: Set<string>, a: string, b: string): boolean {
  return dismissed.has(`${a}:${b}`) || dismissed.has(`${b}:${a}`);
}

export function filterDismissedClusters<T extends {
  places: Array<{ id: string }>;
  edges?: Array<{ a: string; b: string; included: boolean }>;
}>(
  clusters: T[],
  dismissed: Set<string>,
): T[] {
  return clusters.filter((cluster) => {
    const included = (cluster.edges ?? []).filter((edge) => edge.included);
    if (included.length > 0) {
      return included.every((edge) => !pairWasDismissed(dismissed, edge.a, edge.b));
    }
    for (let i = 0; i < cluster.places.length; i++) {
      for (let j = i + 1; j < cluster.places.length; j++) {
        if (pairWasDismissed(dismissed, cluster.places[i].id, cluster.places[j].id)) {
          return false;
        }
      }
    }
    return true;
  });
}

function isPossibleScore(score: number): boolean {
  return score >= DUPLICATE_PAGE_BAND.possibleMin && score < DUPLICATE_PAGE_BAND.reviewMin;
}

/**
 * Possible groups are connected components of edges in [0.60, 0.70), after
 * dismissed pairs are removed. A weak edge that touches a To-review member
 * stays its own group.
 */
export function possibleGroups<T extends { id: string }>(
  wide: Array<{ places: T[]; edges?: DuplicateGroupEdge[] }>,
  dismissed: Set<string> = new Set(),
): Array<Omit<DuplicateCluster, 'places'> & { places: T[] }> {
  const placeById = new Map<string, T>();
  for (const cluster of wide) {
    for (const place of cluster.places) placeById.set(place.id, place);
  }

  const edgeByKey = new Map<string, DuplicateGroupEdge>();
  for (const cluster of wide) {
    for (const edge of cluster.edges ?? []) {
      if (!isPossibleScore(edge.score) || pairWasDismissed(dismissed, edge.a, edge.b)) continue;
      if (!placeById.has(edge.a) || !placeById.has(edge.b)) continue;
      const key = edge.a < edge.b ? `${edge.a}\0${edge.b}` : `${edge.b}\0${edge.a}`;
      const previous = edgeByKey.get(key);
      if (!previous || edge.score > previous.score) edgeByKey.set(key, edge);
    }
  }

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const link = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    let rootA = find(a);
    let rootB = find(b);
    if (rootA === rootB) return;
    if (rootA > rootB) [rootA, rootB] = [rootB, rootA];
    parent.set(rootB, rootA);
  };

  for (const edge of edgeByKey.values()) link(edge.a, edge.b);

  const components = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const members = components.get(root);
    if (members) members.push(id);
    else components.set(root, [id]);
  }

  const groups: Array<Omit<DuplicateCluster, 'places'> & { places: T[] }> = [];
  for (const memberIds of components.values()) {
    if (memberIds.length < 2) continue;
    memberIds.sort();
    const places: T[] = [];
    for (const id of memberIds) {
      const place = placeById.get(id);
      if (place) places.push(place);
    }
    if (places.length !== memberIds.length) continue;

    const memberSet = new Set(memberIds);
    const edges = [...edgeByKey.values()]
      .filter((edge) => memberSet.has(edge.a) && memberSet.has(edge.b))
      .map((edge) => ({ ...edge, included: true }));
    if (edges.length === 0) continue;

    const id = memberIds.join('+');
    groups.push({
      id,
      cluster_id: id,
      places,
      avgConfidence: edges.reduce((sum, edge) => sum + edge.score, 0) / edges.length,
      weakestIncludedScore: Math.min(...edges.map((edge) => edge.score)),
      edges,
      leftOut: [],
      mergedOn: null,
    });
  }

  return groups.sort((a, b) => b.avgConfidence - a.avgConfidence || a.id.localeCompare(b.id));
}

export function keptPlace(cluster: QueueCluster): QueuePlace {
  const keptId = recommendMergeTarget(cluster.places);
  return cluster.places.find((place) => place.id === keptId) ?? cluster.places[0];
}

export function queueSubtitle(cluster: QueueCluster): string {
  const count = cluster.places.length;
  const noun = count === 1 ? 'place' : 'places';
  const city = keptPlace(cluster).city?.trim();
  return city ? `${count} ${noun} · ${city}` : `${count} ${noun}`;
}

export function formatMergedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDistanceAway(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000;
    const rounded = km >= 10 ? Math.round(km).toString() : (Math.round(km * 10) / 10).toString();
    return `${rounded} km away`;
  }
  return `${Math.round(metres)} m away`;
}

/**
 * One line when the score would hide a left-out member, an earlier merge,
 * or that neither place has a pin. Null when the word already says enough.
 */
export function queueContextLine(cluster: QueueCluster): string | null {
  const leftOut = [...(cluster.leftOut ?? [])].sort((a, b) => b.distanceM - a.distanceM)[0];
  if (leftOut) {
    return `Left out ${leftOut.name}, ${formatDistanceAway(leftOut.distanceM)}.`;
  }
  if (cluster.mergedOn) {
    return `Matches a place you merged on ${formatMergedOn(cluster.mergedOn)}.`;
  }
  const edge = cluster.edges && cluster.edges.length > 0 ? bottleneckEdge(cluster.edges) : null;
  if (!edge || edge.distanceM !== null) return null;
  const placeA = cluster.places.find((place) => place.id === edge.a);
  const placeB = cluster.places.find((place) => place.id === edge.b);
  if (placeA && placeB && !hasCoords(placeA) && !hasCoords(placeB)) {
    return 'No coordinates on either.';
  }
  return null;
}

export function emptyReviewCopy(args: {
  possibleCount: number;
  merged: MergedGroupView[];
}): { title: string; lines: string[] } {
  const lines: string[] = [];
  if (args.possibleCount === 1) {
    lines.push('1 weaker match under Possible.');
  } else if (args.possibleCount > 1) {
    lines.push(`${args.possibleCount} weaker matches under Possible.`);
  }

  if (args.merged.length === 1) {
    const merged = args.merged[0];
    lines.push(`Merged ${merged.keptName} on ${formatMergedOn(merged.performedAt)}.`);
  } else if (args.merged.length > 1) {
    const names = args.merged.slice(0, 3).map((merged) => merged.keptName).join(', ');
    lines.push(`${args.merged.length} merges, including ${names}.`);
  }

  return { title: "You're up to date.", lines };
}

export function snapshotNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const row of raw) {
    if (row && typeof row === 'object' && 'name' in row && typeof (row as { name: unknown }).name === 'string') {
      names.push((row as { name: string }).name);
    }
  }
  return names;
}

export interface MergeLogMatch {
  targetId: string;
  performedAt: string;
  undone?: boolean;
  sourceSnapshots?: unknown;
}

/**
 * When an included edge matched through an alt name a merge wrote onto the
 * survivor, the queue can say which day that merge happened.
 */
export function mergedOnForCluster(cluster: QueueCluster, logs: MergeLogMatch[]): string | null {
  let best: string | null = null;
  for (const log of logs) {
    if (log.undone) continue;
    const target = cluster.places.find((place) => place.id === log.targetId);
    if (!target) continue;
    const written = new Set(snapshotNames(log.sourceSnapshots));
    const alts = target.altNames ?? [];
    for (const edge of cluster.edges ?? []) {
      if (!edge.included) continue;
      const otherId = edge.a === target.id ? edge.b : edge.b === target.id ? edge.a : null;
      if (!otherId) continue;
      const other = cluster.places.find((place) => place.id === otherId);
      if (!other) continue;
      const direct = calculateNameSimilarity(target.name, other.name);
      for (const alt of alts) {
        if (!written.has(alt)) continue;
        const via = calculateNameSimilarity(alt, other.name);
        if (via > direct && via >= 0.8 && (!best || log.performedAt > best)) {
          best = log.performedAt;
        }
      }
    }
  }
  return best;
}
