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

It needs no credentials, no network and no `node_modules` — only Node >= 22 for `node:sqlite`,
which is why it is a separate job (the main `ci` job pins Node 20, where the script cannot load).

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

The script has two modes and a diff means opposite things in each — it prints the matching
remediation for the one you invoked:

- `node scripts/verify-baseline-schema.mjs` (CI, the default) compares the journal against the
  checked-in reference. A diff means a migration landed that the reference does not describe.
- `node scripts/verify-baseline-schema.mjs <live-dump.sql> src/db/migrations`
  (`docs/PHASE_B_RUNBOOK.md` §4) compares the journal against a read-only `.schema` dump of a live
  database. A diff there means **that database has drifted**: stop and re-baseline, do not
  `db:migrate` to catch it up, and do not touch the checked-in reference.

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
