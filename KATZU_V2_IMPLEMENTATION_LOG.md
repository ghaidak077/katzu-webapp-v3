# KATZU V2 — Implementation Log

Recorded: **2026-09-27**. Every claim below was produced in this repository; the
verification commands and their real output are in §Verification.

This log covers the V2 rebuild: one atmospheric, story-driven daily mission
(Journey Home → Story Setup → Guided Practice → Live Conversation → Debrief),
Arabic-first RTL, an AMOLED-black layered material system, a voice-first live
screen with a real audio-reactive Katzu orb, and an honest Debrief that states
only what the app actually measured.

---

## 0. Constraints that shaped the work

- **Arabic-first is correctness.** Every new screen is RTL by construction (logical
  `ms-/me-` spacing, `GermanText` `<bdi dir="ltr">` isolation for German), with
  Cairo for Arabic and Satoshi for German — both fonts already shipped in
  `public/assets/fonts/`.
- **The reference screenshots were not available.** `attached_assets/` does not
  exist in this repository (verified: `ls attached_assets` → no such directory),
  and no plan/spec file for the visual reference was present. The visual system
  was therefore built from the written brief (AMOLED black, Liquid-Glass layered
  materials, lavender = normal accent, magenta = earned progress, cinematic
  scenes) and validated on a purpose-built `/dev/system` page instead of against
  a picture. This is the one input the work genuinely lacked; nothing else was
  blocked by it.
- **No new dependencies.** The orb is `canvas` + Web Audio; the material system is
  CSS custom properties + Tailwind; scenes are procedural gradients. `canvas-confetti`
  is now used only for a real purchase (code redemption), not for finishing a lesson.
- **Nothing generative was added to the curriculum.** Story, practice and debrief
  all read content the app already has (D1/Dexie scenarios, phrases, vocabulary,
  recorded sessions/mistakes).

## 1. Phase 1 — Tokens, materials, motion (`tailwind.config.js`, `src/index.css`)

- Added the `kz` palette (`kz-black` #000, `near-black`, `soft-black`, `lavender`
  #B4A0FF, `lavenderDeep` #7C5CF0, `magenta` #FF6FD8, `magentaDeep` #E23FAE, `ink`,
  `inkDim`, `inkFaint`, `warm`, `neon`), squircle radii (28/34 px), the
  `kz-lavender`/`kz-magenta` glows, and the `kz-sheen`, `kz-rise`, `kz-scene-drift`,
  `kz-glow-pulse` animations. **The legacy palette was kept** so pre-V2 screens keep
  rendering while V2 lands screen by screen.
- `src/index.css` now owns one token layer: scene light (`--kz-scene-rgb`,
  `--kz-scene-warmth`), the glass recipe (`--kz-glass-*`), specular position
  (`--kz-spec-*`), motion easings/durations and the Arabic/German type ramp
  (`.kz-ar-*`, `.kz-de-*`). `.kz-surface` is a **material with four depth tiers**
  (`data-tier="canvas|well|glass|floating"`) rather than one dark card, with an
  `@supports not (backdrop-filter…)` fallback and `prefers-reduced-motion` rules.
  Magenta is fenced behind `.kz-earned` / `.kz-earned-text` so earned styling cannot
  leak into an ordinary surface.
- Primitives: `GlassSurface`/`GlassWell`/`NeonEdge`/`SpecularHighlight`
  (+`useSpecularHighlight`, `useReducedMotion`), `GlassCard`/`FloatingControl`/
  `AdaptiveTintLayer`, `GlassButton`/`PrimaryAction` (48 px min target, 58 px large),
  `SceneBackdrop` (procedural location light + grain + readability wash),
  `ProgressStrip`/`ProgressRail`, `StatusIndicator`, `KatzuPresence`.
- `src/lib/design/scenes.ts` maps a scenario/category to a `SceneLighting`
  (café warm gold, practice cool blue, station steel, official cold white, …), so
  every screen in one episode shares the same light.
- `src/features/dev/DesignSystemScreen.tsx` (`/dev/system`, dev builds only) renders
  all four tiers over a scene, the adaptive tint, both action sizes, progress, and
  Arabic/German type including umlauts — the visual regression surface for the system.

## 2. Phases 2–4 — The daily episode

- **`src/lib/journey/context.ts`** (pure): day number counted in **calendar days**,
  chapter of `CHAPTER_SIZE = 3` scenarios derived from scenarios that actually
  reached INDEPENDENT/RETAINED, honest `isFirstRun` / `isAllCaughtUp`, plus
  `situationAr`, `missionReasonAr` (review reasons carry the real due count) and
  `katzuJourneyLineAr` — which returns **null** rather than padding the screen with
  motivation when no state applies.
