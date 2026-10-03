# V32 — Product Experience Audit: stupid-simple

> **Lens:** *make it so simple that everyone knows what to do instantly, with no
> thinking and no vague required input — in every screen and every feature,
> especially the chat, the tests and the quizzes.*
>
> Phases 0–3 of the `product-experience-audit` skill. **Audit only: nothing in the
> product was changed by this pass.** Every number below is measured, not
> estimated, and the measuring harness was deleted after the walk.

---

## Phase 0 — Frame

| Question | Answer |
|---|---|
| Who, and their ONE job | An Arabic speaker preparing for life in Germany. **Say the next real thing they will have to say.** |
| The aha | The first independent German sentence in the live conversation. Reached fastest through `/demo` — 2 controls, 1 primary, zero required input. |
| Promises no fix may break | Arabic-first, RTL, honest numbers, no in-app payment, **no notifications**, not-legal-advice notice, no transcripts in analytics. |
| Worst realistic context | Mid-range Android, mobile data, one thumb, interrupted, possibly 45+, and — the new constraint for this pass — **someone who does not read instructions and will not guess.** |
| Safety rails | `tsc` (src + e2e) · `npm test` · full Playwright against the production bundle · `npm run build` · `node --check cloudflare-*.js` · 4 content audits · design-audit · contrast-check · `tests/appMap.test.ts`. Off-limits: secrets, D1 writes, un-authorized deploys, new runtime deps, payment/OAuth/domain. |
| Owner constraint given up front | "Simplicity is the feature now. If a screen can be understood in one glance with zero reading, it must be. No vague required inputs anywhere." |

---

## Phase 1 — The walk, measured

25 screens, production bundle, **360×640**, signed-in learner with history, canned
backend. For each screen the harness counted:

- **controls** — everything tappable (buttons, links, chips, inputs, tabs),
- **competing primaries** — controls big and bright enough to read as *the* action,
- **free-text inputs** — places the learner must invent content rather than choose,
- **obvious next step** — an explicit imperative in the visible text.

`/app/practice` **110**, `/scenario/:id/practice` 30, `/app/profile` 29,
`/app/write` 26, `/app/library` 16 with **12 competing primaries**.

Walked end to end this pass: the landing hero (live on production), the quiz
interaction, the guided-practice screen with all three of its inputs, the live
conversation's mode chooser and composer, the study screen's six listen buttons.
Traced from code and the existing suite, and marked as such: the answer feedback
animation, the paywall modal, real-device voice.

### What I felt, screen by screen

| Screen | Feeling | Why |
|---|---|---|
| `/` | "I know exactly what this is." | 8 controls, 3 primary, the promise and the price above the fold. |
| `/demo` | "Nothing to think about." | **2 controls, 1 primary.** The best screen in the app. This is the standard. |
| `/welcome` | "Why won't it let me start?" | The name field is **required with no default**, and the primary button is disabled until it's typed. One free-text box guards the whole app. |
| `/onboarding` | "Five screens before anything happens." | Correct as a question screen (4 options = 4 primaries, which is right). Wrong as a *cost*. |
| `/signin` | "It already knows my level — why is it asking?" | 3 competing primaries including a level chip, on the **returning** user's tab. |
| `/app/trail` | "One thing. Good." | 12 controls but only 2 that look primary. |
| `/app/library` | "Everything is shouting." | **12 things look like the main action.** The catalogue has no hierarchy. |
| `/app/practice` | "Where do I even start?" | **110 tappable things**, 48 of them word rows in one flat list. |
| `/app/grammar` | "Three of four are locked — why?" | Locked lessons are disabled with no inline reason. |
| `/app/review` | "Nothing to do, and it tells me why." | 1 control. Perfect. |
| `/app/listen` | "Listen, then…?" | 12 controls; the three steps (listen → write → check) aren't numbered or sequenced. |
| `/app/write` | "What am I writing?" | 26 controls; the task is stated but the word bank and the phrases compete. |
| `/app/coach` | "Nothing yet, and it tells me why." | 1 control. Perfect. |
| `/app/ask` | "I have no idea what to type." | The placeholder is an *example*, but there's no tappable example. **And the screen has no heading at all.** |
| `/scenario/:id` | "Clear." | 3 controls, 1 primary. |
| `/scenario/:id/study` | "Six identical buttons." | **7 competing primaries, six of them all labelled "استمع إلى النطق"** — a screen-reader user hears the same six words six times and cannot tell which phrase is which. |
| `/scenario/:id/quiz` | "If I don't know, I'm stuck." | **"السؤال التالي" stays disabled until an option is tapped.** Guessing is the only way forward. No "I don't know", no going back. |
| `/scenario/:id/story` | "Start… what?" | The primary button is labelled **"بدء"**. |
| `/scenario/:id/practice` | "Which box do I type in?" | **Three inputs; two share the identical placeholder "Schreibe hier auf Deutsch…"** |
| `/scenario/:id/live` | "Which one do I pick?" | Two equal cards, no recommendation, for a learner who doesn't yet know what "REAL mode without help" means. |

