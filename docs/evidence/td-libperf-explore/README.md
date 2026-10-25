# Explore scoped payloads — evidence

Before/after captures for the change that stops Explore from serializing the whole library
into every Explore route (and into every link prefetch of one). Each page wraps itself in
`ExploreScope` with only the places it renders; Browse-all covers are chosen on the server;
quick look's "Also in this city" loads from `GET /api/explore/same-city/[placeId]` when the
sheet opens. Existing features stay.

Desktop is 1440×900; phone is 1170×2532. Each `*-baseline.jpg` / `*-after.jpg` pair is
**byte-identical** — visual parity for a payload-only change.

| Baseline | After | Surface |
|---|---|---|
| ![](explore-home-desktop-baseline.jpg) | ![](explore-home-desktop-after.jpg) | Explore home, desktop |
| ![](explore-home-phone-baseline.jpg) | ![](explore-home-phone-after.jpg) | Explore home, phone |
| ![](explore-browse-all-desktop-baseline.jpg) | ![](explore-browse-all-desktop-after.jpg) | Browse all shelf, desktop |
| ![](explore-browse-all-phone-baseline.jpg) | ![](explore-browse-all-phone-after.jpg) | Browse all shelf, phone |
| ![](explore-quick-look-desktop-baseline.jpg) | ![](explore-quick-look-desktop-after.jpg) | Quick look sheet, desktop |
| ![](explore-quick-look-phone-baseline.jpg) | ![](explore-quick-look-phone-after.jpg) | Quick look sheet, phone |

**Covered by tests, not screenshotted:** `ExploreScope` / layout no longer ship the full
library (`explore-scope`, `explore-layout`); server-side Browse-all covers (`browse-rails`);
quick look's same-city fetch (`place-sheet`); and tenant isolation of
`GET /api/explore/same-city/[placeId]` (`same-city-route`, `cross-tenant-sweep`).