- **`src/lib/journey/story.ts`**: the episode opening. The German opener is the
  scenario's own `initial_message_<level>`, falling back **below** the learner's level
  (an easier sentence is a usable start; silence is a broken episode), the persona
  from the CMS ("Barista katze") becomes a real Arabic role, and a returning learner
  gets different copy from a first-time learner.
- **`src/lib/journey/practice.ts`**: ≤3 cards built from real phrases/vocabulary,
  one retrieval (`gradeTypedProduction` → the review engine's own `gradeAnswer`, so
  an article-only mistake is reported precisely), one listen-and-repeat
  (`diffDictation` word coverage — the copy never implies pronunciation scoring).
- **`src/features/journey/JourneyHomeScreen.tsx`**: status line (day/chapter),
  the mission card over its scene, one `PrimaryAction`, Katzu's contextual line, a
  quiet review-due row (hidden when the mission *is* review), and a magenta
  capability card only when the learner has earned one.
- **`StorySetupScreen`** (full-bleed scene, who/where, the opener with TTS and an
  Arabic translation that states when it is unavailable and offers a retry) and
  **`GuidedPracticeScreen`** (playable cards, retrieval, mic-or-typed repeat, calm
  errors, "أنا جاهز" → live conversation). Practice persists through the existing
  SRS store (`enrolStudiedPhrases`/`enrolStudiedVocabulary`) and writes the
  `scenario_training` row the mission selector reads — without it, today's scenario
  would look untouched tomorrow.

## 3. Phases 5–6 — Live conversation, voice-first

- **`src/lib/conversation/turnPlan.ts`** replaces three inline ternaries with one
  tested rule (`quick` A1 3/A2 4/B1 5/B2 6; `immersion` 8/8/10/10). Session length is
  now a documented value the screen reads, not a number that drifts.
- **`src/lib/audio/useMicLevel.ts`**: a real `AnalyserNode` over the learner's own
  stream (fftSize 1024, four speech bands, attack/release smoothing, voice-activity
  threshold). `read()` is called from a rAF loop, so 60 fps costs **zero React renders**.
  Denied / unsupported / failed are first-class results, never a silent catch.
- **`src/components/voice/KatzuOrb.tsx`**: one continuous liquid-metal sphere across
  idle · listening · transcribing · evaluating · replying · error · offline · quota.
  Blob deformation, radius and ripple release follow the real microphone data; the
  `replying` bars are **lifecycle-synced and documented as such** because the TTS API
  exposes no amplitude. Reduced motion keeps the amplitude feedback (it is
  information) and drops the drift. The canvas is `aria-hidden`; the button carries
  the Arabic name and the live state.
- **`LiveConversationScreen`**: the orb *is* the microphone control; the header shows
  the character and "الجولة X من Y · LEVEL"; the difficulty nudges moved to a quiet
  row; a permanent "اكتب بدلاً من ذلك" escape hatch focuses the LTR input. Orb state
  is derived from the conversation machine (never a second set of booleans), magenta
  only when the last evaluation produced no correction, and release of the microphone
  stops recognition **and** the analyser from the same place.
- **New honesty guard** (`isUsableTranscript` in `stateMachine.ts`): recognition firing
  on background noise used to send `""`/`"-"`/`"a"` as a real turn — a model call, a
  unit of quota and an evaluation of a sentence the learner never said. A final
  transcript with fewer than two letters is now reported as a failed listening attempt
  with Arabic copy, and the typed path stays open.

## 4. Phase 7 — The Debrief (`SessionReportScreen`)

Rewritten. The old screen opened with confetti, "تمت الجلسة بنجاح 🎉" and "إنجاز رائع
يا بطل!" regardless of what happened, then showed points-ish tiles. It now:

- leads with the capability sentence and the same thresholds the Progress screen uses
  (`capabilityFromSession`), so the two can never disagree;
- states the evidence in plain numbers — unaided turns out of total, independent
  accuracy (**"لا توجد جُمل مستقلة كافية للحكم بعد"**, never a fake 0 %), corrections,
  the dominant correction type with its count;
- keeps magenta **only** for a session that genuinely crossed the independence
  threshold; an assisted session gets support, not a consolation pose;
