# Inbox pending-status fix — fm/td-inbox-pending-fix

## Environment

- Local `next dev` on `127.0.0.1:3591`, throwaway `file:` SQLite at
  `/home/gabo/firstmate/data/td-inbox-pending-fix/inbox.db` (migrations applied, seeded user).
  Production Turso was not used.
- Headless Chrome 152.0.7977.75 on CDP `:9377`, driven via chrome-devtools-axi
  (`CHROME_DEVTOOLS_AXI_SESSION=td-inbox-pending-fix`).
- Signed in as `screenshots@local.dev` (credentials).
- Desktop viewport 1440×900.

## Seed highlights

- Three inbox places → **Need Review** should read **3** (not the old estimate).
- `mass-upload-done.png`: `processing_status=completed`, stale `ocrStatus=pending` → badge **Done**.
- `legacy-ocr-done.png`: `processing_status=pending`, `ocrStatus=completed` → badge **Done**.
- `still-reading.png`: `processing_status=extracting` → badge **Reading…**.
- **Processed** header count should be **2** (mass + legacy), not **1**.

## Files

- `before/inbox-desktop.png` — pre-fix UI (badges still **Pending**, **1 Processed**, inflated Need Review).
- `after/inbox-desktop.png` — post-fix UI (**Done**, **2 Processed**, **3 Need Review**).
