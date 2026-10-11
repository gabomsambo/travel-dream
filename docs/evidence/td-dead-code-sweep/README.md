# Dead-code sweep evidence — fm/td-dead-code-sweep (2026-10-11)

Scope: the July 2026 candidate list (`/home/gabo/firstmate/data/td-theme-picker/dead-code-candidates.md`),
re-verified against today's `main` (`a64d0dd`). Method and limits of each proof are stated per item.

## Environment

- Local dev server `next dev` on port 3210, throwaway `file:` SQLite DB at
  `/home/gabo/firstmate/data/td-dead-code-sweep/throwaway.db` (migrations applied, one seeded user).
- The worktree's stale `.env.local` was moved out of the worktree
  (to `/home/gabo/firstmate/data/td-dead-code-sweep/env.local.stale`); the sweep ran against a
  fresh `.env.local` with dummy credentials. Production Turso was never contacted.
- Headless Chrome 152.0.7977.75 (`--remote-debugging-port=9333`), driven via `chrome-devtools-axi`.
- Logged in with the seeded credentials user (`screenshots@local.dev`).
- Theme verified per capture by reading `data-theme` and the computed CSS variables:
  classic = `--primary: 221.2 83.2% 53.3%`, `--radius: 0.5rem`;
  tropical = `--primary: 178 55% 36%`, `--radius: 1rem`, `data-theme="tropical"` on `<html>`.
  Theme flipped through the real Settings → Appearance → "Tropical Boutique UI" switch.

## Screenshots (10 routes × 2 themes, before and after)

Routes: `/library`, `/settings`, `/inbox`, `/archive`, `/collections`, `/duplicates`,
`/export`, `/review`, `/mass-upload`, `/map`.

- `before/`, `after/` — classic theme, before and after the change
- `before-tropical/`, `after-tropical/` — tropical theme, before and after the change

Each directory has a `manifest.txt` recording the verified theme attributes per route.

Pixel comparison (PIL `ImageChops.difference`): **18 of 20 before/after pairs are byte-identical**.
The two exceptions are per-load rendering nondeterminism, not regressions — both were reproduced
by capturing the SAME unchanged page twice with no code change in between:

- `archive` (tropical): 11 px differ at (40,863)–(44,869) — the sidebar avatar element.
  Control experiment (two consecutive captures of the unchanged page): 15 px differ at the
  same element. Sub-pixel/anti-aliasing jitter between loads.
- `map` (tropical): 87 px differ at (1195,126)–(1257,230) — the Mapbox control/attribution area.
  The dummy Mapbox token means tiles never load; the control's final frame depends on network
  timeout timing. The map is blank/broken identically before and after (same dummy token both runs).

## Validation (after the change)

- `npx tsc --noEmit` — exit 0
- `npm run lint` — exit 0 (one pre-existing warning in `src/types/next-auth.d.ts`, unchanged)
- `npm test` — 89 suites / 1291 tests, all pass

## Candidate verdicts

| Candidate | Verdict | Proof |
|---|---|---|
| `src/components/ui-v2/blocks/` (7 files) | **removed** | Repo-wide search for `ui-v2/blocks` across `src/`, `scripts/`, `docs/`, configs, `.github/`, `package.json`: zero references. No relative imports inside the directory (fully isolated island). Every basename match (`place-card`, `collection-card`, `empty-state`, `upload-dialog`, `place-filters`, `place-details-dialog`, `loading-state`) resolves to a different live directory (`@/components/places/*`, `@/components/collections/*`, `@/components/upload/*`, `@/components/library-v2/*`). No barrel re-exports it; no dynamic/template-literal imports exist anywhere in the app. Both themes: nothing mounts it — the adapters import `ui-v2/<primitive>` only, unconditionally, so any module tropical could reach is in the graph; these are not. `tsc` + `lint` + 1291 tests pass after deletion. |
| `src/components/ui-refresh-demo.tsx` | **rewired** | Zero references to `ui-refresh-demo`/`UIRefreshDemo` anywhere (repo-wide search, only the file itself). Rewired from the retired localStorage hook `useUIRefresh()` (`@/lib/feature-flags`) to `useUiRefreshEnabled()` (`@/components/ui-refresh-provider`), so it now follows the Settings → Appearance switch like every other themed component. Kept mounted-by-nothing per the captain's ruling. |
| `src/lib/rollout-config.ts` + `package.json` `rollout:enable`/`rollout:disable` + `scripts/rollout-enable-percent.js` + `scripts/rollout-force-disable.js` | **removed together** | No application code imports `rollout-config` (repo-wide search: only the two scripts reference it). The two scripts are self-contained (only read/rewrite `rollout-config.ts`), referenced only by the two `package.json` scripts. No `.github/` workflow, `vercel.json`, or doc references any `rollout` string. Retired as one change: config + both scripts + both npm scripts. The theme is now chosen only by the cookie path (`ui-theme.ts` / `ui-refresh-provider`). |
| `src/components/library-v2/` | **kept** — live | Still imported by 3 live component trees (`archive-client`, `library-client`, `place-tile`). The `-v2` suffix is not scaffolding. |
| `src/components/ui-v2/*` primitives (57 non-block files) | **kept** — live in both themes | 40 files import them; 16 app files import unconditionally (adapters, `/export`, `/duplicates`, `/map`, `/library`, `library-v2`, `/places`). |
| `src/lib/feature-flags.ts` | **kept** — do-not-touch per candidate list | The list places it under "things that look dead but are NOT". Its July premise ("live, in 9 client chunks") is stale: today nothing renders it — its own header records it as retired, kept by owner decision. After this change's demo rewire, only its own test (`src/__tests__/ui-refresh/feature-flag.test.ts`) imports it. The recorded owner decision stands; flagged here for the captain as a follow-up candidate. |
