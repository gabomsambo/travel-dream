# Travel Dreams — CLAUDE.md

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

## Development Workflow

1. `/prime` — understand the codebase
2. `/generate-prp [feature]` — plan the implementation (saved to `PRPs/`)
3. `/execute-prp [path]` — build it with progressive validation
4. `/code-review` — review changes
5. `/validate` — full health check
6. `/commit` — conventional commit
7. `/pr-create` — open pull request

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

`AGENTS.md` is gitignored here, so this file is the tracked home for agent
instructions — keep it, don't promote it.

Keep this file for knowledge useful to almost every future agent session in this
project. Don't repeat what the codebase already shows; point to the
authoritative file or command instead. Prefer rewriting or pruning existing
entries over appending new ones, and keep entries concise.
