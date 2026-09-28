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

## 10. What the first real phone session broke (2026-09-27)

Eight complaints arrived together from using the app on a real Android phone. Five were the app's
either way; the two that mattered most had one cause each, and both are now structural fixes rather
than patches.

### 10.1 The orb covered the sentence the learner was reading

The conversation dock was `position: fixed` over a scrolling transcript that reserved a hardcoded
`pb-44`. The dock is taller than that whenever the suggestion panel is open, so the newest Katzu
reply — the one the learner needs in order to answer — sat under the orb, cut off mid-sentence
(measured from the session's screenshot: *"Die Miete beträgt 800 Eu…"*). The fix is structural: the
screen is one `h-[100dvh]` column, the transcript is `flex-1 overflow-y-auto`, and the dock is
`shrink-0` below it. Nothing floats over anything, at any dock height, by construction.

`e2e/conversationLayout.spec.ts` asserts that as **geometry, not a screenshot**: with the
suggestion panel open (the tallest the dock ever gets), every message box must end above the dock
and no message box may intersect the orb, on a 720px and a 360×640 viewport. Two measurements found
during that work are worth keeping:

- the auto-scroll must be **instant**, not smooth: a smooth scroll animates towards the height the
  content had when it was measured, and a reply that gains its translation mid-animation left the
  newest message **169 px** short of the view — a whole message hidden under the dock;
- the dock's height changes *while* the learner reads (the suggestion panel opens, the keyboard
  rises), which shrinks the transcript and used to leave the message cut off at the new edge. A
  `ResizeObserver` re-pins the scroll when the learner was already at the bottom, and it decides
  that from the **previous** height: reading the current metrics after the resize cannot tell "the
  learner scrolled up" from "the dock grew".

The one failure this test produced before it was right was its own: a single `evaluate` can land in
the sub-frame window between React committing the new dock height and the observer's before-paint
callback, and read the commit's new `clientHeight` against the old `scrollTop` (347 vs 384, 21 px
short) — a state the learner never sees. It polls for the settle now, with the numbers in the
comment.

### 10.2 The microphone did not work on Android, and could not have

The report was exact: tapping the mic played the Android system chime and recorded nothing. Both
halves were the **browser's** speech API (`webkitSpeechRecognition`), which the app used until this
pass:

1. it captured nothing — Chrome's recogniser and the app's own `getUserMedia` analyser stream (the
   orb's amplitude) compete for the microphone, and the recogniser lost;
2. it plays an OS-level sound when it opens the mic, and no web API can mute a sound the operating
   system makes;
3. it does not exist at all in Firefox and is unreliable in iOS Safari, so "speak German" was
   silently unavailable on two other browsers.

So the app stopped using it. One pipeline replaces it, and every part of it is one the app owns:
`getUserMedia` (already needed by the orb) → `MediaRecorder` → `POST /ai/transcribe` on the Worker →
Workers AI Whisper. `src/lib/speech/useSpeechInput.ts` is **deleted**; `classifySpeechError` went
with it. Details that are decisions rather than plumbing:

- **The feedback is now the app's.** `audio/cues.ts` synthesises a soft two-note blip (rising when
  the mic opens, falling when it closes, peak gain 0.06) and `triggerHaptic` fires with it. No
  audio asset to download, and nothing the page cannot control.
- **Endpointing is local, pure and tested.** `decideStop` (`audio/useVoiceCapture.ts`) owns the
  numbers: a 20 s ceiling, 1.2 s of silence *after* speech ends a recording, 7 s with no speech at
  all gives up (the "tapped by mistake" case). A learner pausing mid-sentence to think is not cut
  off, which a naive level-threshold recorder does constantly in German word order.
- **The microphone is released before the network call** — the OS indicator goes out when the
  learner stops talking, not when the model answers.
- **The Worker route needs no entitlement check, on purpose.** Every other AI route checks the
  plan; transcription *is* the microphone, and refusing it would mean a free learner whose session
  quota is spent can no longer be heard while the app still offers them review. It has its own rate
  budget instead (`scope: "stt"`, 40/min, 800/day, namespaced so speaking never spends a
  conversation turn), a 400,000-character body ceiling on top of the global 64 KB one, and it stores
  no audio. `[ai] binding = "AI"` was already configured, so **no new secret or binding**.