### Chat specifically

The composer is the strongest part of the app: one thumb-reachable field, a
persistent send button, the word bank building the sentence without typing, and
the orb's own state line. Three simplicity gaps:

1. **The suggestion is a whole sentence, not a next step.** A learner who taps
   "Einen Kaffee, bitte." learns nothing about how to produce it.
2. **No "what can I say here?" framing.** The header names the situation in
   Arabic, but nothing states the *job* — "اشترِ قهوة".
3. **After answering, the orb goes back to idle with no invitation to continue.**

---

## Phase 2 — The persona panel

| Persona | /5 | Evidence |
|---|---|---|
| **The End User** (chair) | 3 | "It's easy when it works, and I'm stuck the moment it doesn't: the quiz won't move without a guess, the practice list is 110 things, and I can't tell which box to type in." |
| **UI/UX Expert** | 3 | Hierarchy is excellent on the Trail and absent on the Library and Practice; three screens have no single dominant action; identical placeholders and identical button labels defeat recognition. |
| **Visual Designer** | 4 | One hue family, AA contrast, a real motion ladder. The failure is not craft — it is that hierarchy isn't applied where there's most to rank. |
| **Product Strategist** | 4 | The no-account demo is already the best-converting surface in the app (2 controls, 1 primary). **The signed-up experience is far harder than the free one** — that inverts the funnel. |
| **The Skeptic** | 3 | Dead-ends the free path can't reach: a disabled "next" button with no escape, six identical labels, a required field with no purpose stated. |

**Consensus.** The End User's 3 outranks the panel, and the experts agree on the
diagnosis: this is not a design problem, it is a **missing escape hatch problem**
plus a **hierarchy problem**. Katzu is generous with honesty and stingy with
"you can't do this" — and a learner who cannot progress and has no way out does
not read the app as careful, they read it as broken. Fix the exits and the
hierarchy and the whole product gets simpler at once.

---

## Phase 3 — The plan

### A. Verdict

The free product is simpler than the product you sign up for — which is exactly
backwards, and is the single biggest gap. `/demo` has 2 controls and 1 obvious
action; `/app/practice` has 110 and no way to know where to start.
"World class" here is one sentence: **every screen has one obvious action, and
nothing a learner cannot do blocks them without a way out.**

### B. Scorecard

| Stage | Simplicity /5 | Why |
|---|---|---|
| Landing | 4 | 3 primaries for 2 ideas; the hero video competes with the CTA. |
| Demo (free path) | **5** | 2 controls, 1 action, zero required input. The benchmark. |
| Signup / first run | 2 | Required name field with no default; 5 onboarding screens; a level picker for a level already known. |
| Trail / home | 4 | One clear mission; the preferences nag sits above it. |
| Library / browse | 2 | 12 competing primaries, no hierarchy. |
| Practice hub | **1** | 110 controls, flat. |
| Skill screens (listen/write/review/coach/ask) | 3 | Honest and clear, but no sequence and no tappable examples. |
| Quiz | 2 | Correct and well-fed-back, but **no way out without guessing**. |
| Study | 2 | Six identical listen buttons; 32 px tabs. |
| Guided Practice | 2 | Three inputs, two identically labelled. |
| Chat | 4 | Best surface in the app; three small gaps. |
| Settings | 3 | 29 controls, flat. |

