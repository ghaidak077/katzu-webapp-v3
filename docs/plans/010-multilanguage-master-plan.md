# 010 — The language matrix: Arabic/English/Indonesian × German/Dutch

**Status:** Phase 1a executed 2026-11-22. Phase 1b started 2026-11-23: measurement built, `/welcome` and
`/signin` at zero. Phases 1b (rest) and 2–3 specified here.
**Owner direction:** the app speaks the learner's native language — **Arabic, English or
Indonesian** — and teaches **German or Dutch**.
**Written against:** `main` @ `308f790`, `AGENTS.md` v9, `docs/agent/APP-MAP.md`.

---

## 0. The one-sentence design

> Two independent choices — **the language the app talks to you in** and **the language
> you are learning** — stored on the device, mirrored to the account, and carried on every
> AI turn, with content that exists only for the courses that have been written.

Everything below follows from keeping those two axes independent. Fusing them (an
"Arabic→German" app, an "Indonesian→Dutch" app) would multiply the product by six and
make a single missing string a broken locale.

---

## 1. Product spec

| Dimension | Values | Default | Where it is chosen |
|---|---|---|---|
| UI language (`native_lang`) | `ar`, `en`, `id` | device language, else `ar` | Profile → طريقة تعلّمي → اللغة |
| Target language (`target_lang`) | `de`, `nl` | `de` | same card |
| Direction | `rtl` for `ar`, `ltr` for `en`/`id` | derived | `<html dir>` |

Rules that are not negotiable:

1. **Arabic stays the reference language.** It is the product's first language, not a
   translation of an English source. English and Indonesian are authored as native copy.
2. **A course that is not written is not selectable.** Dutch is visible, labelled
   «قريباً / Soon / Segera», with the reason printed on the row. A picker that accepts
   Dutch today would hand a learner a German course under a Dutch label.
3. **The server never trusts the client's languages.** `resolveTurnLanguages()` maps
   anything unknown, misspelled or unshipped back to `de`/`ar`.
4. **Direction is a layout problem, not a translation problem.** The app already uses
   logical utilities (`start`/`end`, `ps-`/`pe-`), so setting `<html dir>` is enough for
   the chrome; any screen that later hardcodes `left`/`right` is a bug against this spec.

---

## 2. Architecture

### 2.1 Client (executed)

| File | Responsibility |
|---|---|
| `src/lib/i18n/languages.ts` | The matrix. Pure: codes, native names, direction, BCP-47, speech locales, `available` per course, resolvers. |
| `src/lib/i18n/languagePreference.ts` | Device storage (`localStorage`), device-language detection, `currentLanguagePair()` read at call time. **DB-free** so the entry bundle keeps decision A7. |
| `src/lib/i18n/strings.ts` | Key-based dictionary. `UiStringKey` derives from the Arabic table; `en`/`id` are typed `Record<UiStringKey, string>` so a missing line fails `tsc`. |
| `src/lib/i18n/LanguageProvider.tsx` | React context, `<html lang>` + `<html dir>`, `useT()`. Mounted above `AppFrame`. |
| `src/lib/i18n/useLanguageProfileSync.ts` | Two-way, loop-safe mirror between device choice and the signed-in profile row. |
| `src/features/settings/LanguagePreferences.tsx` | The picker. Renders fully in all three languages. |
| `src/types/models.ts` | `UserEntity.uiLanguage?` / `.targetLanguage?` — additive, non-indexed, no Dexie version bump. |

**Why keys, not Arabic-as-key.** A key names the meaning (`language.uiTitle`), so a copy
edit in Arabic cannot orphan the English, and a screen never depends on another language's
wording. Arabic-as-key looks faster for one screen and turns every copy change into a
silent regression in two languages.

**Why device-first with a profile mirror.** `localStorage` is synchronous, so the first
frame already has the right language and direction — no flash of Arabic RTL for an English
learner. The profile row exists so the choice follows a learner to a second device, and it
is adopted **only** when this device has never recorded a choice.

**Why detection is gated on coverage.** `UI_COVERAGE_COMPLETE` in `languages.ts` decides
whether the device's own language may be *assumed*. A phone set to English must not open a
page that is half English and half Arabic, so until a language's Phase 1b batches are
finished it is selectable by hand but never automatic. Completing a batch means flipping
one boolean — no other code changes.

### 2.2 Server (executed, gated)

`cloudflare-ai-chat.js` now owns the language tables beside the prompt:

- `TURN_TARGET_LANGUAGES` — `de` (shipped), `nl` (defined, **not shipped**).
- `TURN_NATIVE_LANGUAGES` — `ar`, `en`, `id`, each with the words the prompt needs
  (`name`, `adjective`, `coach`, `uppercase`, `example`, `chipNote`, `greetingRule`).
- `resolveTurnLanguages(body)` — total, defaults to `de`/`ar`.
- `buildTurnSystemInstruction({ targetLang, nativeLang })` — every "German"/"Arabic"
  in the prompt is now a table lookup. **With `de`/`ar` the assembled text is
  byte-identical to v11**, which is why the existing prompt-cost and roleplay tests stay
  green.

