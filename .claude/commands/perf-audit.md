---
description: Frontend perf audit — bundle budgets, anti-patterns, asset sizes — pulse check, not deep optimization
argument-hint: [route|--quick|--full] (defaults to --quick: reuse latest .next/, skip rebuild)
---

# Perf Audit

Run a deterministic performance pulse-check on the current state of the repo. This is a **regression detector**, not a deep optimization tool — for the latter, delegate a specific route to the `performance-engineer` agent.

The audit produces a ranked markdown report comparing the current build against `perf-budget.json` and flagging known anti-patterns we've learned matter for this stack.

## Scope

$ARGUMENTS

If `--full` is in arguments → run a fresh production build before checks.
If `--quick` or no argument → reuse the latest `.next/` build (warn if stale or missing).
If a route path like `/inbox` is in arguments → still run all checks but focus the report on that route.

## Context

- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Last commit: !`git log --oneline -1`
- Build state: !`if [ -f .next/BUILD_ID ]; then echo "exists, built $(stat -c %y .next/BUILD_ID 2>/dev/null | cut -d. -f1)"; else echo "MISSING — must run --full or build first"; fi`
- Budget file: !`if [ -f perf-budget.json ]; then echo "found"; else echo "MISSING — bail out and ask user to create perf-budget.json"; fi`
- Baseline file: !`if [ -f perf-baseline.json ]; then echo "found (drift detection enabled)"; else echo "absent (no drift detection — only budget checks)"; fi`

If `perf-budget.json` is missing, halt and ask the user. Do not synthesize a budget on the fly — it must be a deliberate, committed artifact.

## What to Check

Run these checks **in order**. Each section produces findings with `file:line` citations and a severity (🔴 FAIL / ⚠️ WARN / ✅ PASS). Only Section 1 may halt early — if the build itself fails, the rest is meaningless.

### 1. Bundle size vs budget

If `--full`: run `npm run build 2>&1 | tee /tmp/perf-audit-build.log` and parse the route table from stdout.
If `--quick`: parse the route table from the most recent build log if available, otherwise read route output from `.next/app-build-manifest.json` and chunk sizes from `.next/static/chunks/`. Note staleness in the report.

For each route:
- Pull current First Load JS (kB)
- Look up `perf-budget.json → firstLoadJsKb.routes[route].max`
- If `perf-baseline.json` exists, compute Δ vs baseline
- Severity: 🔴 if over budget, ⚠️ if within 10% of budget, ✅ otherwise
- Also compare shared baseline vs `firstLoadJsKb.shared.max`

### 2. Anti-pattern detection

Each pattern is one we've learned matters for this stack. Run the grep, then **read enough surrounding context to confirm the finding is real** before flagging — false positives erode trust in the audit.

**a. Raw `<img>` tags** (bypasses next/image optimization):
```bash
grep -rn '<img ' src/ --include='*.tsx' --include='*.jsx'
```
Allowed exceptions: blob/object-URL preview, third-party avatar like `session.user.image`. Note these in the report under "soft" findings, not failures.

**b. `<Image fill>` without `sizes`** (next/image serves the largest variant otherwise):
```bash
grep -rn -A4 '<Image' src/ --include='*.tsx' | grep -E 'fill[ /$>]' | head -30
```
For each match, read the component to confirm `sizes` is actually missing.

**c. `useEffect` + `fetch` for initial-load data** (App Router anti-pattern — should be Server Component):
```bash
grep -rn -B1 -A8 'useEffect' src/ --include='*.tsx' | grep -E 'useEffect|fetch\('
```
Read each match in context. Only flag if it's clearly **initial** page data (fires on mount with empty deps and is needed for first render). User-triggered fetches and search-triggered fetches are fine.

**d. `'use client'` on `page.tsx` or `layout.tsx`** (over-hoists the entire route subtree to client):
```bash
find src/app -name 'page.tsx' -o -name 'layout.tsx' | xargs grep -l "^['\"]use client['\"]"
```

**e. Direct `auth()` calls in `(app)/` routes** (should use cached `getCurrentUser` from `auth-helpers`):
```bash
grep -rn "from '@/lib/auth'" 'src/app/(app)/' --include='page.tsx'
```
Each result is a 🔴 finding — generates duplicate auth resolution between `generateMetadata` and the page.