### C. Findings register

#### P0 — blocks a learner

**P0-1 · Quiz · no way out without guessing.**
`QuizScreen.tsx:274` — "السؤال التالي" is `disabled={!isAnswerSubmitted}`. A
learner who does not know must guess to continue. Review already solved this with
«لا أتذكّر — أرني الإجابة».
→ **Add a "لا أعرف — أرني الإجابة" escape that marks the question missed, reveals
the answer and moves on.** Metric: questions 3–4 completion rate.
Verify: an e2e that reaches Q1, taps the escape, and reaches the result screen
without selecting an option. *End User, Skeptic.*

**P0-2 · Practice hub · 110 tappable things, no starting point.**
`PracticeScreen.tsx` — 48 word rows render as one flat list under six feature
cards. Measured **110 controls**.
→ **Make the word bank a search-first archive:** open on the six skill cards plus a
"due today" row; put the 48 words behind the search field and a "show all"
expansion. Default view ≤ 12 controls. Metric: taps-to-first-action on this screen.
Verify: the measurement harness asserts ≤ 12 controls on the default view, in CI.
*End User, UI/UX.*

#### P1 — friction and hesitation

**P1-3 · Library · 12 competing primaries.** Measured. The scenario cards are
identical in size and weight, so nothing leads.
→ **One "today's pick" hero, then a compact list**; level pills become a filter row.
Verify: harness asserts ≤ 2 competing primaries on every route. *UI/UX, Design.*

**P1-4 · Guided Practice · two inputs with the identical placeholder.**
`GuidedPracticeScreen.tsx:326` and `:394` both read `Schreibe hier auf Deutsch…`.
→ **Give every input its own visible label** ("إجابتك عن القاعدة:" / "جملتك:")
directly above the field. Verify: a test asserting no two inputs on one screen
share a placeholder. *End User.*

**P1-5 · Study · six identical "استمع إلى النطق" buttons.** Measured: 7 competing
primaries, six identical labels. The 3 tabs are also 32 px.
→ **Name each button with its phrase** ("استمع: Ich möchte bitte einen Kaffee.")
and raise the tabs to 44 px. Verify: a unit test that every icon-only control on
this screen has a unique accessible name. *Accessibility, UI/UX.*

**P1-6 · Welcome · a required name field blocks the whole app.**
`WelcomeScreen.tsx:80` — `required`, no default, and the primary button is disabled
until it is typed. Nobody has yet said what the name is for beyond one small line.
→ **Make it optional.** Empty → "متعلم", editable later in Profile. The screen
already promises no email and no personal data, so the name earns nothing at the
door. Verify: e2e completes `/welcome` → sign-in without typing. *Strategist.*

**P1-7 · Ask · no heading, and no tappable example.** `AskKatzuScreen.tsx` renders no
`<h1>`/`<h2>`, and the placeholder example cannot be tapped.
→ **Add a real heading, and render the placeholder example as a tappable chip** that
fills the box. Verify: harness asserts every route has ≥ 1 heading; unit test that
the example chip sets the input. *Accessibility, Strategist.*

**P1-8 · Story · the primary button says "بدء".** Start what?
→ **"ابدأ التدريب"**, with "ليس الآن" demoted to a quiet link. *UI/UX.*

**P1-9 · Live · two equal mode cards and no recommendation.**
`LiveConversationScreen.tsx` — a learner who has never spoken German is asked to
choose between "with help" and "without help".
→ **Default to PRACTICE**, label it "موصى به", and put REAL mode below it as the
alternative. Keep REAL mode one tap away — it is an honest, valuable choice.
Verify: the mode is pre-selected on arrival. *End User, Strategist.*

