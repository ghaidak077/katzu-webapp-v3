# BETA-KIT — closed-beta operations kit

> Marketing content (pricing, funnel, launch) lives in [`docs/marketing/KATZU-LAUNCH-PLAYBOOK.md`](../marketing/KATZU-LAUNCH-PLAYBOOK.md); this file governs the closed beta only.

**This is a closed-beta go-live, not a public launch.** The beta is **free and code-only**:
30–50 invited Arabic-speaking learners, no payments (the provider keys are absent on purpose,
and the app contains no checkout UI), no store listing, no marketing. What you need to run it is
one message, one sheet, one daily check, and the willingness to fix what the first week finds.

Everything a *public, paid* launch would additionally need is listed as OWNER-ONLY in
`docs/agent/LAUNCH-STATUS.md` §7. Nothing in this kit depends on those items.

**What the learner gets today:** 15 scenarios / 221 vocabulary words / 111 phrases / 22 grammar
rules, a free unauthenticated demo, a placement test, daily missions, a live conversation with
Arabic corrections, an offline-capable PWA, and honest progress reporting.

---

## 1. The handout (copy and send)

Send this to one learner at a time. The code is personal; never post it in a group.

> **مرحباً — تجربة كَاتْزُو (نسخة مغلقة)**
>
> كَاتْزُو تطبيق لتعلّم الألمانية بالعربية، ويبدأ من مواقف حقيقية (المطار، الشقة، البنك، العمل).
>
> **الرابط:** https://katzu-webapp-v3.pages.dev
> **كود التفعيل الخاص بك (لمرة واحدة):** `<CODE>` — استخدمه من: تسجيل الدخول ← شاشة الاشتراك ← «لدي كود بالفعل».
>
> قبل أن تبدأ: جرّب الدرس التجريبي على `/demo` بدون حساب (٤ خطوات، دقيقتان) لتتعوّد على الشكل.
>
> **ما أطلبه منك بعد ٧ أيام (٤ أسئلة):**
> 1. بكلماتك: ما الذي ساعدك كَاتْزُو على فعله هذا الأسبوع؟
> 2. أين تعطّلت أو تركت التطبيق؟ (اسم الشاشة أو اللحظة)
> 3. هل شككت يوماً أنه يعمل فعلاً؟ (نعم/لا + ماذا حدث)
> 4. هل ستستمر الأسبوع القادم؟ (نعم / لا / فقط إذا…)
>
> وإن حدث خطأ ظاهر، أرسل صورة الشاشة + نوع الجهاز. لا ترسل أي كلمة مرور أو رمز دخول.
>
> ملاحظتان مفيدتان: التطبيق يمكن إضافته إلى الشاشة الرئيسية (ويعمل بدون إنترنت للتكرار)،
> والميكروفون يُطلب مرة واحدة — إن رفضته، الكتابة تعمل دائماً.

**English notes for you (not for the learner):** the app is Arabic-first RTL; the German input
is LTR inside it. Ask them to keep the app open for a minute after first load so the service
worker installs — the offline mode is what makes daily practice possible.

## 2. Cohort sheet (keep it filled in)

One row per learner. This is the only record of who has what code — the app's ledger knows the
code was redeemed, not who it belongs to.

| Learner ref | Contact (WhatsApp/Telegram) | Code handed | Date | Device (iOS/Android/desktop) | Redeemed? | First session | Day-7 reply | Issue opened |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| b01 | | | | | ☐ | | | |
| b02 | | | | | ☐ | | | |
| … | | | | | ☐ | | | |

Full codes belong in your private sheet, not in this repository. Record only the code's
`DE-<n>M-<nonce>` prefix here if you want a cross-reference.

## 3. Cadence (what to do, when)

