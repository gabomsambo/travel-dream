# Phase B runbook — reconcile production's migration ledger to the baseline

**Status:** not yet executed. This document describes work to be run against **production**
by a human (or firstmate with the captain's approval), *after* the baseline PR has merged.

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

The migrator has no transaction wrapping the whole run, so a partial replay is possible.
**Do not run `npm run db:migrate` against production until step 4 of this runbook is done.**

This failure and its fix are both reproduced locally by:

```bash
node scripts/rehearse-ledger-reconciliation.mjs
```

which simulates production (real schema + the 15 old ledger rows) in a temp file and asserts
that (a) migrating without reconciliation fails, and (b) migrating after reconciliation is a
clean no-op. Run it first; it takes seconds and touches nothing.

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

- Never run `drizzle-kit push` (`npm run db:push`) against a shared database. It rebuilds
  tables to match code without writing a migration file — the original cause of this drift.
  The `apply-schema.sh` helper that piped a blind "Yes" into it has been deleted.
- Never write DDL to the database outside Drizzle. The scripts that used to do this are
  parked in `scripts/archive/` with a README explaining why not to run them.
- `node scripts/verify-baseline-schema.mjs` is the drift check: it replays the journal into a
  throwaway SQLite file and compares it against the reference. `drizzle-kit generate` cannot
  catch this class of bug on its own, because it only compares schema code against the
  drizzle snapshot — the `.sql` files can disagree with both while generate stays silent.
