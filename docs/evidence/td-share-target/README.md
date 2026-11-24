# One-tap sharing from a phone (Shortcut + PWA share target)

Live captures from headless Chrome 152 (`chrome-devtools-axi`) at 390×844 with touch, against
`next dev` on a local port. The signed-in user is a local seed account reading a throwaway SQLite
file built from `src/db/migrations/`. Nothing pointed at production: the Turso, Blob, Redis and
LLM settings were blanked, and TikTok page reading was switched off (which is why the TikTok card
says "Couldn't read TikTok").

| Screen | What it shows |
|---|---|
| `share-from-phone-new-token-mobile.jpeg` | Step 1 on `/share-from-phone`: a new token, its value shown once with Copy, and the token list (name, prefix, created, last used, revoke). |
| `share-from-phone-step4-mobile.jpeg` | Steps 2–4 of the Shortcut recipe, with the endpoint URL and the full `Bearer …` header value ready to copy. |
| `share-from-phone-android-mobile.jpeg` | Android / desktop Chrome install steps and troubleshooting. |
| `settings-share-tokens-mobile.jpeg` | Settings → Share from your phone: the link to the setup page and the same token manager. |
| `inbox-after-share-mobile.jpeg` | Landing after `/share-target?title=…&text=…<instagram url>` while signed out: login, then back to the share, saved, Inbox notice and highlighted card (dark mode). |
| `inbox-shared-duplicate-mobile.jpeg` | Sharing a post that is already saved: the "already in your Inbox" notice, the card highlighted. |
| `share-target-confirm-mobile.jpeg` | The one-tap confirm page `/share-target` shows when it was reached from another site rather than the share sheet. |

Endpoint checks against the same server (`curl`, with a token created on the page above):

```
POST /api/share/links  {"url": "https://www.tiktok.com/@cafe/video/…"}  → 201 {"message":"Saved to your Travel Dream Inbox.", "inboxUrl":"http://localhost:3123/inbox?link=src_…#link-src_…", …}
same again                                                               → 200 {"duplicate":true,"message":"Already in your Travel Dream Inbox.", …}
{"url":"https://example.com"}                                            → 400 {"error":"unsupported", …}
Authorization: Bearer td_share_wrong                                     → 401 {"error":"invalid", …}
no Authorization header                                                  → 401 (JSON, not a login redirect)
GET /manifest.webmanifest                                                → 200 application/manifest+json
```