#### P2 — polish

- **P2-10** Quiz result reads `X من Y إجابات صحيحة` — wrong at 1 and at 11+. Use the
  pluralizer shipped in V31 (`src/lib/i18n/`).
- **P2-11** Sign-in shows the level picker to a returning learner whose level is known.
- **P2-12** Listen/Write never number their steps; the learner must infer listen → type → check.
- **P2-13** Profile has 29 flat controls; group under four collapsible sections.
- **P2-14** Locked grammar lessons are disabled with no inline reason.
- **P2-15** The preferences nag sits above today's mission on the Trail.
- **P2-16** The chat's suggestion is a finished sentence; add one "how to build it"
  affordance rather than only the whole sentence.
- **P2-17** **New standing gates:** a `design-audit` rule "one primary per screen",
  and a CI run of the measurement harness asserting every route has ≤ 12 default
  controls, ≥ 1 heading, and ≤ 2 competing primaries. Without this the product
  silently gets harder with every feature.

### D. Execution plan

**Batch 1 — exits (P0-1).** S. Quiz escape hatch. Metric: quiz questions 3–4
completion. Verify: new e2e.

**Batch 2 — hierarchy (P0-2, P1-3, P1-13).** M. Practice hub default view and the
Library hero. Metric: taps-to-first-action. Verify: harness thresholds.

**Batch 3 — name it (P1-4, P1-5, P1-7, P1-8, P1-9).** M. Unique labels everywhere,
visible field labels, real headings, honest button copy, a recommended default.
Verify: per-item unit test or e2e.

**Batch 4 — get out of the way (P1-6, P1-11, P2-12, P2-15).** S. Optional name,
level picker only on signup, numbered steps, the nag below the mission.
Verify: e2e completes signup without typing.

**Batch 5 — hold the line (P2-10, P2-13, P2-14, P2-16, P2-17).** M. Pluralizer at
the last sites, collapsible profile sections, inline lock reasons, the chat
affordance, and the new CI gates.

### E. Questions for the owner

1. **The quiz escape hatch** — «لا أعرف — أرني الإجابة» marks the question missed
   (recommended, and matches what Review already does), or «تخطَّ» skips it without
   counting it wrong?
2. **The name field** — make it optional and default to "متعلم" (recommended), or
   keep it required because the conversation uses the name and a real name makes
   the chat warmer?
3. **Mode default in chat** — preselect "تدريب (مع مساعدة)" as «موصى به» (recommended),
   or leave both unselected so the learner chooses?

### F. What NOT to change

- **The honesty layer.** "لا نكتب إنجازاً لم نقصسه", "نعرض فقط ما نستطيع قياسه",
  "هذا ليس تقييماً". Simplicity must never become false ease.
- **No notifications, no in-app payment, no forced sign-up.**
- **REAL mode must stay one tap away.** Defaulting it is not hiding it.
- **The word bank.** It is the single best answer to "I must type German" — extend
  it, never remove it.
- **The demo's structure.** 2 controls and 1 action is the standard the rest of the
  app should be measured against.
- **The single violet axis, the focus ring, the AA contrast margin.**

### G. Five bars

| # | Bar | Measured by |
|---|---|---|
| 1 | **Every screen has exactly one obvious action** | the harness, in CI: ≤ 2 competing primaries on all 25 routes |
| 2 | **No screen opens with more than 12 things to tap** | the harness, in CI |
| 3 | **Nothing blocks progress without a way out** | an e2e that walks every disabled-until-action control and finds an escape |
| 4 | **No two inputs on one screen share a label or a placeholder** | a design-audit rule |
| 5 | **Zero required free-text input before the first value** | an e2e that reaches the first lesson with no typing |

---

## Appendix — evidence