- **What is not verified, and cannot be here.** Headless Chromium has no microphone worth trusting,
  so the suite scripts the capture device (a real oscillator stream, so the app's analyser and
  endpointing run for real) and mocks `/ai/transcribe`. The recording container meeting the real
  model is verified separately by `scripts/verify-stt-live.mjs`, which records a real German clip
  with the same `MediaRecorder` options in a browser and posts it to the deployed Worker. The
  Android retest itself stays with the owner.

### 10.3 A test that failed for the right reason, twice

`e2e/microphone.spec.ts` and the journey's live test drove the old scripted `SpeechRecognition`.
They now drive the real path: `say()` raises the level on the scripted microphone, `silence()`
drops it, and everything the app decides with that — when to stop, whether a recording is too
short, whether a transcript is usable, when to send the turn — runs unmodified.

Guided Practice then failed with the app's own honest state (*"لم نسمع جملة واضحة"*), which was
worth diagnosing rather than loosening: `say()` switched the level on and `silence()` switched it off
a few milliseconds later, and the app samples the microphone on `requestAnimationFrame`. That pair
could hand the app **zero frames of speech** — and the identical sequence passed in the conversation
screen only because two extra waits happened to sit before it. `say()` now holds the tone open for
six frames (a human utters a sentence over hundreds of milliseconds; one frame is not a learner
talking), and the practice test waits for the microphone to actually be open before speaking. The
app was never wrong; the stub was asserting something it had not done.

### 10.4 A scenario's own 16:9 banner

The owner asked for a per-scenario 16:9 banner, updatable per scenario, used as the thumbnail on the
main screens and the scenario cards. It is a content column, not a code change:
`scenarios.banner_url` (optional), written from the admin Content Studio, read by the app through
`sceneFor` — where it wins over both the per-scenario and the per-category placeholders — and
rendered by one `ScenarioBanner` component on Journey Home's mission card, the scenario library and
the scenario's own screen. An empty or whitespace value means "no artwork" and falls back, never
`src=""`. When nothing at all is available the component renders its own honest placeholder with an
Arabic label saying the artwork is still to come.

The column is added to a table that was created outside this repo, so there is no migration file to
edit: `ensureContentColumns` (`cloudflare-content-schema.js`) reconciles it with an `ALTER TABLE …
ADD COLUMN` on the worker's first request and is a no-op afterwards. **Additive only, by policy** —
nothing in that path may drop, rename or retype a column — and `tests/contentStudio.test.ts` still
pins the column list against `CONTENT_COLUMNS` in `src/lib/content/curriculumAudit.ts`.

One measurement came out of it and is a real win: the placeholder photographs were being requested
at `w=1200&q=70` for a column that renders 448 px wide. At `w=640&h=360&q=60` the same first photo
is **63,113 bytes instead of 235,739** — a quarter of the bytes, on a mobile connection, for a
picture nobody could tell apart at that size.

### 10.5 The error logger now survives the reload it is needed for

