# Archived scripts — do not run

These scripts are kept for historical reference only. They are **not** part of any
supported workflow and several of them will damage a database if run today.

Most of them wrote to the database directly, outside Drizzle, using
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` from `.env.local`. That is exactly how the
migration history drifted away from production in the first place: changes landed in
the database without ever landing in a migration file, so a fresh database built from
`src/db/migrations/` no longer matched the running one.

| Script | What it did |
|--------|-------------|
| `apply-migration.ts` | Ad-hoc `ALTER TABLE` runner for the collections UI refresh |
| `apply-day-planner-migration.ts` | Ad-hoc runner for the day-planner columns |
| `migrate-auth.ts` | Created the NextAuth tables by hand |
| `migrate-add-columns.ts` / `.sql` | Added assorted `places` columns by hand |
| `add-description-column.ts` | Added `places.description` by hand |
| `fix-json-data.ts` | One-off repair of malformed JSON column values |
| `migrate-to-adapters.js` | Source codemod (not a DB script) rewriting imports to the adapter layer |

## What to do instead

Schema changes go through Drizzle, always:

```bash
npm run db:generate    # edit src/db/schema/**, then generate a migration
npm run db:migrate     # apply it
```

Never use `drizzle-kit push` against a shared database — it diffs and rebuilds tables
without producing a migration file, which is how drift starts.

See `docs/PHASE_B_RUNBOOK.md` for the migration baseline and how to verify that a fresh
database still matches production.
