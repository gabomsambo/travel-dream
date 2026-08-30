# Travel Dreams — AGENTS.md

## Project Overview

Travel Dreams (tabidreams.com) is a full-stack travel planning app built with **Next.js 15 App Router**, **Turso** (cloud SQLite) + **Drizzle ORM**, **NextAuth v5** (Google OAuth), **Vercel Blob** storage, **Radix UI** + **Tailwind CSS**, **Mapbox GL** + **Leaflet**, and LLM integrations (OpenAI, Anthropic, Gemini). Rate limiting via Upstash Redis. Hosted on Vercel.

## Subagent-First Development (MANDATORY)

**Always delegate to the appropriate subagent instead of doing work directly.** Only skip delegation for trivial tasks (rename a variable, fix a typo, answer a quick question).

| Task | Delegate To | Agent Path |
|------|-------------|------------|
| Explore/understand codebase | Codebase Analyst | `@codebase-analysts/codebase-analyst` |
| Frontend analysis | Frontend Analyst | `@codebase-analysts/frontend-analyst` |
| API/backend analysis | Backend API Analyst | `@codebase-analysts/backend-api-analyst` |
| Code review | Code Reviewer | `@core-dev/code-reviewer` |
| Debugging | Debugger | `@core-dev/debugger` |
| Writing tests | Test Generator | `@quality-assurance/test-generator` |
| Running tests | Test Runner | `@core-dev/test-runner` |
| Performance work | Performance Engineer | `@core-dev/performance-engineer` |
| Refactoring | Refactoring Specialist | `@core-dev/refactoring-specialist` |
| Database changes | Database Architect | `@data-operations/database-architect` |
| Architecture decisions | Architecture Planner | `@architecture/architecture-planner` |
| Migration planning | Migration Strategist | `@architecture/migration-strategist` |
| Security review | Security Auditor | `@quality-assurance/security-auditor` |
| Documentation | Documentation Generator | `@documentation/documentation-generator` |
| Tech debt analysis | Tech Debt Analyzer | `@quality-assurance/tech-debt-analyzer` |
| Dependency auditing | Dependency Auditor | `@quality-assurance/dependency-auditor` |
| API contract validation | API Contract Validator | `@quality-assurance/api-contract-validator` |
| CI/CD pipelines | CI/CD Orchestrator | `@devops/cicd-orchestrator` |
| Production errors | Error Detective | `@devops/error-detective` |
| Sprint planning | Sprint Planner | `@project-management/sprint-planner` |
| Create new subagent | Agent Architect | `@agent-architect` |

## Slash Commands

| Command | Purpose |
|---------|---------|
| `/prime` | Scan codebase, build understanding |
| `/prime-deep [area]` | Focused deep dive (e.g., "frontend", "database") |
| `/init-project` | Install deps, run migrations, start dev server |
| `/generate-prp [feature]` | Deep research into structured implementation plan |
| `/execute-prp [path]` | Execute a PRP into working code |
| `/commit` | Smart conventional commits with split detection |
| `/branch-start [name]` | Create feature branch from latest base |
| `/pr-create` | Create polished pull request |
| `/debug [error]` | Systematic root cause analysis |
| `/code-review` | Structured code review |
| `/code-review-fix [file]` | Fix issues found in code review |
| `/perf-audit [route|--full]` | Frontend perf pulse check vs `perf-budget.json` (bundle, anti-patterns, assets) |
| `/validate` | Full health check (lint, types, tests, build, server) |
| `/execution-report` | Generate post-implementation report |
| `/system-review` | Analyze implementation vs plan for process improvements |
| `/rca [issue#]` | Root cause analysis for GitHub issue |
| `/implement-fix [issue#]` | Implement fix from RCA document |
| `/create-prd` | Generate product requirements document |

These are Claude Code slash commands. The **planning pair is harness-portable** and is also
installed as Codex skills — invoke it as `/generate-prp` on Claude and `$generate-prp` on Codex
(likewise `execute-prp`). Everything else in the table is Claude-only: on another harness, do the
work the entry describes rather than looking for a command that is not there.

## Development Workflow

**Plan before coding.** Every non-trivial change starts with a PRP. This applies to
anyone working in this repo — you at the keyboard, or an autonomous agent.

### Planning and building (always)

1. Understand the codebase (`/prime` on Claude; otherwise read the code and this file)
2. **`generate-prp`** — deep research into a plan saved under `PRPs/`
   (`/generate-prp [feature]` on Claude, `$generate-prp` on Codex)
3. **`execute-prp`** — build it, passing the plan's validation gates as you go
   (`/execute-prp [path]` on Claude, `$execute-prp` on Codex)

