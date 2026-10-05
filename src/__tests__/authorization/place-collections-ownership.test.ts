/**
 * @jest-environment node
 *
 * Cross-tenant test for the place page's two new loaders: `getCollectionsForPlace`
 * (the trips shown in "Your plan") and `getExplorePlacesInCity` (the "Also in
 * {city}" rail). Both read derived data — collection membership and same-city
 * neighbours — so an unscoped query would hand one user another's trip names or
 * merge two same-named cities across tenants.
 *
 * Runs against a real database; the fixture must be imported first (see
 * tenant-fixture.ts for why).
 */
import { ALICE, BOB, FIXTURE, assertLocalDatabase, resetTenantFixture } from '../helpers/tenant-fixture';

import { getCollectionsForPlace } from '@/lib/db-queries';
import { getExplorePlacesInCity } from '@/lib/explore/queries';

async function exec(sql: string, args: unknown[]): Promise<void> {
  const { client } = require('@/db') as { client: { execute: (q: { sql: string; args: unknown[] }) => Promise<unknown> } };
  await client.execute({ sql, args });
}

beforeAll(async () => {
  assertLocalDatabase();
  await resetTenantFixture();
  const now = new Date().toISOString();
  // Alice keeps two saves in Paris, France; Bob keeps one in a same-named Paris, USA.
  for (const [id, userId, name, kind] of [
    ['plc_alice_louvre', ALICE.id, 'Alice Louvre', 'museum'],
    ['plc_alice_eiffel', ALICE.id, 'Alice Eiffel', 'landmark'],
  ]) {
    await exec(
      `INSERT INTO places (id,user_id,name,kind,status,city,country,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, userId, name, kind, 'library', 'Paris', 'France', now, now]
    );
  }
  await exec(
    `INSERT INTO places (id,user_id,name,kind,status,city,country,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    ['plc_bob_paris_us', BOB.id, 'Bob Paris Texas', 'cafe', 'library', 'Paris', 'United States', now, now]
  );
  // Two of Alice's Paris saves with no country recorded.
  for (const id of ['plc_alice_nocountry_a', 'plc_alice_nocountry_b']) {
    await exec(
      `INSERT INTO places (id,user_id,name,kind,status,city,country,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, ALICE.id, id, 'cafe', 'library', 'Paris', null, now, now]
    );
  }
});

describe('getCollectionsForPlace', () => {
  it("returns the caller's own trips for a place", async () => {
    const alice = await getCollectionsForPlace(FIXTURE.alicePlace, ALICE.id);
    expect(alice.map((c) => c.id)).toEqual([FIXTURE.aliceCollection]);

    const bob = await getCollectionsForPlace(FIXTURE.bobPlace, BOB.id);
    expect(bob.map((c) => c.id)).toEqual([FIXTURE.bobCollection]);
  });

  it("never leaks another tenant's collection membership", async () => {
    expect(await getCollectionsForPlace(FIXTURE.bobPlace, ALICE.id)).toEqual([]);
    expect(await getCollectionsForPlace(FIXTURE.alicePlace, BOB.id)).toEqual([]);
  });
});

describe('getExplorePlacesInCity', () => {
  it("returns the caller's other places in the city, excluding the current place", async () => {
    const alice = await getExplorePlacesInCity(ALICE.id, 'Paris', 'France', 'plc_alice_louvre');
    expect(alice.map((p) => p.id)).toEqual(['plc_alice_eiffel']);
  });

  it('does not merge a same-named city in another country, or leak another tenant', async () => {
    const alice = await getExplorePlacesInCity(ALICE.id, 'Paris', 'France', 'plc_alice_louvre');
    expect(alice.map((p) => p.id)).not.toContain('plc_bob_paris_us');

    // Bob's "Paris" is a different country; Alice's French Paris is invisible to him.
    const bob = await getExplorePlacesInCity(BOB.id, 'Paris', 'United States', 'plc_bob_paris_us');
    expect(bob).toEqual([]);
    const bobOther = await getExplorePlacesInCity(BOB.id, 'Paris', 'United States', 'plc_bob_secret');
    expect(bobOther.map((p) => p.id)).toEqual(['plc_bob_paris_us']);
  });

  it('with no country, only matches other places with no country', async () => {
    const alice = await getExplorePlacesInCity(ALICE.id, 'Paris', null, 'plc_alice_nocountry_a');
    expect(alice.map((p) => p.id)).toEqual(['plc_alice_nocountry_b']);

    // And a place that has a country never picks up the country-less ones.
    const french = await getExplorePlacesInCity(ALICE.id, 'Paris', 'France', 'plc_alice_louvre');
    expect(french.map((p) => p.id)).toEqual(['plc_alice_eiffel']);
  });
});
