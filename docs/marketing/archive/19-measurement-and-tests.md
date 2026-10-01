# 19 — Measurement & tests

## Metric dictionary (single names; used identically in every file)
| Metric | Definition |
|---|---|
| qualified_mock_start | visitor launched the free mock AND spoke/typed ≥1 sentence |
| mock_completion | mock finished through the debrief screen |
| activation | account created (signup or code redemption) |
| paid | order confirmed (manual transfer verified OR hosted checkout success) |
| D1/D7/D30 | returned to ≥1 session N days after first session |
| refund | refunded order (reason logged) |
| revshare_owed | verified paid conversions × teacher rate, unpaid |
| exam_date_set | learner entered an exam date (commitment lever) |
| mocks_before_exam | mocks completed in the 90 days before the exam date (north star numerator) |
| score_delta | latest mock score − baseline mock score (north star co-metric) |
North star: mocks_before_exam + score_delta. Guard metric: refund rate ≤5% of paid.

## Funnel event SPEC (names + properties only — future engineering run)
- mock_started {source: landing|community|teacher|video, variant}
- mock_completed {score, duration_s, mode: voice|typed}
- signup_completed {method: google|email}
- exam_date_set {days_to_exam}
- paywall_viewed {source: free_mock_end|trial_end|pricing_page, price_cell}
- order_intent {package: single|pass3m, price_eur, teacher_tag}
- paid_confirmed {same + payment: manual|hosted}
- code_delivered {hours_to_deliver}
- activation_redeemed {days_since_paid}
- session_completed {scenario_id, level, mode}
- review_completed {cards, accuracy}
- referral_sent {ref_code}
- nps_answer {score_gap_text}
- content_flagged {scenario_id, field}
Privacy floor: no PII in event properties beyond ids; the allow-list policy (BETA-KIT §5) extends with these names only after engineering review.

## The five 14-day tests (start AFTER the beta's week-2 voice-check gate)
**(a) Teachers.** Hypothesis: teachers activate their cohorts. Setup: 5 teachers (doc 06 rubric) with tracked codes. Pass: ≥2 share codes within 7 days AND cohort produces ≥10 mock starts AND ≥2 purchases. If fail → rewrite the offer (doc 06 Model A/B mix) before blaming teachers; if a teacher shares but zero activations → product first-mile problem, fix doc 15 onboarding.
**(b) Price cells.** EUR 19/29/39, ~20 qualified users per cell, randomized by landing variant or cohort. Pass: ≥5% pay at 29 AND 29's paid-conversion rate ≥70% of 19's. Decide: if 39 ≈ 29 in conversion → adopt 39 (revenue/quality of buyer); if 29 fails vs 19 → adopt 19 + cut teacher wholesale to 15 (05 table recompute).
**(c) Free mock.** Pass: ≥40% of starters finish AND ≥5% of finishers pay within 7 days. Fail-completion → the mock is too long/hard (doc 15 F1–F4 rework). Fail-payment → offer/value gap, not traffic.
**(d) Manual vs hosted checkout.** Pass: ≥80% of intended buyers complete within 24h. Manual under 80% → host checkout becomes the top engineering priority; hosted can't beat manual by this measure without a provider — Lemon Squeezy country limits (FACT from brief) constrain choice; Paddle/Mollis to evaluate [ASSUMPTION].
**(e) Interviews.** 15 learners (doc 20): validate personas/trigger moments (doc 01). Pass: trigger moments converge on exam-date for ≥8/15; else re-center copy (doc 01 kill criterion).

## ICE backlog (initial scores; re-score weekly from real data)
| Experiment | Impact | Confidence | Ease | ICE |
|---|---|---|---|---|
| Teacher cohort pilot (a) | 9 | 6 | 6 | 9.0 (avg) |
| Free mock CTA in groups (c) | 7 | 6 | 8 | 7.0 |
| Price cells on landing (b) | 8 | 5 | 6 | 6.3 |
| Weekly challenge in 3 groups | 6 | 5 | 6 | 5.7 |
| Hosted checkout (d) | 7 | 4 | 3 | 4.7 |
| Side-by-side vs ChatGPT video | 6 | 5 | 5 | 5.3 |
| YouTube B1 explainer series | 5 | 4 | 5 | 4.7 |
| Arab-world pricing tier | 6 | 3 | 2 | 3.7 (later) |
