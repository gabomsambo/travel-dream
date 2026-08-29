# Phase B runbook — reconcile production's migration ledger to the baseline

**Status: DONE — executed against production. Do not run it again.**
The dangerous statement is the `DELETE FROM __drizzle_migrations` in **§5, "Step 3 — Reconcile
the ledger"**. Re-running it would *un-record* migrations that are already applied, and the next
`db:migrate` would then replay them and die on `duplicate column name`. (§4 is read-only and safe
to re-run. **§6 is not**: its `SELECT` is read-only, but the step then runs `npm run db:migrate`
against production — a write, which is a no-op today only because everything is applied. Its
"expect exactly 1 row" is likewise historical; the ledger now holds one row per journal entry,
three as of this branch, so it is not a live pass criterion.)

**§7's rollback is now obsolete for the same reason.** It runs the identical `DELETE` and then
restores the 15 pre-baseline rows; after that the next `db:migrate` replays the baseline and dies
on `table ... already exists`. It was written to undo the reconciliation on the day it was done.
Do not use it now.

The production state this rests on was **measured read-only against production by a separate
investigation** — the `td-prod-schema-drift` scout report, §3.1 and §3.3 — not by this runbook and
not by the PR that added this status block, neither of which had production access. That
investigation found `__drizzle_migrations` holding the baseline row plus one row per migration
applied since, and the 15 pre-baseline rows preserved in `__drizzle_migrations_prebaseline_backup`.
It also judged Phase B correct and complete.

This document is kept as the reference for how the reconciliation was done and why. Everything
below describes it in its original future tense.

**Nothing in this runbook was run against production while writing it.** Every claim below
was verified against throwaway local SQLite files.

---

## 1. Why this is needed

The baseline PR replaced 15 migration files with a single `src/db/migrations/0000_baseline.sql`
that reproduces the production schema exactly. That fixed *fresh* databases — new dev setups,
Docker, preview branches, disaster-recovery restores.

It does **not** fix production, because production's `__drizzle_migrations` ledger still
records the 15 old migrations. The repo now offers one migration the ledger has never seen.

`drizzle-kit migrate` (the `turso` dialect delegates straight to `drizzle-orm/libsql/migrator`)
decides what to apply purely by timestamp:

```js
// node_modules/drizzle-orm/libsql/migrator.js
const lastDbMigration = /* SELECT ... ORDER BY created_at DESC LIMIT 1 */;
if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) { /* apply it */ }
```

Production's newest ledger row is `created_at = 1777154624696` (2026-04-25). The baseline's
`when` is newer. So the next `npm run db:migrate` against production would replay the baseline
in full and abort on the first statement:

```
SQLITE_ERROR: table `accounts` already exists
```

The whole run is atomic, so this failure leaves nothing behind. `migrate()` collects every
statement — the migration SQL *and* its ledger INSERTs — and hands the lot to
`db.session.migrate()`, which `@libsql/client` sends as a single batch:
`PRAGMA foreign_keys=off; BEGIN; ...; COMMIT`, with each step conditioned on the previous one
succeeding and a `ROLLBACK` step conditioned on the `COMMIT` not succeeding
(`node_modules/@libsql/client/lib-esm/hrana.js`, `executeHranaBatch`). A statement that fails
mid-run rolls the whole run back; there is no partial replay.

*Verified on the installed versions (drizzle-orm 0.45.2, @libsql/client 0.17.4) both by reading
that code path and by inducing a mid-run failure: with a conflicting column pre-seeded so the
last migration failed, the earlier migration's `ADD COLUMN`s and its ledger row were both absent
afterwards and the ledger was unchanged.* This corrects an earlier claim here that "the migrator
has no transaction wrapping the whole run, so a partial replay is possible" — that was wrong, and
it made `db:migrate` look riskier than it is.

Atomicity is not permission to skip the reconciliation, though: the run below still *fails*, and
production stays unmigrated until it is fixed.
**Do not run `npm run db:migrate` against production until step 4 of this runbook is done.**