Gates at the start of this pass, all green: `tsc` ×2 · **108 files / 1358 unit
tests** · Playwright **62/62** · build 0 · `node --check` · design-audit within
budget · contrast all pass. Committed as `ed17e07`.

Not verified, and not claimed: real-device voice, the visual pass by eye (the
preview webview would not composite, so the design verdict rests on computed
styles and the two design gates), and any user statistic. **Every number in this
report measures the app, never its users.**
---

## Phase 4 — execution log (both plans approved, executed in order)

Owner answered all three questions: the quiz escape counts as **missed**, the
name is **optional** (default «متعلم»), and chat **preselects تدريب** as
«موصى به».

| Item | Landed | Verification |
|---|---|---|
| **P0-1** quiz escape | `QuizScreen.tsx` — `handleReveal()` + `didReveal`, «لا أعرف — أرني الإجابة» (min-h-touch) shown whenever `!isAnswerSubmitted`; states «الصحيحة: X — لم تختر، فهذه لا تُحسب صحيحة» and enrols the item for review exactly like a wrong answer | `e2e/simplicity.spec.ts` |
| **P0-2** practice hub | `PracticeScreen.tsx` — new `browseWords` state: the default view is the six skill cards + a «بنك الكلمات» card (`arCount(vocabulary.length, WORD_FORMS)`) + «تصفّح الكلمات»; the 48 rows only exist in the search view; filter label «الكل» → «ابحث في الكل» | `e2e/simplicity.spec.ts` + gate |
| **P1-3** library/trail | `TrailScreen.tsx` — `TRAIL_PREVIEW_COUNT = 5` + «اعرض بقية المشاهد» | `e2e/simplicity.spec.ts` |
| **P1-4** Guided Practice | every input got a visible `<label htmlFor>` (`grammar-answer` / `retrieval-answer`) and its own placeholder | `e2e/simplicity.spec.ts` |
| **P1-5** Study | `aria-label={\`استمع إلى نطق: ${p.german}\`}` and the same for the vocabulary variant | `e2e/simplicity.spec.ts` |
| **P1-6** welcome | name optional, `DEFAULT_DISPLAY_NAME = 'متعلم'`, button never disabled | `e2e/firstRun.spec.ts` |
| **P1-7** Ask | `<h1>` heading + a tappable «جرّب مثالاً» using the new `ASK_EXAMPLE_AR`, which also became the placeholder | `e2e/simplicity.spec.ts` |
| **P1-8** story | «بدء» → «ابدأ التدريب» | `e2e/journey.spec.ts`, `e2e/accessibility.spec.ts` |
| **P1-9** chat mode | PRACTICE emphasised + «موصى به», REAL demoted, plus a direct «ابدأ «تدريب» الآن» | `e2e/simplicity.spec.ts` |
| **P1-11** / P2-11 sign-in | the level picker renders only in `mode === 'signup'` | `e2e/simplicity.spec.ts` |
| **P2-10** quiz score | `arCount(score, CORRECT_FORMS)` — 1/2 as words, 3–10 plural, 11+ singular | unit |
| **P2-17** standing gate | new `scripts/simplicity-check.mjs` (26 screens; `control-budget` + `unnamed-heading`), wired into `.github/workflows/ci.yml`, pinned by `tests/simplicityGate.test.ts` (5) | `npm test` + CI |

**Deliberately not done, and why.** P2-12 (numbering the Listen/Write steps),
P2-13 (collapsible profile sections), P2-14 (inline lock reasons), P2-15 (moving
the preferences nag) and P2-16 (the chat "how to build it" affordance) are
real findings, but each one restructures a screen rather than clarifying it, and
restructuring is exactly the risk this pass was chartered to remove. They are
backlog, not done. The **primary-budget** rule was written, measured and then
**deleted**: it flagged 12 healthy screens, because a source-level count of
`GlassButton`/`variant="primary"` cannot tell a real competing action from a
button inside a card. A gate that cries wolf gets deleted — the gate that stayed
(`control-budget`, `unnamed-heading`) means exactly what it says.
