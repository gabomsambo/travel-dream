# Toast notifications — ship 1 evidence

Sonner was mounted in `(app)/layout.tsx` via `AppToaster` so existing `toast.*` call sites become visible.

Captured at **1440×900** with headless Chrome (`chrome-devtools-axi`, port 9222) against the dev server on **`:3001`** (`AUTH_URL=http://localhost:3001`).

| File | What it shows |
|------|----------------|
| `toast-before-classic-library.png` | Authenticated `/library` with no toast (pre-fix baseline) |
| `toast-after-classic-success.png` | Classic — compact success toast, top-right below header; Upload button uncovered |
| `toast-after-classic-error.png` | Classic — error toast on failed export |
| `toast-after-tropical-success.png` | Tropical — same success toast styling via semantic tokens |

**Live in browser:** placement, compact size, both themes, Upload clearance, settings export success/error toasts.

**Unit-tested only:** singleton toaster mount, all toast types render visible text, survival across client navigation (`src/__tests__/toaster/app-toaster.test.tsx`).

**Reasoned, not screenshoted:** mass-upload completion action toast (`toastWithNavigate` → `/library`) — wired in `use-mass-upload-status.ts`; needs an active processing session to capture live.

Before reference (no toast on add-place success): `/home/gabo/firstmate/data/td-notifications-ux/assets/current-add-place-success-no-feedback.png`.
