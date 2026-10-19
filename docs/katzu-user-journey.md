# Katzu — the full user journey, install to the end

A step-by-step reconstruction of everything that happens to a learner, from the
moment the app lands on their phone to the moment they leave it. Every claim is
labelled:

- `[observed]` — read directly out of the source in this repo, or seen in a live
  run of the dev server on `:3000`.
- `[inferred]` — a conclusion drawn from observed code, not from a run.
- `[unknown]` — could not be established without production credentials/AI spend.

Route list, file paths and line-level detail come from the same tree as
`docs/katzu-baseline.md`; this document is the *narrative* version of it.

---

## 0. The journey in one table

| # | Stage | Route | What the learner does | What the app writes |
|---|---|---|---|---|
| 1 | Install / launch | `/` (PWA `start_url`) | taps the icon | SW precache, `katzu_install_id`, seed rows |
| 2 | Public front door | `/` | reads, decides | `landing_viewed`, source tag |
| 3 | Value before signup (A) | `/demo` | one real lesson | `katzu_demo_state_v1` (localStorage) |
| 3′ | Value before signup (B) | `/welcome` | types name, picks plan | `users` row + `katzu_onboarding_completed` |
| 4 | Account | `/signin` | Google sign-in | `sessionToken`, `isLoggedIn`, subscription flag |
| 5 | Getting to know you | `/onboarding` | 5 questions | `primaryGoal`, `arrivalStatus`, `dailyGoalMinutes`, … |
| 6 | Measurement | `/placement` | ~6 min adaptive check | `cefrLevel`, `placementCompletedAt` (+ SRS from missed items) |
| 7 | Home | `/app/trail` | taps today's mission | `onboardingPromptDismissedAt` (if dismissed) |
| 8 | Story | `/scenario/:id/story` | listens to the opener | — (translate call only) |
| 9 | Guided Practice | `/scenario/:id/practice` | rehearses 2–3 lines | `review_items` (enrolled), `skill_practice` |
| 10 | Live conversation | `/scenario/:id/live` | speaks **N** turns | `sessions`, `mistakes`, `review_items`, `totalXp`, `streakDays`, `daily_tasks` |
| 11 | Debrief | `/session-report` | reads, retypes corrections | `review_items.reps`, `cefrLevel` (if promoted) |
| 12 | Habit loop | `/app/trail`, `/app/review`, `/app/grammar` | returns daily | `daily_tasks` day rows, streak |
| 13 | Money (only if needed) | `/subscription`, `/paywall`, `/mock` | buys/redeems a code | `redeemed_codes`, `isSubscriptionActive` |
| 14 | Long tail | `/app/*` | keeps using it | collections, progress |
| 15 | The end | `/app/profile`, `/delete-account` | exports, deletes, signs out | wipe local + cloud |

The funnel events that mark each transition are listed in §18.

---

## 1. Install — what "installing Katzu" actually is

`[observed]` Katzu is **not a native app**. It is a RTL Arabic PWA
(`vite-plugin-pwa`, `vite.config.ts` → `pwaOptions`). "Installing" means either
adding the site to the home screen or opening it in a browser; both land on the
same React app.

The install contract, as configured:

- manifest name `Katzu — رفيقك لتعلم الألمانية`, `short_name: Katzu`,
  `display: standalone`, `orientation: portrait`, `dir: rtl`, `lang: ar`,
  theme/background `#000000`.
- `id: '/'`, `start_url: '/?source=pwa'`, `scope: '/'` — pinned so one phone
  cannot grow two Katzu installs from a re-shared deep link.
- Three icons: 192, 512, and a `maskable` 512 (opaque art, the head inside the
  40 % safe zone, so an Android squircles-crop does not clip it).
- Two launcher shortcuts: **محاكاة B1 مجانية** → `/mock`, **المهمة اليومية** →
  `/app/trail`.
- `index.html` also ships the iOS fallbacks (`apple-touch-icon`,
  `apple-mobile-web-app-*`), so an iOS home-screen install is not a white square.

`[observed]` **Verified against a real production build** (`npm run build`, exit 0,
`tsc` clean): the build emits `dist/manifest.webmanifest` whose contents match the
config byte-for-byte — `start_url: "/?source=pwa"`, `id: "/"`, `scope: "/"`,
`display: "standalone"`, `orientation: "portrait"`, `dir: "rtl"`, the three icons,
and both shortcuts (`/mock`, `/app/trail`) — plus `dist/sw.js` +
`dist/registerSW.js`, precaching **112 entries / 4 948 KiB**.

`[observed]` Note for anyone testing the install locally: `/manifest.webmanifest`
is a **build-time** artifact. On the Vite dev server it is not served at all —
`fetch('/manifest.webmanifest')` returns the SPA's `index.html` with a 200 (which
is also why the hero-video check inspects `content-type` and not just `res.ok`).
The installable app only exists in `dist/`.

`[observed]` The service worker (`workbox` block in the same file):

- precaches `js, css, html, ico, png, webp, ttf, woff2`;
- `navigateFallback: 'index.html'` — a **cold offline open** lands on the cached
  shell instead of the browser's error page;
