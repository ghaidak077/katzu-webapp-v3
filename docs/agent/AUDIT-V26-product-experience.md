# Katzu — Product Experience Audit (V26, 2026-10-01)

Audit method: live walkthrough of the deployed production app (katzu-webapp-v3.pages.dev) in a 390×844 phone viewport as a first-time Arabic-speaking user, plus code/e2e evidence from the repo for surfaces that require an account. Skill: product-experience-audit v2. Nothing was changed in this phase.

---

## A. Verdict

Katzu is **genuinely close to world-class for its stage** — honest copy, a real lesson demo with no account, Arabic-first RTL, a11y-tested, honest pricing, clean failure UX. The three biggest gaps are **not** polish: (1) **/trust/imprint and /trust/refund render the PRIVACY page** — a real legal/credibility defect live right now; (2) **the demo never mentions the free AI-session quota (3) or that live conversation is quota-gated** — the wall a new user hits at session 4 arrives unexplained; (3) **the signup/welcome level pickers stop at A1 while the app serves A0** — the FAQ's own "أنا مبتدئ تماماً" persona is offered an overstated level.

## B. Journey scorecard (End-User-first, 1–5)

| Stage | Score | One line |
|---|---|---|
| First 30 seconds (landing) | 5 | Promise, who-for, two CTAs, FAQ, honest pricing — all within one screen-height of scroll |
| Demo lesson (no account) | 5 | 4 real steps, real content, no AI cost, no dark patterns, honest completion card |
| Signup / first-run | 4 | Google-only, single first-name field; level picker before value feels like a question without payoff yet |
| Core loop (trail → story → guided → live → debrief) | 4 | e2e-proven, debrief deterministic and honest — but UNWALKED on a real device, and the quota wall is unexplained in the demo/landing |
| Every use case | 3 | review/listen/write/coach/library/placement/grammar have no dedicated e2e and no real-device evidence; signup level picker has no A0 option (app supports A0) |
| Empty/error/edge | 4 | unit+e2e proven Arabic copy with next action for offline/mic/quota/401; live checks this session confirm all app routes 200 |
| Payment / honesty | 4 | payments deliberately inert (503), price from worker, plans ordered server-side; trust pages broken (see A-1) |
| Retention | 3 | day1/day7 markers exist but are invisible to the learner; no in-app "come back tomorrow" reason on completion screens |
| Accessibility | 4 | axe-proven, 44px fixed, RTL-first; CSP console errors on every page (see finding 4) |

## C. Findings register

### P0 — journey blockers (a real user hits these today)

