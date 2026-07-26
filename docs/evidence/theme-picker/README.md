# Evidence — cookie-backed, server-rendered theme choice

The goal was to make the theme selectable and persisted **without changing how either theme looks**.
So the interesting evidence is mostly the absence of a visual difference, plus proof that the theme
now arrives from the server.

## Both themes are unchanged

10 routes were captured in both themes, before (`main`) and after (this branch), in a real headless
Chrome driven by `chrome-devtools-axi` against a locally-seeded database — 20 screenshots per side.
The before/after images were then diffed pixel by pixel:

| Screen | classic | tropical |
|---|---|---|
| `/archive` | identical | 58 px, max delta 16 |
| `/collections` | identical | identical |
| `/duplicates` | identical | identical |
| `/export` | identical | identical |
| `/inbox` | identical | identical |
| `/library` | 12 px, max delta 16 | 83 px, max delta 2 |
| `/map` | 90 px, max delta 40 | 86 px, max delta 38 |
| `/mass-upload` | identical | identical |
| `/review` | identical | identical |
| `/settings` | identical | identical |

**15 of 20 screens are pixel-identical.** The five that differ do so by 12–90 pixels out of
1,296,000 (≤0.007%), and every one is a non-deterministic element rather than a styling change: the
Next.js dev-tools badge, the Mapbox canvas, and text anti-aliasing. The worst single-channel delta
anywhere is 40/255, and on `/library` tropical it is **2/255** — below perception.

`*-before-after.png` in this directory are side-by-side captures (before on the left).

## The theme now comes from the server

`library-tropical-before-after.png` looks unchanged, which is the point — but the mechanism behind it
is different. Previously the server sent no theme marker at all and the tropical look was applied in
a `useEffect` after hydration, so every page load began as classic. Now:

```
$ curl -s -b 'ui-theme=tropical' .../library | grep -o 'data-theme="tropical"'
data-theme="tropical"
```

and the same request with no cookie, or with `ui-theme=banana`, renders classic. The stylesheet is
static, so this works with JavaScript disabled.

## Portals

`dialog-portal-tropical.png` — Radix renders dialogs into `document.body`, outside the themed shell.
Verified in the browser that the dialog resolves `--primary: 178 60% 48%` and `--radius: 1rem`
despite `closest('[data-theme]')` being null for it.

## Dark and light

`light-mode-tropical.png` — the theme is a separate axis from dark/light, so there are four states.
All four were checked by reading computed custom properties:

| | classic | tropical |
|---|---|---|
| light | `--primary: 221.2 83.2% 53.3%` | `--primary: 178 55% 36%` |
| dark | `--primary: 217.2 91.2% 59.8%` | `--primary: 178 60% 48%` |

## Payload

Both component trees are deliberately kept, so their weight is unchanged by design
(`ui/` 44.10 → 44.09 kB gzip, `ui-v2/` 34.14 → 34.00 kB gzip). What leaves is the runtime switching
machinery: the localStorage flag module drops out of the client bundle entirely
(5.09 → 0 kB gzip, 9 chunks → 0), replaced by 1.76 kB of constants.

Per route: **−0.35 kB gzip** on every `(app)` route, and **−0.57 kB gzip** on the root layout, which
every route including the marketing pages inherits.

`/`, `/login` and `/signup` remain statically rendered (`○` in the build output) — the cookie is read
in `(app)/layout.tsx`, never the root layout, specifically so that stays true.

## What was not exercised live

`/place/[id]`, `/collections/[id]` and `/collections/[id]/planner` were not clicked through in both
themes. Everything else above was driven in a real browser.
