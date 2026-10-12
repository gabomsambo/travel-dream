# Library: the working tools (build 2 of 2)

Live captures from headless Chromium 152 (`chrome-devtools-axi`) of **production builds**
(`next build` + `next start`) on local ports. Both sides were signed in as local seed users and
read a throwaway SQLite file built from `src/db/migrations/`. Nothing pointed at production.
Desktop is 1440×900 with a fine, hover-capable pointer; mobile is 390×844 at 2× with touch.
**Before** is `main` at `8880ecc`, built from an export of that commit and reading an identical
copy of the same data file.

Accounts in the seed:
- `explorer@local.test`: 300 library places in 33 countries and 78 cities (70 been,
  38 planned, 192 dreaming), 13 without a photo, 6 collections, 12 places waiting in the
  Inbox, and 34 hearts.
  - The seed also has realistic places to search for: a ramen shop in Tokyo with a note about
    tonkotsu, São Paulo, Zürich, Café de Flore.
- `fresh@local.test`: 2 places (the near-empty state).
- `other@local.test`: a second tenant with look-alike data, which never appears.

## Before / after

| Before | After | What it shows |
|---|---|---|
| ![](before-desktop-tools.jpeg) | ![](after-desktop-tools.jpeg) | The tools under the cover. **Before:** a single Filters button. **After:** the shelves gain **Hearts**. Smart shelves get their own row: Needs review → Inbox, Planning soon, Recently added, No collection, Missing photo, plus saved views and **Save view**. The sticky bar gets one pill per filter, with grouping, sort, views, export and Select pinned on the right. |
| ![](before-desktop-search.jpeg) | ![](after-desktop-search.jpeg) | `ramen tokyo`. **Before:** the whole phrase was fuzzy-matched against each field, and there was no result list. **After:** every word must match somewhere, in any order, with typos and accents forgiven. A list under the pill shows the matches (*matched tag*), and ↓ ↵ opens the quick look. "Filter instead" turns the words into a real filter. |
| ![](before-desktop-filters.jpeg) | ![](after-desktop-filters.jpeg) | Filters. **Before:** a side sheet with a wall of 118 vibe chips, and no country, city or tag controls. **After:** each facet is a popover with search, checkboxes and live counts, computed with the other filters on. Options that would give zero results tuck behind "Show all". |
| ![](before-desktop-select.jpeg) | ![](after-desktop-select.jpeg) | Select. **Before:** a toolbar in the sticky bar, with Add to Collection disabled ("coming soon"). **After:** a floating bar stays on screen with Add to collection · Set status · Heart · Export · Archive · Delete, the count, and Select all / Clear. |
| ![](before-desktop-select.jpeg) | ![](after-desktop-add-to-collection.jpeg) | Add to collection finally works. One chooser for one place or many: a new collection inline (named "Lisbon trip" from the selection), your collections with collage thumbs, "Already in" or "has 1 of these", and search when there are many. |
| ![](before-mobile-tools.jpeg) | ![](after-mobile-tools.jpeg) | Mobile tools: shelves and smart shelves scroll sideways. Filters and Select come first in the tool row, so Select is never scrolled out of reach. No horizontal page scroll (390/390). |
| ![](before-mobile-search.jpeg) | ![](after-mobile-search.jpeg) | Mobile search for `kyto`. **Before:** 26 Japan places, Tokyo included. **After:** a full-screen search sheet, recent searches, results with thumbnails, "Filter instead", and a sticky **Show N places**. |
| ![](before-mobile-filters.jpeg) | ![](after-mobile-filters.jpeg) | Mobile filters: every facet in one sheet, with search in the long lists and a sticky "Clear all / Show N places". |
| ![](before-mobile-select.jpeg) | ![](after-mobile-select.jpeg) | Mobile select. **Before:** the toolbar ran off the screen, and Delete couldn't be reached. **After:** a long-press starts Select mode, and the bulk bar fits a phone (count, Add, Status, and ⋯ for the rest). |

## More states (after)

| | |
|---|---|
| ![](after-desktop-planning-soon.jpeg) Planning soon, with the window (2–26 weeks) on the chip | ![](after-desktop-save-view.jpeg) Save view, with a name suggested from the filters |
| ![](after-desktop-saved-view.jpeg) The saved view as a shelf (active), with its ⋯ for Rename / Update / Delete | ![](after-desktop-hearts.jpeg) The Hearts shelf: hearts are on the account now |
| ![](after-desktop-list-select.jpeg) Compact list in Select mode, ⌘A | ![](after-desktop-shortcuts.jpeg) `?`: every shortcut listed is real |
| ![](after-mobile-bulk-more.jpeg) Mobile bulk ⋯ | ![](after-mobile-add-to-collection.jpeg) Mobile Add to collection (a bottom sheet; no keyboard pops up) |
| ![](after-desktop-classic-dark.jpeg) Classic dark | ![](after-desktop-tropical-light.jpeg) Tropical light |
| ![](after-desktop-tropical-dark.jpeg) Tropical dark | ![](after-mobile-classic-dark.jpeg) Mobile, classic dark |
| ![](after-mobile-tropical-light.jpeg) Mobile, tropical light | ![](after-mobile-tropical-dark.jpeg) Mobile, tropical dark |
| ![](after-sparse-desktop.jpeg) Near-empty (2 places): one grid, filters and Select still there | ![](after-sparse-mobile.jpeg) Near-empty, mobile |

## Speed

Measured in the page on the production builds, headless Chromium with no GPU. A step's time
runs from the action until the new result has been on screen for two frames. Ranges span two
runs on `main` and three on this branch. A single number is a typical run.

| 300 places | main | this branch |
|---|---|---|
| A keystroke, until the next frame (median / max) | 19 / 88 ms | 37 / 97 ms |
| Search results settled (`ramen tokyo`) | 31 ms | 28 ms |
| Clear the search (161 tiles back) | 121–145 ms | 151–174 ms |
| Shelf: Planned / back to All | 65–80 / 138–166 ms | 60–80 / 146–182 ms |
| Select all 300 (⌘A) | 57–74 ms | 99–103 ms |
| Heart one / select one | — | ≈30 ms |

- **At 1,000 places** (33 countries) the numbers hardly move: 18 ms for search to settle and
  198 ms worst case. Chapters render a peek per group, so the page holds about 176 tiles
  however big the library is.
- **Search** builds its index once and scores each distinct word once per query: building the
  index and running five queries over 1,000 places takes 30 ms in Jest.
- **The extra cost per keystroke** is the result list and the suggestions. The page filters
  through `useDeferredValue`, so typing never waits for it.
- **`/library` first-load JS** is 222 kB, against `main`'s 220 kB built the same way (the budget
  is 260).
