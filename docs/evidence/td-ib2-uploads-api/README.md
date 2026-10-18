# Evidence: `GET /api/inbox/uploads`

Responses from the running app (`next dev`) on a seeded local SQLite file. `toReviewPlaceIds`
is those captures' inbox place ids, once each, newest batch first. No Turso,
no Blob store, no paid providers: the environment held only a `file:` database URL
and an auth secret. Places were made by the real `createPlacesFromPipeline` with
simulated extraction, mirroring the Inbox scout's walk:

- **3:09 PM upload** (3 screenshots): a London list, a breakfast list and Huacachina.
  The breakfast places and Huacachina were then confirmed into the Library.
- **3:13 PM upload** (6 dropped files): one new place (Médanos de Coro), the same
  breakfast slide again (4 places already in the Library), a re-upload of IMG_2912
  (skipped), a photo with no place, an unreadable poster and a vague balloon ride.
- **Oct 12 upload**: processed before outcomes were recorded (outcome removed), so
  created vs linked is derived (`outcomeDerived: true`).
- A second user with one upload of their own.

Signed in through the credentials flow, then:

| File | Caller | What it shows |
|---|---|---|
| `uploads-inbox-user.json` | `inbox@local.test` | Three uploads, newest first; every outcome row; the legacy fallback |
| `uploads-other-user.json` | `other@local.test` | Only that user's upload; none of the first user's data |

An anonymous request is redirected to `/login` by the middleware (307).
