/** @jest-environment node */
import {
  ALICE,
  BOB,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import { getInboxLinkItems } from '@/lib/inbox-link-items';

type Exec = (query: { sql: string; args: unknown[] }) => Promise<unknown>;
function execute(sql: string, args: unknown[] = []): Promise<unknown> {
  const { client } = require('@/db') as { client: { execute: Exec } };
  return client.execute({ sql, args });
}

beforeAll(() => assertLocalDatabase());

beforeEach(async () => {
  await resetTenantFixture();
  const now = new Date().toISOString();
  for (const [id, userId, url, name] of [
    ['src_alice_social', ALICE.id, 'https://www.instagram.com/p/C8abcDEFghi/', 'Alice saved cafe'],
    ['src_bob_social', BOB.id, 'https://www.instagram.com/p/C8abcDEFghi/', 'Bob private cafe'],
  ]) {
    await execute(
      `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
       VALUES (?,?, 'url', ?, 'Caption', 'completed', ?, ?, ?)`,
      [id, userId, url, JSON.stringify({ platform: 'instagram', title: name, link: {
        originalUrl: url,
        canonicalUrl: url,
        platform: 'instagram',
        kind: 'instagram-post',
        needsResolution: false,
        resolution: { status: 'not-needed' },
        captionText: 'Hidden place in Lisbon',
        providers: [],
      } }), now, now],
    );
  }
  await execute('INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)', ['src_alice_social', 'plc_alice']);
  await execute('INSERT INTO sources_to_places (source_id,place_id) VALUES (?,?)', ['src_bob_social', 'plc_bob_secret']);
});

it('returns only the signed-in user link and its independently scoped places', async () => {
  const rows = await getInboxLinkItems(ALICE.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'src_alice_social',
    title: 'Alice saved cafe',
    hasHelpfulContext: true,
    places: [{ id: 'plc_alice', name: 'Alice Cafe', status: 'library' }],
  });
  expect(JSON.stringify(rows)).not.toContain('Bob');
});

it('keeps fallback guidance visible when the TikTok reader is switched off', async () => {
  const url = 'https://www.tiktok.com/@alicecreator/video/7694185850497666335';
  await execute(
    `INSERT INTO sources (id,user_id,type,uri,ocr_text,processing_status,meta,created_at,updated_at)
     VALUES (?,?, 'url', ?, '', 'queued', ?, ?, ?)`,
    ['src_alice_tiktok_off', ALICE.id, url, JSON.stringify({ link: {
      originalUrl: url,
      canonicalUrl: url,
      platform: 'tiktok',
      kind: 'tiktok-video',
      handle: 'alicecreator',
      postId: '7694185850497666335',
      needsResolution: false,
      resolution: { status: 'not-needed' },
      details: { title: 'A Lisbon video' },
      providers: [{ provider: 'tiktok-page', status: 'empty', reason: 'disabled', fetchedAt: new Date().toISOString() }],
    } }), new Date().toISOString(), new Date().toISOString()],
  );

  const rows = await getInboxLinkItems(ALICE.id);
  const item = rows.find((row) => row.id === 'src_alice_tiktok_off');
  expect(item).toMatchObject({ hasHelpfulContext: true, readerMessage: "Couldn't read TikTok." });
});
