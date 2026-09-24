# Katzu — Product Gaps (Phase 0)
Verified against source. Ordered by impact on the "Arabic-first German readiness system" positioning.

## G1. No value-before-signup (highest-leverage activation gap)
Every app surface sits behind sign-in (`App.tsx` auth gate). WelcomeScreen's only paths lead to `/signin`. A learner cannot try a single lesson without creating a Google-linked account. No anonymous preview, no guest lesson, no sample conversation.

## G2. No checkout — monetization is activation codes only
`SubscriptionRedemptionScreen.tsx` accepts an HMAC code. No price display, no plans, no receipt, no restore, no cancellation, no payment provider integration anywhere. The $5/mo Pro goal is unreachable through the app itself. Codes remain valuable for B2B/gifts but cannot be the consumer flow.

## G3. Curriculum too small for a paid product
5 scenarios live in D1 (embassy_appointment, cafe_order, job_interview, doctor_visit, apartment_viewing). No track/module structure, no draft→reviewed→approved content states, no listening-specific task type, no written-message/email practice type. Local fallback fixtures cover roughly six scenarios.

## G4. No placement or onboarding personalization
No placement test exists (no adaptive assessment anywhere in src/). Onboarding = Google sign-in only. No goal selection (daily life / work / university), no arrival status, no weekly schedule, no Arabic-style preference. Level defaults to A1 with no assessment.

## G5. No learning intelligence
- No spaced repetition: no review scheduling tables or logic (verified: no `nextReview`/interval code exists).
- No competency model: progress = XP, streaks, sessions, mission check-ins. No "can do" statements, no NOT_STARTED→RETAINED progression.
- No mistake taxonomy: mistakes store the raw evaluation fields only.
- Session report leads with scores/XP; independent vs hint-assisted split exists (good) but no "what can I now do" outcome view.

## G6. Legal & trust pages are self-declared drafts
`TrustInfoScreen.tsx` states the privacy page is "توضيحية أولية" and terms are "مسودة تشغيلية" requiring legal review before public payment. No refund policy, no subscription conditions, no business identity, no support email. Data-safety claims in-app ("يمكنك طلب تصدير بياناتك أو حذف حسابك من الإعدادات") are **not yet true in the UI** — deletion is not exposed and export does not exist. Implementation and copy currently disagree.

## G7. Voice & conversation honesty partially delivered
STT/TTS pipeline works (Chrome/Android verified historically; Edge has known Web Speech issues with de-DE). UI does not distinguish transcription success/failure from grammar feedback in all paths. No explicit conversation state machine (idle/loading/recording/transcribing/evaluating/replying/retryable_error/offline/quota states are handled ad hoc). Retry preserves the learner's message and does not double-consume quota (verified: quota consumption is per-session-id, idempotent).

## G8. Retention & growth not started
Referral mechanism exists server-side (REF codes, verified-paid payout). No weekly goals, reminders, milestones view, review-due notifications, or re-engagement surface. Streak/mission systems exist and are the only retention layer.

## G9. No product analytics
No funnel instrumentation (landing → goal → diagnostic → first lesson → first conversation → account → paid). Only a client diagnostics log exists. AI cost signals (fallback usage) are visible in /health but not tied to learners.

## G10. Screens exist but lack personalization surfaces
Trail/Study/Quiz/Live/Report/Practice/Progress/Settings are all built and match designs. None consume goals, placement results, or review-due data because those entities don't exist yet.