**f. `force-dynamic` on mutation-only API routes** (redundant — POST/PUT/PATCH/DELETE are dynamic by default):
```bash
for f in $(grep -rl "force-dynamic" src/api/ src/app/api/ 2>/dev/null); do
  if grep -qE 'export async function (POST|PUT|PATCH|DELETE)' "$f" && ! grep -q 'export async function GET' "$f"; then
    echo "$f"
  fi
done
```

**g. Routes missing `loading.tsx`** (no streaming UI on navigation):
For each `src/app/(app)/**/page.tsx`, check whether a sibling `loading.tsx` exists.
```bash
for p in $(find 'src/app/(app)' -name 'page.tsx'); do
  d=$(dirname "$p")
  [ ! -f "$d/loading.tsx" ] && echo "$p"
done
```
⚠️ severity (not 🔴) — missing loading.tsx isn't broken, it's degraded UX.

**h. Heavy SDK imports at module scope in API routes** (cold-start risk on Vercel):
```bash
grep -rn -E "^import.*from '(openai|@anthropic-ai|@google/generative-ai|mapbox-gl)'" src/app/api/ src/lib/ --include='*.ts'
```
For matches in `src/lib/` files that are imported by client components — flag as 🔴. For matches in `src/lib/llm-providers/` or similar server-only files imported only by API routes — note as ✅ (expected).

### 3. Public asset budget

```bash
find public/ -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -size +300k -exec ls -la {} \; | awk '{print $5, $9}' | sort -rn | head -30
```

Threshold from `perf-budget.json → publicAssetsKb.maxImageSize`. Each file over budget is a ⚠️ (Next.js auto-optimizes at request time, so this is repo-bloat / cold-cache concern, not user-facing).

### 4. Build warnings

If a fresh build was run, scan `/tmp/perf-audit-build.log` for:
- `"is not supported in the Edge Runtime"` — middleware bundle issues
- `"caniuse-lite" ... "old"` — stale browserslist
- `"Image with src"` warnings
- `"Failed to compile"` / `"Error:"` — anything blocking

If no fresh build, skip this section with a note.

## Output Format

```markdown
# Perf Audit Report

**Branch:** {branch}
**Commit:** {hash} {subject}
**Build:** {fresh|cached, age}
**Mode:** {--quick|--full}{|, focused on {route}}

## Summary

| Severity | Count |
|---|---:|
| 🔴 Fail | X |
| ⚠️ Warn | Y |
| ✅ Pass | Z |

## 1. Bundle Size

| Route | Current (kB) | Budget | Δ vs Baseline | Status |
|---|---:|---:|---:|:---:|
| / | 171 | 200 | 0 | ✅ |
| ... |

Total over budget: X / Y routes. Shared baseline: NkB / Mmax {status}.

## 2. Anti-Patterns

### 🔴 Critical
- **{type}** at `file:line` — {one-line why it matters} → fix: {action}

### ⚠️ Soft
- **{type}** at `file:line` — {context}

(If a category has zero findings: "✅ {category}: clean")

## 3. Public Assets

| File | Size | Budget | Action |
|---|---:|---:|---|
| ... |

## 4. Build Warnings

{summary or "no fresh build — skipped"}

## Top Recommended Actions

Ranked by impact ÷ effort. Cap at 3.

1. **{action}** — {one-sentence rationale}
2. ...
3. ...

## How to Go Deeper

For deep optimization of a specific route, delegate to the performance-engineer agent:

> "Use performance-engineer to deeply optimize the {route} page — read the page, the components it renders, the queries it runs, and propose top 3 fixes with code."

The agent does context-aware analysis (reads the actual code, traces import chains, makes judgment calls) where this skill only does pattern matching.
```

## Operating Notes

- **Cap the report at ~30 findings.** If more, group by type and surface "see also: N additional similar findings."
- **Verify before flagging.** False positives in the audit erode trust. When a grep result is ambiguous, read the surrounding code before deciding severity.
- **Don't suggest fixes for Tier 4 polish.** This is a regression detector. Recommendations should be the top 3 highest-leverage actions, not a punch list.
- **The audit doesn't fix anything.** It only reports. Fixing is a separate decision the user makes after seeing the report.
- **If `perf-budget.json` is older than the latest commit on `main` and current → main has diverged**, note this as "budget may be stale — review and update if needed."