- maps Katzu's pose and line to the outcome (`independent` / `assisted` / `incomplete`);
- keeps the retype drill — it is real second retrieval — but fixes its meaning: one
  correct retype used to write `isMastered` while the review engine defines mastery as
  three consecutive good recalls. It now grades through `gradeReviewItem`, so
  "mastered" means one thing in the whole app;
- ends with one primary action: review this session's corrections (when any remain) or
  back to the journey; the level-promotion offer is intact and still the learner's choice.

`canvas-confetti` remains only in the purchase flow (code redemption), where a
celebration is honest.

## 4b. Phase 9 (first slice) — Review in the same material language

The Debrief now sends learners straight to `/app/review`, so that screen can no
longer look like a different app. `ReviewScreen` was re-skinned onto the V2
materials (glass card, sunken well, floating action tier, `KatzuPresence`,
`ProgressRail`) with **its SRS logic untouched** — queue freezing, `gradeAnswer`,
`gradeReviewItem`, `again`-requeue and the finish-time queue sync are byte-for-byte
the same behaviour.

Two honesty changes came with it:

- the three self-grades (**لم أتذكّر / بصعوبة / بسهولة**) now carry **equal visual
  weight**. Highlighting "سهل" would teach the learner to press it, and the interval
  it buys would be unearned — a schedule is only as honest as the answer fed to it;
- the finished state reports the real tally (first-try correct / article-only / needs
  fixing) and only takes the earned treatment (magenta + `independent` pose) when the
  session was at least three items **and** had no misses.

## 5. Routing (`src/App.tsx`)

New: `/scenario/:scenarioId/story`, `/scenario/:scenarioId/practice`, `/app/library`
(the pre-V2 trail, kept as the scenario/level browser), `/dev/system` (dev only). The
Trail tab now renders Journey Home; the bottom nav uses the floating material tier,
48 px targets and `aria-current`, labelled الرحلة · التدريب · التقدم · الملف.

## 6. The paywall rule, and the wall it was hiding

The free tier is the Worker's, not the client's: `checkUserEntitlement` serves **A1
only** — every other level is `PAYWALL_REQUIRED` — with three free conversations
counted server-side. `src/lib/entitlement/trial.ts` mirrors that boundary through
`shouldOfferPro` (never before a finished episode), `isLevelFree` (A1, or anything for
Pro) and `servedLevel`.

`servedLevel` was written during this rebuild and then wired nowhere, and the gap had
a real cost: every screen in the episode read `user.cefrLevel` directly, so a free
learner whose placement measured **A2 or above** was handed an A2 episode the Worker
refuses. The paywall landed on the **first turn of their first mission** — the one wall
this product is not allowed to build. `WritingScreen` had the same shape: an A2 learner
could not write at all.

Fixed by making `servedLevel` the single source of an AI session's level —
`JourneyHomeScreen` (mission selection), `StorySetupScreen` (the opener),
`GuidedPracticeScreen` (the deck), `LiveConversationScreen` (the `cefr_level` actually
sent) and `WritingScreen`. Journey Home now states that the episode runs at A1 when it
does, instead of letting the learner discover it mid-conversation. For a Pro learner
nothing changes: `servedLevel` returns their measured level, and the e2e suite pins both
directions of that rule.

The library copy was corrected with it. It promised "مستواك الحالي مفتوح دائماً" while
the server refused exactly that level; the boundary it describes now matches the Worker.
`e2e/harness.ts` enforces the rule in the backend mock — it previously answered *any*
level, which is why a level-wall regression could pass the suite green.

## 7. Two screens that announced a failure that had not happened

> **Correction (measured later — see §9).** The 45 s failure this section explains was
> **not** a wedged read. The failing Playwright snapshot taken at the timeout showed the
> full screen — including the `بدء` button the locator had been waiting for — because the
> DOM had been built; the **renderer thread was blocked** in a WebGL call made by the
> thinking indicator on that same screen, so no query could answer for 48.6 s. The
> `useLiveRow` policy below is still correct and still wanted (a slow read must never be
> reported as a missing scene, and a wedged one needs a way out), but it is not what was
> failing the suite. The measurement is in §9.

`useLiveQuery` returns `undefined` twice: while the first read is in flight, and when the
row genuinely does not exist. `StorySetupScreen` collapsed both into one state and painted
**«لم نجد هذا المشهد على هذا الجهاز بعد.»** — a false statement during a slow IndexedDB
read, on the screen that opens every episode. It was also that screen's only dead end: no
control, no way back, nothing to tap.