This failure and its fix are both reproduced locally by:

```bash
node scripts/rehearse-ledger-reconciliation.mjs
```

which simulates production (baseline-era schema + the 15 old ledger rows) in a temp file and
asserts that (a) migrating without reconciliation fails, (b) migrating after reconciliation
succeeds and applies exactly the journal entries newer than the baseline, and (c) a second run
is a clean no-op. Run it first; it takes seconds and touches nothing.

---

## 2. Preconditions

- [ ] The baseline PR is **merged to `main`**.
- [ ] You have `turso` CLI authenticated against the production database.
- [ ] You are working from a checkout of merged `main` (the hash you insert must come from the
      merged `0000_baseline.sql`, not a local edit).
- [ ] A maintenance window / low-traffic period. The reconciliation itself is two statements
      against a metadata table and does not touch app tables, but a backup restore would.
- [ ] `node scripts/rehearse-ledger-reconciliation.mjs` passes.

---

## 3. Step 1 — Take a full backup (mandatory)

Do not skip this even though the change is metadata-only.

```bash
# Full logical dump (schema + data) to a local file.
turso db shell <production-db-name> ".dump" > backup-$(date +%Y%m%d-%H%M%S).sql

# Sanity-check the dump is complete and non-empty before continuing.
tail -5 backup-*.sql          # should end with COMMIT;
grep -c "INSERT INTO" backup-*.sql
```

Additionally (recommended), take a server-side point-in-time fork, which is faster to restore
than replaying a dump:

```bash
turso db create travel-dream-prebaseline-backup --from-db <production-db-name>
```

Record here before proceeding:

- Backup file: `________________________`
- Fork database name: `________________________`
- Timestamp (UTC): `________________________`

---

## 4. Step 2 — Confirm production still matches the reference (read-only)

The baseline was built against `docs/db/prod-schema-reference.sql`, captured 2026-07-24. If
production drifted since then, **stop** and re-baseline instead of reconciling.

```bash
# Read-only. Dump production's schema (no data) and compare against the reference.
turso db shell <production-db-name> ".schema" > /tmp/prod-now.sql

node scripts/verify-baseline-schema.mjs /tmp/prod-now.sql src/db/migrations
```

Expected output:

```
PASS — a fresh database from the journal is schema-equivalent to the reference.
```

with exactly one accepted equivalence (`users.email`: production spells the unique constraint
inline, drizzle spells it as a named unique index; both reject duplicate emails).

Also confirm the ledger is in the state this runbook assumes:

```sql
-- read-only
SELECT COUNT(*) AS rows, MAX(created_at) AS newest FROM __drizzle_migrations;
-- expect: rows = 15, newest = 1777154624696
```

If `rows` is not 15 or `newest` is not 1777154624696, **stop** — someone has run a migration
since this runbook was written. Re-derive the situation before continuing.

---

## 5. Step 3 — Reconcile the ledger

Derive the two values from the merged baseline file (do not copy them from memory — if the
baseline file ever changes, so do these):

```bash
node -e "
const c=require('node:crypto'),fs=require('node:fs');
const j=require('./src/db/migrations/meta/_journal.json');
const tag=j.entries[0].tag;
const sql=fs.readFileSync('src/db/migrations/'+tag+'.sql').toString();
console.log('tag  =', tag);
console.log('hash =', c.createHash('sha256').update(sql).digest('hex'));
console.log('when =', j.entries[0].when);
"
```

As of this PR the values are:

| field | value |
|-------|-------|
| tag   | `0000_baseline` |
| hash  | `79edbd006b7d71d49770a16b0120278464aa3aba672806e6202b38954f86d694` |
| when  | `1784922906035` |

Then, in the production shell, replace the 15 old rows with the single baseline row:

