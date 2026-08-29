# Migration safety — what stops an unapplied migration reaching production

## What went wrong (2026-08-29)

PR #30 added two Drizzle migrations. CI was green, it merged, it deployed, and **nothing
applied the migrations to production**. For roughly an hour production returned HTTP 500 on
every screenshot upload, every place-detail page, `/review`, and the 5-minute safety-net cron.
Firstmate applied the migrations by hand and production recovered.

The root cause is not any one of those routes. It is that **nothing connected "a migration file
landed" to "the database was migrated"**. `tsc`, `jest` and `next build` all pass happily
against a database that is missing columns — none of them touch the database at all.

## What is in place now

### `node scripts/verify-baseline-schema.mjs` — runs in CI on every PR

The `schema-drift` job in `.github/workflows/ci.yml`. It replays the migration journal into a
throwaway local SQLite file and compares the result against `docs/db/prod-schema-reference.sql`,
the checked-in description of production's schema. If a migration lands without that reference
being refreshed, the job fails and its output names the fix.

It needs no credentials, no network and no `node_modules` — only a Node with `node:sqlite`
available *unflagged*, since the documented invocation passes no flags. The module does not exist
at all before Node 22.5 *(measured: Node 20.20.2 fails with `ERR_UNKNOWN_BUILTIN_MODULE`)*, and on
current Node 22 and 24 it is on by default *(measured: 22.23.1 and 24.13.0 both spell the option
`--no-experimental-sqlite`, and a bare `require('node:sqlite')` succeeds on 22.23.1)*; on early
22.x it was behind `--experimental-sqlite`, so a sufficiently old 22.x may still need that flag
*(reasoned from that option spelling, not reproduced — no such build is installed here)*. That is
why it is a separate job: the main `ci` job pins Node 20, where the script cannot load.

**Know what this does and does not prove.** It proves the journal and the reference agree. It
does *not* read production, so it cannot prove production was migrated. Its real job is to make
a migration impossible to land **silently**: shipping one now forces someone to go and update
the production reference, which is a thing you can only honestly do after looking at production.

That leaves one way to defeat it: regenerate the reference from the migrations without applying
them anywhere. The failure message says not to; nothing mechanically prevents it.

**It is advisory, not blocking, as of the PR that added it.** A red `schema-drift` job does not
stop a merge today: `main` has no branch protection, and the only ruleset (`TabidreamsV1`) declares
just `deletion` and `non_fast_forward` — no required status checks. *(Measured read-only via the
GitHub API while reviewing that PR.)* That is equally true of the `ci` job, and is why PR #30 could
merge at all. Enabling required status checks on `main` for the `ci` and `schema-drift` contexts is
authorised and happens right after that PR merges — separately, because a required check that has
never run on `main` would block every merge including the one that introduces it. Until that is
done, this guard tells you; it does not stop you.

The script has two modes, and it prints the remediation matching the one you invoked:

- `node scripts/verify-baseline-schema.mjs` (CI, the default) compares the journal against the
  checked-in reference. A diff means a migration landed that the reference does not describe.
