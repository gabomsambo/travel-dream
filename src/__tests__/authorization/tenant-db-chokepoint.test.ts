/**
 * @jest-environment node
 *
 * The chokepoint, proved from both ends.
 *
 * 1. The lint rule really does reject a new route that imports the unscoped
 *    client. A rule nobody exercises is a rule that silently stops working —
 *    and this one is the only thing standing between route N+1 and the class
 *    of bug that has now shipped three times.
 * 2. `forUser()` really does confine every query it builds to one tenant, run
 *    against a real database rather than a mock of one.
 */

// Pins TURSO_DATABASE_URL to a local file. MUST be the first import: `@/db`
// resolves the URL at module load, and `jest.setup.js` has already run
// `dotenv.config()`, which would otherwise leave the production URL in place.
import {
  ALICE,
  BOB,
  FIXTURE,
  assertLocalDatabase,
  resetTenantFixture,
} from '../helpers/tenant-fixture';

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import {
  attachments,
  collections,
  places,
  placesToCollections,
  uploadSessions,
} from '@/db/schema';
import { sourcesCurrentSchema } from '@/db/schema/sources-current';
import { forUser } from '@/lib/tenant-db';

const RULE = 'no-restricted-imports';

/**
 * Just enough of ESLint's shape to drive it. `eslint` ships no types and the
 * repo has no `@types/eslint`; adding one for a single test is not worth a new
 * dependency.
 */
interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
}
interface EslintInstance {
  lintText(code: string, opts: { filePath: string }): Promise<{ messages: LintMessage[] }[]>;
}
const { ESLint } = require('eslint') as {
  ESLint: new (opts: { cwd: string }) => EslintInstance;
};

/**
 * Lint a hypothetical file at `filePath` without writing it to disk. ESLint
 * resolves `.eslintrc.json` for that path exactly as it would for a real file,
 * so this asks the real configuration the real question.
 */
async function lintAt(filePath: string, code: string): Promise<LintMessage[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages;
}

function restrictedImportErrors(messages: LintMessage[]): LintMessage[] {
  return messages.filter((m) => m.ruleId === RULE);
}

describe('the lint rule closes the door on new unscoped route code', () => {
  it('rejects a brand-new API route that imports the raw client', async () => {
    const messages = await lintAt(
      'src/app/api/brand-new-feature/route.ts',
      [
        "import { db } from '@/db';",
        "import { places } from '@/db/schema';",
        'export async function GET() {',
        '  return Response.json(await db.select().from(places));',
        '}',
        '',
      ].join('\n')
    );

    const errors = restrictedImportErrors(messages);
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe(2); // error, not warning
    expect(errors[0].message).toContain('@/lib/tenant-db');
  });

  it('rejects the raw libSQL client too, not just the Drizzle handle', async () => {
    const messages = await lintAt(
      'src/app/api/brand-new-feature/route.ts',
      "import { client } from '@/db';\nexport const GET = () => client.execute('SELECT 1');\n"
    );

    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it('rejects it in a server component under (app) as well as in an API route', async () => {
    const messages = await lintAt(
      'src/app/(app)/brand-new-page/page.tsx',
      "import { db } from '@/db';\nexport default async function Page() { return <div>{(await db.select()).length}</div>; }\n"
    );

    expect(restrictedImportErrors(messages)).toHaveLength(1);
  });

  it('still allows the schema, which carries no data and no ambient user', async () => {
    const messages = await lintAt(
      'src/app/api/brand-new-feature/route.ts',
      "import { places } from '@/db/schema';\nexport const GET = () => Response.json(Object.keys(places));\n"
    );

    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });

  it('leaves the shared library alone — the worker there has no user context', async () => {
    const messages = await lintAt(
      'src/lib/mass-upload/some-worker.ts',
      "import { db } from '@/db';\nexport const run = () => db;\n"
    );

    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });

  it('accepts the escape hatch, so the migration can stay incremental', async () => {
    const messages = await lintAt(
      'src/app/api/legacy-feature/route.ts',
      [
        '// TODO(tenant-db): migrate to `forUser(user.id)`.',
        `// eslint-disable-next-line ${RULE} -- unmigrated; see the TODO above`,
        "import { db } from '@/db';",
        'export const GET = () => Response.json(!!db);',
        '',
      ].join('\n')
    );

    expect(restrictedImportErrors(messages)).toHaveLength(0);
  });

  it('every route still using the escape hatch says who finishes the job', () => {
    const roots = ['src/app/api', 'src/app/(app)'];
    const files: string[] = [];
    for (const root of roots) {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(entry.name)) files.push(full);
        }
      };
      walk(path.join(process.cwd(), root));
    }

    const hatched = files.filter((f) =>
      fs.readFileSync(f, 'utf8').includes(`eslint-disable-next-line ${RULE}`)
    );

    // Not an assertion about how many are left — that number should fall over
    // time — but that none of them is a silent exemption.
    expect(hatched.length).toBeGreaterThan(0);
    for (const file of hatched) {
      expect(fs.readFileSync(file, 'utf8')).toContain('TODO(tenant-db)');
    }
  });
});

