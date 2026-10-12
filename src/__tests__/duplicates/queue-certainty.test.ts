/**
 * @jest-environment node
 *
 * Certainty words, tab membership, the Certain-only merge set, and the empty
 * To-review copy, scored from places stored in a local SQLite file.
 * The fixture import must stay first so `@/db` never opens a remote database.
 */
import {
  ALICE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import { db } from '@/db';
import { mergeLogs, places } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  batchDetectDuplicates,
  findDuplicateClusters,
  DEFAULT_DETECTION_CONFIG,
} from '@/lib/duplicate-detection';
import {
  certaintyWord,
  certainGroups,
  emptyReviewCopy,
  groupsOutsideReview,
  isCertainGroup,
  queueContextLine,
  DUPLICATE_PAGE_BAND,
  type QueueCluster,
} from '@/lib/duplicate-certainty';
import { loadDuplicateQueueExtras } from '@/lib/duplicate-queue-data';
import type { Place } from '@/types/database';

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
    const possible = groupsOutsideReview(wide, review);

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

    const places = await alicePlaces();
    const detected = await batchDetectDuplicates(places, {
      ...DEFAULT_DETECTION_CONFIG,
      minConfidenceScore: DUPLICATE_PAGE_BAND.possibleMin,
    });
    const review = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.reviewMin);
    const wide = findDuplicateClusters(detected, 2, DUPLICATE_PAGE_BAND.possibleMin);
    const possible = groupsOutsideReview(wide, review);
    expect(review.find((cluster) => cluster.places.some((place) => place.id === 'plc_fushimi_a'))).toBeUndefined();
    expect(possible.some((cluster) => cluster.places.some((place) => place.id === 'plc_fushimi_a'))).toBe(true);

    const extras = await loadDuplicateQueueExtras(
      ALICE.id,
      places.map((place) => place.id),
      [],
      [],
    );
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
  });
});
