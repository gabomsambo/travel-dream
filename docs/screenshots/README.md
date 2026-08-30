# Screenshots

Live captures at **1440×900** from headless Chrome (CDP `:9222`) against the app on **`:3001`** (`AUTH_URL=http://localhost:3001`). Theme proof is `data-theme` on `<html>` plus the Upload button’s computed colour — classic Upload is blue, tropical is teal.

## Activity bell — ship 2

Header bell beside the profile avatar. Terminal mass-upload jobs persist in `localStorage` until dismissed. Regenerate: `node scripts/capture-activity-bell-screenshots.mjs`.

Theme log from the capture run: [`activity-bell-theme-log.json`](activity-bell-theme-log.json).

| File | Theme proof | What it shows |
|------|-------------|---------------|
| `activity-bell-rest-classic.png` | `data-theme` absent, Upload `rgb(37, 99, 235)` | Bell at rest — no indicator |
| `activity-bell-rest-tropical.png` | `data-theme=tropical`, Upload `rgb(41, 142, 139)` | Same rest state in tropical |
| `activity-bell-active-classic.png` | classic blue Upload | Bell with active-work dot |
| `activity-bell-active-tropical.png` | tropical teal Upload | Active-work dot on tropical tokens |
| `activity-bell-popover-active-classic.png` | classic | Popover: `Processing 183 of 500 · 42 places found` |
| `activity-bell-popover-active-tropical.png` | tropical | Same active popover; shell accents differ |
| `activity-bell-popover-complete-classic.png` | classic | Completed job with counts, View results / Retry stalled / Dismiss |
| `activity-bell-popover-complete-tropical.png` | tropical | Same completed popover in tropical |

**Exercised live:** authenticated `/library` shell, theme cookie round-trip, bell indicator, and rendered popover copy and action controls. Active counts came from an in-page `fetch` mock of `/api/mass-upload/status` after login; completed jobs were hydrated from the signed-in user's `td:activity-jobs:v1:<userId>` key the same way a reload would.

**Unit-tested, not screenshoted:** provider toast-once + persist-across-remount, acknowledge clears storage, poll-paused copy, session list `userId` scope, 404-then-403 on GET/PATCH.

**Reasoned:** in-page `/mass-upload` progress card (unchanged); `toastWithNavigate` on a real completing run (provider unit test covers the call).

## Toast notifications — ship 1

Sonner is mounted in `(app)/layout.tsx` via `AppToaster`. Capture script: `node scripts/capture-toast-screenshots.mjs`.