This was not hypothetical. Full-suite runs failed *Story Setup* intermittently, and
Playwright's page snapshot at the failure is the proof:

```
- main:
  - paragraph: جارٍ تجهيز المشهد…
  - button "العودة"
```

The screen sat in a read that never emitted for the whole 45 s window — with nothing to catch:
`useLiveQuery` *throws* on error, so a rejected query would have reached the ErrorBoundary,
meaning this read neither resolved nor failed. A later failing run caught the nastier shape of
the same thing: the row resolved (`بدء` appeared), the live query then re-subscribed — it resets
to `undefined` on every re-subscribe, and re-runs on every write to the tables it touched,
including the app's own background content refresh — and the screen fell back to loading. That
is why the assertion for the **second** control on the same screen then failed on a screen that
had been rendering fine a moment earlier.

Both screens now read through one shared policy, `src/lib/db/useLiveRow.ts`:

- `reading` / `missing` / `ready` are three states, never one (`undefined` vs `row: null`);
- **sticky** — the last row actually read is kept, so a re-run is a refresh rather than news
  that the content vanished, and the screen cannot blank itself mid-episode;
- **bounded** — after 6 s with no result the screen stops implying it is merely slow, says so
  («تأخّر تجهيز المشهد — قد يكون التحديث معلّقاً في تبويب آخر.») and offers **إعادة المحاولة**,
  which re-runs the query. A wedged IndexedDB read becomes a state with a way out instead of a
  spinner forever, and the learner never has to reload the app.

`ScenarioDetailScreen` had the same collapse in milder form — a missing row showed
«جاري التحميل...» forever with no escape — and now shares the hook.

Regression test: *"a scenario that is not on the device says so and keeps a way back"* in
`e2e/journey.spec.ts` visits `/scenario/not_on_this_device/story`, asserts the honest
sentence, then taps «العودة» and lands on `/app/trail`. Against the old component it fails:
Playwright's page snapshot at the failure contained the paragraph and nothing else.

## 8. The dev server can serve a stale revision (it did, twice)

Two rounds of phantom failures traced to one cause: **a file written through the sync layer
is not reliably invalidated in Vite's transform cache.** The browser keeps running the
previous revision of that module until the preview is restarted.

Evidence — after editing `StorySetupScreen.tsx`, with no restart:

```
$ curl -s http://localhost:3000/src/features/journey/StorySetupScreen.tsx | grep -c scenarioRow
0
$ curl -s "http://localhost:3000/src/features/journey/StorySetupScreen.tsx?t=$(date +%s)" | grep -c scenarioRow
3
```

The plain URL — the one the browser requests — served the pre-edit code; a cache-busted URL
served the new code. The same mechanism produced 17 React warnings about a `neon` prop that
no file under `src/` contains (`GlassSurface` had been revised; the browser still ran the
old module), and it is what made an edited screen look unfixed while the suite was running —
reported as a stale revision, never as a product bug. After a restart the same probe reports
`scenarioRow: 3` on the plain URL and the warnings are gone. (The `Story Setup` failure turned
out to have its own, unrelated cause — see §7.)

Rules that follow:
1. `freebuff-preview restart` after a batch of edits, **before** trusting a browser suite.
2. When the browser behaves as if the source were wrong, probe the served module
   (`curl … | grep <marker>`) before re-reading the source.

## 9. What actually froze the episode: a forced WebGL context loss

Entry into the episode was measured frame by frame in a real browser, and the V2 diagnosis
in §7 was wrong in an instructive way. The evidence, in the order it was gathered:

**1. The timeline.** Playwright's trace for the failing test, `time` in ms from test start:

```
    4.0s  Expect "toBeVisible" getByRole('button', { name: 'بدء' })
    4.0s  waiting for getByRole('button', { name: 'بدء' })
   52.6s  [SiriWave] shader setup failed Error: shader compile error
```

Every module the screen needed had arrived by 3.8 s and the Arabic gloss had been requested
at 4.1 s — the screen *was* built. Then nothing: 48.6 s with no page activity, no screencast
frame, no answer to the locator. A wedged IndexedDB read cannot do that to a locator; a blocked
main thread can.

**2. The call.** With every WebGL entry point instrumented (`getContext`, `compileShader`,
`linkProgram`, `loseContext`, …), the transition produced exactly one slow call:

```
PROBE4 loseContext          calls=1 total=9303ms worst=9303ms
PROBE4 getContext(webgl)    calls=1 total=  34ms worst=  34ms
PROBE4 getShaderParameter   calls=1 total=   3ms worst=   3ms
```