- runtime-caches `https://*.workers.dev/(scenarios|vocabulary|grammar)` with
  `StaleWhileRevalidate`, 100 entries / 7 days — this is the content cache, and
  it is why the *mission* works offline later (confirmed present as the
  `katzu-api-content` cache in the generated `dist/sw.js`);
- the AI conversation is never cached and never claimable as offline.

`[observed]` `public/_headers` sets a CSP that allows exactly: own origin,
Google's GSI script/style/frame, and `*.workers.dev` as a connect target.
Microphone is allowed for self only (`Permissions-Policy: microphone=(self)`).

## 2. First launch — the boot sequence, exactly

`[observed]` `src/main.tsx` runs four side effects **before** React renders, in
this order:

1. `installDiagnosticsCapture()` — console + `window.onerror` +
   `unhandledrejection` into a timestamped buffer (`kz-diagnostics-crashes` in
   localStorage on this dev machine).
2. `installPreloadRecovery()` — a deploy that swaps lazy chunks under a running
   session triggers **one guarded reload** instead of a dead route.
3. `installAnalyticsLifecycle()` — flushes the queue on reconnect and on
   backgrounding.
4. `trackRetentionReturns()` — seeds `katzu_retention_first_seen` and fires
   day-1 / day-7 anonymous return markers once each.

Then `<ErrorBoundary><NetworkStatusBanner /><App /></ErrorBoundary>`.

`[observed]` `AppRoutes` then, on mount:

- `captureSourceFromSearch(location.search)` on **every** route change — the
  `?ref=` / channel tag is kept for later (a tag that only lives in the address
  bar is gone by the time the learner would pay).
- fires `share_landed` **once per page load** if the URL carries a share marker.
- `initializeDatabaseSeed()` → `seedArrivalTopUps()` → `suppressInvalidReviewItems()`
  → then three content fetches (`fetchScenarios`, `fetchVocabulary`,
  `fetchGrammar`) from the Worker.
- until that resolves, the whole app renders `جاري التحقق من الحساب...`
  (`role="status"`, `aria-live="polite"`).
- `document.title` is set per route (`titleForPath`) — 26 screens used to share
  one title.

`[observed]` A hostile-network detail worth copying: if a *deploy* swapped chunks
mid-session, the recovery reload runs; if a route's code is still arriving, the
learner sees `جارٍ التحميل…` inside `<Suspense>`, never a blank page.

`[observed]` The local datastore is Dexie at **version 9** (`katzuDb.ts`), with
tables: `scenarios`, `starter_phrases`, `vocabulary`, `grammar`, `saved_words`,
`users`, `redeemed_codes`, `sessions`, `scenario_training`, `mistakes`,
`sync_queue`, `review_items`, `skill_practice`, `memory_patterns`,
`grammar_lessons`, `daily_tasks`. Every migration is additive.

`[observed]` On the dev machine the first-visit footprint is exactly:

- localStorage: `katzu_install_id`, `katzu_analytics_queue_v1`,
  `katzu_retention_first_seen`, `katzu_demo_state_v1` (after a demo),
  `kz-diagnostics-crashes`
- IndexedDB: the Katzu database above
- cookies: **none set by Katzu**. The only cookie observed on the dev origin is
  `g_state`, written by Google's GSI script — a third-party artifact of the
  sign-in widget, not app state. All learner state is local storage + IndexedDB +
  the Worker's session token.

## 3. `/` — the public front door

`[observed]` Before this page existed, `/` redirected straight into `/app/trail`
and every stranger was bounced into a name form. It is now the only surface that
explains the product before asking for an account.

`[observed]` The page order is deliberate — "the order a stranger actually
decides in": hero → the demo they can take right now → proof → price → who made
it → FAQ. Sections as rendered live on `:3000`: `Hero`, `TryDemoSection`,
`ExampleSection`, `FreeVsProSection`, `FounderSection`, `SkillsSection`,
`ComingSection`, `FaqSection`, `Footer`.

Two variants of the same page, chosen by whether a `users` row says
`isLoggedIn`:

| | visitor | signed-in learner |
|---|---|---|
| header | `تسجيل الدخول` + `ابدأ مجاناً` | `متابعة التعلّم` |
| hero primary | `جرّب درساً بدون حساب` → `/demo` | `متابعة رحلتك` → `/app/trail` |
| hero secondary | `ابدأ مجاناً الآن` → `/welcome` | — |
| hero tertiary | `لديّ حساب` → `/signin` | — |

`[observed]` Live confirmations on the dev server: the badge reads
`عربي أولاً · ألمانية الحياة اليومية`, H1 `تحدّث الألمانية التي تحتاجها فعلاً /
لا كلمات تحفظها وتنساها`, the four proof chips (`يتحدّث بصوت عالٍ`, `يستمع
ويملي`, `يتذكّر أخطاءك`, `يعرف مستواك من البداية`), the three real
Arabic-speaker mistakes (`Ich habe 25 Jahre.` → `Ich bin 25 Jahre alt.`,
`Ich gehe nach Arzt.` → `Ich gehe zum Arzt.`, `Ich wohne in der Berlin.` →
`Ich wohne in Berlin.`), and the free column literally printing **`3 جلسات
محادثة مجانية`**.