The turn payload carries `native_lang` and `target_lang` from
`workerClient.sendTurnOnce`, read at send time (not passed through eleven props), so no
screen can silently fall back mid-episode.

---

## 3. Phase 1a — executed in this batch

**Done**

- The matrix, resolvers, device storage, provider, `useT()`, profile sync, picker.
- `AppShell`: tab bar labels, lock announcement and the account-check gate are translated.
- `workerClient` sends `native_lang` + `target_lang`; the worker resolves and uses them.
- Prompt layer parameterised for `de`/`nl` × `ar`/`en`/`id`.
- Tests: `tests/languages.test.ts`, `tests/turnLanguages.test.ts`.

**Deliberately not done (and why)**

- The rest of the UI. There are ~1,400 Arabic string literals across `src/features`
  (`conversation` 218, `journey` 196, `settings` 126, `auth` 111, …). Translating them in
  one batch would either ship unreviewed machine copy or break the screens' own tests.
  §4 is the measured, per-screen path.
- The Dutch course. §5.

---

## 4. Phase 1b — finish the UI (per-screen batches)

**Rule:** a screen is "localised" only when **every** user-visible string it renders comes
from `strings.ts`, its keys exist in `ar`/`en`/`id`, and a native reader of each language
has approved the copy. Half a screen in English is worse than an Arabic screen.

Order = what a learner meets first, and what a stranger judges:

| Batch | Surface | Strings (approx) | Gate |
|---|---|---|---|
| B1 | `/welcome`, `/signin`, onboarding | 160 | existing e2e first-run specs in all three languages |
| B2 | Tab bar, Journey home (`journey/`) | 200 | `firstRun`, `trailOrdering` |
| B3 | Story → Guided practice → Live conversation | 280 | `roleplay` e2e + correction card |
| B4 | Session report, review | 140 | `review` specs |
| B5 | Practice, progress, grammar, listening, writing, coach, ask | 300 | unit + screen e2e |
| B6 | Profile/settings, subscription, placement, partners, mock exam | 320 | `accountOps`, `deletionRequest` |

**Measurement, not vibes (built 2026-11-23).** `scripts/i18n-coverage.mjs` is in place (`npm run
i18n:coverage`); its first run measured **1,520 Arabic strings in 54 files**, and its gate reads
`src/lib/i18n/coverage.json`. State on 2026-11-23: `/welcome` 19 → **0**, `/signin` 31 → **0**
(verified in the browser: English and Indonesian front doors render with no Arabic at all), so B1 is
still open on `/onboarding` (48) and `/subscription` (47) — and those two read their option copy from
`src/lib` tables (`GOAL_COPY`, `ARRIVAL_COPY`, `PREVIOUS_GERMAN_COPY`), which the script does not scan
yet. **Known measurement gap:** `src/lib` copy tables are outside the scan; widen `SCAN_DIRS` before
flipping a batch on the strength of a zero.

What it does: per-file counts of Arabic segments in JSX text and string props, grouped into the
batches below, plus a manifest that turns "marked done but still Arabic" into a failing exit code.

**Turning detection on:** set the language's `UI_COVERAGE_COMPLETE` row to `true` in the
same commit as its final batch.

**Copy rules**

