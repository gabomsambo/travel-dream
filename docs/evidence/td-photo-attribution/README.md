# Photo attribution UI — before / after

Live captures from headless Chromium against `next dev` on `127.0.0.1:3524`, signed in as `explorer@local.test` on a throwaway copy of `file:/home/gabo/firstmate/data/td-photo-attribution/local.db`. Never Turso. Desktop 1440×900, phone 390×844, classic theme. Dark frames set `localStorage.theme` to `dark` (`html` class `dark`).

**Verified live:**

- Library place grid (Japan tiles), not the atlas header. After frames show the Wikimedia caption. Before frames are the same scroll with that caption layer hidden, so the pair shows the caption itself. Desktop and phone, light and dark; each pair’s files differ. On `after-library-card-phone-light.png` Shinjuku Gyoen’s caption still wraps onto the location line. The one-line clamp in `src/components/attribution/cover-photo-credit.tsx` landed after these captures and was not re-shot.
- Collection card. Before is Kyoto in autumn on the fallback Pexels cover (Pixabay). After sets a custom cover to the Kiyomizu Google photo; the card credits Jane Doe and shows the Google wordmark. Desktop and phone, light. Both after frames still let the place-count badge cover the end of the wordmark. The gutter in `src/components/collections/collection-card.tsx` landed after these captures and was not re-shot.
- Lightbox. After light and after dark are different files. The dark frame is the Kiyomizu photo with “Photo by Jane Doe on Google” and the Google wordmark. Before frames hide that caption; the caption-less lightbox chrome is the same in both themes, so those two before files match.
- Place hero, dark and light. The fixed white chip uses the light-background Google asset (`powered-by-google-light.svg`, one image) so the wordmark stays dark on that chip.

**Reasoned only:** tropical theme (same tokens as classic). Explore rails outside the library tiles were not recaptured; library tiles are the shared `PlaceTile`. Archive list, journal, and gallery credits were not recaptured; `src/__tests__/attribution/photo-credit-surfaces.test.tsx` checks that those credits sit outside the place link. Clearing a custom cover so the fallback photo keeps its own credit, including none for a plain upload, is `src/__tests__/collections/collection-card-cover-credit.test.tsx`, not these screenshots.