`WEBGL_lose_context.loseContext()` — the "release the context" hygiene call in
`SiriWave`'s effect cleanup — held the main thread for **9.3 s on an idle machine**, and for
48.6 s while the suite competed for the same core. The same 9.3 s figure came back in the
regression test built from it (`Received: 9309`).

**3. The second defect it caused.** A standalone probe of the mechanism:

```
PROBE5 before      { ok: true, log: "" }   // the first mount compiles fine
PROBE5 loseContext 98ms                    // cheap on a quiet page, seconds inside the app
PROBE5 sameObject  true                    // the next getContext returns the SAME context
PROBE5 isLost      true
PROBE5 after       { ok: null, log: null } // COMPILE_STATUS is null on a lost context
```

`getShaderParameter` returns **null** on a lost context, `null` is falsy, and the thrown message
falls back to `'shader compile error'` — with an empty info log, which is exactly what the
suite kept reporting and what §6 of the old log read as "the signature of the software
rasteriser". React's dev-mode double-invocation made it deterministic: mount → cleanup
(`loseContext`) → mount → the re-used canvas hands back the lost context → the indicator is an
empty box for the rest of its life.

**4. The remaining cost is real GL work on software rasterisers.** Profiling the transition
with the forced loss removed still showed 100 % of a 37.9 s window inside the indicator's
effect body — **6,993 ms inside a single `compileShader`**, the rest in program setup and
link — on SwiftShader, where the same shader compiles in 4 ms on an idle page. Neither the
indicator nor the orb should ask a software rasteriser to compile a shader whose whole job is
to say "working".

### The fix

- **No forced context loss.** `SiriWave` and `VoicePoweredOrb` no longer call
  `WEBGL_lose_context.loseContext()` in their cleanup. Deleting the program, shaders and
  buffers is what frees GPU memory, and it is cheap; the context goes when the canvas does.
- **No shader on a software rasteriser.** `src/lib/utils/rendererTier.ts` answers that question
  from `WEBGL_debug_renderer_info` (falling back to the masked renderer string, and answering
  `false` when it cannot tell, so hardware keeps the effect). It is unit-tested in
  `tests/rendererTier.test.ts` — including the measured SwiftShader string, the other software
  rasterisers, five real mobile/desktop GPUs, and the both-directions rule.
- **The indicator always has something to show.** No context, a lost context, a software
  rasteriser or a compile failure all draw `kz-siri-fallback`: a lavender CSS dot, gated by the
  same reduced-motion rule as the rest of the decoration, sized so the layout never moves. A
  thinking state can no longer be an empty square.
- **The orb survives a GPU reset.** `VoicePoweredOrb` now listens for `webglcontextlost` and
  hands the body back to its 2D canvas. A lost context accepts every call and draws nothing —
  no throw — so before this the frame loop would have rendered into it forever.

The orb keeps its WebGL body: measured on the live screen, its GL setup cost **11 ms total
across 317 instrumented calls** (worst single call 7 ms, worst page stall 83 ms), so it is not
the component that needs the guard — only its teardown did.

### The regression test, and what it deliberately does not assert

`e2e/journey.spec.ts` → *"the thinking indicator survives the episode opening"* opens the
episode and asserts the indicator reports **no** setup failure. Verified in both directions:
with the forced loss (and the old lost-context blindness) restored, it fails on
`expect(failedSetups).toHaveLength(0)`; with the fix, it passes.

A wall-clock budget is deliberately **not** asserted. The same transition measured from 77 ms
to 48.6 s in this sandbox, and the range tracks CPU contention with the dev server rather
than the app: the identical `loseContext` call took 98 ms on a quiet page and 9,303 ms inside
the app page. A timing assertion here would be a test of the machine, not of Katzu. What is
shipped is the deterministic half — the indicator must not report a failure — and the numbers
above.

### Result

```
$ npx playwright test
Running 18 tests using 1 worker
18 passed (10.6m)          # 0 console errors in the run (was 5 SiriWave shader failures)

$ npx vitest run
Test Files  56 passed (56)
     Tests  638 passed (638)
```

## Verification

