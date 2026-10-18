# Inbox screenshot delete — shared blob fix (`fm/td-inbox-photo-delete-fix`)

## Environment

- Local `next dev` on `127.0.0.1:3602`, throwaway `file:` SQLite at
  `/home/gabo/firstmate/data/td-inbox-photo-delete-fix/local.db` (migrations applied, seeded user).
  Production Turso was not used; blob `del()` was not invoked against real storage during the UI run.
- Headless Chrome 152.0.7977.75 on CDP `:9382`, driven via chrome-devtools-axi
  (`CHROME_DEVTOOLS_AXI_SESSION=td-inbox-photo-delete-fix`).
- Signed in as `photo-delete@local.dev` (credentials).
- Desktop viewport 1440×900.

## Seed highlights

- Screenshot `IMG_2912.png` (`src_img2912`) shares one `placehold.co` URL with primary photos on
  **Huacachina** and **Tacama Winery** in the Library.
- Deleting the screenshot from the Inbox must leave both place photos loadable.

## Files

- `after/inbox-before-delete.png` — inbox still shows the screenshot and updated helper copy.
- `after/library-before-delete.png` — library cards show photos before screenshot delete.
- `after/inbox-after-delete.png` — screenshot removed from inbox.
- `after/library-after-delete.png` — library photos still render after delete (`hero_image_renders=true`).
