/**
 * @jest-environment node
 *
 * Certainty words, tab membership, the Certain-only merge set, and the empty
 * To-review copy, scored from places stored in a local SQLite file.
 * The fixture import must stay first so `@/db` never opens a remote database.
 */
import {
  ALICE,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import { db } from '@/db';
import { attachments, mergeLogs, places } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  batchDetectDuplicates,
  findDuplicateClusters,
  DEFAULT_DETECTION_CONFIG,
  type DuplicateGroupEdge,
} from '@/lib/duplicate-detection';
import {
  certaintyWord,
  certainGroups,
  dismissPairsForCluster,
  distinctPlaceCount,
  emptyReviewCopy,
  filterDismissedClusters,
  isCertainGroup,
  possibleGroups,
  queueContextLine,
  unionGroupsSharingPlace,
  DUPLICATE_PAGE_BAND,
  type QueueCluster,
  type QueuePlace,
} from '@/lib/duplicate-certainty';
import { recommendMergeTarget } from '@/lib/duplicate-target-selector';
import { loadDuplicateQueueExtras } from '@/lib/duplicate-queue-data';
import type { Place } from '@/types/database';
import { createMockPlace } from '../helpers/mass-upload-helpers';

type Exec = { execute: (q: string | { sql: string; args?: unknown[] }) => Promise<{ rows: Record<string, unknown>[] }> };

function client(): Exec {
  return (require('@/db') as { client: Exec }).client;
}

const now = '2026-10-11T12:00:00.000Z';

async function insertPlace(row: Partial<Place> & { id: string; name: string }): Promise<void> {
  await db.insert(places).values({
    userId: ALICE.id,
    createdAt: now,
    updatedAt: now,
    altNames: [],
    tags: [],
    vibes: [],
    confidence: 0.5,
    ratingSelf: 0,
    status: 'library',
    kind: 'attraction',
    ...row,
  });
}

async function alicePlaces(): Promise<Place[]> {
  return db.select().from(places).where(eq(places.userId, ALICE.id));
}

function byMember(clusters: QueueCluster[], id: string): QueueCluster | undefined {
  return clusters.find((cluster) => cluster.places.some((place) => place.id === id));
}