`PRPs/*.md` are gitignored (templates are not) — they are local planning artifacts.
To ship one alongside its PR, `git add -f` that specific file.

### Size the task while you plan

**One PRP should be one reviewable change.** If the plan's task list spans unrelated
subsystems, or the change would touch more than a few hundred lines, split it into
separate PRPs and ship them separately.

This is not style advice. Review cost scales with diff size, and review is by far the
most expensive validation step: measured across this repo's pipeline runs, review
averaged 18.6 minutes against an average workload of ~4,100 changed lines, and the
single largest task took three runs and ~3.7 hours. Two right-sized PRs are
dramatically cheaper than one that does both jobs.

### Delivery (depends on who is driving)

Do not run delivery steps that whoever is driving already owns.

- **Solo, at the keyboard:** `/code-review` → `/validate` → `/commit` → `/pr-create`.
- **As a firstmate crewmate:** your brief's *Definition of done* governs, not this list.
  `direct-PR` means you push the branch and open the PR yourself. `no-mistakes` means
  the pipeline owns review, tests, docs, push, PR and CI — do not stack your own
  review or PR steps on top of it.

## Key Paths

```
src/app/(app)/          — authenticated routes (inbox, library, collections)
src/app/(marketing)/    — public routes (login, landing)
src/app/api/            — backend API routes
src/db/schema/          — Drizzle ORM schema definitions
src/lib/db-queries.ts   — read queries (SELECT)
src/lib/db-mutations.ts — write operations (INSERT/UPDATE/DELETE)
src/components/         — shared UI components
src/hooks/              — custom React hooks
src/types/              — TypeScript type definitions
src/styles/             — global styles
src/__tests__/          — test files
PRPs/                   — implementation plans
PRPs/templates/         — PRP template
.env.local              — all credentials (NEVER commit)
```

## Coding Standards

- **TypeScript strict** — no `any` types, be specific
- **"use client"** directive required on all interactive/stateful components
- **Radix UI + Tailwind CSS** for all UI — no inline styles or CSS modules
- **Drizzle ORM** for DB — follow patterns in `db-queries.ts` / `db-mutations.ts`
- **NextAuth v5** for auth — use `auth()` in server components, check session in API routes
- **API routes** validate input (Zod) and check auth before processing
- **Conventional commits** — `feat:`, `fix:`, `refactor:`, `docs:`, etc.
- **Zod** for runtime validation of API inputs
- **Server components by default** — only add "use client" when needed

## File Organization

| Type | Location |
|------|----------|
| New page (authenticated) | `src/app/(app)/[page-name]/page.tsx` |
| New page (public) | `src/app/(marketing)/[page-name]/page.tsx` |
| New API route | `src/app/api/[endpoint]/route.ts` |
| New DB table | `src/db/schema/[table-name].ts` |
| New DB query | `src/lib/db-queries.ts` |
| New DB mutation | `src/lib/db-mutations.ts` |
| Shared component | `src/components/[component-name].tsx` |
| Feature component | `src/components/[feature]/[component].tsx` |
| Custom hook | `src/hooks/use-[name].ts` |
| Types | `src/types/[name].ts` |
| Tests | `src/__tests__/[name].test.ts(x)` |

## Quick Commands

```bash
npm run dev             # start dev server (port 3000)
npm run build           # production build
npm run lint            # ESLint
npx tsc --noEmit        # type check
npm run test            # Jest tests
npm run db:generate     # generate Drizzle migrations
npm run db:migrate      # apply migrations
npm run db:studio       # visual DB browser (port 4983)
```

`npm run build` needs a populated `.env.local` (see `.env.example`). Without at
least `TURSO_DATABASE_URL` it fails during "Collecting page data", which looks
like a code error but is not. `npx tsc --noEmit` and `npm run test` need no env.

## Background activity (header bell)

Mass-upload observation lives in `src/components/activity/activity-provider.tsx`,
mounted in `(app)/layout.tsx` beside `AppToaster`. Terminal jobs persist per user in
`localStorage` (`td:activity-jobs:v1:<userId>`) until dismissed — there is no
acknowledgement column. Announce transitions with `toastWithNavigate`
(`src/lib/toast-navigate.ts`).
The inbox `ProcessingBanner` is in-flight only; completion belongs to the bell.

## Multi-Tenancy (security-critical)

Every user-owned table carries a `userId` (`places`, `sources`, `collections`, `uploadSessions`, and
`attachments` transitively via `places.placeId`). **Authentication is not authorization**: any handler
that reads or writes a row by a caller-supplied id must also filter on the caller's `user.id`, or join
through `places` when the row is only owned transitively.

