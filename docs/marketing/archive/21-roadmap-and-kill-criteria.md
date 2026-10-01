# 21 — Roadmap & kill criteria (launch GTM only; product roadmap lives in the repo's own docs)

Baseline: beta not started, payments test-mode (FACT). The GTM clock starts after the beta's week-2 voice-check gate (BETA-KIT cadence). All targets are TEST TARGETs — the point of each gate is a decision, not a celebration.

## Targets & gates
| Day | Targets | Decision gate (kill/pivot criteria) |
|---|---|---|
| 30 | Beta cohort 30–50 active (BETA-KIT); voice OK on 3 real devices (owner TODO #2); payment path live (manual at minimum); 8 teachers pitched, 2 trial cohorts running; landing live at final domain; doc 19 events instrumented | D7 <10% → STOP all acquisition, fix product first (retention before growth). No teacher share by day 30 → offer rewrite (doc 06), not more DMs. Voice broken on mid-range Androids → typed-first positioning pivot; kill voice-first marketing claims. |
| 60 | 600+ signups cumulative; 2 teacher pilots complete; ≥10 paid; price cell decided (doc 19-b); ≥3 consented stories (doc 16); free-mock funnel ≥40% completion | <3 paid with ≥300 activations → offer/value gap: interview 10 finishers who didn't pay (doc 20), test EUR 19 + single-mock path harder; if still <1% pay → the wedge may be wrong — pivot candidates: career-scenarios wedge (P2 persona) or the €7 single-mock-only model. |
| 90 | 1,500+ signups; ≥40 paid cumulative; ≥1 teacher at repeatable ≥5 paid/month; 5 stories; side-by-side vs ChatGPT done (doc 02) | Teacher channel <1 paid per 3 cohorts → shift mix to community+video; paid conversion <1.5% of actives → pricing re-test or packaging change (single-mock front). |
| 180 | 40–55 paid/month run-rate (~EUR 1,000 net); ≥10 stories; 3 recurring teacher partners; D30 ≥12%; continuation offer live (doc 17) | Missed by >50% → the buyer is the teacher, not the learner: pivot to B2B-first (institutes buy cohort codes wholesale, doc 06 Model A) — same product, different customer. Daily-use features (doc 18) build only if D30 gate passed. |

## Weekly operating rhythm (solo founder, ~15–20h/week on GTM; protect build time)
| Block | When | Hours |
|---|---|---|
| Sunday batch: video filming + metrics review + weekly question prep (docs 08/09) | Sun 2h | 2 |
| Support windows (doc 14) | daily 3×20min | 3.5 |
| Teacher outreach + calls (doc 07) | Tue/Thu | 3 |
| Community: post replies, polls, DMs (doc 08) | daily 20min | 2.5 |
| Code delivery + payments check (doc 13) | daily 15min | 2 |
| Interviews (doc 20) | 2/week | 2 |
| Proof engine sweep (doc 16) | Sun | 0.5 |
| Metrics & experiments review (doc 19) | Fri 1h | 1 |
Non-negotiable: Sunday batch happens even in a bad week — the channel dies of silence, not of imperfection.

## Engineering needs, ordered by funnel demand (build ONLY when the metric demands; GTM never waits on engineering for docs/teacher/community work)
1. Event instrumentation (doc 19 SPEC) — needed at day-30 gate; nothing above is measurable without it.
2. Exam-date capture + countdown (doc 15 E-strings) — the commitment lever + north star numerator.
3. Content-flag flow polish (doc 15 C-strings) — trust loop; cheap.
4. Shareable score card (doc 16 spec) — unlocks video V8 + landing proof.
5. Hosted checkout — only if test (d) fails manual's 80% bar.
6. Teacher dashboard-lite — only after ≥3 active partners ask for numbers they can't get from the owner's weekly report.
7. Habit layer (doc 18) — only after the D30 gate at day 180.