- `node scripts/verify-baseline-schema.mjs <live-dump.sql> src/db/migrations`
  (`docs/PHASE_B_RUNBOOK.md` §4) compares the journal against a read-only `.schema` dump of a live
  database. Here the **direction of a diff does not decide the fix**, and the message deliberately
  does not pretend it does. Unapplied migrations and real drift produce overlapping shapes:
  `EXTRA IN FRESH` fits an unapplied *additive* migration, `MISSING FROM FRESH` fits both drift and
  an unapplied *destructive* one (`DROP COLUMN` / `DROP TABLE`, or a drizzle-kit table rebuild that
  removes a column), `MISMATCH` fits an unapplied column *alteration* — drizzle-kit cannot `ALTER` a
  SQLite column in place and renders it as a table rebuild that redefines the column — and one
  unapplied rename emits diffs in both directions at once. So the script routes the verdict through
  the ledger instead, as a precondition plus a three-way comparison (it prints the journal values it
  is comparing against):
  - **Precondition** — `SELECT COUNT(*) FROM __drizzle_migrations WHERE created_at = <baseline
    when>`. A count of 0 means that ledger does not record *this checkout's* baseline entry, which
    on its own does not say why, so `MAX(created_at)` separates the causes: NULL (or no such table)
    ⇒ no recorded history at all, which the dump splits — no application tables ⇒ a genuinely fresh
    database, migrate normally; application tables present ⇒ a schema built outside the migrations
    (a `drizzle-kit push`, or a restore that dropped the ledger), where `db:migrate` would replay
    the baseline and die on `table ... already exists`, so reconcile the ledger instead — and if
    the ledger *table* is absent rather than merely empty, §5's block cannot run as written
    (its backup and `DELETE` both read `__drizzle_migrations`), so create it with drizzle's own
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL,
    created_at numeric)` and then record one row per journal entry the schema already contains —
    §5's `INSERT` writes the baseline row alone, which is correct only for a database at the
    baseline, and under-recording makes the next `db:migrate` replay migrations whose effects are
    already there; MAX
    **older** than the baseline `when` ⇒ the ledger
    genuinely predates the baseline, where `db:migrate` would replay `0000_baseline.sql` and die on
    `table ... already exists`, so the recovery is the ledger reconciliation in
    `docs/PHASE_B_RUNBOOK.md` §5; MAX **newer** ⇒ the database has moved past this checkout (it was
    re-baselined, or the checkout is behind), where reconciling would overwrite a correct ledger
    with a stale baseline row, so check out the matching commit first.
  - Otherwise compare the journal's newest `when` against `SELECT MAX(created_at) FROM
    __drizzle_migrations`. Journal **newer** ⇒ merged-but-unapplied whatever the diffs look like, so
    `npm run db:migrate` (the PR #30 shape). **Level**, with the schemas still differing ⇒ genuine
    drift, so stop and re-baseline rather than `db:migrate`. Ledger **newer** ⇒ that database has
    applied migrations this checkout does not contain, i.e. the working tree is behind the database
    and the diffs are not evidence of drift; `db:migrate` is a harmless no-op there (the migrator
    applies only entries newer than the ledger) but re-baselining would discard live work, so check
    out the commit whose journal matches that database and re-run first.

  drizzle records each applied migration's `created_at` as its journal entry's `when`, which is what
  makes those comparisons well-defined. The per-direction listing is printed as evidence subordinate
  to that check, not as an instruction. Either way the checked-in reference is not the file being
  compared, so do not edit it to make the run go green, and rule out a stale or truncated dump first
  — a truncated dump looks exactly like an unapplied migration. Known bound on the **level** verdict:
  a journal entry whose `when` is older than the ledger's newest `created_at` and was never applied
  produces the same signature as drift — reachable when two migrations are generated on parallel
  branches and merged out of generation order, since the migrator only applies entries newer than
  the ledger — so that verdict's cause can be wrong even though its action (stop and investigate)
  is right either way *(reasoned from the migrator's comparison, not reproduced)*.

### `scripts/rehearse-ledger-reconciliation.mjs` — run by nobody automatically

The rehearsal that models the ledger reconciliation is not in CI. Its pass criteria hardcoded
`finalLedger.length === 1`, which silently rotted the moment PR #30 added two migrations, and
nothing stops that recurring: `CLAUDE.md` records the "must not hardcode counts" rule, but no job
enforces it. Wiring it into `schema-drift` would cost that job its deliberate no-`npm ci`,
no-network hermeticity, since unlike the guard the rehearsal imports `@libsql/client` and
`drizzle-orm`. Stated as a known limit rather than a proposal; a separate job with `npm ci` is the
follow-up if the rot proves likely to recur.

## The gap that is still open — a deploy-time applied-migrations guard

The check that would close it completely: assert, at deploy time, that the journal's newest
`when` is `<=` the database's newest `__drizzle_migrations.created_at`, and refuse the deploy
otherwise. That turns "silently broken production" into "the deploy stops".

**Deliberately not built yet**, because it can only be built responsibly with production
credentials in hand:

- It must read the live ledger, so it needs `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` wired into
  whatever runs it (a Vercel build step, or a CI job with production secrets).
- Its whole value is that it *blocks a deploy*. An untested blocking gate is a new outage of its
  own: a wrong comparison, a missing secret, or an unreachable database and every deploy —
  including the rollback you need — fails closed.

Sketch for whoever picks it up:

- A `scripts/verify-migrations-applied.mjs` reading the two env vars, comparing
  `max(_journal.json entries[].when)` against `SELECT max(created_at) FROM __drizzle_migrations`.
- Exit non-zero **only** on a confident answer: journal newer than ledger. On a connection error,
  a missing table, or missing credentials it must say so loudly and exit **zero** — fail open on
  "I could not tell", fail closed only on "I checked and it is behind".
- Run it as a deploy-gating step, and prove both directions against a throwaway libSQL container
  (see `scripts/mass-upload-loadtest/README.md`) before it gates anything real.
- Never against a shared database, and never `drizzle-kit push`.

## A second gap — no written re-baseline procedure

The guard's drift verdict tells the operator to stop and re-baseline, and nothing in this repo
says how: `docs/PHASE_B_RUNBOOK.md` §4 carries the instruction but no procedure, and no procedure
exists anywhere else either *(grepped across `docs/`, `scripts/` and `CLAUDE.md` while reviewing
the PR that added the guard)*. So the most consequential branch of that decision procedure
currently depends on a document that has not been written. Writing it needs production access to
validate against, which the PR that added the guard deliberately did not have — flagged here as a
follow-up rather than improvised.

## Standing rules

- **Never run `drizzle-kit push`** against a shared database. It rebuilds tables and can destroy
  data. `npm run db:migrate` is the only path.
- `npm run db:migrate` is **atomic** on the installed drizzle-orm 0.45.2 / @libsql/client 0.17.4:
  the whole run is one `PRAGMA foreign_keys=off; BEGIN; ...; COMMIT` batch, so a failure mid-run
  leaves nothing behind. See `docs/PHASE_B_RUNBOOK.md` §1.
- **Apply migrations to production before promoting the deployment that reads them.** Additive
  `ALTER TABLE ... ADD COLUMN` is online and O(1) in row count; the app picks the columns up on
  the next request with no redeploy.
- `users.email` is spelled as an inline `UNIQUE` in production and as a named unique index by
  Drizzle. `verify-baseline-schema.mjs` classifies that as an accepted equivalence on purpose.
  **Do not "fix" it** — changing it means a table rebuild.