```sql
BEGIN;

-- Keep a copy of the old ledger in case we need to inspect or restore it.
CREATE TABLE __drizzle_migrations_prebaseline_backup AS
  SELECT * FROM __drizzle_migrations;

DELETE FROM __drizzle_migrations;

INSERT INTO __drizzle_migrations ("hash", "created_at")
VALUES (
  '79edbd006b7d71d49770a16b0120278464aa3aba672806e6202b38954f86d694',
  1784922906035
);

COMMIT;
```

> Use the values printed by the command above if they differ from the table — the printed
> values are authoritative.

Note this only ever touches `__drizzle_migrations`. No application table is read or written.

---

## 6. Step 4 — Verify

```sql
-- read-only
SELECT COUNT(*) AS rows, hash, created_at FROM __drizzle_migrations;
-- expect exactly 1 row, hash + created_at matching the values above
```

Then confirm the migrator is now a no-op:

```bash
npm run db:migrate
```

Expected: it completes immediately having applied nothing. If any migrations have landed in
the repo *after* the baseline (e.g. `0001_*`), this step correctly applies those and only
those — that is the desired behaviour, not a problem.

Finally, smoke-test the app:

- [ ] Sign in works (touches `users` / `accounts` / `sessions`).
- [ ] Inbox and library load (touches `places`, `sources`).
- [ ] Creating a place and a collection succeeds (write path, nullable `user_id`).

---

## 7. Rollback

> **Obsolete — do not run this now.** It was the same-day undo for the reconciliation. Migrations
> have been applied since, so restoring the pre-baseline ledger would make the next `db:migrate`
> replay the baseline and fail on `table ... already exists`. See the status block at the top.

The reconciliation is metadata-only and reversible without touching app data:

```sql
BEGIN;
DELETE FROM __drizzle_migrations;
INSERT INTO __drizzle_migrations ("hash", "created_at")
  SELECT hash, created_at FROM __drizzle_migrations_prebaseline_backup;
COMMIT;
```

Restoring app data (only if something else went wrong):

```bash
# From the point-in-time fork — promote it, or dump-and-restore from the fork.
# From the logical dump:
turso db create travel-dream-restore --from-file backup-<timestamp>.sql
```

Once the reconciliation has been verified and left alone for a release cycle, drop the
leftover backup table:

```sql
DROP TABLE __drizzle_migrations_prebaseline_backup;
```

---

## 8. After Phase B

These were deliberately left out of the baseline so that it matches production exactly. They
become ordinary migrations once the ledger is reconciled:

- Rename `merge_logs.undon_at` → `undone_at` (the typo is preserved in the baseline on purpose).
- Add the missing foreign keys / `ON DELETE` action on `dismissed_duplicates.user_id`
  (production has a plain `REFERENCES users(id)`; the baseline mirrors that).
- Decide whether `user_id` should become `NOT NULL`. Production has zero nulls, so a
  backfill is not required — but the app still writes nullable, so this needs a code change
  in the same migration.

## 9. Keeping drift from coming back

This section is the standing rule set for anyone — human or agent — changing the schema.

- Schema changes go through Drizzle, always: edit `src/db/schema/**`, then
  `npm run db:generate` to produce a migration, then `npm run db:migrate` to apply it.
- Never run `drizzle-kit push` (`npm run db:push`) against a shared database. It rebuilds
  tables to match code without writing a migration file — the original cause of this drift.
  The `apply-schema.sh` helper that piped a blind "Yes" into it has been deleted.
- Never write DDL to the database outside Drizzle. The scripts that used to do this are
  parked in `scripts/archive/` with a README explaining why not to run them.
- `merge_logs.undon_at` is misspelled in production and the schema mirrors it **on purpose**.
  Do not "fix" it in passing; it is a separate migration (see section 8).
- `node scripts/verify-baseline-schema.mjs` is the drift check: it replays the journal into a
  throwaway SQLite file and compares it against the reference. `drizzle-kit generate` cannot
  catch this class of bug on its own, because it only compares schema code against the
  drizzle snapshot — the `.sql` files can disagree with both while generate stays silent.