describe('duplicate queue certainty on local places', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    for (const table of ['merge_logs', 'dismissed_duplicates', 'attachments']) {
      try {
        await client().execute(`DELETE FROM ${table}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('no such table')) throw error;
      }
    }
    await resetTenantFixture();
    await client().execute({
      sql: 'DELETE FROM places WHERE user_id = ?',
      args: [ALICE.id],
    });
  });

  it('puts words, tabs, and the Certain set on the real scorer', async () => {
    await insertPlace({
      id: 'plc_sushi_a',
      name: 'Sushi Saito',
      kind: 'restaurant',
      city: 'Tokyo',
      country: 'Japan',
      status: 'library',
    });
    await insertPlace({
      id: 'plc_sushi_b',
      name: 'Sushi Sato',
      kind: 'restaurant',
      city: 'Tokyo',
      country: 'Japan',
      status: 'inbox',
    });
    await insertPlace({
      id: 'plc_arctic_a',
      name: 'Arctic Cathedral',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6489, lon: 18.9857 },
      altNames: ['Ishavskatedralen'],
      status: 'library',
    });
    await insertPlace({
      id: 'plc_arctic_b',
      name: 'Ishavskatedralen',
      kind: 'attraction',
      city: 'Tromsø',
      country: 'Norway',
      coords: { lat: 69.6492, lon: 18.9857 },
      status: 'inbox',
    });
    await insertPlace({
      id: 'plc_fushimi_a',
      name: 'Fushimi Inari Taisha',
      kind: 'attraction',
      city: 'Kyoto',
      country: 'Japan',
      status: 'library',
    });
    await insertPlace({
      id: 'plc_fushimi_b',
      name: 'Fushimi Inari Shrine',
      kind: 'attraction',
      status: 'inbox',
    });
    await insertPlace({
      id: 'plc_central_a',
      name: 'Café Central',
      kind: 'cafe',
      city: 'Vienna',
      country: 'Austria',
      status: 'library',
    });
    await insertPlace({
      id: 'plc_central_b',
      name: 'Café Central',
      kind: 'cafe',
      city: 'Madrid',
      country: 'Spain',
      status: 'inbox',
    });
    await insertPlace({
      id: 'plc_google_a',
      name: 'Twin Chapel',
      kind: 'attraction',
      city: 'Lisbon',
      country: 'Portugal',
      googlePlaceId: 'ChIJ_same_chapel',
      coords: { lat: 38.7139, lon: -9.1334 },
      status: 'library',
    });
    await insertPlace({
      id: 'plc_google_b',
      name: 'Twin Chapel',
      kind: 'attraction',
      city: 'Lisbon',
      country: 'Portugal',
      googlePlaceId: 'ChIJ_same_chapel',
      coords: { lat: 38.7141, lon: -9.1334 },
      status: 'inbox',
    });

    const places = await alicePlaces();
    expect(places.length).toBeGreaterThanOrEqual(10);
    const detected = await batchDetectDuplicates(places, {
      ...DEFAULT_DETECTION_CONFIG,
      minConfidenceScore: DUPLICATE_PAGE_BAND.possibleMin,
    });
    const review = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.reviewMin) as QueueCluster[];
    const wide = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.possibleMin) as QueueCluster[];
    const possible = possibleGroups(wide);

    const sushi = byMember(review, 'plc_sushi_a');
    const arctic = byMember(review, 'plc_arctic_a');
    const central = byMember(review, 'plc_central_a');
    const google = byMember(review, 'plc_google_a');
    const fushimiReview = byMember(review, 'plc_fushimi_a');
    const fushimiPossible = byMember(possible, 'plc_fushimi_a');

    expect(sushi).toBeDefined();
    expect(certaintyWord(sushi!)).toBe('maybe');
    expect(queueContextLine(sushi!)).toBe('No coordinates on either.');
    expect(isCertainGroup(sushi!)).toBe(false);

    expect(arctic).toBeDefined();
    expect(certaintyWord(arctic!)).toBe('very-likely');
    expect(isCertainGroup(arctic!)).toBe(true);

    expect(central).toBeDefined();
    expect(certaintyWord(central!)).toBe('probably-not');
    expect(isCertainGroup(central!)).toBe(false);

    expect(google).toBeDefined();
    expect(certaintyWord(google!)).toBe('same');
    expect(isCertainGroup(google!)).toBe(true);

    expect(fushimiReview).toBeUndefined();
    expect(fushimiPossible).toBeDefined();
    expect(certaintyWord(fushimiPossible!)).toBe('possible');

    const certainIds = certainGroups(review).map((cluster) => cluster.cluster_id).sort();
    expect(certainIds).toEqual([arctic!.cluster_id, google!.cluster_id].sort());
    expect(certainIds).not.toContain(sushi!.cluster_id);
    expect(certainIds).not.toContain(central!.cluster_id);
  });

  it('names Possible and a real merge in the empty To-review copy', async () => {
    await insertPlace({
      id: 'plc_fushimi_a',
      name: 'Fushimi Inari Taisha',
      kind: 'attraction',
      city: 'Kyoto',
      country: 'Japan',
    });
    await insertPlace({
      id: 'plc_fushimi_b',
      name: 'Fushimi Inari Shrine',
      kind: 'attraction',
    });
    await insertPlace({
      id: 'plc_igu',
      name: 'Iguazu Falls',
      kind: 'attraction',
      city: 'Puerto Iguazu',
      country: 'Argentina',
      altNames: ['Cataratas do Iguaçu'],
    });

    await db.insert(mergeLogs).values({
      id: 'mrg_igu',
      targetId: 'plc_igu',
      sourceIds: ['plc_old_a', 'plc_old_b'],
      sourceSnapshots: [{ name: 'Cataratas do Iguaçu' }, { name: 'Iguaçu Falls' }],
      confidence: 0.9,
      performedBy: 'user',
      performedAt: '2026-10-11T15:00:00.000Z',
      undone: false,
    });
    await db.insert(mergeLogs).values({
      id: 'mrg_bob',
      targetId: FIXTURE.bobPlace,
      sourceIds: ['plc_bob_old'],
      sourceSnapshots: [{ name: 'Secret' }],
      confidence: 0.9,
      performedBy: 'user',
      performedAt: '2026-10-10T15:00:00.000Z',
      undone: false,
    });

    const places = await alicePlaces();
    const detected = await batchDetectDuplicates(places, {
      ...DEFAULT_DETECTION_CONFIG,
      minConfidenceScore: DUPLICATE_PAGE_BAND.possibleMin,
    });
    const review = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.reviewMin);
    const wide = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.possibleMin);
    const possible = possibleGroups(wide);
    expect(review.find((cluster) => cluster.places.some((place) => place.id === 'plc_fushimi_a'))).toBeUndefined();
    expect(possible.some((cluster) => cluster.places.some((place) => place.id === 'plc_fushimi_a'))).toBe(true);

    const extras = await loadDuplicateQueueExtras(ALICE.id, [], []);
    const copy = emptyReviewCopy({
      possibleCount: possible.length,
      merged: extras.merged,
    });

    expect(copy.title).toBe("You're up to date.");
    expect(copy.lines).toContain('1 weaker match under Possible.');
    expect(copy.lines).toContain('Merged Iguazu Falls on 11 Oct.');
    expect(copy.title.toLowerCase()).not.toContain('clean');
    expect(copy.lines.join(' ').toLowerCase()).not.toContain('clean');
    expect(extras.merged).toEqual([
      expect.objectContaining({ keptName: 'Iguazu Falls', keptPlaceId: 'plc_igu', placeCount: 3 }),
    ]);
    expect(extras.merged.map((entry) => entry.keptPlaceId)).not.toContain(FIXTURE.bobPlace);
  });

  it('keeps a 0.65 pair on Possible when another edge is already To review', () => {
    const possible = possibleGroups([bandCluster(
      ['A', 'B', 'C'],
      [['A', 'B', 0.85], ['A', 'C', 0.65], ['B', 'C', 0.4]],
    )]);

    expect(possible.map((group) => group.cluster_id)).toEqual(['A+C']);
    expect(possible[0].places.map((place) => place.id)).toEqual(['A', 'C']);
  });

  it('keeps an undismissed 0.65 pair when another pair in the wide group was dismissed', () => {
    const possible = possibleGroups(
      [bandCluster(
        ['A', 'B', 'C'],
        [['A', 'B', 0.66], ['A', 'C', 0.65]],
      )],
      new Set(['A:B']),
    );

    expect(possible.map((group) => group.cluster_id)).toEqual(['A+C']);
    expect(possible[0].places.map((place) => place.id)).not.toContain('B');
  });

  it('labels an exact name with no pins under 0.80 as Maybe', () => {
    const under = lagoonCluster(0.79);
    const atLikely = lagoonCluster(0.91);

    expect(certaintyWord(under)).toBe('maybe');
    expect(isCertainGroup(under)).toBe(false);
    expect(certaintyWord(atLikely)).toBe('likely');
  });

  it('does not certify a group when only the bottleneck edge shares a Google place', () => {
    const groups = possibleGroups([{
      places: [
        googlePlace('A', 'ChIJ_one'),
        googlePlace('B', null),
        googlePlace('C', 'ChIJ_one'),
      ],
      edges: [
        googleEdge('A', 'C', 0.63, true),
        googleEdge('B', 'C', 0.69, false),
        googleEdge('A', 'B', 0.4, false),
      ],
    }]);

    expect(groups.map((group) => group.cluster_id)).toEqual(['A+B+C']);
    const mixed = groups[0] as QueueCluster;
    expect(certaintyWord(mixed)).toBe('possible');
    expect(isCertainGroup(mixed)).toBe(false);

    const pair: QueueCluster = {
      cluster_id: 'A+C',
      avgConfidence: 0.66,
      places: [
        googlePlace('A', 'ChIJ_one'),
        googlePlace('C', 'ChIJ_one'),
      ] as QueueCluster['places'],
      edges: [googleEdge('A', 'C', 0.66, true)],
    };
    expect(certaintyWord(pair)).toBe('same');
    expect(isCertainGroup(pair)).toBe(true);
  });

  it('certifies a group when every spanning-tree edge shares one Google place', () => {
    const groups = possibleGroups([{
      places: [
        googlePlace('A', 'ChIJ_one'),
        googlePlace('B', 'ChIJ_one'),
        googlePlace('C', 'ChIJ_one'),
      ],
      edges: [
        googleEdge('A', 'C', 0.63, true),
        googleEdge('B', 'C', 0.69, true),
      ],
    }]);

    const group = groups[0] as QueueCluster;
    expect(group.cluster_id).toBe('A+B+C');
    expect(certaintyWord(group)).toBe('same');
    expect(isCertainGroup(group)).toBe(true);
  });

  it('unions overlapping certain groups onto one keeper and counts each place once', () => {
    const shared = googlePlace('A', 'ChIJ_one');
    const kept = { ...googlePlace('B', 'ChIJ_one'), description: 'The fuller record' };
    const noted = { ...googlePlace('C', 'ChIJ_one'), notes: 'A note' };
    const review: QueueCluster = {
      cluster_id: 'A+B',
      avgConfidence: 0.98,
      places: [shared, kept] as QueueCluster['places'],
      edges: [googleEdge('A', 'B', 0.98, true)],
    };
    const possible: QueueCluster = {
      cluster_id: 'A+C',
      avgConfidence: 0.66,
      places: [shared, noted] as QueueCluster['places'],
      edges: [googleEdge('A', 'C', 0.66, true)],
    };

    const unions = unionGroupsSharingPlace(certainGroups([review, possible]));
    expect(unions).toHaveLength(1);
    expect(distinctPlaceCount(unions)).toBe(3);
    expect(distinctPlaceCount([review, possible])).toBe(3);
    expect(recommendMergeTarget(unions[0].places)).toBe('B');
  });

  it('keeps a To-review component when only its Possible chord was dismissed', () => {
    const review = reviewCluster(
      ['A', 'B', 'C'],
      [['A', 'B', 0.85], ['B', 'C', 0.75], ['A', 'C', 0.65]],
    );
    const dismissed = new Set(['C:A']);

    const kept = filterDismissedClusters([review], dismissed);
    expect(kept).toHaveLength(1);
    expect(kept[0].places.map((place) => place.id)).toEqual(['A', 'B', 'C']);
    expect(possibleGroups([review], dismissed)).toEqual([]);

    const restored = filterDismissedClusters([review], new Set(['A:B']));
    expect(restored.map((cluster) => cluster.places.map((place) => place.id))).toEqual([['B', 'C']]);
    expect(
      (restored[0].edges ?? [])
        .filter((edge) => edge.included)
        .map((edge) => [edge.a, edge.b].sort().join(':')),
    ).toEqual(['B:C']);
  });

  it('dismisses a Possible group by its weak edges and leaves the review pair', () => {
    const groups = possibleGroups([bandCluster(
      ['A', 'B', 'C'],
      [['A', 'B', 0.85], ['A', 'C', 0.65], ['B', 'C', 0.65]],
    )]);

    expect(groups.map((group) => group.cluster_id)).toEqual(['A+B+C']);
    const keys = dismissPairsForCluster(groups[0] as QueueCluster)
      .map((pair) => [pair.placeId1, pair.placeId2].sort().join(':'))
      .sort();
    expect(keys).toEqual(['A:C', 'B:C']);
  });

  it('dismisses a To-review group by its included edges and leaves the Possible chord', () => {
    const wide = bandCluster(
      ['A', 'B', 'C'],
      [['A', 'B', 0.85], ['B', 'C', 0.75], ['A', 'C', 0.65]],
    );
    const review = reviewCluster(
      ['A', 'B', 'C'],
      [['A', 'B', 0.85], ['B', 'C', 0.75], ['A', 'C', 0.65]],
    ) as QueueCluster;

    const keys = dismissPairsForCluster(review)
      .map((pair) => [pair.placeId1, pair.placeId2].sort().join(':'))
      .sort();
    expect(keys).toEqual(['A:B', 'B:C']);

    const dismissed = new Set(
      dismissPairsForCluster(review).map((pair) => `${pair.placeId1}:${pair.placeId2}`),
    );
    expect(filterDismissedClusters([review], dismissed)).toEqual([]);
    expect(possibleGroups([wide], dismissed).map((group) => group.cluster_id)).toEqual(['A+C']);
  });

  it('uses a stored thumbnail for a queue photo and the full uri when it is absent', async () => {
    await insertPlace({ id: 'plc_thumb', name: 'Thumb' });
    await insertPlace({ id: 'plc_full', name: 'Full' });
    await db.insert(attachments).values([
      {
        id: 'att_thumb',
        placeId: 'plc_thumb',
        type: 'photo',
        uri: '/api/photos/resolve/att_thumb',
        thumbnailUri: '/api/photos/resolve/att_thumb?w=400',
        filename: 'thumb.jpg',
        isPrimary: 1,
        source: 'google_places',
      },
      {
        id: 'att_full',
        placeId: 'plc_full',
        type: 'photo',
        uri: 'https://example.test/full.jpg',
        thumbnailUri: null,
        filename: 'full.jpg',
        isPrimary: 1,
        source: 'upload',
      },
      {
        id: 'att_other',
        placeId: 'plc_full',
        type: 'photo',
        uri: 'https://example.test/other.jpg',
        thumbnailUri: 'https://example.test/other-thumb.jpg',
        filename: 'other.jpg',
        isPrimary: 0,
        source: 'upload',
      },
    ]);

    const stored = await alicePlaces();
    const extras = await loadDuplicateQueueExtras(ALICE.id, [{
      id: 'plc_full+plc_thumb',
      cluster_id: 'plc_full+plc_thumb',
      places: stored.filter((place) => place.id === 'plc_full' || place.id === 'plc_thumb'),
      avgConfidence: 0.9,
      weakestIncludedScore: 0.9,
      edges: [],
      leftOut: [],
      mergedOn: null,
    }], []);

    const byId = new Map(extras.clusters[0].places.map((place) => [place.id, attachedPhotoUrl(place)]));
    expect(byId.get('plc_thumb')).toBe('/api/photos/resolve/att_thumb?w=400');
    expect(byId.get('plc_full')).toBe('https://example.test/full.jpg');
  });
});

function googlePlace(id: string, googlePlaceId: string | null) {
  return {
    id,
    name: id,
    googlePlaceId,
    kind: 'attraction',
    city: 'Lisbon',
    country: 'Portugal',
    coords: null,
    altNames: [] as string[],
  };
}

function googleEdge(a: string, b: string, score: number, sameGoogle: boolean): DuplicateGroupEdge {
  return {
    a,
    b,
    score,
    included: score >= DUPLICATE_PAGE_BAND.possibleMin,
    distanceM: null,
    factors: { name: 0.4, location: 0, kind: 1, city: 1, country: 1 },
    for: [],
    against: [],
    flags: sameGoogle ? ['same Google place'] : [],
  };
}

function reviewCluster(ids: string[], scores: Array<[string, string, number]>) {
  const cluster = bandCluster(ids, scores);
  return {
    ...cluster,
    edges: cluster.edges.map((edge) => ({
      ...edge,
      included: edge.score >= DUPLICATE_PAGE_BAND.reviewMin,
    })),
  };
}

function bandCluster(ids: string[], scores: Array<[string, string, number]>) {
  return {
    places: ids.map((id) => ({ id, name: id })),
    edges: scores.map(([a, b, score]): DuplicateGroupEdge => ({
      a,
      b,
      score,
      included: score >= DUPLICATE_PAGE_BAND.possibleMin,
      distanceM: null,
      factors: { name: 0.5, location: 0, kind: 1, city: 1, country: 1 },
      for: [],
      against: [],
      flags: [],
    })),
  };
}

function attachedPhotoUrl(place: Place): string | null {
  if (!('photoUrl' in place)) return null;
  const url = place.photoUrl;
  return typeof url === 'string' ? url : null;
}

function lagoonPlace(id: string, country: string | null): QueuePlace {
  return createMockPlace({
    id,
    name: 'Blue Lagoon',
    kind: 'attraction',
    city: null,
    country,
    coords: null,
    googlePlaceId: null,
    altNames: [],
  });
}

function lagoonCluster(score: number): QueueCluster {
  return {
    cluster_id: 'lagoon_a+lagoon_b',
    avgConfidence: score,
    places: [
      lagoonPlace('lagoon_a', 'Iceland'),
      lagoonPlace('lagoon_b', null),
    ],
    edges: [{
      a: 'lagoon_a',
      b: 'lagoon_b',
      score,
      included: true,
      distanceM: null,
      factors: { name: 1, location: 0, kind: 1, city: 0, country: 0 },
      for: [],
      against: [],
      flags: [],
    }],
  };
}
