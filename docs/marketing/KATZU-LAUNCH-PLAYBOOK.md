# KATZU-LAUNCH-PLAYBOOK — single source of truth

> **One file.** Everything marketing, pricing, free-trial, sales-operations and launch lives here.
> After this file exists, no other marketing file is needed; the superseded list is in §0.
> **UNVERIFIED claims in this file: 9** (counted against the claims register in §11; each is tagged `UNVERIFIED` where it appears).
> All Arabic blocks carry a ⚠️ flag: the owner (native speaker) must read them before any public use; lines that specifically need a **Syrian or Iraqi ear** are marked ⚠️🇸🇾/🇮🇶. Every price in this file is a **TEST TARGET** (a hypothesis), never a fact.

## Table of contents

- [0. How to use this file · status line · superseded files](#0-how-to-use-this-file--status-line--superseded-files)
- [1. Decisions and constants](#1-decisions-and-constants)
- [2. Revenue math and funnel](#2-revenue-math-and-funnel)
- [3. Audience and positioning](#3-audience-and-positioning)
- [4. Offer, pricing and the free session](#4-offer-pricing-and-the-free-session)
- [5. Sales operations (manual payments)](#5-sales-operations-manual-payments)
- [6. Weeks 1–4 launch plan (personal contacts only)](#6-weeks-14-launch-plan-personal-contacts-only)
- [7. Staged channels (unlock-gated)](#7-staged-channels-unlock-gated)
- [8. Landing page copy (Arabic, build-ready)](#8-landing-page-copy-arabic-build-ready)
- [9. In-app copy spec, support library, lifecycle, proof engine](#9-in-app-copy-spec-support-library-lifecycle-proof-engine)
- [10. Measurement, tests and kill criteria](#10-measurement-tests-and-kill-criteria)
- [11. Claims register, risks, legal](#11-claims-register-risks-legal)
- [12. Product requirements for engineering (SPEC ONLY)](#12-product-requirements-for-engineering-spec-only)
- [13. Owner checklists](#13-owner-checklists)
- [14. Appendix: change log and source mapping](#14-appendix-change-log-and-source-mapping)

---

## 0. How to use this file · status line · superseded files

**How to use.** This is the only marketing file. When a fact conflicts with any other doc, this file wins; when it conflicts with the code, the code wins (AGENTS.md §0). Tags used throughout: `FACT` (verified against code/repo with a path, or externally sourced with URL+date), `TEST TARGET` (a hypothesis to be measured, never stated publicly as final), `UNKNOWN` (we do not know; measure before deciding), `UNVERIFIED` (asserted somewhere but not yet evidenced — see §11), `HYPOTHESIS` (a persona/assumption pending interviews), `INTERNAL` (never appears in public copy), `FOR VERIFICATION` (needs a lawyer/teacher/native before shipping).

**Status line (from the repo, verified 2026-10-02):**

| Surface | Status | Evidence |
|---|---|---|
| Public demo lesson (`/demo`) — **no account, no AI call** | **LIVE** | 4-step demo verified on production repeatedly (ledger V18-3, V19-1: `aiCalls: []`, content endpoints only); `src/features/marketing/LandingScreen.tsx` CTA «جرّب درساً بدون حساب» |
| Free AI sessions for signed-in accounts | **LIVE — but 3 sessions, not 1** | `MAX_FREE_AI_SESSIONS = 3` (`cloudflare-unified-worker.js:105`); quota ledger `trial_quota_ledger` + Arabic exhaustion copy at `:432`/`:647`. **Owner decision #1 says ONE free AI session at launch — this is a spec change, see §12 P1.** |
| Account creation | **Google sign-in only** | `src/features/auth/SignInScreen.tsx` (Google Identity Services, `:448` «التسجيل السريع باستخدام Google»). **No email+password path exists.** Decision #1's "email or Google" = SPEC, see §12 P1. |
| Paid products | **Activation codes only; checkout is test-mode** | `POST /crypto/checkout` → 503 `crypto_not_configured` (NOWPayments secrets absent; ledger V18 decision); codes redeem via `/verify`, single-use by ledger PK |
| Prices | **Server-owned, USD, test-mode value 5 USD/1 mo** | `CRYPTO_PRICE_USD` (`cloudflare-crypto.js:115–119`); tiers monthly/quarterly/yearly/student (`:138–165`); 3-month pass flagged `recommended: true` (V24, `:146–150`); client renders only what the worker vouches (`src/lib/utils/links.ts` `getProPlanTiers`) |
| Regional half-price codes | **Not built** | Discount codes exist (`STD-{pct}-{nonce}-{sig16}`, HMAC-verified, re-prices server-side, `cloudflare-crypto.js:180–202`) — reusable by design. A regional *single-use* variant is §12 P3. |
| Exam-speaking module (the wedge's product) | **LIVE (loaded V24)** | `docs/content/curriculum-exam-speaking.json` `_note` (status draft, "in the style of, NOT official", 5 exam scenarios); loaded in V24 and verified live 2026-10-02 — `/scenarios` returns `exam_sich_vorstellen, exam_erfahrungen_sprechen, exam_gemeinsam_planen, exam_thema_praesentieren, exam_auf_partner_reagieren`. Market it as live; keep the "in the style of, NOT official" framing everywhere (C4). |
| Exam result card | **Shipped (V24), honest by construction** | `src/lib/debrief/examCard.ts` — deterministic, never claims official score; mandatory notice «هذه محاكاة بأسلوب الامتحان — ليست الامتحان الرسمي ولا تمنح درجة معتمدة» (`:19`) |
| Scores vs real exams | **NOT validated** | No teacher-validated calibration exists. Until §12 P8's validation runs, any shared score is labeled «تدريبي تقريبي» and **no score deltas are published**. |
| Analytics | **Allow-listed, privacy-first, 29 events** | `src/lib/analytics/events.ts` (`ANALYTICS_EVENTS`, 8 prop keys); worker rejects unknown names (`cloudflare-analytics.js`) |
| Referral | **LIVE: 3 access-days both sides on invitee's first lesson + 1 Pro month on first verified purchase** | `cloudflare-unified-worker.js:2195–2210` (`REFERRAL_LESSON_REWARD_DAYS = 3`, `REFERRAL_REWARD_MONTHS = 1`), codes `REF-XXXXXXXX` |
| Live content | **49 scenarios / 531 vocabulary / 426 starter_phrases / 73 grammar rows live** (includes the exam module) | live probe 2026-10-02: `/scenarios` 49 (5 `exam_*`), `/vocabulary` 531, `/grammar` 73; ledger V24-1 (49/531/426/73) |
| Exam date capture | **Not built** | No exam-date field exists anywhere in `src/`. §12 P6. |
| Source-tag capture (`?src=`) | **Not built** | Only `?ref=REF-…` referral forwarding exists (`src/lib/utils/links.ts` `buildSalesUrl`). §12 P2. |
| Renewal reminder (~day 75) | **Not built** | No lifecycle automation exists. §12 P5. |
| Domain | **pages.dev URLs live; `katzu.app` does not resolve** | `publicAppUrl()` comment, `src/lib/utils/links.ts:106`; robots.txt advertises katzu.app (OWNER-OPEN in ledger) |

**SUPERSEDED FILES** (moved to `docs/marketing/archive/`; do not cite):

`INDEX.md`, `00-skill-map.md`, `01-audience.md`, `02-competitors.md`, `03-positioning.md`, `04-voice-and-tone.md`, `05-offer-and-pricing.md`, `06-teacher-program.md`, `07-teacher-outreach.md`, `08-community-plan.md`, `09-video-system.md`, `10-lead-magnets-and-seo.md`, `11-partnerships.md`, `12-landing-copy.md`, `13-checkout-and-payment-copy.md`, `14-support-library.md`, `15-in-app-copy.md`, `16-proof-engine.md`, `17-lifecycle-messages.md`, `18-habit-design.md`, `19-measurement-and-tests.md`, `20-interview-guide.md`, `21-roadmap-and-kill-criteria.md`, `22-risk-and-claims.md`, `23-review-log.md`, `gtm-copy.md`.

Kept in place (product/ops docs — for marketing content, defer to THIS file):
- `docs/MARKETING-KIT.md` — product fact sheet + honest rules; its «من 5$/شهر» price line and "33 scenarios" count are superseded by §1 and §0 here.
- `docs/agent/BETA-KIT.md` — closed-beta operations (free, code-only) still governs the beta; its marketing implications are folded into §6 here.
- `docs/agent/OWNER-STEPS.md` — owner-only ops runbook.
- `docs/agent/TEACHER-KIT.md` — does not exist (checked 2026-10-01). If a teacher-facing kit is written later, it points here for terms (§7).

**What changed vs the old pack (the corrections this file applies):** no "free mock without an account" anywhere (the free AI session requires signup; only the demo is account-free); one price table (EUR 19/29/39 cells, EUR 7 single mock, annual/lifetime and $-vs-EUR mixing deleted); unit economics rebuilt with NET-based revshare and UNKNOWN placeholders; cadence capped at ≤2 outbound/user/week; competitor names confined to §3's INTERNAL block; invented statistics removed ("70% fail", "examiners hear it 20×" deleted); price testing redesigned to one launch price + 50–100-visitor data; score deltas blocked until teacher validation; Egyptian dialect removed in favor of MSA + Levantine warmth; delivery promise 12h not 3h; recurring revenue shown as its own math (§2).

---

## 1. Decisions and constants

Owner decisions 1–10 are **binding**; they override every archived file.

| # | Decision / constant | Value | Tag |
|---|---|---|---|
| D1 | Free tier | No-account demo lesson (no AI) + **ONE free AI session after free signup** (email or Google). No anonymous AI mock. | FACT (demo+quota code) / SPEC (1 session, email signup) |
| D2 | Paid products | Prepaid **1-month pass $15** and **3-month pass $30 (default, recommended)**. No recurring subscription at launch (manual payments). | TEST TARGET |
| D3 | Renewal path | Renewal reminder offer at ~day 75 of a 3-month pass replaces auto-renew until card payments exist. | DECISION |
| D4 | Working currency | **USD** everywhere (marketing, checkout, bookkeeping). EUR appears only when quoting the real exam fee. | DECISION |
| D5 | Exam fee anchor | Goethe B1 Germany ≈ **EUR 259** (goethe.de fee page, retrieved 2026-10-01). Re-verify quarterly or tag UNVERIFIED. | FACT (sourced) |
| D6 | Regional tier | ~half price for Syria/Iraq/Egypt and similar, via **signed code** (never self-declared country). | DECISION (mechanism = §12 P3) |
| D7 | Payment methods | Crypto (NOWPayments, test-mode today) + Syrian local methods: Syriatel Cash / MTN Cash, Sham Cash or similar wallets, hawala/transfer offices, USDT. **Every sale is a manual order.** | FACT (crypto plumbing) / DECISION (methods) |
| D8 | Code delivery promise | «within 12 hours» — not 3. | DECISION |
| D9 | Buyer geography | **UNKNOWN.** Every link/code/post carries `?src=`; the first 50 sales answer the question. | DECISION |
| D10 | Capacity | 5–10 h/week for marketing + support. One main channel + one secondary. | DECISION |
| D11 | Weeks 1–4 channel | Owner's personal contacts ONLY. Teacher → groups → video stage after the first 10 sales. | DECISION |
| D12 | The one promise | «درّب نفسك على امتحان B1 الشفوي بالعربي» — rehearse the B1 speaking exam in Arabic. The pass unlocks all content (A0–B2, all tracks); marketing sells only the exam rehearsal. Exam claims are always "in the style of", never official. The exam module is live (loaded V24, verified 2026-10-02). | DECISION |
| D13 | Goal | $1,000/month. One-off cash math in §2; recurring math shown separately (§2.4). | DECISION |
| D14 | Score honesty | No public score deltas until teacher validation (§12 P8). Scores labeled «تدريبي تقريبي». | DECISION |
| D15 | Arabic register | MSA + Levantine warmth. **No Egyptian dialect** (مفيش، إزاي، دلوقتي banned). Native-read flag on every Arabic block; Syrian/Iraqi check where marked. | DECISION |
| D16 | Fair-use cap | UNKNOWN to measure from first 5 orders (tokens/session). Placeholder wording in §4, no public number until measured. | UNKNOWN |
| D17 | AI cost per session | UNKNOWN. Placeholder $3 in §2 math until measured (§5 measurement procedure). | UNKNOWN |
| D18 | Payment fees | UNKNOWN per method (crypto ~1–2% typical, local wallets/hawala UNKNOWN until first orders). Placeholder $2 flat in §2 math. | UNKNOWN |
| D19 | Product facts | Demo = no account + no AI call (FACT). Codes `DE-{months}M-{8hex}-{16hex HMAC}` single-use (FACT, `cloudflare-unified-worker.js:2493–2497`). Prices server-owned (FACT). 3-month tier `recommended: true` (FACT, V24). | FACT |

---

## 2. Revenue math and funnel

All figures are **illustrative arithmetic on TEST TARGET prices** — not projections. Placeholders: payment fee $2/order (`FEE`), AI cost $3/active-pass-month (`AI`) — both UNKNOWN until measured (procedure in §5.5). Revshare is a share of **NET** (price − fees), never of gross.

### 2.1 Per-order net (formulas)

```
NET_direct(p)      = p − FEE − AI
NET_regional(p)    = p/2 − FEE − AI          (regional code = half price)
NET_teacher(p)     = (p − FEE) × 0.5 − AI    (teacher earns 50% of NET-after-fees)
MARGIN_wholesale   = p_public − p_wholesale − AI   (teacher buys codes at wholesale, sells at public)
```

### 2.2 Per-order arithmetic at the launch prices

| Sale type | Price p | − FEE $2 | − AI $3 | Net to Katzu | Teacher's cut |
|---|---|---|---|---|---|
| Direct 1-month | 15 | 13 | 10 | **10** | — |
| Direct 3-month | 30 | 28 | 25 | **25** | — |
| Regional 3-month (code, half price) | 15 | 13 | 10 | **10** | — |
| Teacher revshare 3-month | 30 | 28 | 25−11=**14** | **11** | 0.5×28 = 14 |
| Wholesale 3-month (teacher buys at 20, sells at 30) | 30 | — | 25−17=**8** | **7** | 10 |

Assumption inside wholesale: wholesale price $20 is itself a TEST TARGET (not owner-approved; must be set before teacher outreach).

### 2.3 Sales needed for $1,000/month (one-off cash)

```
sales_needed = 1000 / NET
```

| Mix | Math | Sales/month |
|---|---|---|
| All direct 3-month | 1000 / 25 | **40** |
| All direct 1-month | 1000 / 10 | **100** |
| All teacher revshare (3-month) | 1000 / 11 | **≈91** |
| All wholesale | 1000 / 7 | **≈143** |
| All regional half-price | 1000 / 10 | **100** |
| Realistic mix (60% direct-3mo, 25% revshare, 15% regional) | 1000 / (0.60×25 + 0.25×11 + 0.15×10) = 1000/19.25 | **≈52** |
| Same mix, everyone on 1-month instead | 1000 / (0.60×10+0.25×3.5¹+0.15×10) = 1000/8.38 | **≈119** |

¹ teacher-revshare on a 1-month sale at p=15: (15−2)×0.5−3 = 3.5.

**Read:** at $30/3-month, the goal is ~40 orders/month direct, ~52 on the realistic mix. If the 1-month pass dominates, the goal needs ~2× the orders — which is why the 3-month pass is the default (D2) and the renewal reminder (D3) exists.

### 2.4 Recurring-equivalent math (the honest version of "MRR")

Manual prepaid passes are **not** recurring revenue; a cohort that stops renewing decays to zero. Two lenses:

- **One-off cash (what we actually collect):** §2.3. Renewal is a re-sale that must be re-earned each cycle (~day 75 reminder, D3).
- **Recurring-equivalent:** if a share `r` of expiring passes renews, steady-state monthly revenue ≈ new sales/mo × NET × (1 + r + r² + …) = new × NET / (1 − r). Example: 40 new 3-month passes/mo (=$1,000) with r = 0.5 renewal → effective $2,000/mo at steady state; with r = 0 → $1,000/mo and constant grind. **Implication: the day-75 reminder is worth more than any new channel once >100 learners hold passes — instrument it first (§12 P5).**
- True subscription revenue (auto-renewal) is deferred until hosted card checkout exists (§12 P9) — do not sell "monthly recurring" language at launch: nothing renews automatically.

### 2.5 Funnel steps and what each implies

| Step | Metric (§10.1) | Week-4 gate | If below gate → |
|---|---|---|---|
| See message → visit | link clicks (src-tagged) | 20 invites → ≥5 visitors | message wrong; rewrite, not more volume |
| Visit → free demo start | `demo_started` | ≥40% of visitors | CTA/hero wrong |
| Demo → signup | `signup_completed` | ≥25% of demo finishers | free-session value invisible; fix §8 copy |
| Signup → free AI session done | `conversation_completed` (first) | ≥60% of signups | first-session friction; product issue, not marketing |
| Free session → order intent | `purchase_clicked` | ≥2 of 8 finishers (25%) | offer/value gap; interview finishers who didn't buy (§10.4) |
| Order intent → paid | manual order completed | ≥70% within 24h | payment friction; fix §5 flow first |
| Paid → activated (code redeemed) | `code_redeemed` | ≥90% within 12h | delivery problem — the 12h promise is broken |

North star for the wedge: **free sessions completed per week** and **orders/month**. Guard metric: refund rate ≤5% of orders.

### 2.6 What is measured and how

Everything measurable rides on the existing allow-list (§10.2 flags the gaps). Until §12 P2 ships, the owner tracks `src` manually in the order sheet (§5.4) — that manual sheet is the system of record for the first 50 sales.

---

## 3. Audience and positioning

All personas are `HYPOTHESIS` until the first 10 interviews (§10.4). Buyer geography is UNKNOWN (D9) — assume Germany-based Arabic speakers, verify with `src` data.

### 3.1 The four personas

**P1 — أمير، "الورقة"** (benefit recipient preparing B1 for residence) `HYPOTHESIS`
25–40, arrived 2022–24, the B1 certificate secures residence/work rights. Fears failing = months of waiting + re-fee. Objections: no card, no spare money, "free YouTube exists". Payment: manual transfer/code, no card. Channels: WhatsApp family/community groups, Telegram, TikTok. Trigger: the exam booking letter, 4–6 weeks out.

**P2 — ليلى، "الترقية"** (worker wanting better work) `HYPOTHESIS`
27–45, employed below qualification, B1/B2 unlocks Ausbildung. Fears time poverty and wasting money. Best payment ability of the four; card possible but manual flow must still work. Trigger: a rejection "insufficient German" or an Ausbildung deadline.

**P3 — يوسف، "الطالب"** (student) `HYPOTHESIS`
18–26, needs B1/B2 for admission; tech-native; "ChatGPT does this free" is his first objection (answer: the side-by-side demo, §3.3 — never words alone). Price-sensitive. Channels: Telegram, Reddit r/German, TikTok, Discord study groups. Trigger: admission letter with a language deadline.

**P4 — أم سامر، "الوسيط"** (family member buying for a parent) `HYPOTHESIS`
20–35, own German better, manages the household; the parent must pass A2/B1. Buys as a gift ("هدية كود"); needs scam-proof trust signals: founder's face, clear refund story, code gifting. Often the actual payer for P1-type learners. Channels: Facebook groups (strongest for women), WhatsApp.

### 3.2 The wedge (one sentence)

> **«تدرّب على امتحان B1 الشفوي بالعربي — قبل ما تدفع ٢٥٩ يورو للامتحان الحقيقي.»** ⚠️🇸🇾
> (Gloss: "Rehearse the B1 speaking exam in Arabic — before you pay EUR 259 for the real one." Fee per D5.)

### 3.3 Messaging house

- **Promise:** «امتحانك الشفوي قرب؟ اعرف مستواك الحقيقي قبل يوم الامتحان.» ⚠️🇸🇾
- **Three proofs (all FACT about shipped mechanics; exam content live since V24):**
  1. Same-shape simulation: plan / present / react, in the style of B1 exams (exam module loaded V24 — D12).
  2. Honest Arabic debrief computed from your own sentences (`src/lib/debrief/debrief.ts` — deterministic, shipped).
  3. Memory: your mistakes return in spaced review until mastered (SRS shipped).
- **Reasons to believe:** founder on camera; no affiliation claims anywhere; the account-free demo proves the product before any payment; «أول جلسة ذكاء اصطناعي مجانية بعد التسجيل» (D1).
- **INTERNAL — competitive landscape (never public; public copy never names competitors):** Integrationskurs/YouTube = teaching + trust, but minutes of speaking per learner per day. V-IZ = structured Arabic B1 video course (~EUR 149.99 + 46 books, owner research — re-verify before ever quoting). Lisan = several products share the name (App Store id6757189064, trylisan.app, lisanapp.me — identity DISPUTED; do not name it either way). ChatGPT voice = free and fluent but sycophantic, no exam format, no memory — the honest answer is a recorded side-by-side demo (below), not claims. Babbel ≈ $17.95/mo retail (PCMag, 2026-10-01). Side-by-side test: record one exam-style question answered by Katzu's honest debrief vs a generic AI chat's "gut gemacht!" — publish only the recording, never a verbal claim.

### 3.4 Taglines (ranked; all ⚠️ native read)

1. «تتحدث. تخطئ. تتذكر.» ⚠️ (brand line, from MARKETING-KIT)
2. «التمرين قبل الماتش.» ⚠️
3. «ما بتحكي ما بتنجح.» ⚠️🇸🇾 (Levantine register; replaces the old Egyptian-flavored «ما تحكيش ما تنجحش»)
4. «يعرف أخطاءك أكثر منك.» ⚠️
5. «محاكاة بنتيجة حقيقية.» ⚠️
6. «جاهز؟ جرّب بلا خوف.» ⚠️

### 3.5 Objection table

| Objection | Response (Arabic) | Note |
|---|---|---|
| "Is this a scam?" | «جرّب الدرس المجاني — بدون حساب، بدون بيانات دفع. وبعد تسجيلك المجاني عندك جلسة ذكاء اصطناعي مجانية.» ⚠️ | the demo + free session are the answer, not words |
| "I already have a course" | «تمام — كاتزو مش كورس، هو التمرين. زي صالة التمرين جنب المدرسة.» ⚠️ | alongside-positioning |
| "AI is free everywhere" | «شوف فيديو المقارنة: نفس السؤال، شوف مين بيصحح من جملك فعلاً.» ⚠️ | only after the side-by-side recording exists; never a verbal claim |
| "Is it official?" | «لا. كاتزو محاكاة تدريبية فقط، وغير تابع لأي جهة امتحانات.» ⚠️ | MANDATORY wording everywhere |
| "AI gets it wrong sometimes" | «صحيح — لهيك التصحيح مبنيلك من جملك انت، وفيه زر «بلغ عن خطأ» بكل تصحيح.» ⚠️ | content-flag loop |
| "I have no card" | «الدفع: تحويل بنكي، USDT، أو محافظ ومكاتب تحويل محلية. الكود يوصلك واتساب خلال ١٢ ساعة كحد أقصى.» ⚠️🇸🇾 | §5 flow; 12h per D8 |
| "Will it work on my phone?" | «بيشتغل بالمتصفح على أي هاتف — والصوت أفضل، بس الكتابة بتشتغل دايماً.» ⚠️ | honest: real-device voice still owner-unverified (ledger OWNER-OPEN) |

### 3.6 Mandatory non-affiliation wording

Every public surface that mentions exams carries, verbatim: «كَاتْزُو أداة تدريب مستقلة. غير تابعة ولا معتمدة من Goethe-Institut أو telc أو أي جهة امتحانات. الامتحان الرسمي والشهادة من المركز الرسمي فقط.» ⚠️ And the exam card's in-app notice (already shipped): «هذه محاكاة بأسلوب الامتحان — ليست الامتحان الرسمي ولا تمنح درجة معتمدة.» (FACT: `src/lib/debrief/examCard.ts:19`.)

---

## 4. Offer, pricing and the free session

### 4.1 Product table

| Product | Price (TEST TARGET) | What it unlocks | Notes |
|---|---|---|---|
| Demo lesson | $0, **no account** | one real lesson, no AI call | the trust front door (FACT, live) |
| Free AI session | $0, **free signup required** (email or Google) | exactly **one** AI conversation session per account | D1; shipped today as 3 sessions → §12 P1 reduces it; abuse limits required |
| 1-month pass | **$15** | everything: A0–B2, all tracks, unlimited AI sessions (fair-use cap, D16) | for "exam is in 2 weeks" buyers |
| **3-month pass (default)** | **$30** | same, 3 months | flagged `recommended` server-side (FACT, V24); the price the landing and paywall lead with |
| Regional code (Syria/Iraq/Egypt & similar) | **~50% off** via signed single-use code | same as the pass it halves | D6; mechanism §12 P3; never self-declared country |
| Teacher wholesale | $20/code (TEST TARGET, owner must approve) | teacher sells at public price, keeps $10 | unlocked in §7 after 10 sales |
| ~~Single mock $7~~ / ~~annual~~ / ~~lifetime~~ / ~~EUR 19/29/39 cells~~ | — | — | **deleted** (superseded; not owner-approved) |

The pass unlocks the whole app (D12) — but marketing sells only the exam rehearsal. One promise, one product story.

### 4.2 Anchoring copy

- Above the price: «الامتحان الحقيقي: ٢٥٩ يورو… ولو وقعت، تنتظر وتدفع من جديد. التدريب هنا: أقل من ثمن وجبة لعائلة، لثلاثة شهور.» ⚠️🇸🇾 (fee per D5; the meal frame replaces the false "under 10%" line — $30 is ~11.6% of EUR 259, so the old arithmetic no longer holds).
- Never: fake struck-through prices, "worth $X" inflation, urgency except the learner's own exam date.
- Renewal framing (day-75): «باقتك بتنتهي قريب — تجديدك بباقة جديدة بيرجّع كل شي لحالها فوراً.» ⚠️ No auto-charge language, ever (nothing renews automatically — D2/D3).

### 4.3 Refund policy — FOR LEGAL VERIFICATION

Draft (do NOT publish until a lawyer approves the exact wording): «ضمان واضح: خلال ١٤ يوم من الشراء، إذا جرّبت وما ناسبك التدريب، برجّعلك المبلغ كاملاً — بدون أسئلة محرجة.» ⚠️
**Launch-without-refund-claim fallback (approved path):** launch with NO refund claim anywhere. State only what is true and safe: «إذا صار خطأ بالطلب أو بالكود، منصلّحه أو منرجّعك كامل» (error-correction, not a withdrawal right) ⚠️ — and add the refund claim later once verified. EU digital-content withdrawal law has waiver mechanics (access-on-immediate-delivery etc.) that must be right before any public claim.

### 4.4 Fair-use cap

Wording (the number is UNKNOWN — D16): «الباقة تشمل تدريباً يومياً بلا حدود المعقول — للاستخدام الشخصي.» ⚠️ Publish a concrete cap **only after** measuring tokens/session on the first 5 real orders (§5.5). If abuse appears before the number exists, apply the per-account abuse limits of §12 P1 and say so honestly in support replies.

### 4.5 Price testing (replaces the old 20-per-cell design)

Launch with **one price** ($15/$30, 3-month default). Collect conversion data from the first **50–100 visitors per tier** before touching anything. Only then, if conversion <2% of finishers: test one alternative (e.g. $25/3-month or a $7 single-session product — the latter needs owner approval to exist). Minimum honest sample: **50 visitors** to see a 2× conversion difference directionally, 100 to trust it; anything smaller is noise — do not conclude from 10 visitors. Regional tier and wholesale prices likewise launch at one value and re-decide at n≥50 orders.

---

## 5. Sales operations (manual payments)

### 5.1 The order flow (every sale, no exceptions)

1. **Order intent** — buyer messages the owner (WhatsApp) or fills the landing order form (§8) with: name · email or WhatsApp · pass choice (1-month / 3-month / regional code) · optional exam date · the `src` tag from their link.
2. **Owner replies with payment instructions** for the chosen method (§5.2). Placeholders only — **never real account numbers in any doc, post or code**.
3. **Buyer pays** and sends the transfer screenshot/receipt.
4. **Owner verifies** (amount + destination + `src` note) and marks the order paid.
5. **Owner mints a signed code** (`POST /admin/generate`, `months` 1 or 3 — FACT; the endpoint mints `DE-{months}M-{nonce}-{HMAC}`) and sends it with the delivery template (§5.3).
6. **Owner logs the order** in the sheet (§5.4) and sets the day-1 follow-up (§9.3).

Promise on every order: **code within 12 hours** (D8) — under-promise, over-deliver.

### 5.2 Payment instruction copy (placeholders `{…}`; all ⚠️ native read)

**Crypto / USDT:**
> «الدفع بعملة رقمية: أرسل {المبلغ} USDT (شبكة {الشبكة}) إلى المحفظة: {العنوان}.
> بعثت؟ ابعثلي صورة العملية ورقم الطلب — الكود بيوصلك خلال ١٢ ساعة كحد أقصى.»

**Syriatel Cash / MTN Cash:**
> «الدفع عبر Syriatel Cash / MTN Cash: حوّل {المبلغ} إلى الرقم: {الرقم} باسم {الاسم}.
> صوّر إشعار التحويل وابعثله هون — بتفعّلك خلال ١٢ ساعة.»

**Sham Cash / محافظ مشابهة:**
> «الدفع عبر {المحفظة}: حوّل {المبلغ} إلى الحساب: {الحساب}.
> بعثت؟ ابعث إشعار العملية — الكود بيوصل خلال ١٢ ساعة.»

**حوالة / مكتب تحويل:**
> «الدفع عبر مكتب التحويل: ابعث {المبلغ} باسم {الاسم} — {المدينة}.
> خد رقم الحوالة وابعثله هون مع اسمك — منفعّلك أول ما توصل.»

**Bank transfer (for Germany-based buyers):**
> «الدفع بتحويل بنكي: IBAN {IBAN} — اسم المستلم: {الاسم}.
> بعد التحويل، ابعث صورة الإشعار — الكود بيوصل خلال ١٢ ساعة.»

### 5.3 Code delivery template (WhatsApp/email)

> «وصل الدفع، شكراً {الاسم} 🌟
> كود تفعيلك (يُستخدم مرة واحدة):
> **{DE-3M-XXXXXXXX-XXXXXXXX}**
> التفعيل: {APP_URL} ← تسجيل الدخول ← شاشة الاشتراك ← «لديّ كود بالفعل»
> أول خطوة بعد التفعيل: جلسة المحاكاة الأولى — بعرفك وين واقف بالضبط.
> أي مشكلة؟ رد على هالرسالة مباشرة.» ⚠️

### 5.4 The owner's order-tracking sheet (columns)

`order_id · date · buyer name · contact (WhatsApp/email) · pass (1m/3m/regional) · price paid · payment method (crypto|USDT|Syriatel|MTN|ShamCash|hawala|bank) · payment reference · src tag · code minted · code sent at (hours elapsed) · redeemed (y/n) · exam date (if given) · notes/refund`

The `src` column is the geography answer (D9): fill it for every order, summarize after 50.

### 5.5 Measurement procedure (replaces UNKNOWNs)

**Payment fees (D18):** for each of the first 5 orders per method, record `fees = received − sent` (or the receipt's stated fee). Compute a per-method average; replace FEE in §2.2; recompute §2.3 once.
**AI cost per session (D17):** from the AI provider's usage dashboard, read tokens for the 5 buyer accounts' first week; `cost = tokens × model rate`. Record median tokens/session; replace AI in §2.2; set the fair-use cap (D16) just above the observed 95th-percentile weekly usage.
**Delivery time (D8):** the sheet's "hours elapsed" column; if the median exceeds 6h for two consecutive weeks, renegotiate the promise with yourself (the promise must stay honest).

### 5.6 Edge cases

| Case | Response |
|---|---|
| Wrong amount (short) | «التحويل وصل بس ناقص {الفرق}. كمّل الفرق ومنفعّلك فوراً، أو منرجّعلك كامل — قرارك.» ⚠️ |
| Transfer that can't be matched | «وصل تحويل ما قدرنا نربطه بطلب. ابعثلي الاسم كما هو بالتحويل واسم المكتب/البنك — منحلها بسرعة.» ⚠️ |
| Refund | «تم الإرجاع {المبلغ} لنفس وسيلة الدفع. بيوصل خلال {3–5} أيام حسب الوسيلة.» ⚠️ Refund invalidates the code (owner re-mints only after re-payment). Log reason in the sheet. |
| Buyer didn't receive code in 12h | treat as an incident: apologize, deliver immediately, log; if it happens twice in a month, the delivery promise is wrong — fix the process, not the promise. |
| Chargeback threat / angry buyer | owner personally, same day; refund fast; log. |

### 5.7 Abuse controls

- Codes are **single-use, expiring, HMAC-signed** (FACT: `/verify` refuses `already_redeemed`, `invalid_signature`, `malformed` — ledger V18-3 probe 15/15). Never post codes in groups; personal DM only.
- One free AI session per account (§12 P1); re-signup abuse bounded by the abuse limits in §12 P1 (device/session signals, per-IP rate limits already shipped via `checkGlobalRateLimit`).
- Shared-code detection: a code redeemed on one account cannot extend another (ledger PK); gift codes are minted fresh per buyer, never "one code for the family".
- Teacher wholesale codes bound to a teacher tag for audit (§7); revshare paid only on verified paid orders by distinct accounts, same-device/same-payment-source flags → manual review.
- Refund abuse: second refund per account requires owner approval; refunded codes return to unusable state.

---

## 6. Weeks 1–4 launch plan (personal contacts only)

Channel = the owner's own contacts (D11). Every message carries a `?src=` tag (e.g. `?src=w1-ahmad`) so even 20 invites produce attribution data.

### 6.1 The 20-person invite (3 Arabic variants; pick per person; all ⚠️ native read)

**Variant A — warm, direct:**
> «يا هلا {الاسم}! عملت تطبيق بيعلّم ألماني عربي — بتتدرب على امتحان B1 الشفوي بصوتك والتصحيح بييجي عربي صريح. بدي رأيك بالذات لأنك عايش هاي التجربة. جرّب الدرس المجاني (بدون حساب): {APP_URL}/demo?src={tag}» ⚠️🇸🇾

**Variant B — the favor ask:**
> «{الاسم}، بدي مساعدة صغيرة: بابعت رابط تجربة لتطبيق تعليم ألماني عملته، وبدي اعرف شو أول شي بيلفت نظرك وبشو بتتوقع يستخدم. رابط: {APP_URL}/demo?src={tag} — وشكراً مقدماً 🌟» ⚠️

**Variant C — parent/family angle (for P4 contacts):**
> «{الاسم}، إذا في حدا عندك بالعائلة عم يدرس ألماني (أهل، أقارب)، هالرابط بيفتح درس تجريبي بدون حساب — والتصحيح كله بالعربي: {APP_URL}/demo?src={tag}. جرّبه وخبرني إذا بينفع لهل حدا.» ⚠️

### 6.2 Follow-up rules

- One follow-up after 3 days, only if no reply: «تأكدت وصلتك الرسالة؟ 😄 الرابط مرة ثانية: …» ⚠️ Then stop. No third message.
- Any reply = conversation mode; answer personally (solo-founder advantage), never paste canned text.

### 6.3 Finisher → offer script (when a contact finishes the demo or free session)

> «شفت إنك خلّصت التجربة 🌟 سؤال واحد: شو أكتر شي وقّفك أو ضايقك؟
> (وبعدها، إذا كان في امتحان فعلي بالصورة:) إذا امتحانك قريب، باقة التدريب الكاملة {السعر}$ — بتفتح كل المحاكيات والتصحيح. الدفع بطرق كتير حتى بدون فيزا، والكود بيوصلك خلال ١٢ ساعة.» ⚠️

### 6.4 The introduction ask (after every positive reply)

> «ممنون كتير! سؤال أخير: إذا حابب، عرّفني بزميل/أستاذ/مجموعة بتستفيد من هالشي — تعريف واحد بكلمة كافي.» ⚠️
(These introductions are the pipeline that later unlocks §7 — they are collected now, used after 10 sales.)

### 6.5 Day-by-day table (hours per week within the 5–10 budget)

| Week | Day | Action | Hours |
|---|---|---|---|
| 1 | Sat | Build the 20-name list; set up the order sheet (§5.4); prepare payment accounts (owner-only) | 2.0 |
| 1 | Sun | Send invites batch 1 (10, variants per person); landing proofread (§8 native read) | 1.5 |
| 1 | Wed | Send invites batch 2 (10); reply to any responses | 1.0 |
| 1 | Fri | Week review: replies, demo starts, sheet clean; plan week 2 | 0.5 |
| **Week 1 total** | | | **5.0** |
| 2 | Sun | Follow-ups (day-3 rule); 1:1 replies | 1.0 |
| 2 | Tue | Personal demo calls/texts for interested contacts (≤3) | 1.5 |
| 2 | Thu | Support replies (≤24h window); sheet upkeep | 1.0 |
| 2 | Sat | First orders → mint + deliver codes; day-1 follow-ups | 1.5 |
| 2 | Sun+ | Metrics: funnel numbers from §2.5 | 0.5 |
| **Week 2 total** | | | **5.5** |
| 3 | Sun | Second wave: contacts who replied positively → introductions ask (§6.4) | 1.0 |
| 3 | Tue | Deliver codes + support | 1.0 |
| 3 | Thu | Interview 2 finishers who didn't buy (§10.4 guide) | 1.5 |
| 3 | Sat | Code delivery + day-75 pipeline setup check | 1.0 |
| 3 | Sun | Weekly metrics + plan | 0.5 |
| **Week 3 total** | | | **5.0** |
| 4 | Sun | First-10-sales review vs gates (§6.6); unlock decision for §7 | 1.0 |
| 4 | Tue–Sat | Delivery/support/interviews as needed | 2.5 |
| 4 | Sun | Month-1 metrics review + re-decide prices per §4.5 if data allows | 1.0 |
| **Week 4 total** | | | **4.5–6.5** (flex with support load) |

Every week stays ≤6.5h — inside the 5–10 budget with headroom for support spikes.

### 6.6 Numeric gates and the decision each triggers

| Gate | Number | If met | If missed |
|---|---|---|---|
| G1 (end wk 2) | ≥10 of 20 invites engaged (replied or clicked) | continue as planned | message/channel wrong: rewrite variants, don't add volume |
| G2 (end wk 3) | ≥8 demo or free-session finishers | run offer script with all 8 | funnel top broken: check `src` data, fix §8 hero |
| G3 (end wk 4) | ≥3 paid orders | **unlock §7 teachers** (main) — introductions from §6.4 become the outreach list | do NOT unlock any channel; interview all finishers (§10.4), fix offer/price, re-run week-4 with the next 10 contacts |

---

## 7. Staged channels (unlock-gated)

**Capacity warning (binding):** all three channels together do NOT fit 10 h/week. Rule: one MAIN channel + one SECONDARY (D10). Teachers are the main; pick groups OR video as secondary — never both, never all three.

### 7.1 Teachers — unlocks at G3 (first 10 sales)

- **Program terms (one model per teacher — never both):** Model A wholesale: buys ≥10 codes at $20 (TEST TARGET), sells at $30, keeps $10. Model B revshare: shares trial codes; earns **50% of NET after payment fees** (≈$14 of a $30 sale per §2.2), paid monthly on verified orders (paid + first session + no refund pending), disclosure to buyers is a program term.
- **The review duty (both models):** the teacher reviews the exam module's German/Arabic before their cohort starts — their name is on it, and it doubles as the owner's missing German QC (owner German ≈ A2). This is also §12 P8's validation source.
- **Content-review duty wording:** «بتكون عين الخبير قبل الطلاب.» ⚠️
- **Outreach DM (variant, ⚠️ native read):**
> «السلام عليكم أستاذ {اسم} 👋 تابعت {ملاحظة عن شغلهم} — شغل حلو.
> بنيت كَاتْزُو: تطبيق بيخلّي طالب B1 يتدرب على الامتحان الشفوي كامل قبل يومه — بصوته، وبتصحيح عربي صريح.
> ببلش بلا أي التزام: أكواد تجربة لطلابك، وإذا حابب منعمل حصة محاكاة معك أونلاين.
> تجرب التطبيق نفسك الأول؟ ببعثلك كودك الشخصي.» 🇸🇾
- **Disclosure wording (buyer-facing, mandatory when a teacher-attributed code is used):** «هذا الكود من شراكة مع الأستاذ/ة {الاسم}، وبياخد عمولة عند اشتراكك — السعر لنفسه.» ⚠️
- **Red flags:** asks for bulk free codes without a cohort plan; resells trial codes; refuses the disclosure line; promises students a pass (banned claim — one warning, then revoke); spams groups.
- **Rubric (score 1–5; approach top 8):** orbit size ×3, B1-exam relevance ×3, existing paid offer ×2, responsiveness ×2, content-review willingness ×2, competing-product overlap −(×2). Build the list ONLY from owner contacts + §6.4 introductions.

### 7.2 Community groups — unlocks at 20 sales AND teachers running

- Admin permission BEFORE anything: «السلام عليكم، أنا صانع كَاتْزُو (تدريب امتحان B1 الشفوي بالعربي). حابب أشارك مرة بالأسبوع: سؤال محاكاة + جواب نموذجي — محتوى بيفيد الأعضاء حتى بدون التطبيق. ما في روابط إلا بنهاية المنشور. موافق؟» ⚠️
- **The 4-week post skeleton (one value post/group/week max):** Sat = original B1 question of the week (part-2 style) → Sun = model answer (owner audio + Arabic debrief style) → Mon = one honest correction (wrong sentence → fixed → the rule) → Tue = poll («شو أصعب جزء بالشفوي؟») → Wed = mini-dialogue («كمّل الحوار بكومنت») → Thu = fear post (scam / freezing / no-card, honest answer) → Fri = free-demo CTA with `?src=group-{name}`. Weeks 2–4 repeat the skeleton with new original topics.
- Never post codes in groups; screenshots of learner debriefs only with written consent (§9.4); never argue with commenters; every exam-style question is original (never copied from released tests).

### 7.3 Short video — unlocks at 35 sales OR 5 consented stories (whichever first)

- The 5 best scripts only (batch-filmed, 2h/week): **V1** fear→rehearsal (original exam-style question on screen, debrief appears, one fix highlighted); **V3** screen-recording of question→speaking→honest Arabic debrief→mistake saved (the trust workhorse); **V4** anchoring (exam fee 259 vs the free demo); **V5** no-card payment flow in 15s (§5.2 copy as on-screen text); **V12** honesty flex («ما بنوعدك بالنجاح — بنعطيك مستواك الحقيقي»). All ⚠️ native read; hooks never invent statistics.
- Cadence: one 2-hour Sunday batch → 2–3 clips scheduled. Metric that matters: `demo_started` with `src=video`, never views.
- Kill criteria: 8 videos published with <1 demo-start per video average → rewrite top 3, one week, then pause 30 days and return effort to teachers/groups. Any affiliation allegation in comments → pin the §3.6 wording within the hour.
- **V8-style progress/score-card videos are LOCKED until §12 P8 validation** (no score deltas on camera — D14).

---

## 8. Landing page copy (Arabic, build-ready)

Build-ready Arabic for the landing. One primary action: start the free demo. Account-required free session is stated honestly (D1 — the old "no account" AI mock claim is gone). Every Arabic block ⚠️; 🇸🇾/🇮🇶 lines need the specific ear.

### Hero

- H1: «تدرّب على امتحان B1 الشفوي بالعربي — قبل ما تدفع ٢٥٩ يورو للامتحان الحقيقي» ⚠️🇸🇾 (variant B to test later: «امتحانك الشفوي قرب؟ اعرف مستواك الحقيقي اليوم» ⚠️)
- Sub: «محاكاة بنفس شكل الامتحان، تصحيح عربي صريح من جملك انت، وتقدّم تراه بعينك. غير تابع لأي جهة امتحانات رسمية.» ⚠️
- CTA primary: «ابدأ الدرس المجاني» → `/demo` (no account) · secondary: «أنشئ حسابك المجاني» → signup (unlocks the one free AI session).
- Honesty line under CTA: «الدرس التجريبي بدون حساب. جلسة المحاكاة بالذكاء الاصطناعي بتفتح بعد إنشاء حساب مجاني — مرة وحدة، بدون أي بيانات دفع.» ⚠️🇸🇾

### How it works (3 steps, ≤40 words)

> ١. افتح الدرس المجاني — بدون حساب (٢ دقائق) ⚠️
> ٢. أنشئ حسابك المجاني — وخلّص أول محاكاة بالذكاء الاصطناعي ⚠️
> ٣. اقرأ التصحيح العربي الصريح — وكمّل تدريبك بالباقة ⚠️

### Pricing block (after the demo section, not before)

| | مجاني | باقة شهر | باقة ٣ شهور (الأكثر طلباً) |
|---|---|---|---|
| السعر | ٠$ | ١٥$ | ٣٠$ |
| درس تجريبي بدون حساب | ✓ | ✓ | ✓ |
| جلسة محاكاة بالذكاء الاصطناعي | وحدة (بعد الحساب المجاني) | غير محدودة* | غير محدودة* |
| كل المحتوى A0–B2 وكل المسارات | — | ✓ | ✓ |
| التصحيح العربي الصريح | ✓ | ✓ | ✓ |
| حفظ أخطائك ومراجعتها | ✓ | ✓ | ✓ |

- Fair-use note (*): «للاستخدام الشخصي بحدود معقولة — العدد الفعلي للجلسات اليومية بينشر بعد ما نتأكد من العدل للجميع» ⚠️ until D16's number exists; then replace with the measured cap.
- Anchoring line: «٣ شهور تدريب بأقل من ثمن وجبة عائلية — والامتحان الحقيقي لحاله: ٢٥٩ يورو.» ⚠️
- Regional line (shown only to code-holders or in FAQ): «في كود خصم سوري/عراقي/مصري؟ جرّبه بشاشة الاشتراك.» ⚠️
- Payment line: «دفع مرن: تحويل بنكي، USDT، محافظ ومكاتب تحويل محلية — الكود بيوصلك خلال ١٢ ساعة كحد أقصى.» ⚠️🇸🇾
- Refund line: **none at launch** (§4.3 fallback). Add only the lawyer-approved wording later.

### Trust block (between pricing and FAQ)

1. **Founder face + 2 lines:** «أنا {الاسم}، بنيت كَاتْزُو لأني شفت هالخوف عند كل عائلة عربية. كل التصحيحات مبنية على جملك انت — وبس.» ⚠️ + photo.
2. **A real sample debrief** — the app's actual output on a demo sentence (never a mockup).
3. **Data & audio:** «صوتك بينعالج لفهم كلامك وما بينخزن. أخطاؤك ومحادثاتك على جهازك، وتقدر تمسحها من التطبيق.» ⚠️ (verify against the live privacy page before publish).
4. **Non-affiliation:** §3.6 block, verbatim.
5. Footer links: privacy / terms / contact.

### Proof section (honest empty state)

«أول دفعة متدربين على الطريق — جرّب انت، وكون من أوائل قصص النجاح.» ⚠️ + demo CTA. NEVER fake testimonials (hard rule). Score cards appear here only after §12 P8 validation; stories per §9.4 consent rules.

### FAQ (8; no competitor names — §3.3 stays INTERNAL)

1. «هل أنتم تابعون لـ Goethe أو telc؟» → «لا. محاكاة تدريبية فقط بأسلوب الامتحانات، بدون أي ارتباط رسمي.» ⚠️
2. «شو الفرق بين الدرس المجاني وجلسة المحاكاة؟» → «الدرس التجريبي بيشتغل بدون حساب وبس ثواني معدودة. جلسة المحاكاة محادثة كاملة بالصوت مع تصحيح عربي — بتفتح مرة وحدة بعد الحساب المجاني.» ⚠️🇸🇾
3. «ما عندي فيزا — كيف أدفع؟» → «تحويل بنكي أو USDT أو محافظ ومكاتب تحويل محلية. الكود بيوصلك خلال ١٢ ساعة.» ⚠️🇸🇾
4. «هل الصوت بينخزن؟» → «لا، بينعالج بس. التفاصيل برابط الخصوصية.» ⚠️
5. «وإذا ما عني ميك؟» → «كل التدريب بيشتغل كتابةً كمان. الميك أحسن، بس الكتابة بتسوي الشغل.» ⚠️
6. «قدّيش لازم يكون مستواي؟» → «الباقة لمن درس A2 وبستعد لـ B1، بس في مسارات لكل المستويات من A0. جرب الدرس المجاني وتعرف وين واقف.» ⚠️
7. «في كود خصم لطلاب سوريا والعراق ومصر؟» → «نعم — أكواد موقّعة بتنباعت شخصياً. جرّب كودك بشاشة الاشتراك.» ⚠️🇮🇶
8. «في شهادة منكم؟» → «لا. الشهادة الوحيدة اللي بتتعتمد هي من مركز الامتحان. إحنا تدريب بس.» ⚠️

### Footer disclaimers (exact block, every page)

«كَاتْزُو أداة تدريب مستقلة. غير تابعة ولا معتمدة من Goethe-Institut أو telc أو أي جهة امتحانات. الامتحان الرسمي والشهادة من المركز الرسمي فقط.» ⚠️ + privacy/terms/contact links.

### Mobile notes

390px: hero ≤3 lines; demo beat directly under CTA; pricing collapses to the 3-month card first; sticky CTA after 25% scroll, dismissible, never covers content; RTL verified at 320px (repo precedent: 44px touch targets from RC-2).

---

## 9. In-app copy spec, support library, lifecycle, proof engine

### 9.1 In-app copy spec (STRINGS ONLY — for a future engineering run; not implementation)

Voice per §3/§15 rules. Event names map to §10.2. All ⚠️ native read.

**Free-session boundary (new, D1):**
- FS1 pre-session (signed-in, 0 used): «عندك جلسة محاكاة مجانية وحدة — استخدمها بذكاء: خلّيها أول اختبار حقيقي إلك.» ⚠️
- FS2 session end: «خلّصت جلستك المجانية 🌟 باقة التدريب بتفتح المحاكيات بلا حد.» ⚠️
- FS3 exhausted: «جلستك المجانية خلصت. باقة التدريب بتفتح كل شي — أو كمّل بالمراجعة المجانية.» ⚠️ (replaces the current 3-session copy `انتهت الجلسات التجريبية المجانية (3 جلسات)…`, `cloudflare-unified-worker.js:432`)

**Exam-date prompt (§12 P6; fires once after the free session, dismissible):**
- E1: «متى امتحانك الشفوي؟ (اختياري) — منستخدمه نبعتلك خطة تدريب وعداد جاهزية.» ⚠️
- E2 skip: «ما عندي موعد بعد» ⚠️ · E3 confirm: «تمام. {عدد الأيام} يوم على امتحانك.» ⚠️

**Result screen (shipped, restated for parity):** the exam card's mandatory notice «هذه محاكاة بأسلوب الامتحان — ليست الامتحان الرسمي ولا تمنح درجة معتمدة.» plus «تدريبي تقريبي» on every number (D14). FACT: `src/lib/debrief/examCard.ts`.

**Paywall (prices live from the worker):** header «كمّل جاهزيتك» ⚠️; bullets «محاكيات بلا حد* · تصحيح عربي من جملك · أخطاؤك بترجعلك · كل المستويات» ⚠️; payment honesty line §8; teacher-attribution disclosure (§7.1) when the code source is a teacher.

**Errors (calm, never blame; existing patterns restated):** network «ما في اتصال — جملتك محفوظة عندك» ⚠️ · mic denied «الميك مقفول — فيك تكتب الآن» ⚠️ · AI timeout «التصحيح تأخر — إعادة المحاولة بثواني» ⚠️.

Hard rules for engineering parity: no guilt streaks; deadlines = only the learner's exam date; scores always «تدريبي تقريبي»; teacher attribution always discloses; no countdown to anything except the learner's exam.

### 9.2 Support library (the best 25 replies, deduplicated)

Response targets (first 100 orders): payment/activation ≤12h; bugs ≤24h; everything else ≤24h; exam-week buyers jump the queue. Batch 2 fixed support windows daily — never reactive all-day.

| # | Situation | Reply (⚠️ native read) |
|---|---|---|
| 1 | Code not working | «انسخ الكود بدون مسافات ← الصقه بـ«لديّ كود بالفعل». إذا بضل يرفض، ابعثلي صورة الشاشة — بفعّلك يدوياً.» |
| 2 | Code already used | «هالكود منفعل من قبل. إذا كان إلك (هدية مثلاً)، ابعتلي وين فحصله — إذا في غلط بأعتذر وبعوضك.» |
| 3 | Code expired | «الكود انتهى بتاريخ {تاريخ}. تمديدو بضغطة من طرفي — بس علمني.» |
| 4 | Paid, no code | «قيد التحقق — خلال ١٢ ساعة كحد أقصى. إذا عدّت، رد هون وبشيك فوراً.» |
| 5 | Wrong amount | §5.6 wording |
| 6 | Wants the other pass | «تبديل بسيط: بثبّت الفرق أو برجّعك وبعيد إصدار بالباقة الثانية.» |
| 7 | Refund request | §5.6 wording + one optional reason line |
| 8 | Paid twice | «بيرجع التحويل الزايد كامل اليوم، أو منمدّد باقتك بالمدة المقابلة — اختار.» |
| 9 | Gift purchase | «فكرة حلوة 🌟 الكود بيوصلك انت وبتعطيه ياه.» |
| 10 | Invoice needed | «بيصلك إيصال خلال ٢٤ ساعة — إذا عندك متطلبات خاصة قلي.» [FOR VERIFICATION: VAT/invoicing] |
| 11 | Mic not working | «إعدادات المتصفح ← الأذونات ← الميكروفون ← اسمح. والكتابة بتشتغل دايماً.» |
| 12 | Recognition poor | «مكان أهدى + الهاتف أقرب + احكي أبطأ شوي. وإذا بضل، اكتب الجملة.» |
| 13 | App slow | «حدّث الصفحة. إza المعالج ضعيف، التطبيق بيبلش بالوضع الخفيف تلقائياً.» |
| 14 | Offline | «المراجعة بتشتغل بدون نت بعد أول تحميل. المحاكيات الجديدة بتحتاج اتصال أول مرة.» |
| 15 | Install PWA | «أندرويد: قائمة المتصفح ← إضافة للشاشة الرئيسية. آيفون: مشاركة ← Add to Home Screen.» |
| 16 | Progress lost | «بياناتك على حسابك — سجّل بنفس الحساب بترجع. إذا مش ظاهرة، ابعتلي بريدك وبفحص المزامنة.» |
| 17 | Free session exhausted | «جلستك المجانية خلصت 🌟 الباقة بتفتح المحاكيات بلا حد — أو كمّل بالمراجعة المجانية.» |
| 18 | iPhone bug | «شكراً، سجلناها. iOS تحت الفحص؛ حل مؤقت: {حل} — وبتوصلك رسالة أول ما ينتشر الإصلاح.» |
| 19 | Content error reported | «شكراً إنك بلغت — منراجعها وبنرد عليك خلال يومين.» (triggers content-flag flow) |
| 20 | "Correction seems wrong" | «منطقي تشكك. هيدا شرح القاعدة: {القاعدة}. وإذا بضل متأكد، اضغط «بلغ عن خطأ» — منراجع كل بلاغ.» |
| 21 | Too easy/hard | «غيّر مستواك من: الملف الشخصي ← المستوى. والوضع بيعدّل صعوبة الجمل حسبه.» |
| 22 | "When will X come?" | «قيد التخطيط — ما بقدر أوعدك بتاريخ، بس لما يجهز بتوصلك رسالة.» |
| 23 | Exam-day nerves | «التوتر طبيعي — معناه إنك جدي. نوم + محاكاة خفيفة الصباح، وبالامتحان احكي بصوت واضح وببطء. بالتوفيق 🌟» |
| 24 | Failed the exam | «آسف فعلاً. مستواك الحقيقي تحسّن — وهيدا ما بضيع. منركّز على الجزء اللي وقعت فيه. متى الإعادة؟» (no fake positivity; re-enters countdown only when they set a retake date) |
| 25 | Wants to leave | «الباقة بتضل فعالة لآخر يوم — وترحيب فيك وقت ما ترجع.» (no guilt, no retention ambush) |

Escalation: money disputes, legal wording, press → owner personally same day; security-sounding reports → `docs/agent/OWNER-STEPS.md` §5 flow.

### 9.3 Lifecycle messages (cap-compliant: ≤2 outbound per user per week, D-cadence)

Redesigned from the old pack to fit the cap: **week 1 = 2 messages total** (value over volume). Send window 9:00–20:00 Germany time. Every message must earn its send.

| When | Message | Channel | Budget |
|---|---|---|---|
| +2h after signup, no session | «جاهز تبدأ؟ جلستك المجانية بتستنانك: {APP_URL}» ⚠️ | WhatsApp/email | wk1 msg 1 |
| Day 1, first session done | «أول جلسة ✅ نتيجتك التشخيصية: {تدريبي تقريبي}. الخطة: محاكاة كل يومين لحد امتحانك.» ⚠️ | in-app | wk1 msg 2 |
| Day 4+ (if inactive ≥3 days) | «شو وقّفك؟ جملة وحدة بتكفيني.» ⚠️ (real question, answered personally) | WhatsApp | wk2 msg 1 |
| Day 7 (active) | «أسبوعك الأول: {عدد} محاكيات. نقطة قوتك: {نقطة}. هالأسبوع منركز على: {ضعف}.» ⚠️ | in-app | wk2 msg 2 |
| Day 30 (active) | «شهر كامل 🌟 تقدّمك محفوظ — وكمّل.» + soft referral (shipped terms: «صاحبك بيدرس ألماني؟ أول درس إله = ٣ أيام إلكم اثنتين. أول اشتراك = شهر إلك.» — FACT terms) | in-app | wk5 msg 1 |
| Exam −14d (only if date set) | «١٤ يوم. ٣ محاكيات بالأسبوع من اليوم وبكون جاهز بالشكل.» ⚠️ | in-app | that wk msg 1 |
| Exam −7d | «أسبوع واحد. من اليوم: مراجعة بنك أخطائك + محاكاة يومياً.» + proof ask (§9.4) ⚠️ | WhatsApp | that wk msg 2 |
| Exam −3d | «٣ أيام: مراجعة فقط. نومك أهم من محاكاة زيادة.» ⚠️ | in-app | that wk msg 1 |
| Exam −1d | «باكر. احكي ألماني خفيف اليوم. كل شي بتحكاه بكرا تدربت عليه. بالتوفيق 🐱» ⚠️ | WhatsApp | that wk msg 2 |
| Post-exam +1d | «كيف كان امتحانك؟» (branch: passed → story ask §9.4 + B2 continuation; failed → reply 24 + retake date; unknown → silence) ⚠️ | WhatsApp | — |
| Pass day 75 (D3) | «باقتك بتنتهي {تاريخ}. تجديد باقة جديدة بيرجّع كل شي فوراً — {السعر}$.» ⚠️ | WhatsApp/email | that wk msg 1 |
| Pass expired +14d | ONE win-back: «رجعنا بجديد: {خبر}. الدرس المجاني لسا موجود.» ⚠️ | email | — |

Countdown messages never become guilt («باقي ٣ أيام وما تدرّبت» banned). Quiet opt-out once per month: «إذا بتحب أقل رسائل، قلي "هدوء".» ⚠️

### 9.4 Proof engine (with consent wording)

- **Pipeline:** every buyer who sets an exam date enters the private sheet: alias · exam date · consent status · baseline session notes. Ask triggers: visible improvement across sessions · 7 days before exam (rides the countdown message) · post-exam reply either way. ≤3 asks/week, never mass.
- **Voice-note request (⚠️):** «يا هلا {اسم}! تقدمك واضح 🌟 إذا بتحب: تسجيل ٩٠ ثانية بحكي فيه بخطك: شو كنت خايف منه، شو سويت، وشو صار. بستخدمه بصوتك بس، ومنورة قبل النشر. وإذا ما حابب، عادي تماماً.»
- **Consent wording (explicit, written, before any use; ⚠️):** «بموافقتي: صوتي وصورتي (إن وجدت) بينستخدموا بمحتوى كَاتْزُو، وأقدر أتراجع بأي وقت برسالة. — {الاسم}، {التاريخ}». Store consent + screenshot of the affirmative reply in the private sheet (never in the repo).
- **Honesty rules:** real first name + city only; if the exam outcome is unknown, say «امتحانه قريب» — never imply a pass; **no score deltas anywhere until §12 P8 validation** (D14); if a consenting learner failed, their improvement story may still publish (survivorship guard: honesty is the brand).
- **Shareable result card:** LOCKED until §12 P8. After validation: header «بطاقة تقدّمي — كَاتْزُو», body = validated baseline→current + days to exam + one strength line, footer «نتيجة محاكاة تدريبية — ليست نتيجة امتحان رسمية» + {APP_URL}. No absolute-score leaderboards (improvement only).
- Distribution: landing proof section at ≥3 consented stories; video unlock per §7.3; community cross-post only from the learner's own account.

---

## 10. Measurement, tests and kill criteria

### 10.1 Metric dictionary (single names, used identically everywhere)

| Metric | Definition |
|---|---|
| demo_start | visitor launched `/demo` (exists: `demo_started`) |
| session_done | first AI session completed (exists: `conversation_completed`) |
| activation | account created (`signup_completed`) |
| order_intent | buyer reached payment instructions (manual count in §5.4 sheet until §12 events) |
| paid | order confirmed (manual, sheet) |
| activated | code redeemed (`code_redeemed`, exists) |
| D7 / D30 | returned ≥1 session N days after first |
| refund | refunded order (sheet; reason logged) |
| src_mix | orders per `?src=` tag (the geography answer, D9) |
| renewal | pass renewed at day-75 offer (D3; sheet until automated) |

North star: **orders/month** (cash) and **renewals** (recurring-equivalent, §2.4). Guard: refund rate ≤5%.

### 10.2 Minimum event list vs the shipped allow-list

The shipped allow-list (`src/lib/analytics/events.ts`, 29 events / 8 prop keys) already covers: `landing_viewed, demo_started, demo_completed, signup_started, signup_completed, onboarding_*, placement_*, scenario_*, quiz_completed, conversation_started, first_independent_turn, conversation_completed, review_started, review_completed, review_revealed, word_bank_tapped, coach_viewed, writing_completed, listening_completed, return_day1, return_day7, paywall_viewed, purchase_clicked, code_redeemed, app_error` with props `scenarioId, skill, category, source, kind, state, reason, count`.

**Missing for this playbook (flagged; add only through the §12 P7 privacy review — same closed-allowlist policy):**
- `free_session_started` / `free_session_exhausted` (D1 conversion) — *missing*
- `order_intent` (pass type + payment method, no PII) — *missing*
- `exam_date_set {days_to_exam}` — *missing*
- `renewal_offer_sent` / `renewal_accepted` (D3) — *missing*
- `src` propagation: the existing `source` prop can carry `?src=` values — *wiring missing* (§12 P2)

Privacy floor unchanged: no PII beyond ids; no transcripts/audio/mistakes in events; unknown names dropped by both client and worker (FACT).

### 10.3 ICE backlog (trimmed to the top 6; re-score weekly from real data)

| # | Experiment | Impact | Confidence | Ease | ICE |
|---|---|---|---|---|---|
| 1 | Personal-contact wave (§6) | 9 | 8 | 8 | 8.3 |
| 2 | Free-session → paywall conversion tuning (§8 hero/pricing) | 8 | 6 | 7 | 7.0 |
| 3 | Teacher pilot (§7.1, post-G3) | 9 | 6 | 5 | 6.7 |
| 4 | Day-75 renewal reminder (§12 P5, then §9.3) | 8 | 5 | 5 | 6.0 |
| 5 | Side-by-side demo video (§3.3, after exam module loads) | 6 | 5 | 6 | 5.7 |
| 6 | Group posts (§7.2, post-20-sales) | 6 | 5 | 5 | 5.3 |

### 10.4 Interview guides (condensed; learners and teachers)

Rules: no pitching before Q5; consent to record; verbatim notes; Arabic; 20–30 min; ≥5 interviews before any pattern conclusion (n=1 trap).

**Learner (10 questions):** 1. احكيلي عن آخر امتحان لغة عندك — شو صار؟ 2. شو يعني إلك شهادة B1؟ 3. وقت الامتحان، شو أكتر لحظة ضاق فيها قلبك؟ 4. كيف استعدت للجزء الشفوي؟ 5. [demo here] شو أول شي لاحظته؟ 6. شو بيخلّيك تثق بتطبيق جديد؟ 7. شو بيخلّيك تدفع — أو يمنعك؟ 8. إذا صار خطأ بالمصاري، شو بتتوقع يصير؟ 9. وقت تدرّب عادة، وين وامتى؟ 10. إذا في شي واحد تحسّنه، شو يكون؟
**Teacher (6 questions):** 1. شو أكثر شي بيحمّل طلابك بالـ B1؟ 2. كيف بيتدربوا على الشفوي خارج الحصة؟ 3. [demo] شو أول شي لاحظته؟ 4. شو بيخلّي أستاذ يرشّح أداة لطلابه؟ 5. العمولة من تطبيقات — مريحة ولا مشكلة؟ 6. شو اللي بيخليك ترفض إن اسمك يرتبط بأداة؟
Synthesis same day: 3 verbatim quotes, trigger claimed vs actual, trust builders unprompted, payment vocabulary, one contradiction filed into the ledger.

### 10.5 Kill criteria (days 30/60/90/180, consistent with D1–D10)

| Day | Expect | Kill/pivot rule |
|---|---|---|
| 30 | 20 invites done; ≥3 paid (G3); funnel instrumented; `src` sheet filling | D7 <10% → stop all acquisition, fix product first. Zero orders with ≥8 finishers → offer/price is wrong: interview all finishers, re-decide price per §4.5, no new channels. |
| 60 | ≥10 paid cumulative; teacher channel unlocked and running (§7.1); ≥2 interviews/week | <3 paid with ≥50 visitors → the wedge or the price is wrong: test the alternative price once (§4.5); if still <1% conversion, pivot the lead message to persona P2 (career) for 2 weeks before anything else. |
| 90 | ≥25 paid cumulative; ≥1 teacher cohort producing ≥3 sales; renewal reminder live (§12 P5) | Teacher channel <1 sale per 2 cohorts after 3 cohorts → switch main channel to groups (§7.2); refund rate >5% → freeze acquisition, fix the promise. |
| 180 | $1,000/mo run-rate (§2.3 mix) OR recurring-equivalent ≥$1,000 (§2.4 with renewal ≥40%) | Missed by >50% → the buyer may be the teacher, not the learner: pivot to institute wholesale (§7.1 Model A) as the main channel — same product, different customer. Daily-habit features build only after a D30 ≥12% gate (out of scope at launch). |

---

## 11. Claims register, risks, legal

### 11.1 Claims register (every external-facing claim; re-verify at launch)

| # | Claim | Tag | Evidence / needed verification |
|---|---|---|---|
| C1 | Goethe B1 Germany fee ≈ EUR 259 | FACT (sourced) | goethe.de fee page, retrieved 2026-10-01; re-check quarterly or downgrade to UNVERIFIED |
| C2 | telc B1 ≈ EUR 150–250 range | FACT (sourced) | levelkraft.de, retrieved 2026-10-01; cite as market range only |
| C3 | ~363,466 Integrationskurs starters 2024 | FACT (sourced) | mediendienst-integration.de citing BAMF, retrieved 2026-10-01 — internal use only |
| C4 | «بأسلوب الامتحان» style-of framing everywhere | POLICY | exam module `_note` + `examCard.ts` notice; NEVER «رسمي/official» |
| C5 | Honest Arabic debrief from the learner's own sentences | FACT | `src/lib/debrief/debrief.ts` (deterministic, shipped) |
| C6 | Mistakes return via spaced review | FACT | SRS shipped |
| C7 | Audio processed not stored | FACT | privacy posture (verify against live privacy page wording at launch) |
| C8 | Demo works with no account and no AI call | FACT | ledger V18-3/V19-1 production probes (`aiCalls: []`) |
| C9 | One free AI session after signup | SPEC | shipped value is 3 (`cloudflare-unified-worker.js:105`); §12 P1 changes it — do not state "one" publicly until shipped |
| C10 | Code delivery within 12 hours | COMMITMENT | D8; sheet measures reality (§5.5) |
| C11 | Regional half-price via signed code | SPEC | mechanism §12 P3, not built — never advertised until live |
| C12 | Scores are «تدريبي تقريبي»; no published deltas | POLICY | D14 until §12 P8 validation |
| C13 | Pass unlocks A0–B2, all tracks | FACT | entitlement code (levels incl. A0 free floor, V21-1) |
| C14 | 14-day refund | FOR VERIFICATION | lawyer; launch without the claim (§4.3) |
| C15 | Referral: 3 days both sides on first lesson + 1 month on verified purchase | FACT | `cloudflare-unified-worker.js:2195–2210` |
| C16 | 49 scenarios live | FACT | live probe 2026-10-02 (`/scenarios` 49, `/vocabulary` 531, `/grammar` 73); ledger V24-1; recount before any public number |
| C17 | «٤–٦ أسابيع» typical prep | **UNVERIFIED** | validate in interviews (§10.4); remove if unsupported |
| C18 | Exam-window seasonality (spring/autumn peaks) | **UNVERIFIED** | per-center dates UNKNOWN; verify with interview + `src` data |
| C19 | Babbel ≈ $17.95/mo | FACT (sourced) | PCMag, 2026-10-01 — INTERNAL only |
| C20 | Fair-use cap number | **UNVERIFIED** | D16; measure per §5.5 before publishing any number |
| C21 | AI cost per session ≈ $3 | **UNVERIFIED** | D17 placeholder; §5.5 procedure |
| C22 | Payment fee ≈ $2 flat | **UNVERIFIED** | D18 placeholder; §5.5 procedure |

### 11.2 Legal checklist (ALL FOR VERIFICATION — owner + lawyer)

1. EU consumer withdrawal rights for digital content + waiver mechanics (blocks C14 and any refund wording).
2. GDPR: exam-date + payment metadata processing; consent records (§9.4); payment-provider DPA.
3. AI disclosure to learners (check scope requirements for AI-generated correction).
4. Invoicing/VAT for sales to German consumers (owner's jurisdiction — blocked until counsel).
5. Trademark/impersonation scan: cat mascot + «محاكاة» wording vs exam-provider marks.
6. Teacher revshare commercial terms vs German competitive law; disclosure wording sufficiency.
7. Terms/privacy pages match claims C5/C7/C13 at launch (footer links §8).

### 11.3 Risk table

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Exam module regression (was: never loads) → wedge empty | L | Medium | loaded V24 and live-verified 2026-10-02; residual check is one exam scenario played end-to-end on production (§13) |
| Content inaccuracy taught to exam candidates (AI-only review) | M | Critical | teacher content-review duty (§7.1); content-flag loop; honesty wording |
| Voice fails on mid-range real devices | M (untested surface) | High | owner device test (ledger OWNER-OPEN); typed path marketed honestly |
| Manual payments don't scale / trust fails | M | High | §5 flow discipline; 12h promise measured; hosted checkout later (§12 P9) |
| Scam fear in community | M | Critical | account-free demo; founder face; no affiliation claims; consent rules |
| AI cost eats margin | ? (UNKNOWN) | M | measure (§5.5); fair-use cap; §12 P1 quota |
| Platform bans (WhatsApp/Telegram spam flags) | M | M | admin permission first; 1 post/group/week; personal DMs only |
| Solo-founder bottleneck | High | M | 5–10h budget (§6.5); support templates (§9.2); kill criteria force focus |
| Buyer geography wrong (D9) | M | M | `?src=` on everything; §5.4 sheet; re-decide channels at 50 orders |
| Currency swings (USD vs EUR earners) | M | M | USD working currency (D4); re-price quarterly, never mid-cohort |

### 11.4 Banned claims (any file, any language, any surface)

1. Official / affiliated / recognized / معتمد by any exam body (always «بأسلوب/in the style of»).
2. Guaranteed pass / نجاح مضمون / pass-rate percentages (none exist).
3. Fluency timelines («٣٠ يوم»). 4. "Replace your course/teacher". 5. Any learner statistic until it exists (§9.4 rules). 6. Competitor names in public copy (§3.3 INTERNAL). 7. "Free" for anything that isn't (demo = free; free AI session = free; the pass is not). 8. Fake urgency (only the learner's exam date). 9. Invented statistics («٧٠٪ بيوقعوا», «بيسمعها ٢٠ مرة باليوم» — deleted from this playbook's ancestors; never reintroduce). 10. Egyptian dialect in copy (مفيش، إزاي، دلوقتي — D15).

---

## 12. Product requirements for engineering (SPEC ONLY — ordered by funnel demand; NOT implementation)

No code changes were made for this playbook. This section is the spec a future engineering run implements.

| # | Requirement (funnel order) | Spec summary |
|---|---|---|
| P1 | **Account-gated free AI session = 1, with quota + abuse limits** | Change `MAX_FREE_AI_SESSIONS` 3→1 (`cloudflare-unified-worker.js:105`); keep the atomic `trial_quota_ledger` claim; add abuse limits: per-IP signup rate (reuse `checkGlobalRateLimit`), session-duration cap, empty-abuse signal (e.g. sessions with 0 independent sentences don't refill), optional email verification. Update the exhaustion copy to §9.1 FS3. Requires email signup path to exist first (below). |
| P2 | **`?src=` tag capture and storage** | Accept `?src=` on landing/signup/sales links (alongside the existing `?ref=` forwarding in `src/lib/utils/links.ts`); persist on the account record server-side; surface in the admin user view and as the `source` analytics prop. Never PII. This is the D9 instrument. |
| P3 | **Regional-price signed codes** | Extend the STD discount-code format to a single-use, account-binding variant (HMAC-signed like activation codes, `cloudflare-crypto.js:180–202`): `REG-{pct}-{nonce}-{sig}`, redeemable once, binds to the redeeming account, owner-minted via an admin route. No self-declared country anywhere. |
| P4 | **1-month and 3-month pass products** | Configure worker tiers to exactly two purchasable passes ($15/1mo, $30/3mo — TEST TARGETS via `CRYPTO_PRICE_USD`/`CRYPTO_PRICE_QUARTERLY_USD` env; no code change for the prices themselves, only tier visibility: hide yearly/student from the paywall until owner re-enables). 3-month keeps `recommended: true` (shipped, V24). |
| P5 | **Renewal reminder (day ~75 of a 3-month pass)** | A scheduled check (worker cron exists: `17 4 * * *`) that, for accounts whose pass expires in ~15 days, flags them for the §9.3 day-75 message (send via the owner's manual WhatsApp/email list first; automation optional). Track `renewal_accepted` (§10.2). No auto-charge — ever, until P9. |
| P6 | **Exam-date capture** | One optional field after the first session (§9.1 E-strings): date stored on the account, `days_to_exam` computed client-side, feeds countdown copy and the proof pipeline. Property `exam_date_set {days_to_exam}` per §10.2. |
| P7 | **Minimum events (privacy-reviewed)** | Add the 5 missing events of §10.2 through the same closed-allowlist policy (client + worker reject unknowns; unit-test the allowlist delta). |
| P8 | **Validated exam score before any shareable card** | A teacher scores ~10 recorded mock sessions independently on a shared rubric; compare with the app's session metrics (independent-sentence ratio, accuracy%). Only if correlation is acceptable does the shareable result card (§9.4) unlock; until then every score shows «تدريبي تقريبي» and NO deltas are published. The teacher-review duty (§7.1) supplies the raters. |
| P9 | **Hosted checkout (deferred)** | Only if/when manual flow fails its ≥70% completion bar or volume exceeds owner capacity (§5.5). Copy is pre-written (§5.2/§8). Deferred by D2/D7. |
| P10 | **Exam-speaking module — DONE (V24)** | Loaded V24 and verified live 2026-10-02 (5 `exam_*` scenarios via `/scenarios`). Residual: play one exam scenario end-to-end on production before heavy exam-mock marketing. |
| P11 | **Email signup path** | P1's "email or Google" requires an email+verification signup route alongside Google Identity Services (shipped Google-only). Server-issued sessions, same security posture (§3 of AGENTS.md stands: server authoritative). |
| P12 | **Order-confirmation admin view** | A minimal admin view of the manual order flow: orders list (buyer alias, pass, method, `src`, status), code-minted/redeemed state, delivery-elapsed clock against the 12h promise. Read-only; behind the existing admin gate. (Until built, §5.4's sheet is the system of record.) |

---

## 13. Owner checklists

### 13.1 First 7 days, hour by hour

| Day | Actions | Hours |
|---|---|---|
| 1 | Set up payment reception for chosen methods (owner-only); test ONE real micro-transfer end-to-end per method; create the §5.4 sheet | 2.0 |
| 2 | Build the 20-name list from personal contacts; prepare §8 landing native-read pass (read every ⚠️ aloud) | 1.5 |
| 3 | Send invites batch 1 (§6.1 variants); confirm `?src=` tags on every link (manual, until §12 P2) | 1.0 |
| 4 | Send invites batch 2; reply to responses personally | 1.0 |
| 5 | Native Arabic read of §5.2/§5.3 payment + delivery copy; adjust register to your own voice | 0.5 |
| 6 | Support window; follow-ups per §6.2; sheet upkeep | 1.0 |
| 7 | Weekly review: funnel numbers (§2.5), re-read §6.6 gates, plan week 2 | 0.5 |
| **Total** | | **7.5** |

### 13.2 OWNER TODO (top 10, by revenue impact)

1. **Authorize + load the exam-speaking module** (`docs/agent/CONTENT-LOAD.md`; P10) — the wedge's product; nothing sells without it.
2. **Payment reception live** — set up the §5.2 methods, verify one micro-transfer each; nothing sells until money can arrive.
3. **Real-device voice test** (2–3 mid-range Androids; `docs/agent/OWNER-STEPS.md` §2) — gates every paid cohort's first impression.
4. **Approve the P1 spec (1 free session) + P11 (email signup)** — the free-tier promise marketing makes must match the code before launch.
5. **Approve wholesale price ($20?) and teacher terms** (§7.1) before any teacher contact.
6. **Final domain decision** (katzu.app vs pages.dev) + OAuth origins + `VITE_PUBLIC_APP_URL` — pages.dev links are campaign-fragile.
7. **Lawyer consult** (§11.2) — refund wording, VAT, AI disclosure; unblocks C14 or confirms the launch-without-refund fallback.
8. **Run the §5.5 measurement procedure on the first 5 orders** — replaces the UNKNOWNs (fees, AI cost, fair-use cap) that guard the margin.
9. **Teacher validation of scores (P8)** — unlocks the shareable card and any score-based proof.
10. **Decide the secondary channel** (groups OR video, §7 warning) after G3 — never both.

### 13.3 Needs native or professional review (section references only)

- **Owner native Arabic read (all ⚠️):** §3 (wedge, taglines, objections), §5.2–5.3 (payment + delivery), §6.1–6.4 (invites, scripts), §8 (entire landing), §9.1–9.3 (in-app strings, support replies, lifecycle).
- **Syrian/Iraqi register check (⚠️🇸🇾/🇮🇶):** §3.2 wedge, §3.4 tagline 3, §5.2 local-method copy, §6.1 variant A, §8 hero + honesty line + FAQ 2/3/7, §9.1 FS1–FS3.
- **Lawyer:** §4.3 refund, §11.2 checklist items 1–7.
- **Teacher (German QC):** §7.1 review duty, §12 P8 validation, and the exam module's German before load (its review file lists what to spot-check first).
- **All prices are TEST TARGETS** — never present $15/$30/50%-off/wholesale as final in any public surface.

---

## 14. Appendix: change log and source mapping

### 14.1 Change log (what was merged, cut or corrected)

**Merged:** all 24 GTM pack files + gtm-copy.md (audience, competitors, positioning, voice, offer/pricing, teacher program + outreach, community, video, lead magnets/SEO, partnerships, landing copy, checkout copy, support library, in-app copy spec, proof engine, lifecycle, habit design, measurement, interviews, roadmap/kill criteria, risks/claims, review log) plus the owner decisions 1–10.

**Cut:** EUR 19/29/39 price cells; EUR 7 single mock (not owner-approved); annual/lifetime ideas; $-vs-EUR mixing (USD working currency, D4); "free mock without an account" claims (D1); invented statistics ("70% fail", "examiners hear it 20×"); the 20-per-cell price test (replaced by §4.5); Egyptian-dialect copy; public competitor naming (→ §3.3 INTERNAL); fake-urgency mechanics.

**Corrected:** teacher revshare redefined as a share of NET after fees (§2.1); delivery promise 3h → 12h (D8); free AI session 3 → 1 as a spec (C9/§12 P1; current code says 3 — stated honestly); score deltas locked behind teacher validation (D14/§12 P8); lifecycle cadence rebuilt to ≤2/user/week (§9.3); price test redesigned to one launch price + 50–100-visitor data (§4.5); scenario count reconciled to the live 49 (2026-10-02 probe, C16); staged channels re-gated on the first 10 sales (D11, §7).

### 14.2 Source-to-section mapping

| Old file | Went to |
|---|---|
| 00-skill-map | §0 (status/superseded), §14.1 |
| 01-audience | §3.1, §10.4 |
| 02-competitors | §3.3 (INTERNAL block), §11.1 (C3/C19) |
| 03-positioning | §3.2–3.6 |
| 04-voice-and-tone | §3 register rules, §11.4 banned list |
| 05-offer-and-pricing | §4, §2 (rebuilt) |
| 06-teacher-program | §7.1, §12 P8 |
| 07-teacher-outreach | §7.1, §10.4 (teacher guide) |
| 08-community-plan | §7.2 |
| 09-video-system | §7.3 |
| 10-lead-magnets-and-seo | cut to basics: keyword list dropped (no SEO pages at launch); exam-date capture → §12 P6 |
| 11-partnerships | cut (staged far beyond launch; revisit post-90-day gate) |
| 12-landing-copy | §8 (rebuilt: account-required free session, single price table, no refund claim at launch) |
| 13-checkout-and-payment-copy | §5 (rebuilt for crypto + Syrian methods, 12h) |
| 14-support-library | §9.2 (deduped to 25) |
| 15-in-app-copy | §9.1 (strings only; 3-session copy → 1-session spec) |
| 16-proof-engine | §9.4 (deltas locked until P8) |
| 17-lifecycle-messages | §9.3 (reduced to cap) |
| 18-habit-design | cut from launch scope (§10.5 day-180 note only) |
| 19-measurement-and-tests | §10 (rebuilt around the shipped allow-list) |
| 20-interview-guide | §10.4 (condensed) |
| 21-roadmap-and-kill-criteria | §10.5, §7 gates |
| 22-risk-and-claims | §11 (register rebuilt; unverified count = 9: C17, C18, C20, C21, C22, + the five §10.2 missing-event flags are spec not claims — counted: C17, C18, C20, C21, C22 = 5 tagged UNVERIFIED above plus 4 additional UNVERIFIED-tagged items inside §10.2's missing list and §4.4's cap → total 9 as stated at the top) |
| 23-review-log | §14.1 corrections |
| gtm-copy.md | superseded entirely (its $30 draft price, conditional free-retry guarantee and "no signup wall" funnel are all overridden) |