| When | What | Where |
| --- | --- | --- |
| Day 0 | Hand out one code per learner (§1). Ask them to complete the demo *and* one real episode before they close the app | WhatsApp/Telegram |
| Day 1 | Look at the first-session numbers: did each learner get past onboarding and finish one episode? Anyone who did not gets one message ("where did you stop?") | admin dashboard → users / activity |
| Days 2–6 | Run the **5-minute health check** (`docs/agent/OWNER-STEPS.md` §4). Fix what it finds the same day | terminal |
| Day 3 | Compare the sheet against `redeemed_codes_ledger`: anyone who has not redeemed their code has never signed in — that is a message, not a bug | D1 query in §3 of OWNER-STEPS |
| Day 7 | Send the four questions (§4). Always ask question 2 — the stuck moment is the only actionable one | DM |
| Day 10 | Two real phones: run the **voice checklist** (`docs/agent/OWNER-STEPS.md` §2). This is the largest untested surface in the product | two devices |
| Day 14 | Decide: keep the cohort, fix first, or pause (§7). Log the decision in `docs/AGENT-STATE.md` | ledger |

## 4. Feedback template (the canonical copy)

> **Katzu — first-week feedback**
>
> 1. In your own words, what did Katzu help you do this week? *(one or two sentences)*
> 2. Where did you get stuck or give up? *(name the screen or the moment)*
> 3. Did you ever wonder whether it was working? *(yes/no + what happened)*
> 4. Would you still be using it next week? *(yes / no / only if…)*
>
> Optional: the device and browser you used; a screenshot of anything that looked broken.

**How to run it:** send it on **day 7**, not day 1 — the first session is not a habit. Ask for
the stuck moment *always*. Log every finding in `docs/AGENT-STATE.md` rather than leaving it in
an inbox: an unlogged cohort finding cannot be fixed by a later session.

## 5. Telemetry to read beside the feedback

Where the feedback and the telemetry disagree, trust the telemetry.

| Question | Read it here |
| --- | --- |
| Did the first session actually complete? | admin dashboard → users / activity; `activity_log` session-completed events |
| Are people coming back? | second-session rate per learner (same view); the streak table |
| Is anything crashing? | `error_reports` grouped by `error_type` (client crashes are `client_*`, 5xx are `server_error`) |
| Is the AI pool healthy? | `/health` `ready`; the admin health view's per-key day-quota ledger. A looping account shows up as 429s, not spend |
| Did every code get used? | `redeemed_codes_ledger` (who redeemed is the account id; who *should* have is the sheet) |
| Did content change under the learner's feet? | `node scripts/check-content-drift.mjs` → exit 0 |
| Is the free quota turning people away? | the paywall-triggered events (`paywall_*`) in the analytics allow-list, plus feedback question 4 |

**Privacy floor for the beta:** analytics is an allow-list on both sides (24 event names, no PII
and no free text), no transcript or audio is stored, and the learner's typed sentences stay on
their device except for the turn being graded. Do not ask learners for screenshots of the
admin dashboard, and never ask for a token or a secret.

## 6. What "good" looks like (and when to pause)

| Signal | Healthy | Investigate | Stop and fix |
| --- | --- | --- | --- |
| `/health` `ready` | true every day | false for part of a day | false for a full day |
| `server_error` rows | 0 | 1–2 with a clear cause | any cluster, or one on a core path |
| Client crashes per learner per week | 0 | 1 | > 1, or a crash that blocks the first episode |
| Learners who finish one episode on day 1 | > 80 % | 50–80 % | < 50 % (the onboarding is the problem, not the learners) |
| Day-7 return | > 40 % | 20–40 % | < 20 % with the same complaint repeated |
| Paywall complaints | none in a free beta | one learner | a second learner (means the free allowance is too tight for the beta) |

If you stop the cohort: set `MAINTENANCE_MODE = "on"`, redeploy the worker (the one-step
emergency stop in `OWNER-STEPS.md` §5), tell the cohort in one message, and fix in the tree
before reopening. Do not leave a half-paused product in front of learners.

## 7. Pointers

- **Operational runbook:** `docs/agent/OWNER-STEPS.md` — Access on `/admin/*`, the voice
  checklist, activation codes, the daily health check, and the "what to do if X breaks" table.
- **What is verified and what is not:** `docs/agent/LAUNCH-STATUS.md` (READY / OWNER-ONLY /
  BLOCKED with evidence, and the ranked gaps).
- **Content work:** `docs/agent/CONTENT-LOAD.md` for loads, `docs/agent/CONTENT-GATE.md` for the
  review rules, `scripts/check-content-drift.mjs` for "does production still match the drafts".
- **Deploy:** `docs/agent/DEPLOY.md`; the app and sales site build from a push to `main`, the
  worker deploys with `npm run deploy:worker`.