1. **[trust] `/trust/imprint` and `/trust/refund` render the privacy page** (h1 = "الخصوصية والبيانات" on both, verified live this session). A user clicking the refund or imprint link gets the wrong document — a lie-by-layout, not a missing page. → Fix the route→content mapping in the TrustPage component (imprint and refund get their own content or 404 honestly). Persona: Skeptic — "the corner nobody polished."
2. **[first-run → core loop] The free-quota wall is invisible until it hits.** Landing and demo say "جلسات محادثة تجريبية محدودة" but never the number (3, `MAX_FREE_AI_SESSIONS`), never where the wall appears, and the demo completion card pitches account + placement without saying the live conversation you're about to try has 3 free sessions. → State "٣ جلسات محادثة مجانية" verbatim in the landing pricing block and on the demo completion card. Persona: End User — "I felt tricked at the wall."
3. **[signup] The signup/welcome level pickers offer only A1–B2 while the app serves A0.** A complete beginner (the FAQ's own persona) is offered a picker whose lowest option overstates them. → Add A0 to both pickers (the enum, level spec and placement all support it already). Persona: End User.

### P1 — friction / trust hurts

4. **[all pages] CSP console errors on every page**: `Refused to load https://accounts.google.com/gsi/style` (style-src blocks Google Identity's stylesheet). Verified live in this session's console, ×3 per load. → Add the GSI style host to the CSP `style-src` in the worker (or self-host). Consequence today: the Google button may render unstyled, and console noise undermines the "no console errors" battery claim.
5. **[signup] The welcome screen's name field has no "why do you need my name" microcopy, and the continue button sits disabled with no explanation.** One line — "نستخدم الاسم في المحادثة فقط" — removes the hesitation.
6. **[demo] The completion card asserts a review card was created but a signed-out user cannot see it** ("سينتقل معك إلى حسابك لاحقاً"). → Render the actual card content inline (it is one phrase) so the promise is visible, not asserted.
7. **[retention] The demo completion and session-report screens give no reason to come back tomorrow.** One Arabic line ("غداً: مشهد جديد ينتظرك — دقيقتان تكفيان") closes the loop the product's own philosophy depends on.
8. **[signup] Target-level question before first value:** the signin screen asks target level before the user has seen any value; placement exists and adapts anyway. → Defer to placement, or reframe as "تقدير أولي — سنضبطه بالمحادثة".

### P2 — polish

9. **[trust] refund/imprint have no full-policy link** (once finding 1 is fixed, add the "النسخة الكاملة المنشورة" link pattern to both).
10. **[a11y] The Google iframe carries an Indonesian title** "Tombol Login dengan Google" (verified in the live snapshot) — a screen-reader user hears Indonesian. Wrap or label it in Arabic.
11. **[nav] robots.txt/sitemap.xml still advertise katzu.app (does not resolve)** — known OWNER-OPEN item; unchanged.

## D. Execution plan (ordered by users-affected × severity ÷ effort)

| # | Item | File/surface | Change | Effort | Metric | Verify |
|---|---|---|---|---|---|---|
| 1 | Fix imprint/refund content | TrustPage route mapping (src) | render correct content per page or honest 404 | S | trust-page completion | new e2e: each /trust/* page's h1 matches its name |
| 2 | State the 3-session quota honestly | LandingScreen pricing block + demo completion card | add "٣ جلسات محادثة مجانية" | S | trial→wall confusion | e2e copy assertion |
| 3 | A0 in signup/welcome pickers | SignInScreen + welcome picker | add A0 option | S | A0-completer activation | unit + e2e |
| 4 | CSP allow GSI styles | worker CSP header | add accounts.google.com to style-src | S | console-clean p95 | live console check (needs worker deploy) |
| 5 | "Why my name" microcopy | welcome screen | one Arabic line under the field | S | field abandonment | manual |
| 6 | Show the review card inline | demo completion card | render card content | S | demo→signup conversion | e2e |
| 7 | Tomorrow-hook line | demo completion + session report | one Arabic line | S | D1 return rate | copy assertion |
| 8 | Defer/reframe the level question | signin | move to placement or reframe copy | M | onboarding completion | e2e |
| 9 | Full-policy links on refund/imprint | trust pages | after #1 | S | trust | manual |
| 10 | GSI iframe Arabic label | aria wrapper | screen-reader label | S | a11y | axe |

Batches: #1–#3 one commit (client only); #4 one commit (worker-only, needs deploy authorization); #5–#7 one commit (copy); #8–#10 one commit.

## E. Questions for the owner (only what needs you)

1. **Imprint content**: the imprint needs publisher identity data you own. Recommended default: an honest placeholder page ("بيانات الناشر: غيدق علوش — ghaidak.com") clearly marked for you to complete. Approve, or supply the wording?
2. **Refund policy wording**: no refund policy exists in the repo (payments are deliberately off). Recommended default: "الشراء عبر أكواد التفعيل — الاسترداد وفق سياسة صفحة الشراء الرسمية" until payments go live. Approve?
3. **Worker deploy**: item #4 (CSP) needs `DEPLOY-AUTHORIZED: worker`. Include it in the approval, or hold the CSP commit until the next authorized deploy?

## F. What NOT to change (already excellent — protecting it is part of the plan)

- The demo flow end-to-end (real content, no account, no AI cost, honest praise) — best-in-class activation.
- Honest pricing copy on the landing + "ويبقى مجانياً دائماً" framing.
- Arabic failure copy with next actions (offline/mic/quota/401) — verified in tests.
- The renderer-tier/kz-lite performance system; landing LCP 324 ms — do not re-litigate the hero.
- The قريباً honesty on the skill table (Sprechen/Hören/Schreiben live, Lesen قريباً).

## G. 90-day bars for "top tier"

1. First German sentence produced < 60 s from cold landing (today: ~2–3 min through demo steps).
2. Every `/trust/*` page shows its own document (today: 2 of 4 show the privacy text).
3. Zero console errors on landing, demo and signup (today: CSP errors on every page).
4. Every voice path has at least one real-device run recorded (today: none — Chromium fake device only).
5. ≥ 40% of demo completers create an account, measured via the existing analytics markers.

---

## Panel consensus

The End User's verdict: "this app tells me the truth and respects my data, and the first lesson is genuinely real — but when it says 'limited sessions' it hides the number, and if I go looking for the company behind it I find the privacy page wearing two other names." The UI/UX expert and the Visual Designer both score the surface 4–5 and have almost nothing to add (the V19–V21 polish passes already consumed their findings). The Product Strategist confirms the quota-blindspot is the single biggest conversion risk. The Skeptic files the trust-page bug, the CSP noise and the A0 gap. **Consensus: approve the plan as-is; it is small, mostly copy-level, and protects everything that already works.**
