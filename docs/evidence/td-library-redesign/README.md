# Library: "Chapters" redesign (build 1 of 2)

Live captures from headless Chromium 152 (`chrome-devtools-axi`) against `next dev` on a
local port, signed in as local seed users, against a throwaway copy of the scouts' enriched
seed served by a local `libsql-server` container. Nothing pointed at production. Desktop is
1440×900 with a fine, hover-capable pointer; mobile is 390×844 at 2× with touch.
**Before** is `main` at `09ffdc1` with the same data.

Accounts:
- `explorer@local.test`: 121 library places in 29 countries and 65 cities (29 been, 14 planned,
  78 dreaming), 118 with photos, 6 collections, 10 places waiting in the Inbox.
- `fresh@local.test`: 2 places, one without a photo (the near-empty state).
- `empty@local.test`: no places.

## Before / after

| Before | After | What it shows |
|---|---|---|
| ![](before-desktop-classic-light.jpg) | ![](after-desktop-classic-light.jpg) | The journal cover replaces the title and the four stat cards. The stats are one sentence, and each number applies its shelf or grouping. The flag passport shows "Been to 7 of 29". Below: the serif "Search your atlas…", the shelves (All · Dreaming · Planned · Been, and Needs review → Inbox), and Trips & lists. |
| ![](before-desktop-list.jpg) | ![](after-desktop-chapters-classic-light.jpg) | The places as chapters, one per country, in place of the 256 px filter wall and one flat grid. The serif index rail scroll-spies. City chips filter inside a chapter, and each chapter links to the country's atlas page and Shuffle. Tiles are Explore's `PlaceTile`. |
| ![](before-desktop-classic-dark.jpg) | ![](after-desktop-classic-dark.jpg) | Classic dark. |
| ![](before-desktop-tropical-light.jpg) | ![](after-desktop-chapters-tropical-light.jpg) | Tropical light. |
| ![](before-desktop-tropical-dark.jpg) | ![](after-desktop-tropical-dark.jpg) | Tropical dark. |
| ![](before-desktop-click.jpg) | ![](after-desktop-quick-look.jpg) | A click opens Explore's quick-look sheet, with ←/→ through the page in reading order (3 / 121) and **Open place** to the Postcard. It replaces the legacy tabbed dialog, and the Postcard's Edit covers everything those tabs did. |
| ![](before-desktop-list.jpg) | ![](after-desktop-list.jpg) | The Compact list: thumbnails, Where, Kind, Status, Rating, Collections, Saved and a ⋯ menu, grouped by the same chapters. |
| ![](before-mobile-classic-light.jpg) | ![](after-mobile-classic-light.jpg) | Mobile. The cover collage starts at 64 px and the first place tile is at 609 px (it was about 800 px, under the stat cards, search, filters, export, sort and the view toggle). On phones, Trips & lists comes after the first chapter. The document is 390/390 px wide, with no horizontal scroll. |
| ![](before-mobile-tropical-dark.jpg) | ![](after-mobile-tropical-dark.jpg) | Mobile, tropical dark. |
| ![](before-sparse-desktop.jpg) | ![](after-sparse-desktop.jpg) | Near-empty (2 places). A duotone "Your atlas starts here" cover sits over one grid with invitations: Drop screenshots and Add a place by name. A photo-less place gets the duotone poster and a **Find image** pill. |
| ![](before-sparse-mobile.jpg) | ![](after-sparse-mobile.jpg) | Near-empty on mobile. |

## Views and states (after only)

| Capture | What it shows |
|---|---|
| ![](after-desktop-journal.jpg) | **Journal**, grouped by Collection: a collage header for each trip, the serif name, your note as an italic quote, and "✓ Been · date ★ · Tip from · Saved". |
| ![](after-desktop-map.jpg) | **Map**: the chapters as a list beside the app's existing Mapbox map, with the passport and most-saved cities below. This machine has no `NEXT_PUBLIC_MAPBOX_TOKEN`, so the map panel shows its no-token state (as `/map` does locally). With a dummy token the react-map-gl map mounts and fails only at Mapbox's token check. |
| ![](after-desktop-group-menu.jpg) | **Group by**: Country (default) · City · Collection · Shelf · Kind · Best month to go · Date saved · No grouping. |
| ![](after-desktop-filters.jpg) | **Filters** is today's panel, unchanged in behaviour, behind a button in a side sheet. All 13 place types are listed (it used to cut off at 12), the types are multi-select, and "Neighborhood" no longer overlaps its neighbour. |
| ![](after-desktop-selection.jpg) | **Select**: marks on every tile, and today's selection toolbar in the sticky bar (All/None, Archive, Delete; Add to collection is still disabled until build 2). |
| ![](after-desktop-no-matches.jpg) | Filtered to nothing: the filters in plain words, and Clear filters. |
| ![](after-desktop-chapters-classic-dark.jpg) | Chapters, classic dark. |
| ![](after-desktop-chapters-tropical-dark.jpg) | Chapters, tropical dark. |
| ![](after-mobile-chapters-classic-light.jpg) | Mobile chapters: 2-column tiles with one chip each, the heart, a ⋯ menu, and the floating **Index** pill. |
| ![](after-mobile-index.jpg) | The mobile Index sheet: every chapter in two serif columns. Tapping one closes the sheet and scrolls there. |
| ![](after-mobile-quick-look.jpg) | Quick look on mobile, as a bottom sheet. |
| ![](after-mobile-journal.jpg) | Journal on mobile. |
| ![](after-mobile-list.jpg) | Compact list on mobile: native rows, not a table. |
| ![](after-mobile-map.jpg) | Map view on mobile. |
| ![](after-mobile-classic-dark.jpg) | Mobile, classic dark. |
| ![](after-mobile-tropical-light.jpg) | Mobile, tropical light. |
| ![](after-mobile-chapters-tropical-dark.jpg) | Mobile chapters, tropical dark. |
| ![](after-sparse-desktop-tropical-dark.jpg) | Near-empty, tropical dark. |
| ![](after-empty-desktop.jpg) | No places at all: the cover and the two ways in. |
| ![](after-empty-mobile.jpg) | No places, mobile. |

## Checked live (beyond the pictures)

- **Has a photo** shows 118 of 121, which matches `sqlite3` on the seed. **Landmark + Museum**
  shows 37, and **Landmark** alone 29: a second type widens the filter instead of clearing it.
- **Export with the Been shelf** sends the 29 visible ids and returns 200 with 30 CSV lines
  (header + 29). Before, this failed validation. An **unfiltered export** returns 122 lines:
  library only, where it used to include the Inbox and the Archive.
- **Shortcuts** that the toolbar lists all work: `/` focuses search, `j`/`k` move between
  places, `Space` selects, ⌘/Ctrl+A selects everything shown, `a` opens the Archive
  confirmation, `d` opens the Delete confirmation, and `Esc` clears. ⌘K stays the app's
  command palette.
- **⋯ → Archive** on one place goes through the confirmation, the page refreshes to 120
  places, and the place is restored afterwards.
- No console errors in any view. At 320 px the app shell's header is 328 px wide on every
  page (Explore too), which this change doesn't affect.