The diagnostics ring buffer lived in memory, which made it useless for the one case that matters:
a page that crashed hard enough that the learner reloaded it. The export they were asked to send
carried **nothing**. Errors (uncaught `window`/`promise` and the app's own `logError`) are now
mirrored into `localStorage` (cap 40) and rehydrated on install; `console` output is deliberately
excluded, because it is the one source that can contain a learner's own German sentence, and a
stored sentence is a stored sentence even on their own device. `tests/diagnosticsPersistence.test.ts`
pins the rules that make it safe: only the already-outbound entries, bounded, idempotent across
reloads, and never throwing when storage is missing, full or corrupted.

### 10.6 One prompt fix for answers that read as non-sequiturs

The roleplay prompt asked for a `followup_question_ar` that "encourages the learner to keep
chatting" about the scenario. That is an instruction to *add* a question, and it produced ones the
conversation had not earned — the reported case being a rent conversation that suddenly asked about
الشفعة (a legal right of first refusal). The field now asks for the question **the character would
naturally ask next**, using only words the situation has already introduced, and allows an empty
string: "a filler question is worse than none".

## 11. The microphone conflict, solved from the other end (2026-09-27, same day as §10)

§10.2 deleted the platform's own speech recogniser after a real Android session, on three grounds.
Two of them were about the recogniser; one was about us, and it was the one that mattered most:

1. **It recorded nothing.** Chrome's recogniser and the app's own `getUserMedia` analyser stream (the
   orb's amplitude) compete for one microphone, and the recogniser lost. That is *our* stream in the
   way — not a defect of the engine. A native session that never opens a stream has the microphone to
   itself, which is what the app now guarantees.
2. **It plays an OS chime.** True, and unfixable from a page: that sound belongs to the operating
   system's own recogniser and no web API can mute it. It is the price of the native engine, so it is
   now documented as an accepted cost instead of used as the reason to delete the pipeline. The app's
   own blip and haptic still mark start and stop, so the learner is not relying on the system sound.
3. **Firefox has no recogniser.** Still true — and it is the entire reason the fallback exists.

So speech input is **native-first with the recording path behind it**, chosen automatically. A learner
never picks an engine, and never sees which one served them.

**`src/lib/audio/nativeSpeech.ts`** owns the wrapper and every rule that can be tested without a phone.
`startNativeRecognition(handlers, 'de-DE')` runs `continuous = false` with `interimResults = true`, and
accepts both `SpeechRecognition` and `webkitSpeechRecognition`. Beside it, the decisions:

| Engine failure (`error`) | What it means | What the app does |
| --- | --- | --- |
| `not-allowed`, `service-not-allowed` | The learner or the site refused the microphone | Arabic "لم يُسمح بالوصول للمايك", **no** fallback |
| `audio-capture` | No microphone device is reachable | Honest failure, **no** fallback |
| `no-speech`, `network`, `language-not-supported`, unknown | The engine could not do its job | Fall back to recording |
| `aborted` after the app's own stop | The normal end of a session we ended | Empty result, **no** fallback |

That table is `classifyRecognitionError(code, { requestedStop })` plus `mayFallBack`, pinned by
`tests/nativeSpeech.test.ts` (12 tests). A refusal is not an engine failure: retrying a denial through
the recorder would ask for the microphone again seconds after the learner said no. The fallback is
capped at `MAX_NATIVE_FALLBACKS = 2` per session, so an engine that is broken in a way its own error
codes do not name cannot turn every mic tap into a network round trip.

**Two details in the wrapper that would each have silently lost the learner's words:**

- The `results` list is **cumulative** — every event carries the whole list so far, not the newest
  fragment. Reading only the newest entry drops the beginning of every sentence, and real engines
  re-send the whole utterance on the final event, so the naive `finalText += …` also duplicates it.
  The handler reads the whole list on every event instead.
- `onend` can arrive with nothing finalised (a learner who stops mid-sentence, or an engine that just
  goes quiet). The interim text already on screen is the honest answer, so `lastHeard` is delivered
  rather than an empty string — otherwise the caption the learner watched and the transcript in the
  composer would disagree about the same utterance.

**A hung "listening" state is not reachable.** `nativeWatchdogVerdict` (pure, tested) covers the three
ways a session can stall: never started (3 s), started and silent (7 s), started and talking (15 s
ceiling). On abandon the app delivers `lastHeard` or empty and spends one fallback.

**The orb in native mode is decorative, and the code says so.** The one thing native mode must never do
is open a `getUserMedia` stream — that *is* the §10.2 conflict — so while a native session runs the orb
is driven by `syntheticListeningSample(elapsedMs)`: two incommensurate sines, amplitude 0.06–0.42, with
the bands falling low → high, which reads as a voice without pretending to be a measurement. Nothing in
native mode measures the learner and no score is derived from it. The recorder path still reads the real
analyser, because it needs the stream for endpointing anyway.

Everything §10.2 got right survives unchanged on the recording path: local endpointing (`decideStop`),
the app's own two-note cue, the microphone released **before** the network call, and `/ai/transcribe`
with its own rate budget and no entitlement gate.

### 11.1 The learner sees their own German while they are still speaking

The recogniser returns words while the learner is talking, so the conversation shows them in three
places through one mapping:

- `src/lib/speech/wordHighlight.ts` — `speechSegments` splits German into word segments while keeping
  spaces and punctuation as their own, and the segments' concatenation is **character-exact** the input
  string. That identity is the point: the engine reports `charIndex` into the *original* string, so any
  splitter that trims, normalises or re-joins differently would highlight the wrong word.
  `tests/wordHighlight.test.ts` (8 tests) pins the identity and `activeWordIndex`'s honest answers for
  `null`, `undefined`, `NaN` and out-of-range indices.
- The live caption band on the conversation screen (`data-testid="live-caption"`) shows the interim
  sentence LTR-isolated under an Arabic "أسمع" label, and disappears with the session that produced it.
  Guided Practice and the public demo carry the same band (`src/features/journey/GuidedPracticeScreen.tsx`,
  `src/features/demo/DemoScreen.tsx`); `e2e/journey.spec.ts` asserts it appearing, containing the
  learner's words, and being gone once the turn is submitted.
- Katzu's own speech was already reported word by word by `speechSynthesis` (`onboundary`);
  `activeWordIndex` now maps those boundaries onto the bubble, so the reply is highlighted as it is
  read, with `aria-current` for assistive technology. Only the message being spoken is highlighted at
  all — every other bubble passes `null`, so two messages can never both look like they are speaking.

### 11.2 The voice the learner hears is chosen, not whichever one came first

`src/lib/speech/voiceChoice.ts` (`chooseGermanVoice`, 6 tests) ranks the device's voices: a **device**
voice first (`localService` — it works offline and is the one the phone's own settings tuned), then a
known natural or neural German name, then any German voice at all. Ties break on a code-unit name
comparison rather than `localeCompare`: the same device must give the same answer every time, and a
locale-dependent collator does not promise that.

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
Test Files  62 passed (62)
     Tests  690 passed (690)

$ npx playwright test --list
Total: 24 tests in 7 files

Every one of the 24 was run green across the two passes (22 from §10, 2 from §11), in groups that fit this sandbox's command
timeout (`npx playwright test` itself takes ~10.5 m here because there is one CPU: the Vite dev
server transforms every lazily-imported screen on first request while the browser competes for
the same core, and that contention dilates whichever task the renderer is running — a single
call measured 98 ms on a quiet page and 9,303 ms inside the app). Three of those runs are worth
naming, because a green line is not on its own evidence of the right thing:

$ npx playwright test e2e/conversationLayout.spec.ts --repeat-each=2
  4 passed (1.0m)            # the dock geometry, twice, so the race below stays fixed

$ npx playwright test e2e/journey.spec.ts -g "Live Interaction runs a turn|a denied microphone"
  2 passed (44.0s)           # record → /ai/transcribe → the sentence lands in the input

$ npx playwright test e2e/banner.spec.ts
  2 passed (1.1m)            # a per-scenario banner_url on every screen, and the floor without one

$ npx playwright test e2e/journey.spec.ts -g "still speaking|without a platform recogniser"
  2 passed (33.2s)           # the live caption while the learner is still talking, and the same
                             # turn served by the recording fallback with no caption claimed

The runs also carried **zero** console errors (the five SiriWave shader failures of §9 are gone).
One test failed once on a *contended* run (the "Story Setup" click, in a 3-test sequence on one
core) and passed alone in 42.8 s; that is the documented sandbox dilation, not a regression, and it
is recorded here rather than hidden by a retry policy.

$ npx playwright test e2e/microphone.spec.ts
[e2e] peak analyser RMS over 400ms: 0.000000
  2 passed (1.0m)

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

1. **The browser suite covers behaviour; three claims stay manual.** 24 Playwright tests
   (`e2e/`, driven against the managed preview with the backend mocked and the microphone
   substituted) walk the five screens of the episode end to end, the orb's state machine
   including a denied permission and the typed fallback, onboarding, the Progress tab, and
   the paywall rule in both directions. What a headless browser cannot settle:
   - **The orb's audio-reactive deformation.** Chromium's fake capture device was measured
     through the same analyser the orb reads: peak RMS **0.000000** over 400 ms
     (`e2e/microphone.spec.ts`). The stream, the `AudioContext` and the rAF read are all
     real — the signal is silence, so the orb has nothing to deform with. With native
     recognition as the default the claim narrows further: the orb is generated rather than
     measured whenever the platform recogniser is the engine (§11), so the deformation can only
     be judged on the recording path — Firefox, or an engine that has failed twice.
   - **Real recognition timing.** The suite scripts the capture device (a real oscillator
     stream, so the app's analyser and endpointing run for real) and mocks `/ai/transcribe`,
     because a headless browser has no microphone worth trusting and the sandbox has no
     Worker credentials. Two things follow: whether a **real room** produces a garbage turn
     is unverified (the guard, `isUsableTranscript`, is unit-tested), and the recording
     container meeting the real model is verified elsewhere — `scripts/verify-stt-live.mjs`
     records a real German clip in a browser with the app's own `MediaRecorder` options and
     posts it to the deployed Worker.
   - **Android itself.** The bug that started §10.2 was reported from a real phone, and
     headless Chromium cannot reproduce it (it has no phone audio stack, and a scripted
     recogniser proves nothing about the real one). The native path is now the default and
     the fix needs the owner's own device to confirm: tap the orb, speak, and check that the
     words appear in the caption as they talk, that the sentence lands in the input without a
     second permission prompt, and that the app's own blip plays. The system chime comes back
     with the platform recogniser and is the accepted cost of §11 — it is deliberately not a
     failure condition.
   - **How any of it feels.** Latency against the deployed Worker, TTS intelligibility and
     the pacing of a turn are judgements, not assertions.

   Manual QA with a real microphone: (a) the orb visibly deforms while speaking and settles
   when you stop; (b) recognition ends the turn on its own without a tap; (c) a noisy room
   does not send an empty turn; (d) the Arabic TTS reading of the opener is intelligible on
   a phone.
2. **`replying` orb motion is not voice-driven** — the microphone is deliberately released
   before the turn is sent (and stays closed while Katzu answers, so the app is not listening
   to its own voice). With no live stream there is no amplitude, so that motion is
   lifecycle-synced and the code says so; it must not be presented as a waveform. **In native
   recognition the orb does not measure the learner either, for the same class of reason:**
   opening a stream would take the microphone from the recogniser (the §10.2 conflict), so its
   motion is generated (`syntheticListeningSample`) and documented as decorative. Only the
   recording path reads the real analyser.
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
7. **This log has reached its editor's reach limit.** It is now ≈48 KB, and this repository's file
   editor could not match a one-line string anywhere in the ≈51 KB-past-the-start region of
   `docs/PRODUCT-SPEC.md` — which records the same constraint at its own top. The entry above was
   the last one writeable in place, so the next implementation entry belongs in a new file
   continuing from §12.

## 12. Launch-hardening pass (2026-09-28)

Performance and structure work from `AGENTS.md` §6 item B4, on branch `launch-hardening`:

- **JourneyHome bounded projection** (`168655c`): 8 full-table live queries → one
  identity-preserving projection, proven equal by `tests/journeyHomeData.test.ts`.
- **Local scene art** (`37d1f74`): 14 Unsplash hotlinks → local 640×360 JPEGs
  (29 KB total); remote `banner_url` still wins.
- **woff2 fonts** (`44a2ffb`): Cairo 588K→116K, Satoshi ~72K→~15K each.
- **Renderer tier** (`860b503`): `detectTier()` (saveData → reduced-motion →
  cores/memory) resolves once per load; `kz-lite` drops blur/saturation/grain,
  never contrast.
- **LiveConversationScreen split** (`f5ad979`): 1248 lines → hook (922) +
  transcript (140) + dock (233) + 311-line layout; zero behaviour change;
  conversation e2e groups green before and after.
- **Unreachable worker code deleted** (`20f47a4`): the legacy
  `handleAiConversationTurn` / `handleAiTranslation` / `handleAiHints` bodies,
  `callGeminiWithFailover`, `summarizeFailoverState` and `LEDGER_SCOPES`
  (478 lines) — all routes already serve from the extracted modules.

Verification at commit time: tsc clean, 65 files / 747 vitest tests, `node --check`
clean on both workers, live-conversation e2e group 3/3.