- Arabic: no feminine second person (the learner's gender is never collected) —
  `npm run lint:arabic` stays green.
- Indonesian and English: second person singular ("kamu", "you") — friendly, short, no
  exclamation marks, same information density as the Arabic.
- Never translate the target-language text itself (German stays German in every locale).

**Risk that must be planned for:** `tests/designSystem.test.ts` and several screen tests
assert Arabic strings. Each batch therefore updates the assertions **with** the screen, in
one commit; an assertion changed alone is a test weakened to fit a bug.

---

## 5. Phase 2 — the Dutch course (the real work)

Dutch is not "German with different words". The course has to be authored, and it has to
pass the same reviews the German curriculum did (`docs/agent/CONTENT-GATE.md`).

### 5.1 Content schema

Today the D1 tables are German-specific: `scenarios.title_de/initial_message_a1…`,
`vocabulary.german`, `grammar.rule_de/rule_ar`, `starter_phrases.german`. Two options:

| Option | Change | Verdict |
|---|---|---|
| A. Rename to `target_text` etc. | destructive, breaks every reader and the live D1 | **No** |
| B. Additive `target_lang` column + keep column names as legacy | one `ALTER TABLE … DEFAULT 'de'` per content table; readers filter by target; `german` is documented as "text in the target language" | **Yes** |

Option B follows the same additive rule every other Katzu data change follows
(`cloudflare-content-schema.js` already reconciles columns). The content loader gains
`--target=de|nl`; ids are namespaced (`nl_*`) so a Dutch row can never collide with a
German one.

### 5.2 What must be written (and reviewed) for Dutch

1. **Scenarios** — 12 A0–A1 situations first (greeting, café, supermarket, address,
   doctor, train, landlord, work intro, appointment, pharmacy, neighbour, goodbye). Each
   with: Dutch title, persona, opener per level, banner, category, `sequence_order` in the
   Dutch track only.
2. **Vocabulary** — ~300 items with `article` (`de`/`het`), plural, part of speech,
   translation in `ar`/`en`/`id`, example sentence in Dutch.
3. **Grammar** — 8 rules, authored in Dutch with explanations in all three native
   languages: `de/het`, V2 word order, inversion, plural formation, diminutives, `niet`
   vs `geen`, perfect tense (`hebben`/`zijn`), modal verbs.
4. **Roleplay plans + anchors** — `cloudflare-roleplay-plans.js` is German-specific and
   Arabic-labelled. Dutch plans live in `cloudflare-roleplay-plans.nl.js` (same shape:
   4 objectives, `register` `je`/`u`, persona gender), with anchors in Dutch.
5. **Deterministic checker** — the German local checker must not run on Dutch. Ship
   `src/lib/conversation/dutchChecker.ts` (or admit the honest alternative: server-only
   correction, with the chip saying so) rather than a German checker flagging every Dutch
   sentence.
6. **Speech** — `nl-NL` for TTS and recognition (`speechLocale` already lives in the
   matrix); verify a Dutch voice exists on Android and iOS before promising audio.
7. **Level spec** — word limits per CEFR level are language-agnostic; the *examples* in
   `docs/agent/LEVEL-SPEC.md` are not.

### 5.3 Turning it on (one commit, two flags)

1. `src/lib/i18n/languages.ts` → `nl: { available: true }`
2. `cloudflare-ai-chat.js` → `nl: { shipped: true }`
3. Client content routing: when `targetLanguage === 'nl'`, the scene library, vocabulary,
   grammar and review read the Dutch rows (the German D1 fetch is skipped, not merged).
4. `tests/languages.test.ts` has the Dutch-unavailable assertion; it is updated in the same
   commit, with the content manifest that proves the rows exist.

**Blocker to state plainly:** the Dutch rows must reach production D1 through the content
loader. `AGENTS.md` §3 requires the owner's exact line
`CONTENT-LOAD-AUTHORIZED: <file names>` for that. Until then Dutch is authored, audited
and loadable — not live.

---

## 6. Phase 3 — AI quality per language

- **Prompt** (done structurally): target and native are table lookups. Dutch needs its own
  `TURN_TARGET_LANGUAGES.nl` prose line once the course exists — e.g. no noun
  capitalisation, `de/het` as the article error, `ij` as one letter for spelling notes.
- **Checks** (`cloudflare-roleplay.js`): `registerSwitchInReply` is `sie`/`du` (German
  formal/informal). Dutch needs `u`/`je`. `arabicAddressesLearnerAsFeminine` is
  Arabic-only by design and must stay conditional on `nativeLang === 'ar'`.
- **Evaluation** (`validateGermanAgainstLevel`) currently validates German. It must take
  the target language, or Dutch replies will be rejected by a German validator.
- **QA**: `npm run qa:chat` replay pairs are German/Arabic. A Dutch replay set (20
  prompts) is required before Dutch is served — the same gate German had to pass.

---

## 7. Verification plan (what "done" means per phase)

| Claim | Evidence required |
|---|---|
| Matrix + storage correct | `tests/languages.test.ts` green |
| Prompt is target/native aware and unchanged for `de`/`ar` | `tests/turnLanguages.test.ts` + prompt-cost test green |
| A screen is localised | coverage script batch = 0, plus a manual read by a native speaker of each language |
| Dutch is real | content audit (`audit-curriculum.mjs`) on the Dutch file, 20-replay QA, and a live smoke of one Dutch episode |
| Nothing regressed | `npm run verify` (full gate) green in the same tree |

---

## 8. Risks and rollback

| Risk | Mitigation |
|---|---|
| A half-translated screen ships | coverage gate + batch commit boundary; Arabic is the fallback in `translate()`, never a key |
| LTR chrome breaks on a screen with hardcoded `left/right` | the B1–B6 batches include a 390×844 LTR pass; `dir` is on `<html>` |
| A Dutch row leaks into the German track | ids namespaced `nl_`, readers filter by `target_lang`, loader takes `--target` |
| The language choice loops with sync | `lastWrittenRef` de-duplication + adopt-once ref (`useLanguageProfileSync`) |
| Rollback | Every phase is additive: revert the commit, and the app is Arabic/German again with the same data (the profile fields are ignored when absent) |

---

## 9. Owner decisions still open

1. **Dutch content load** — the authored Dutch files need `CONTENT-LOAD-AUTHORIZED:`.
2. **Native copy review** — English and Indonesian UI copy should be read by a native
   speaker before the full UI batches land; machine copy is not "masterclass".
3. **Dutch launch scope** — 12 scenarios (a real A1 course) or the full 61-scenario
   catalogue? The plan assumes 12 first.

---

## 10. What a run must NOT do

- Do not translate a screen and leave its test asserting the Arabic string.
- Do not make `translate()` return a key, an empty string, or English as a fallback:
  Arabic is the fallback, always.
- Do not set `available`/`shipped` for Dutch before its content is loadable.
- Do not give the client's `target_lang` authority: the server resolves it.