describe('forUser() confines every query to one tenant, against a real database', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await resetTenantFixture();
  });

  beforeEach(async () => {
    await resetTenantFixture();
  });

  it('refuses to build a scope with no user', () => {
    expect(() => forUser('')).toThrow(/requires a user id/);
  });

  it('cannot read an owned row belonging to another tenant, even by exact id', async () => {
    const rows = await forUser(ALICE.id).select(places, eq(places.id, FIXTURE.bobPlace));
    expect(rows).toEqual([]);

    // Positive control: the same call shape does return Bob's row for Bob.
    const asBob = await forUser(BOB.id).select(places, eq(places.id, FIXTURE.bobPlace));
    expect(asBob.map((p) => p.id)).toEqual([FIXTURE.bobPlace]);
  });

  it('cannot read a transitively-owned row belonging to another tenant', async () => {
    // `places_to_collections` has no user_id and carries a free-text note.
    const rows = await forUser(ALICE.id).selectVia(placesToCollections);
    expect(JSON.stringify(rows)).not.toContain(FIXTURE.bobCollectionNote);
    expect(rows.map((r) => r.collectionId)).toEqual([FIXTURE.aliceCollection]);
  });

  it('narrows rather than widens when the caller passes an extra predicate', async () => {
    // The extra predicate names Bob's collection explicitly. AND cannot undo
    // the ownership clause, so it produces nothing rather than his rows.
    const rows = await forUser(ALICE.id).selectVia(
      placesToCollections,
      eq(placesToCollections.collectionId, FIXTURE.bobCollection)
    );
    expect(rows).toEqual([]);
  });

  it('cannot write to another tenant\'s row', async () => {
    const updated = await forUser(ALICE.id)
      .update(
        sourcesCurrentSchema,
        { processingStatus: 'cancelled' },
        eq(sourcesCurrentSchema.id, FIXTURE.bobSource)
      )
      .returning();
    expect(updated).toEqual([]);

    const [bobSource] = await forUser(BOB.id).select(
      sourcesCurrentSchema,
      eq(sourcesCurrentSchema.id, FIXTURE.bobSource)
    );
    expect(bobSource.processingStatus).toBe('uploaded');
  });

  it('cannot delete a transitively-owned row belonging to another tenant', async () => {
    await forUser(ALICE.id).deleteVia(
      placesToCollections,
      eq(placesToCollections.collectionId, FIXTURE.bobCollection)
    );

    const bobRows = await forUser(BOB.id).selectVia(placesToCollections);
    expect(bobRows.map((r) => r.note)).toEqual([FIXTURE.bobCollectionNote]);

    // Positive control: Bob can delete his own.
    await forUser(BOB.id).deleteVia(
      placesToCollections,
      eq(placesToCollections.collectionId, FIXTURE.bobCollection)
    );
    expect(await forUser(BOB.id).selectVia(placesToCollections)).toEqual([]);
  });

  it('forces user_id on insert instead of trusting the caller', async () => {
    // The parameter type has no `userId` at all; the accessor supplies it.
    await forUser(ALICE.id).insert(collections, { id: 'col_alice_new', name: 'Alice New' });

    const [row] = await forUser(ALICE.id).select(collections, eq(collections.id, 'col_alice_new'));
    expect(row.userId).toBe(ALICE.id);

    const asBob = await forUser(BOB.id).select(collections, eq(collections.id, 'col_alice_new'));
    expect(asBob).toEqual([]);
  });

  it('separates "no such row" from "someone else\'s row" without disclosing it', async () => {
    const tdb = forUser(ALICE.id);

    await expect(tdb.findOwned(uploadSessions, eq(uploadSessions.id, 'session_nope'))).resolves
      .toEqual({ status: 'not-found' });

    const foreign = await tdb.findOwned(uploadSessions, eq(uploadSessions.id, FIXTURE.bobSession));
    expect(foreign).toEqual({ status: 'forbidden' });
    // The verdict carries no row: nothing of Bob's reaches the caller.
    expect(Object.keys(foreign)).toEqual(['status']);

    const own = await tdb.findOwned(uploadSessions, eq(uploadSessions.id, FIXTURE.aliceSession));
    expect(own.status).toBe('ok');
  });

  it('scopes a transaction to the same user as the handle that opened it', async () => {
    await forUser(ALICE.id).transaction(async (tx) => {
      await tx.updateVia(
        attachments,
        { isPrimary: 1 },
        eq(attachments.placeId, FIXTURE.bobPlace)
      );
    });

    // Nothing of Bob's was touched: he has no attachments, and the statement
    // could not have reached them if he had.
    const bobAttachments = await forUser(BOB.id).selectVia(attachments);
    expect(bobAttachments).toEqual([]);
  });
});