- Ownership-scoped read: `src/app/api/photos/resolve/[attachmentId]/route.ts`
- Session ownership check (404 then 403): `src/app/api/mass-upload/start/route.ts`
- Regression tests for both shapes: `src/__tests__/authorization/`

Client-supplied URLs the server will fetch or persist must pass `isAllowedBlobUrl()`
(`src/lib/blob-url.ts`) first — `sources.uri` is re-fetched later by the privileged cron.

Client IP for rate limiting comes only from platform-set headers (see `getClientIdentifier` in
`src/lib/rate-limit.ts`); this app is on Vercel, so `cf-connecting-ip`/`x-real-ip` are spoofable.

## File Storage (all uploads go to Vercel Blob)

**Never write uploads to the local filesystem.** On Vercel everything outside `/tmp` is read-only, so
`writeFile`/`mkdir` into `public/uploads` fails at runtime — it only ever "worked" in local dev.

Every upload uses the same three-step client-upload flow: `upload()` from `@vercel/blob/client` →
`/api/blob/upload` (mints the token, enforces content types and rejects traversal-shaped keys) →
a feature-specific `blob-complete` route that validates the URL with `isAllowedBlobUrl()` and stores
it. Three implementations to copy: `src/components/upload/screenshot-uploader.tsx`,
`src/components/upload/photo-uploader.tsx`, `src/components/collections/cover-image-picker-dialog.tsx`.

The cover flow takes its blob-key extension from the MIME allow-list in `src/lib/image-upload.ts`,
never from `file.name` — do the same in new upload paths. The screenshot and photo uploaders are not
converted yet and still derive the extension from `file.name`; copy their three-step flow, not that.

Deleting a record must only `del()` a blob that record owns — collection covers can point at a place
photo's blob (see `isOwnedCoverBlobUrl` / `releaseOwnedCoverBlob` in `src/lib/cover-blob.ts`).

Pre-Blob rows whose `uri` is a `/uploads/...` path are deliberately not migrated; those files never
existed on Vercel, so treat such rows as broken-image leftovers rather than something to clean up.

`src/lib/ocr-service-server.ts` writes to `os.tmpdir()`, which is allowed — `/tmp` is writable.

## Mass-upload queue (reliability-critical)

The owner's bar is "drop 500 images and walk away": a screenshot that uploaded successfully must
never end up `failed` because a run ran out of clock, was killed, or raced another run.

`processingAttempts` counts **genuine verdicts about the image** and can end in `failed`.
`processingInterruptions` counts **clock-outs, kills and upstream outages**; they only requeue, and
past the cap they land in `stalled` (retryable, surfaced separately in the UI). Never merge the two
counters. Classification lives in `asInterruption()` in `src/lib/mass-upload/queue-processor.ts`.

Claims are leases (`processing_lease_id`): every write back is guarded by the lease the run holds, so
a reclaimed item cannot be finished twice. A requeued item also gets a `next_attempt_at` backoff, and
`claimNextQueuedSource` skips rows whose backoff has not elapsed (`NULL` means ready).

The queue columns on `sources` are read by widely-used queries, not only the queue paths
(`getSourcesForPlace` selects them, so place detail breaks too). Apply the migrations to Turso
**before** promoting the deployment that reads them — shipping them unapplied is exactly what took
production down on 2026-08-29 (see "Database migrations" below).

The timing invariants (lease TTL > item budget, run budget > item budget) are asserted by
`src/__tests__/mass-upload/queue-config.test.ts` — change values in
`src/lib/mass-upload/queue-config.ts`, not in scattered constants, and keep route `maxDuration` and
`vercel.json` in sync with `MASS_UPLOAD_MAX_DURATION_SECONDS`.

Processing is event-triggered from `/api/mass-upload/start`; the cron is only a safety net. New
system-to-system endpoints authenticated with `CRON_SECRET` must be added to the bypass list in
`src/middleware.ts`, or they get redirected to `/login` and silently never run.

Gemini extraction is cached onto `sources.meta.massUpload` as soon as it is paid for, so a retry
never re-charges the API. Anything that adds an upstream call to this pipeline should do the same.

Load/kill testing runs against a throwaway Docker libSQL DB and a local blob server — never against
Turso or the production Blob store. See `scripts/mass-upload-loadtest/README.md`.

## Production legacy rows (do not touch)

Production has rows that look like stranded work. **They are deliberate — do not process or clean
them up.** The approximate counts below come from the external decision record, not a live query.