```
$ npm run lint          # tsc --noEmit
> katzu-web@1.0.0 lint
> tsc --noEmit
(no output — clean)

$ node --check cloudflare-unified-worker.js
worker OK

$ npm run test:e2e:types
> tsc -p e2e --noEmit
(no output — clean)

$ npx vitest run
Test Files  56 passed (56)
     Tests  638 passed (638)

$ npx playwright test
Running 18 tests using 1 worker
18 passed (10.6m)

That run logged **zero** console errors (the five SiriWave shader failures it used to carry are
gone — see §9). The suite takes ~10.5 m rather than 1.8 m here because this sandbox has one
CPU: the Vite dev server transforms every lazily-imported screen on first request while the
browser competes for the same core, and that contention dilates whichever task the renderer is
running (a single call measured 98 ms on a quiet page and 9,303 ms inside the app).

$ npx playwright test e2e/microphone.spec.ts
[e2e] peak analyser RMS over 400ms: 0.000000
  1 passed (6.9s)

$ freebuff-preview restart
{"message":"Preview is ready","running":true,"listening":true,"previewPort":3000}
```

New tests: `tests/rendererTier.test.ts` (the software-rasteriser rule that keeps a decorative
shader off a device that would freeze compiling it, both directions, plus the "cannot tell →
keep the effect" case) and the e2e *"the thinking indicator survives the episode opening"*
(both in §9); `tests/journeyV2.test.ts` (context → calendar days, chapters, honest
"all caught up"; story → level fallback and persona mapping; practice → deck cap,
dedupe, empty state, retrieval/listening selection, coverage wording; turn plan →
monotonic per level and both modes), two cases in `tests/conversationState.test.ts`
pinning `isUsableTranscript` in both directions, and `tests/entitlement.test.ts` →
`servedLevel` never returning a level `isLevelFree` would refuse (the invariant the A2
regression violated).

## Known limitations / still open

1. **The browser suite covers behaviour; three claims stay manual.** 18 Playwright tests
   (`e2e/`, driven against the managed preview with the backend mocked and the microphone
   substituted) walk the five screens of the episode end to end, the orb's state machine
   including a denied permission and the typed fallback, onboarding, the Progress tab, and
   the paywall rule in both directions. What a headless browser cannot settle:
   - **The orb's audio-reactive deformation.** Chromium's fake capture device was measured
     through the same analyser the orb reads: peak RMS **0.000000** over 400 ms
     (`e2e/microphone.spec.ts`). The stream, the `AudioContext` and the rAF read are all
     real — the signal is silence, so the orb has nothing to deform with.
   - **Real recognition timing.** Headless Chromium has no Web Speech API, so the suite
     scripts `SpeechRecognition`'s exact event sequence. Endpointing, and whether a noisy
     room produces a garbage turn, stay unverified: the guard (`isUsableTranscript`) is
     unit-tested, but only a real room proves it.
   - **How any of it feels.** Latency against the deployed Worker, TTS intelligibility and
     the pacing of a turn are judgements, not assertions.

   Manual QA with a real microphone: (a) the orb visibly deforms while speaking and settles
   when you stop; (b) recognition ends the turn on its own without a tap; (c) a noisy room
   does not send an empty turn; (d) the Arabic TTS reading of the opener is intelligible on
   a phone.
2. **`replying` orb motion is not voice-driven** — the Web Speech API exposes no
   amplitude. It is lifecycle-synced and the code says so; it must not be presented as
   a waveform.
3. **Pronunciation is never scored.** Repeat tasks report word coverage only.
4. **Scenes are procedural** (light pools + grain). `SceneBackdrop` already accepts an
   `artUrl`; real scene artwork can be dropped in without touching a screen.
5. **Landed after this log's first draft** — the three items it listed as unstarted:
   - the Progress tab leads with capabilities built by the same `buildCapabilityModel` the
     Debrief uses, every row tagged with the review engine's own state and the scenario it
     came from, and the vanity tiles (`إجمالي الجمل`, `وقت التحدث`) are gone;
   - onboarding is Katzu's own questions — dots rather than a percentage, one question per
     screen — with the goal picker and the previous-experience question wired and asserted.
     A self-report still never sets a level: only the placement does;
   - the Pro offer appears only on the Debrief of a finished episode, and `servedLevel`
     closed the level wall described in §6.
6. ~~**`SiriWave` degrades silently in headless Chromium.**~~ **Diagnosed and fixed —
   see §9.** The intermittent `[SiriWave] shader setup failed / shader compile error` was not
   a swiftshader GLSL quirk: it was the component's own forced context loss coming back as a
   lost context on the next mount (`getShaderParameter` returns `null`, not `false`). The
   indicator no longer compiles a shader on a software rasteriser at all, and the suite now
   runs with **zero** console errors (was 5).
