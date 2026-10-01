# 05 — Offer architecture & pricing (cells are TEST TARGETs; nothing is final)

## Architecture (staged)
| Stage | Item | Price | Status |
|---|---|---|---|
| 0 | Free first mock | EUR 0 | TEST TARGET (doc 19-c). Zero-price effect; no payment data needed; the anchor for everything else. |
| 1 | Single mock + full debrief | EUR 7 | TEST TARGET. For "exam in 10 days" urgency buyers and gift-givers. |
| 1 | 3-month B1 pass | EUR 19 / 29 / 39 cells | TEST TARGET (doc 19-b). Working default: EUR 29. |
| 2 | Monthly plan | ~EUR 9.99 | LATER — only after daily-use features exist (doc 18); otherwise it cannibalizes the pass. |
| — | Annual / lifetime | none | Deliberately absent (brief). |
| Partner | Teacher wholesale | EUR 15–18 per code | TEST TARGET (doc 06); sells at the public cell price; margin = their cut. |

## Anchoring & mental-accounting copy (all ⚠️ native read)
- Above the price: «الامتحان الحقيقي: ٢٥٩ يورو... ولو وقعت، تنتظر وتدفع من جديد. التجربة: أقل من ١٠٪ من قيمة محاولة واحدة.» (Gloss: "The real exam: EUR 259... fail and you wait and pay again. The rehearsal: under 10% of one attempt.") [FACT fee / ASSUMPTION framing]
- Pass framing: «ثلاثة شهور تدريب بثمن وجبة عائلية.» (Gloss: "Three months of practice for the price of a family meal.") — test against the exam-fee frame; keep whichever survives the native read + interviews.
- Never: fake original price struck through, "worth EUR X" inflation (offers-skill banned list).

## Guarantee & refund wording — FLAGGED FOR VERIFICATION (lawyer)
- Draft: «ضمان واضح: خلال ١٤ يوم من الشراء، إذا جربت ولم يناسبك التدريب، نعيد المبلغ كاملاً — بدون أسئلة محرجة.» (Gloss: 14-day full refund, no embarrassing questions.)
- EU distance-selling withdrawal rights for digital content have specific conditions (waiver on immediate access, etc.) — **FOR VERIFICATION**, never publish until a lawyer confirms the exact wording and the waiver flow.
- The conditional "fail → next pass free" idea from gtm-copy.md is ON HOLD: it requires exam-result proof handling (GDPR-sensitive) — lawyer flag.

## Fair-use cap wording (protects AI cost without dark patterns) ⚠️
«الباقة تشمل حتى ٣ محاكيات كاملة في اليوم — أكثر من كفاية للتدريب اليومي.» (Gloss: up to 3 full mocks/day.) — number is ASSUMPTION pending AI-cost measurement (owner TODO #4).

## Unit economics model (monthly) — placeholders marked
| Line | Direct sale @29 | Teacher-sourced @29 |
|---|---|---|
| Gross | 29.00 | 29.00 |
| Teacher revshare | 0 | ~9.00 (≈50% of net — doc 06) |
| Payment (manual transfer/Wise ~EUR 1–3; hosted checkout later ~3%+fixed — ASSUMPTION) | ~2.00 | ~2.00 |
| AI cost per active pass-month (UNKNOWN — placeholder until owner measures) | ~3.00 ⚠️PLACEHOLDER | ~3.00 |
| **Net** | **~24.00** | **~15.00** |
Sales needed for EUR 1,000 net: **~42 direct** or **~67 teacher-sourced**; realistic mix (40% teacher) ≈ **~50** → matches the 40–55 goal only if price cell ≥29 holds. At EUR 19: ~60–65 direct needed (goal at risk). At EUR 39: ~32 direct (volume risk). → Why doc 19-b tests 19/29/39.

## Exam-window calendar logic (research)
Goethe/telc B1 exams run year-round with frequent monthly dates; registration typically closes 1–3 weeks before (examples retrieved 2026-10-01: telc Bad Homburg shows November 2026 dates with open spots, https://www.telc.net/en/language-examinations/telc-pruefungen/; Goethe centers list per-location dates, https://www.goethe.de/ins/de/en/prf.html). **Exact Germany-wide windows: UNKNOWN (per-center).** Marketing use: never claim dates; instead in-app ask «متى امتحانك؟» at signup and drive countdown prompts from the learner's own date (also the commitment lever). Promo calendar: intensity follows the natural exam waves (post-Integrationskurs completions — typically spring/autumn peaks) — ASSUMPTION to validate with interview data.

## Abuse prevention
1. **Code leakage:** codes single-use + expiry (FACT: shipped); never post codes in groups — personal DM only (BETA-KIT rule reused); wholesale codes bound to a teacher id for audit.
2. **Self-referral/collusion:** revshare paid only on verified paid orders by distinct accounts with a completed first session; same-device or same-payment-source flags = manual review before payout.
3. **Teacher over-promotion (cobra effect):** spam in groups → one warning, then code revocation; disclosure requirement (buyers see the teacher earns revshare) is a term of the program, not a courtesy.
4. **Refund abuse:** refund returns the code to unusable state; second refund per account requires owner approval.
5. **Fair-use evasion:** multiple accounts from one household is fine (paying each time); quota evasion via re-signup is blocked by phone/email uniqueness at signup — VERIFY current signup flow with engineering before promising anything.
