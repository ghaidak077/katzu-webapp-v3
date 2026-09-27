# KATZU — Implementation Log (continuation)

Recorded: **2026-09-27**. Continuation of `KATZU_V2_IMPLEMENTATION_LOG.md`, which
reached this repository's editor write-reach limit (§Known limitations, item 7
there). Section numbers continue from §11.

---

## 12. The offline shell that shipped dead (2026-09-27)

**What the audit saw.** `docs/verification-report.md` recorded the FAIL as
*"SW registers, but cold offline navigation shows blank root
(`net::ERR_INTERNET_DISCONNECTED` on reload; app-shell fallback missing for
navigation requests)"* — while the source config looked correct
(`navigateFallback: 'index.html'`, `globPatterns` including `html`).

**What was actually happening.** Measured on the built output, in a fresh
browser: `navigator.serviceWorker.ready` resolved with
`reg.active.state === 'activated'` and a controller set — and **Cache Storage
completely empty**. Attaching CDP to the service worker from its first
evaluation surfaced the exception, invisible to the page console:

```
Uncaught (in promise) add-to-cache-list-conflicting-entries :: [
  { firstEntry:  '…/assets/fonts/cairo.ttf' },
  { secondEntry: '…/assets/fonts/cairo.ttf?__WB_REVISION__=0e355a99…' }
]
```

Workbox's `precacheAndRoute` threw while building its install handler, so the
install listener was never registered: the worker activated instantly with no
routes and no precache — **silently**. Three overlapping settings produced it:

1. `includeAssets: ['favicon.ico', 'assets/mascot/*.png', 'assets/fonts/*.ttf']`
   duplicated files already matched by `globPatterns` — once unrevisioned, once
   with a revision. The generated manifest held **104 entries for 84 distinct
   files**.
2. `includeManifestIcons` (default `true`) added a second, separately-hashed
   copy of the two manifest icons, for the same reason seen from the other side.
3. The plugin derives `dontCacheBustURLsMatching` from Vite's `assets/`
   directory, so every *public* file copied there (`assets/fonts/*.ttf`,
   `assets/mascot/*.png`) was precached with `revision: null` — "immutable" —
   and a replaced font or mascot would never invalidate.

**The fix** (`vite.config.ts`): one owner per file, honest revisions.
`includeAssets` removed, `includeManifestIcons: false`, and an explicit
`dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.(js|css)$/` that matches only
the hash Vite really appends. Result on the built `sw.js`: **84 entries, 0
duplicate URLs, 0 conflicting revisions**; hashed js/css stay `revision: null`;
fonts and mascots are content-hashed.

Verified on the built bundle with the network cut: the precache holds all 84
entries and the offline navigation renders the shell (`offline: nav=ok
root=true`; before the fix, `caches: {}` and `nav-error`).

### 12.1 Why the green tests were green

`tests/pwaOffline.test.ts` pinned the *config values* — all true while the
generated worker was dead. The failure lived in the generated manifest, which
no unit test read, and there is no honest way to assert that without a build.
Regression coverage is therefore split:

- the unit suite now pins the **ownership rules** (no `includeAssets`,
  `includeManifestIcons: false`, and the exact match/no-match set of
  `dontCacheBustURLsMatching`) beside the original fallback contract;
- the live behavior is pinned by the verification battery, which now **waits**
  for `navigator.serviceWorker.ready` and for the precache to hold entries
  before cutting the network. It used to flip offline after a fixed 5 s — mid
  install on a cold cache — and report a failure it had caused itself.

## 13. The public demo had never loaded (2026-09-27)

**What a visitor saw.** `/demo` — the whole value-before-signup promise —
sat on «جارٍ تحضير الدرس التجريبي…» forever. Reproduced on production, on the
dev server, and on the built bundle; **zero console output**, and IndexedDB was
fully populated (scenarios 7, starter_phrases 8, vocabulary 122 on production).

**Root cause**, once the screen was instrumented: the lesson resolved fine —

```
[demo-debug] {scenarios: 6, phrases: 8, vocabulary: 8, lesson: bakery_shopping, questionCount: 2}
```

— and the body still showed "preparing". `useReducer(demoReducer, initialState)`
takes its initial state from the **first** render, where the Dexie live queries
are still pending and `initialState` is therefore `null`. React never adopts a
later initial value, so `state` stayed `null` for the life of the component.

**Why nothing caught it.** The demo had no browser test, and the battery's J5
block walked `/scenario/cafe_order/live` signed out — an auth-gated screen,
which by design lands on `/welcome` — so the signed-out visitor's own screen was
never actually looked at.

**The fix.** An explicit, idempotent hydration event:
`{ type: 'hydrate'; state }` handled as `state ?? event.state` (a repeat hydrate
can never wipe progress), dispatched by `DemoScreen` once the lesson — and any
resumable progress — exists.

Verified on the dev server (intro card in ~1.9 s) and on the built bundle
through the whole flow: study → quiz → produce → done, with the correct form
shown. Coverage added:

- `e2e/demo.spec.ts` — signed out on purpose, walks the entire flow, asserts
  the Arabic RTL shell, isolated LTR German, the done card, and no page errors;
- two reducer tests for `hydrate` (from null; a late hydrate never overwrites);
- the battery's J5 block now walks `/demo` signed out instead of an auth-gated
  screen.

## Verification (local, 2026-09-27)

| Command | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run test:e2e:types` | clean |
| `npx vitest run` | **62 files / 694 tests passed** (was 690; +2 hydrate, +2 offline ownership) |
| `npm run build` | clean; generated `sw.js` = 84 precache entries, 0 duplicate URLs, 0 conflicts |
| offline check on the built bundle | precache 84/84; `offline: nav=ok root=true` |
| `npx playwright test` | **25 tests in 8 files** green in groups (new: `e2e/demo.spec.ts`) |
| `node --check cloudflare-*.js` | clean on all **13** (the worker was not changed) |

Live battery re-run against `https://katzu-webapp-v3.pages.dev` is recorded in
`docs/verification-report.md` after this commit deploys.

## Known limitations

1. **The Android retest is still the owner's.** Headless Chromium has no phone
   audio stack; the device checks in §11 (orb deformation, endpointing, TTS
   intelligibility) remain manual.
2. **The OS chime** that comes with the platform recogniser belongs to the
   operating system; no web API can mute it. Accepted cost, not a failure.
3. **The demo needs device content once.** On a genuinely empty, offline first
   visit it states that honestly instead of inventing a lesson (by design).
4. **This file continues the numbering of `KATZU_V2_IMPLEMENTATION_LOG.md`.**
   That file is at its editor's reach limit and is not edited again.