`[observed]` Honesty rules encoded in this page, which a clone should keep:

- `MAX_FREE_SESSIONS_AR` is imported from `lib/entitlement/trialCopy.ts`, whose
  value is pinned by `tests/trialPromise.test.ts` against the Worker's
  `MAX_FREE_AI_SESSIONS` — the landing page cannot promise a different number
  than the server enforces.
- the Pro headline comes from `usePricing()` (the server's `/pricing`). With no
  price available it renders `Katzu Pro — السعر عند صفحة الشراء`, not an invented
  figure — which is what the live run showed.
- `Lesen` is marked `قريباً` while `Sprechen`/`Hören`/`Schreiben` say
  `متاح الآن`; the writing card moved to "available" in the same commit that
  shipped `/app/write`.
- the non-affiliation sentence is verbatim and marked do-not-edit.
- `VideoSlot` does a `HEAD /videos/katzu_hero_video.mp4` and renders **nothing**
  unless the response is `video/*` — an absent video leaves the page untouched.
- `landing_viewed` fires with `source: signed_in | visitor`.

## 4. Branch A — `/demo`: value before signup

`[observed]` The public demo is a complete, real learning turn with **no account
and no AI call** (`lib/demo/demoFlow.ts`). It exists because the landing page used
to end at Google sign-in, so a stranger could not find out what Katzu does
without handing over an account first.

- Lesson source: real cached content only — a scenario that has **both** starter
  phrases and vocabulary; up to 2 phrases + 2 vocabulary items, deterministic
  (first stable candidate, not random).
- Stages: `intro → study → quiz → produce → done`.
  - `study`: one item at a time; each item the visitor actually looked at is
    recorded in `studiedIndices`.
  - `quiz`: two multiple-choice comprehension questions built from real rows.
  - `produce`: the visitor writes (or speaks) one German sentence; graded by
    `gradeProduction`, the **same comparator family as the review engine** — no
    fake AI feedback, no invented score.
- State lives in `localStorage['katzu_demo_state_v1']` (versioned).
- Events: `demo_started`, `demo_completed`.

`[observed]` **What crosses into the account** when they later sign in
(`lib/demo/migration.ts` → `consumeDemoProgress()`, called from `SignInRoute`):

1. the scenario they actually studied, with a truthful `studiedAt`;
2. the content rows they saw, enrolled into the spaced-repetition queue —
   idempotent by `[kind+refId]`, and the training row keeps the *earliest*
   truthful timestamp so a re-run cannot overwrite real progress.

The demo's quiz score and production verdict are **deliberately discarded**:
they are client-side, unmoderated and unverifiable, so recording them as
achievement would be exactly the "claim a learner learned something the app did
not measure" failure the product forbids.

Demo exits: `onSignUp` → `/signin?mode=signup`, `onStartPlacement` →
`/signin?mode=signup&returnTo=%2Fplacement`.

> `[observed]` **Defect worth knowing:** `returnTo` is written at `App.tsx:280`
> and read **nowhere** in the repo. It is a dead parameter. The post-sign-in
> destination is decided by `needsOnboarding` / `needsPlacement`, which happens
> to land on `/placement` anyway — so the intent survives by accident, not by
> code.

## 5. Branch B — `/welcome`: name, plan, then the account

`[observed]` `WelcomeScreen` (`features/auth/WelcomeScreen.tsx`):

- badge `Katzu AI • رفيقك الذكي`, H1 `تحدث الألمانية بدون خوف`, one paragraph
  naming Katzu as "الساخر والذكي".
- one optional text field, placeholder `اسمك داخل المحادثة — اختياري`. Empty is
  allowed and means the display name `متعلم` — "a required free-text box at the
  front of the app buys nothing the screen has not already promised".
- primary `ابدأ رحلتك الآن` opens `GoalSelectionBottomSheet`:
  minutes **5 / 15 / 30**, days **3 / 5 / 7**, level **A1 / A2 / B1 / B2**.
- on save, one write: `db.users.update('current_user', { displayName,
  dailyGoalMinutes, weeklyGoalDays, cefrLevel, updatedAt })`, then
  `localStorage['katzu_onboarding_completed'] = 'true'`, then
  `onGoToSignIn('signup')`.
- secondary `جرّب درساً كاملاً بدون حساب` → `/demo`; a Google button → `/signin`;
  footer links to sign-in / create account; maker credit
  `صُنع بواسطة غيدق علوش — ghaidak.com`.

> `[observed]` **Semantic wrinkle to be aware of when cloning:** the flag
> `katzu_onboarding_completed` is written here *before* onboarding has run. It is
> read only by the auth redirect in `App.tsx`, which uses it to choose `/signin`
> vs `/welcome` for a signed-out visitor. The actual onboarding gate is
> `needsOnboarding(user)` against `onboardingCompletedAt` in Dexie — so the two
> meanings never collide, but the name is doing two jobs.

## 6. `/signin` — Google only, and one button at a time

`[observed]` `SignInScreen`:

- **Google Identity Services only.** No password, no email form, no magic link.
- Tab switcher `تسجيل الدخول` / `إنشاء حساب جديد`; the second fires
  `signup_started {source:'tab'}`.
- The A0–B2 level picker appears on the **signup** tab only (a returning learner
  is not asked to re-pick a level the app already stores).
- Exactly one button is on screen at any moment: Google's own iframe button if
  GSI actually drew (checked 700 ms after `renderButton`), otherwise Katzu's
  fallback behind the same `accounts.id.prompt()`. Two identical choices 12 px
  apart was a real, measured defect.
- The GSI container is labelled in Arabic (`role="group"`,
  `aria-label="التسجيل السريع باستخدام Google"`) because Google's iframe is
  titled in Indonesian by default.

`[observed]` On a successful credential, in order:

1. `signup_started {source:'google_button'}` (GSI's own button is a cross-origin
   iframe, so a click handler cannot catch it — the event fires where it
   completes);
2. decode the JWT **in the client** for `email` / `name` / `sub`;
3. `exchangeGoogleToken(idToken)` → `session_token`. The raw Google ID token is
   used **once** and never written to IndexedDB; if the exchange fails, sign-in
   fails honestly (no raw-token fallback);
4. `db.users.update('current_user', { email, googleAccountEmail, displayName,
   sessionToken, accountId, isLoggedIn: true, cefrLevel })`;
5. `checkSubscriptionStatus(sessionToken)` → sets **or clears**
   `isSubscriptionActive` / `subscriptionExpiresAt` (a server-side "inactive"
   downgrades immediately, not at the next check);
6. `restoreProgress(token)` then `syncReviewQueue(token)` — a learner signing in
   on a new device gets back the review schedule, not an empty queue;
7. haptic success, `signup_completed` if signup, `تم إنشاء حسابك بنجاح! جاري
   الدخول...`, then 600 ms later `onSuccess`.

`[observed]` `onSuccess` then: set `katzu_onboarding_completed`, run
`consumeDemoProgress()`, and route:

```
needsOnboarding(user)  → /onboarding
else !placementCompletedAt && !placementSkippedAt → /placement
else → /app/trail
```

— the four questions come first, and only then the measurement, "so the questions
are never what blocks the first lesson".

`[observed]` If `VITE_GOOGLE_CLIENT_ID` is missing the screen becomes a
configuration-error page (with the exact env-var name to set) and offers
`المتابعة كضيف للمعاينة التجريبية` — a synthetic `guest@katzu.app` account with
`'preview_guest_token'`. Useful for local testing; a clone should be aware this
path bypasses the token exchange entirely.

## 7. `/onboarding` — five questions, one per screen

`[observed]` `OnboardingScreen`, mode `first_run` (or `edit` from Profile). Not a
settings form: **one question per screen, dot progress** rather than a fraction,
haptics on every advance, Katzu's own voice, and every answer changes something
real.

| step | question | what it actually changes |
|---|---|---|
| `goal` | لماذا تتعلّم الألمانية؟ (`daily_life` / `work` / `university` / `exam`) | reorders which situations come first (category keyword scoring) |
| `arrival` | where are you in the move? (`preparing` / `recently_arrived` / `living_in_germany`) | which situations are treated as urgent |
| `previous` | what have you tried before? (`first_time` / `some_basics` / `can_hold`) | only which ending the placement question recommends |
| `time` | daily minutes | the mission's length |
| `target` | a date (travel / exam / job) | the countdown line, allowed only in the last month |

`[observed]` The last step is the placement offer, not a question:
`placementOffer(previous)` recommends `start` for a first-timer ("يمكنك أن تبدأ
الآن مباشرة") and `placement` for anyone who studied before ("دقيقتان من القياس
قد توفّر عليك شهوراً من البداية الخاطئة"). Skipping is always possible.

`[observed]` Writes (`onboardingPatch`): `primaryGoal`, `arrivalStatus`,
`previousGerman`, `dailyGoalMinutes` (only when it is one of the offered
choices), `weeklyGoalDays` clamped 1–7, `targetDateKind`, `targetDate` sanitized
(rejects more than a day in the past, more than 5 years out, non-finite),
`onboardingCompletedAt`, `updatedAt`. Skip also writes `placementSkippedAt`.

`[observed]` Events: `onboarding_started`, `onboarding_completed {source:
'take'|'skip'}`. A failed local write is logged and the learner still proceeds —
"a failed local write must not trap the learner".

## 8. `/placement` — the measurement

`[observed]` `PlacementScreen`, an adaptive staircase over the **already-cached**
vocabulary and starter phrases:

- levels walked A0 → B2; each question is drawn at the level the staircase
  currently rests at, and every row is marked used as it is shown so nothing is
  asked twice;
- a listening question is inserted periodically (`shouldUseListening`), gated on
  `speechSynthesis` actually existing — "a listening question on a silent device
  is a dead end";
- answers feed `applyPlacementResponse`; `isPlacementFinished` ends the walk;
- on finish, the level is committed **and the missed items are enrolled into the
  spaced-repetition queue**, so "the first review session is built from what they
  got wrong".

`[observed]` Writes: `cefrLevel` + `placementCompletedAt` +
`placementEstimatedLevel` for a *measured* result; `cefrLevel` +
`placementSkippedAt` for a manual choice. Profile later speaks the difference
honestly (`describeLearnerLevel`): `مستواك المقيس: B1`, or `لم تقيس مستواك بعد —
نعرض A1 كبداية عملية`, or `مستواك غير مقيس بعد…`.

`[observed]` Events: `placement_started`, `placement_completed {source:
'measured'|'chosen', state: level}` → `/app/trail`.

## 9. `/app/trail` — Journey Home, or "what do I do today?"

`[observed]` `JourneyHomeScreen` answers one question once, with one action.
Everything on it is derived from recorded evidence.

Reads: one transactional live query (`readJourneyHomeData`, which replaced eight
full-table `toArray()`s), the capability model (`buildCapabilityModel`), and the
daily-task snapshot. Then:

```
level   = servedLevel(user.cefrLevel, isPro)        // free tier ⇒ A1 (or A0)
mission = selectDailyMission({ level, goal, scenarios, training, reviewItems,
                               scenarioLevels, weakestSkill, dailyMinutes,
                               targetDate, targetDateKind })
```

`[observed]` What is on the screen, top to bottom:

1. `اليوم N · الفصل X من Y` + chapter title, online/offline indicator, and a
   quiet `Katzu Pro` button when not Pro.
2. An onboarding prompt card (dismissible, writes `onboardingPromptDismissedAt`)
   **only** for profiles that predate onboarding — answered once, "never
   mid-task".
3. The mission card: scene banner, `title_de` + `title_ar`, the `reasonAr` for
   *why this today*, estimated minutes, and — when `level !== learnerLevel` — the
   explicit note `هذه المهمة بمستوى A1 — وهو المتاح في الخطة المجانية`. An exam
   countdown appears only inside the last month, and only *beside* the mission.
4. One `PrimaryAction`, whose label is chosen by the mission plan itself
   (`mission.ctaAr`).
5. The three daily tasks (§14).
6. Katzu's one line (`katzuJourneyLineAr`), rendered only when a real state
   produced it.
7. A quiet review-due row, only when something is due **and** the mission is not
   already review — "two prominent CTAs is how a learner does neither".
8. The earned-capability card (magenta) **only** when a real unaided success was
   recorded; otherwise the chapter-goal card in the same slot.
9. Chapter progress as segments, never a percentage.
10. Three chips: `القواعد`, `كل المشاهد والمستويات`, `المستوى A1`.

`[observed]` **There is no gate on this screen, on purpose.** Today's mission is
always startable — on the first run and the hundredth. `servedLevel` guarantees a
free learner is handed an episode at the level the *server* will serve, so the
402 can never arrive mid-episode. The trial limit lives in the Worker; the Pro
offer is made on the Debrief after a finished episode.

## 10. `/scenario/:id/story` — the episode opening

`[observed]` `StorySetupScreen`: near-full-bleed scene art, a glass panel that
says where you are, who you are about to speak to, and what you will have to do.
The German opener is a real character line **at the level the conversation will
actually be served at** — never a level-appropriate sentence followed by a
different level's conversation. The opener can be played before the conversation
starts, and its Arabic gloss comes from the edge-cached translate route; a
failure shows a **retry**, never a blank line.

`[observed]` Every slow/failed read is a state with a way out (`useLiveRow`):
`جارٍ تجهيز المشهد…`, `لم نجد هذا المشهد على هذا الجهاز بعد`, or a stalled-read
message plus `إعادة المحاولة`. Never a spinner forever.

## 11. `/scenario/:id/practice` — Guided Practice

`[observed]` Deliberately short — "the conversation is where the learning
happens": two or three phrases to read and say, then one retrieval, one listening
moment, out.

- Deck built by `buildGuidedPractice({ phrases, vocabulary(topic = scenario),
  grammar, level })`.
- Deeper beats are **collapsed by default and only one is open at a time**, so at
  most one text field is ever on screen.
- Both graded moments use the review engine's own comparators
  (`gradeTypedProduction`, `gradeRepeat`) — "correct" means the same thing on
  every screen that says it.
- `buildWordBank` gives tappable word chips for the production answers, because
  the owner's report was that these beats asked for a German sentence with no way
  to find the vocabulary.
- Voice preferred, typing always available; a denied or unsupported microphone
  degrades into a text box, never a dead end.
- Items the learner studied are enrolled into the SRS queue here — the same
  enrolment the authenticated Study screen performs.

Exit: `أنا جاهز` → the live conversation, carrying `{ vocabulary, grammarId }`.

## 12. `/scenario/:id/live` — the live conversation

`[observed]` One explicit state machine (`lib/conversation/stateMachine.ts`)
replaced a pile of mutually contradictory booleans. States:
`idle · recording · transcribing · evaluating · generating_reply ·
showing_feedback · retryable_error · offline · quota_exhausted · completed`.

Rules the tests pin:

- a submit while a turn is in flight is **dropped** — no duplicate sends, no
  double quota burn;
- the learner's sentence survives every failure and is cleared **only** by a
  successful turn;
- `retry` is possible only from `retryable_error`/`offline`, and reuses the same
  turn id and the same text;
- quota exhaustion and session invalidation are **terminal for the session**, so
  a retry cannot spend the rest of the allowance.

`[observed]` One turn, end to end:

1. record (mic) → `stop_recording` → transcribe on the Worker (the browser's own
   speech API is gone; it "recorded nothing on…");
2. `isUsableTranscript` rejects a stray `a`/dash/punctuation from background
   noise as a failed listening attempt rather than spending a model call and a
   quota unit on a sentence nobody said;
3. `sendTurn(...)` — one fused `/ai/turn` call per turn carrying the scenario,
   vocabulary context, grammar id, history, CEFR level, sarcasm level,
   `isFinalTurn`, mode (`roleplay` for practice, `extended` for real),
   `sessionId`, allow-listed `learner_memory` patterns and `turnIndex`;
4. the reply arrives with the pedagogical evaluation embedded — `germanReply`,
   `arabicTranslation`, `followupAr`, `isCorrect`, `mistakeSegment`,
   `correctedSegment`, `grammarRule`, `grammarReference`, `explanationAr`,
   `roastComment`, `positiveNoteAr`, and **one context-aware hint** (same call,
   no extra round-trip);
5. the reply is spoken automatically with word-by-word highlighting;
6. if it was wrong, the mistake is written to `mistakes` **and** enrolled as a
   scheduled review item;
7. on the first sentence produced *without a hint*, `first_independent_turn`
   fires — "the product's real 'you can speak' moment".

`[observed]` Modes (`lib/conversation/turnPlan.ts`): `practice` = hints,
translation, direct correction; `real` = no hints, no translation, no live
correction, report at the end. Length is a **level** property
(`levelSpec.maxSessionTurns`), not a mode one.

`[observed]` What the screen does at the wall:

- `402 PAYWALL_REQUIRED` (level beyond the free tier) or
  `FREE_QUOTA_EXHAUSTED` (the three conversations spent) →
  `quota_exhausted` + the `PaywallModal`, whose title names the *exact* thing:
  `انتهت 3 جلسات محادثة مجانية` or `هذا المستوى ميزة Pro`, with
  `free_session_exhausted` counted **only** for the quota case (a learner locked
  out of B2 on turn one has not spent anything).
- `DAILY_SPEND_CAP` → an explicitly *not-your-fault* message
  (`أوقفنا المحادثات مع Katzu مؤقتاً حتى تبقى الخدمة مستقرة…`) and **retryable**,
  because it lifts on its own. Without this case the learner was told their
  sentence had a fault — the one thing they will keep retrying all day.
- Changing difficulty mid-conversation is a **Pro** feature
  (`handleNudgeDifficulty`): a free learner tapping it gets a paywall modal, not
  a silent no-op.

`[observed]` `finishSession()` then, in order:

1. writes the `sessions` row — `sentencesSpoken`, `accuracyPercent`,
   `durationSeconds`, `wasIndependentOnly`, `independentSentences`,
   `hintAssistedSentences`, `mode`, `mistakesCount`;
2. `conversation_completed` then `scenario_completed`;
3. XP from the frozen `sessionXp` rule (REAL weighted higher), credited **only**
   through `creditXp` — the anti-farming daily cap of **600 XP/day**, with
   anything the cap refused reported as `cappedTo` rather than silently dropped;
4. `recalculateStreak` — consecutive days, honest reset, same-day repeats never
   inflate;
5. `markScenarioTaskDone()` — today's scenario task is done the moment a
   conversation ends;
6. `enqueueDailyEvent(...)` — the day, the XP cap and the streak are enforced
   against the **server's** clock, not the device's;
7. `syncProgress(sessionToken)` in the background;
8. hands the summary to `/session-report`.

## 13. `/session-report` — the Debrief

`[observed]` "The conversation just ended, so the learner's question is *did that
count, and what now?*" — answered only with recorded evidence. There is **no AI
call behind this screen** (`buildSessionDebrief` is deterministic).

- Outcome from `capabilityFromSession`, mapped to one of five states with a
  matching Katzu pose and line: `NOT_STARTED`, `INTRODUCED`, `PRACTISING`
  (assisted, explicitly told it is normal), `INDEPENDENT`
  (`أتممت الموقف بنفسك، بلا تلميحات`), `RETAINED`. Celebration is not rendered at
  all; magenta appears only when the same threshold the Progress screen uses was
  crossed — which is why the two screens can never disagree.
- Capability card: independent sentences `n / total`, accuracy on independent
  sentences only (`—` plus `لا توجد جُمل مستقلة كافية للحكم بعد` when there are
  too few), corrections count, the dominant weakness by taxonomy, and the line
  that says what happens next: *"أضفنا ما أخطأت فيه إلى مراجعتك المجدولة — أول
  موعد غداً، ثم تتباعد المواعيد…"*.
- Debrief card: headline, what went well, top mistakes with the rule explained,
  phrases to keep (each with a play button), `canNowAr`, and a comparison to the
  previous session when one exists.
- **Retype drill**: typing the correction back is graded by
  `gradeCorrectionRetype` and then graded *through the review store*
  (`gradeReviewItem`) — one correct retype is practice, not mastery, and mastery
  is the review engine's own `MASTERED_REPS = 3`. The old version wrote
  `isMastered` after a single retype; two definitions of one word was the defect.
- **Exam scenarios only:** `buildExamCard` + a share image. It says `محاكاة`,
  never claims a score, and carries the mock notice verbatim.
- **Level promotion offer** (quiet card, learner's choice):
  `أصبحت جاهزاً لمستوى A2` with `الترقية إلى A2` / `تمت الترقية`, backed by
  `isEligibleForPromotion` over the same measured sessions.
- **The Pro offer** — `shouldOfferPro({ isPro, completedEpisodes })`, which is
  false until at least one conversation with a spoken turn exists. "Nothing is
  blocked by dismissing it, and the offer never appears before this point."
- The primary action returns to the Trail (or to Review when this session
  produced real corrections).

## 14. The habit loop — daily tasks, streak, review, reminders

`[observed]` Three tasks, exactly (`lib/daily/tasks.ts`), reset at local midnight,
with **one forgiven day**:

| task | completes when |
|---|---|
| `محادثة مشهد واحدة` | one finished conversation today |
| `خطوة قواعد واحدة` | one grammar-lesson attempt today |
| `دفعة مراجعة` | 5 graded review items **or** the queue emptied after at least one |

Two rules that matter when cloning:

- a completed day is **monotonic**. `reviewCompleted` is persisted, so a new item
  becoming due at 18:00 cannot un-complete the batch and drop the streak;
- the streak line states plainly how many consecutive completed days there are,
  and **says so when a day is being forgiven** — "a habit loop that lies about a
  missed day is worse than none".

`[observed]` Review (`/app/review`) is the retrieval engine: due items by `dueAt`,
graded `again | hard | good`, mastery at 3 good recalls, intervals that widen as
recalls succeed. Kinds include the mistakes, studied vocabulary and phrases. It is
free forever and works offline — "the offer can never take something back".

`[observed]` Reminders are an **`.ics` download only** (`lib/reminder/ics.ts`,
offered from Profile when a target date exists): one day before the learner's own
date, all-day or timed, correct escaping and line folding, filename from
`reminderFileName()`, and `share_click {kind:'ics_reminder'}` when downloaded.
There is **no push server, no VAPID keys and no email** — both explicitly
deferred, and the app hands over a calendar file rather than promising a
notification it cannot deliver.

## 15. The money path, in the order the learner meets it

`[observed]`

1. **In-context modal** — `PaywallModal` (`paywall_viewed {source}`) is what the
   conversation shows at the wall, and it says what the learner still has
   (`freeSessionsCopy` reads the *server's* ledger; a `null` ledger says
   "لم نتمكن من تحديثه الآن", never a made-up number).
2. **`/paywall`** — `PaywallScreen`, the priced offer, every number from
   `/pricing`.
3. **`/subscription`** — `SubscriptionRedemptionScreen`: the priced offer *and*
   the redemption box (`#redeem-code`) on one path, plus the referral claim. It
   states the free allowance honestly, links to the separate sales site (crypto
   via NOWPayments, or local payment in Syria) with the referral code attached,
   and on `verifyCode(code, token)` writes `redeemed_codes` and fires
   `code_redeemed`. **There is no in-app payment and no auto-renewal** — a code
   bought outside, activated inside.
4. **`/mock`** — one free B1 speaking mock exam. `/mock/start` decides on the
   *server* whether this is the one free seat, a credit, or a paid repeat; the
   mock is three parts (plan together, present a topic, react to questions) on the
   same conversation engine, with a part clock that warns and counts but never
   stops the learner talking, an `estimatePracticeScore`, and a share card.

## 16. The long tail — where a returning learner actually spends time

`[observed]` `/app/library` (the pre-V2 trail: every scenario and level;
`isLevelFree` keeps A0/A1 open), `/scenario/:id/study` + `/scenario/:id/quiz`,
`/app/grammar` (the rules section, browsable by level, linking into scenes),
`/app/listen` (dictation: hear the German, type it, corrected word by word),
`/app/write` (exam-format writing tasks assessed on four criteria; past the free
allowance the 402 message is honest about it), `/app/coach` (the error bank by
taxonomy, feeding Review), `/app/ask` (Ask Katzu), `/app/progress` (earned
capability and collections, not a score), `/app/profile`, `/trust/*` (privacy,
terms, contact, imprint, refund — public on purpose so they can be read before
signing up).

## 17. The end of the journey

`[observed]` Three exits, all deliberate:

- **Sign out** — `signOutSession()` (best-effort) then `wipeUserScopedData()`,
  which clears sessions, mistakes, saved words, training, redeemed codes, review
  items, skill practice, grammar lessons and daily tasks inside one transaction.
  A signed-out device holds no learner content.
- **Delete account** — from Profile (`deleteAccount()`: server sessions revoked
  and cloud data deleted, then local wipe and return to sign-in), and also from
  `/delete-account` (`DeletionRequestScreen`), which is reachable **without a
  session** — "erasure that does not depend on still holding a session".
- **Uninstall / go offline** — the SW keeps the shell; a cold offline open lands
  on the cached app; the mission, the review queue and everything already learned
  keep working, because the content cache is 7-day `StaleWhileRevalidate` over
  `scenarios|vocabulary|grammar` and the review items are local. The AI
  conversation is the one thing that never claims to work offline — the
  indicator says the *cached mission* works, nothing more.

## 18. Funnel event timeline (what the instrument believes happened)

`[observed]`

```
landing_viewed {source: visitor|signed_in}
demo_started ─────────────────────────────► demo_completed
signup_started {source: tab|google_button} ─► signup_completed
onboarding_started ─► onboarding_completed {source: take|skip}
placement_started  ─► placement_completed  {source: measured|chosen}
scenario_started   ─► first_independent_turn ─► conversation_completed ─► scenario_completed
free_session_exhausted {kind: trial, state: wall} ─► paywall_viewed ─► upgrade_click
code_redeemed / referral_converted
share_click {kind: mock_result | ics_reminder} ─► share_landed
```

40 events are defined first-party; the queue is flushed to
`${WORKER_BASE_URL}/analytics/events` on reconnect and on backgrounding, carries
no PII, and an opt-out deletes the queue. `onboarding_goal` is defined and never
emitted — a dead event.

## 19. Honest gaps and gotchas in this journey

`[observed]` unless marked otherwise.

1. `returnTo=/placement` is written but never read (dead parameter).
2. `katzu_onboarding_completed` is set before onboarding runs and means
   "has seen the welcome form"; the real gate is Dexie's `onboardingCompletedAt`.
3. Onboarding is skipped-then-asked-again for pre-existing accounts — deliberate,
   and dismissible from Home forever.
4. Level promotion is a **client-side** write; the Worker still serves a free
   learner A1 via `servedLevel`, so a promoted free learner sees no mid-episode
   402 (consistent, but the promotion is a preference, not new access).
5. The Pro column advertises "تغيير الصعوبة أثناء المحادثة" — this is real, but
   only as the Pro `handleNudgeDifficulty` path; there is no mid-conversation
   difficulty control for free learners.
6. There is no push notification and no email anywhere in the journey; retention
   rests on the daily mission, the streak, review, and a calendar file.
7. `Lesen` (reading) is advertised as `قريباً` and is not built; mock exams cover
   speaking only.
8. Phase-3 evidence limit: everything above is from source plus the public
   routes on a local dev server, plus one clean production build. The signed-in
   half of the journey (a full live conversation, the Debrief, redemption) was
   **not executed** — it needs a Google account and spends real production AI
   quota — so those steps are `[observed]` in code and `[unknown]` in behaviour.
9. The production build's `dist/.well-known/assetlinks.json` is **`[]`** — no
   Android package or signing fingerprint is configured
   (`VITE_ANDROID_PACKAGE_NAME` / `VITE_ANDROID_CERT_SHA256` unset). A TWA or a
   Play "web app" listing fails verification until those are filled in. The empty
   list is deliberate and honest: a placeholder fingerprint would make a wrong
   certificate look configured.
10. `dist/robots.txt` and `dist/sitemap.xml` are emitted with **relative** URLs
    (`Sitemap: /sitemap.xml`) because `VITE_PUBLIC_APP_URL` is unset — so the
    build advertises no domain at all. Correct at build time, but it means the
    public crawl story is incomplete until the domain variable is set.
11. The entry chunk is still **534 KB / 169 KB gzipped** and Vite warns about it.
    Every screen behind sign-in is lazily split, but the first paint the visitor
    waits for is still that one chunk.
12. **`share_click` has only two live emitters** — `mock_result`
    (`MockExamScreen.tsx:258`) and `ics_reminder` (`ProfileSettingsScreen.tsx:243`).
    The exam-result card share in the Debrief
    (`SessionReportScreen.tsx:617`, `navigator.share` with a generated image)
    fires **no event at all**, so exam-card sharing is invisible in the funnel.
    `kind: 'exam_card'` exists only as a fixture value in `tests/funnel.test.ts`,
    which is why the surface looks instrumented in tests but is not in the app.
    (Checked by grepping every `share_click` occurrence in `src/` — two calls,
    two kinds.)

`[observed]` One stale artifact found while running this audit: the dev browser's
`kz-diagnostics-crashes` buffer holds an `Uncaught ReferenceError: BackButton is
not defined` from an older build (2026-10-02). Every current file that renders
`<BackButton>` imports it, so this does not reproduce today; treat it as a
historical entry, not a live defect.
