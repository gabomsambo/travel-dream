# Postcard edit evidence — fm/td-place-edit-build

Global Edit used to replace the Postcard with the classic form ("Back to Library / Editing: …").
These shots are the same two local places before that swap and after Edit stays on the Postcard.

## Environment

- Local `next dev` on `127.0.0.1:3471`, throwaway `file:` SQLite at
  `/home/gabo/firstmate/data/td-place-edit-build/place-edit.db` (migrations applied, one seeded user).
  Production Turso was not used.
- Headless Chrome 152.0.7977.75, driven via chrome-devtools-axi.
- Signed in as the seeded user `screenshots@local.dev`.
- Light and dark are next-themes (`class` on `<html>`), flipped with the header theme button.
- Desktop is 1440×900. Phone is 390×844, which is inside the existing `(max-width: 1023px)` sheet breakpoint.

## Places

- Rich: Fushimi Inari-taisha (`plc_rich`) — photo, notes, plan, address, link.
- Sparse: Kissa Sora (`plc_sparse`) — inbox café with city and country only. Read mode keeps the four
  "Make it yours" invitations. Edit mode shows quiet "+ Add …" rows instead.

## Files

`before-<place>-<view|edit>-<desktop|phone>-<light|dark>.png` under `before/` and `after/`.

Before edit frames are the classic form. After edit frames keep the Postcard: the "Editing · Changes save
as you type · Done" bar, an in-place name and category on desktop, and the section index on a phone.
Sparse after-edit frames are scrolled to the "+ Add" rows. Phone after-edit frames are scrolled to the index.

## What was exercised live

- Both places, view and edit, both viewports, light and dark (the 32 shots).
- A hero name edit on the rich place: the field autosaved with `PATCH /api/places/plc_rich` 200, the new
  name was in SQLite, and typing the original name back saved the revert.
- More → "Open classic editor" opened `/place/plc_rich?editor=classic` and the unchanged classic form
  ("Back to Library", "Editing:", place name field).

## What the Jest suite covers and this browser pass did not repeat

Entry from `?edit=1`, Inbox/Review `placeEditHref`, and the "Open places in edit mode" preference;
a partial-save race across two sections with a stale refresh; Done staying in edit mode after a failed
save; focus returning to the invoking phone-index row after a sheet closes.
