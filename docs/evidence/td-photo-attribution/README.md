# Photo attribution UI — before / after

Live captures from headless Chromium against `next dev` on `127.0.0.1:3524`, signed in as `explorer@local.test` on a throwaway copy of `file:/home/gabo/firstmate/data/td-photo-attribution/local.db`. Never Turso. Desktop 1440×900, phone 390×844, classic theme. Dark frames set `localStorage.theme` to `dark` (`html` class `dark`).

**Verified live:**

- Library place grid (Japan tiles), not the atlas header. After frames show the Wikimedia caption above the place name. Before frames are the same scroll with that caption layer hidden, so the pair shows the caption itself. Desktop and phone, light and dark; each pair’s files differ.
- Collection card. Before is Kyoto in autumn on the fallback Pexels cover (Pixabay). After sets a custom cover to the Kiyomizu Google photo; the card credits Jane Doe and shows the Google wordmark. Desktop and phone, light.
- Lightbox. After light and after dark are different files. The dark frame is the Kiyomizu photo with “Photo by Jane Doe on Google” and the Google wordmark. Before frames hide that caption; the caption-less lightbox chrome is the same in both themes, so those two before files match.
- Place hero, dark and light. The fixed white chip uses the light-background Google asset (`powered-by-google-light.svg`, one image) so the wordmark stays dark on that chip.

**Reasoned only:** tropical theme (same tokens as classic). Explore rails outside the library tiles were not recaptured; library tiles are the shared `PlaceTile`.
