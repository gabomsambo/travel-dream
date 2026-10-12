/**
 * @jest-environment node
 *
 * Custom collection covers store an attachment URI. Credit has to come from
 * that attachment, scoped to the caller, including Google resolve paths.
 */
import {
  ALICE,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import { collectionCoverForCard, getCreditsForCoverUrls } from '@/lib/library-adapters';
import type { AttributionMeta } from '@/db/schema/attachments';

const PEXELS_URL = 'https://images.pexels.com/photos/123/photo.jpeg';
const BOB_PEXELS_URL = 'https://images.pexels.com/photos/999/bob.jpeg';
const GOOGLE_ID = 'att_alice_google';
const GOOGLE_URI = `/api/photos/resolve/${GOOGLE_ID}`;
const GOOGLE_THUMB = `${GOOGLE_URI}?w=400`;
const UPLOAD_URL = 'https://store.public.blob.vercel-storage.com/alice-upload.jpg';
const UNKNOWN_BLOB = 'https://store.public.blob.vercel-storage.com/not-an-attachment.jpg';

const pexelsAttribution: AttributionMeta = {
  kind: 'pexels',
  photographer: 'Ada Lovelace',
  photographerUrl: 'https://www.pexels.com/@ada',
  photoUrl: 'https://www.pexels.com/photo/123',
};

async function insertAttachment(row: {
  id: string;
  placeId: string;
  uri: string;
  thumbnailUri?: string | null;
  source: string;
  attribution: unknown;
}) {
  const { client } = require('@/db') as {
    client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> };
  };
  await client.execute({
    sql: `INSERT INTO attachments
            (id, place_id, type, uri, thumbnail_uri, filename, is_primary, source, attribution, created_at)
          VALUES (?, ?, 'photo', ?, ?, ?, 0, ?, ?, ?)`,
    args: [
      row.id,
      row.placeId,
      row.uri,
      row.thumbnailUri ?? null,
      `${row.id}.jpg`,
      row.source,
      row.attribution === null ? null : JSON.stringify(row.attribution),
      new Date().toISOString(),
    ],
  });
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
  await insertAttachment({
    id: 'att_alice_pexels',
    placeId: FIXTURE.alicePlace,
    uri: PEXELS_URL,
    source: 'pexels',
    attribution: pexelsAttribution,
  });
  await insertAttachment({
    id: GOOGLE_ID,
    placeId: FIXTURE.alicePlace,
    uri: GOOGLE_URI,
    thumbnailUri: GOOGLE_THUMB,
    source: 'google_places',
    attribution: {
      kind: 'google_places',
      authorAttributions: [{ displayName: 'Sam', uri: 'https://maps.google.com/authors/sam' }],
    },
  });
  await insertAttachment({
    id: 'att_alice_upload',
    placeId: FIXTURE.alicePlace,
    uri: UPLOAD_URL,
    source: 'upload',
    attribution: { kind: 'upload' },
  });
  await insertAttachment({
    id: 'att_bob_pexels',
    placeId: FIXTURE.bobPlace,
    uri: BOB_PEXELS_URL,
    source: 'pexels',
    attribution: {
      kind: 'pexels',
      photographer: 'Bob',
      photographerUrl: 'https://www.pexels.com/@bob',
      photoUrl: 'https://www.pexels.com/photo/999',
    },
  });
});

describe('collectionCoverForCard', () => {
  const fallbackCredit: AttributionMeta = pexelsAttribution;

  it('keeps a licensed custom cover credit and still sends the fallback photo', () => {
    const google: AttributionMeta = {
      kind: 'google_places',
      authorAttributions: [{ displayName: 'Sam', uri: 'https://maps.google.com/authors/sam' }],
    };
    const payload = collectionCoverForCard(
      GOOGLE_URI,
      {
        coverUrl: PEXELS_URL,
        coverAttribution: fallbackCredit,
        coverSource: 'pexels',
      },
      { attribution: google, source: 'google_places' },
    );

    expect(payload.coverAttribution).toEqual(google);
    expect(payload.coverSource).toBe('google_places');
    expect(payload.places).toEqual([{
      coverUrl: PEXELS_URL,
      coverAttribution: fallbackCredit,
      coverSource: 'pexels',
    }]);
  });

  it('omits credit for a plain upload and still sends the fallback photo', () => {
    const payload = collectionCoverForCard(UPLOAD_URL, {
      coverUrl: PEXELS_URL,
      coverAttribution: fallbackCredit,
      coverSource: 'pexels',
    }, undefined);

    expect(payload.coverAttribution).toBeNull();
    expect(payload.coverSource).toBeNull();
    expect(payload.places?.[0]?.coverUrl).toBe(PEXELS_URL);
    expect(payload.places?.[0]?.coverAttribution).toEqual(fallbackCredit);
  });
});

describe('getCreditsForCoverUrls', () => {
  it('resolves a Pexels cover, a Google resolve path, and an upload, and skips unknown blobs', async () => {
    const credits = await getCreditsForCoverUrls(
      [PEXELS_URL, GOOGLE_THUMB, UPLOAD_URL, UNKNOWN_BLOB, BOB_PEXELS_URL],
      ALICE.id,
    );

    expect(credits.get(PEXELS_URL)).toEqual({
      attribution: pexelsAttribution,
      source: 'pexels',
    });
    expect(credits.get(GOOGLE_THUMB)).toMatchObject({
      source: 'google_places',
      attribution: {
        kind: 'google_places',
        authorAttributions: [{ displayName: 'Sam', uri: 'https://maps.google.com/authors/sam' }],
      },
    });
    expect(credits.get(UPLOAD_URL)).toMatchObject({
      source: 'upload',
      attribution: { kind: 'upload' },
    });
    expect(credits.has(UNKNOWN_BLOB)).toBe(false);
    expect(credits.has(BOB_PEXELS_URL)).toBe(false);
  });
});
