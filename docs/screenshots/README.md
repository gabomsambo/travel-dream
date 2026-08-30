# Toast notifications — ship 1 evidence

Sonner is mounted in `(app)/layout.tsx` via `AppToaster` so existing `toast.*` call sites become visible.

Captured at **2026-08-30** against branch HEAD with headless Chrome (CDP on port 9222) and the dev server on **`:3001`** (`AUTH_URL=http://localhost:3001`). Theme was toggled via Settings → “Tropical Boutique UI”; each capture logged `document.documentElement.getAttribute('data-theme')` and the Upload button colour before shooting.

## Screenshots (live browser)

| File | Viewport | What it shows |
|------|----------|---------------|
| `toast-before-classic-library.png` | 1440×900 | Classic (`data-theme` absent, Upload `rgb(59,130,246)`) — `/library` with no toast |
| `toast-before-tropical-library.png` | 1440×900 | Tropical (`data-theme=tropical`, Upload `rgb(49,196,191)`) — `/library` with no toast |
| `toast-after-classic-success.png` | 1440×900 | Classic — compact success toast after Settings → Export All Data; top-right below header; Upload uncovered |
| `toast-after-classic-error.png` | 1440×900 | Classic — error toast after mocked export failure |
| `toast-after-tropical-success.png` | 1440×900 | Tropical — same export success flow; shell accents differ (teal Upload, tropical tokens) |
| `toast-after-tropical-error.png` | 1440×900 | Tropical — error toast after mocked export failure |
| `toast-after-classic-narrow-success.png` | 780×900 | Classic at narrow width — toast stays top-right with `12px` inset, does not overlap Upload |

**Toast chrome vs theme:** Notification styling is mostly fixed sizing plus semantic tokens (`--popover`, `--border`, `--muted-foreground`). Success/error toasts therefore look similar in both themes; the theme difference is visible in the surrounding shell (Upload colour, cards, sidebar), not in radically different toast palettes.

## Unit-tested (not screenshoted)

- Singleton toaster mount, all toast types render visible text, survival across client navigation — `src/__tests__/toaster/app-toaster.test.tsx`
- Mass-upload poll errors surface via `toast.error` — `src/hooks/__tests__/use-mass-upload-status.test.tsx`
- Collection-builder transport/note/pin failures surface via `toast.error` — `src/components/collections/__tests__/collection-builder-failures.test.tsx`

## Reasoned (not screenshoted)

- Mass-upload completion action toast (`toastWithNavigate` → `/library`) — wired in `use-mass-upload-status.ts`; needs an active processing session to capture live.

Before reference (no toast on add-place success): `/home/gabo/firstmate/data/td-notifications-ux/assets/current-add-place-success-no-feedback.png`.

Regenerate: `node scripts/capture-toast-screenshots.mjs` (requires logged-in session, Chrome on `:9222`, dev server on `:3001`).