- **`sources`**: ~50 rows at `processing_status = 'pending'` from December 2025 predate the
  mass-upload queue. Do not flip them to `queued` or otherwise process them — that spends ~50
  Gemini vision calls and creates places the owner did not ask for. The queue only claims
  `queued`, so these will never be picked up on their own; that is the intended resting state.
- **`upload_sessions`**: ~77 rows still marked `active` from the old uploader are harmless
  leftovers. Do not bulk-close or delete them.

The captain decided on 2026-08-29 to leave the pending sources as-is. Fuller account (not in
this repo): `data/td-prod-schema-drift/decision-legacy-pending-sources.md`.

## Database migrations (production-critical)

**A merged migration file is not an applied migration.** `tsc`, `jest` and `next build` never
touch the database, so a PR that adds a migration is green whether or not production ever runs it.
PR #30 did exactly that and 500'd live uploads, place pages, `/review` and the cron for an hour.

`docs/db/MIGRATION_SAFETY.md` is the authoritative account: what the CI `schema-drift` job
(`node scripts/verify-baseline-schema.mjs`) does and does not prove, the still-open deploy-time
guard, and the standing rules. Read it before touching anything under `src/db/migrations/`.

The short version:

- Adding a migration means refreshing `docs/db/prod-schema-reference.sql` too, **after** applying
  the migration to production. The CI job fails until the two agree; regenerating the reference
  without applying is how you silence the check and keep the outage.
- Never `drizzle-kit push` against a shared database — it rebuilds tables. `npm run db:migrate`
  only, and it is atomic (`docs/PHASE_B_RUNBOOK.md` §1).
- The `users.email` inline-`UNIQUE`-vs-named-index difference is an accepted equivalence in
  `verify-baseline-schema.mjs`. Leave it; "fixing" it means a table rebuild.
- `scripts/*.mjs` under `scripts/` that model the database (`verify-baseline-schema`,
  `rehearse-ledger-reconciliation`) must stay runnable with no credentials and no network, and
  must not hardcode counts that change when a migration is added.

## Theming (two visual themes, one component architecture)

The app ships two looks: **classic** (default) and **tropical**. The difference is
almost entirely **CSS custom properties** — see the `[data-theme="tropical"]` blocks in
`src/styles/globals.css`. The `ui-v2/` tree is a newer shadcn *generation*, not "the tropical
theme": it styles itself with the same semantic tokens, and 16 files import it unconditionally, so
it renders in classic too. Don't assume `ui-v2` == tropical.

- Choice is persisted in the `ui-theme` cookie (`src/lib/ui-theme.ts`) and resolved **server-side**
  in `src/app/(app)/layout.tsx`, so the first paint is already correct and it works with JS off.
  Anything unrecognised falls back to classic — keep it that way.
- Read the cookie in `(app)/layout.tsx`, **never the root layout**: `cookies()` forces dynamic
  rendering, and the root layout would drag the static marketing routes (`/`, `/login`, `/signup`)
  with it for no benefit — they ship no theme code. The root `error.tsx` / `not-found.tsx` render
  outside that segment, so they resolve the cookie in the browser instead
  (`src/components/client-ui-theme-provider.tsx`) and cost one classic frame — that escape hatch is
  for boundaries the server-resolved theme cannot reach, not a second way to theme normal pages.
- Radix portals escape the themed shell into `document.body`, so `UIRefreshProvider` mirrors the
  attribute onto `<html>`. If you move where `data-theme` is rendered, re-check dialogs and popovers.
- Theme is a separate axis from next-themes' dark/light (`class` on `<html>`). Both dark and light
  variants of tropical exist; changing one selector means changing both.
- `src/lib/feature-flags.ts` is the retired localStorage path — unreferenced by anything rendered
  and *not* part of the migration (`UIRefreshProvider` reads `LEGACY_UI_REFRESH_KEY` from
  `ui-theme.ts`). Kept deliberately; don't reintroduce it as a theme source.

## Anti-Patterns

- Don't create new patterns when existing ones work — check similar features first
- Don't use `any` — always specify types
- Don't mix server and client code without proper boundaries
- Don't hardcode values that should be env vars
- Don't skip validation — run `/validate` before committing
- Don't forget "use client" on interactive components
- Don't run `npm audit fix --force` — it "fixes" Next.js by downgrading it from
  15.x to 9.3.3. Plain `npm audit fix` is lockfile-only and safe.

## Maintaining this file

`AGENTS.md` is the tracked home for agent instructions; `CLAUDE.md` imports it.

Keep this file for knowledge useful to almost every future agent session in this
project. Don't repeat what the codebase already shows; point to the
authoritative file or command instead. Prefer rewriting or pruning existing
entries over appending new ones, and keep entries concise.
