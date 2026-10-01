# 23 — Review log (Phase 8: red team, consistency, polish)

## Persona pass — findings → fix
1. **Skeptical learner (scam-fearful):** flagged that doc 12's trust block promises a sample debrief "not a mockup" — but the exam module isn't loaded, so a B1 demo isn't real yet. FIX: doc 12 demo beat now points at the CURRENT demo flow (shipped `/demo`) until the exam module loads; exam-demo assets wait for the load. Also: V12 script already self-deprecates promises — kept.
2. **Arabic-speaking teacher (name on the line):** worried the "Lead Partner = المدرّب المعتمد" title implies exam authority. FIX: doc 06 tier renamed to «شريك تدريب معتمد من كَاتْزُو» with an explicit non-exam parenthetical; legal flag kept in 22.
3. **Native Arabic copy editor:** flagged «تصحيح صربي» typo risk chain in 08 W1-Fri (introduced by fast drafting) — fixed to «تصحيح عربي صريح» in the file; flagged «بيّ الميك» dialect vs MSA norm in 14 #11 → replaced with «الميكروفون» in the canonical string, dialect allowed only in voice video captions; flagged that 17 day-3 message «شو وقّفك؟» could read as pressure → softened to include «إذا ما بدك تحكي، عادي — بس بدي أتأكد إنه كل شي شغال عندك».
4. **B1 examiner-type reader:** doc 08 W1-Sun model answer uses Perfekt+weil — realistic, fine; but the poll «أصعب جزء» names exam parts in a way that could imply insider format knowledge — verified the module's published shape is public knowledge (exam formats are public); kept. Also confirmed no file claims scoring parity with real exams; doc 15 F1 qualifier is mandatory and referenced in 16's score card.
5. **Competitor marketer:** noted our files name V-IZ/Lisan/ChatGPT — these are INTERNAL docs only; doc 04 bans public naming; added explicit «internal-only» markers on 02 and 03 (do-not-publish banner at top).
6. **Consumer-protection reviewer:** refund claim appeared in 12 pricing table and 13 — both now carry the 【FOR VERIFICATION】 block and a launch-without-refund-claim fallback (12); the "fail→next pass free" idea stays on hold (05); disclosure wording (06) made a program term not a courtesy.

## Consistency pass
- Prices: single-mock EUR 7 and pass cells EUR 19/29/39 now identical in 05/12/13; gtm-copy.md marked superseded (00) — its $30 default must not be quoted.
- Terms: fair-use «٣ محاكيات كاملة باليوم» identical in 05/12; code expiry + single-use identical in 05/13/14; referral rewards match shipped behavior (MARKETING-KIT §7) in 17 only.
- Names: «كَاتْزُو» spelled with fatha everywhere in Arabic copy; "B1 Rehearsal" not used publicly (internal only).
- Claims: C-register (22) now the single source; C11 recomputation rule added.
- Dates: exam-window language downgraded to UNKNOWN + per-center citation (05).

## Duplication cut
- Hero variants live ONLY in 12 (gtm-copy.md referenced, not repeated); objection table ONLY in 03 (12 FAQ links to it); psychology lever definitions ONLY in product-marketing.md (files use lever names).

## Second variants for the top 3 assets (test order recommendation)
1. **Landing hero** — Variant B («اعرف مستواك الحقيقي اليوم — مجاناً») vs A (fee-anchored). Test first: it's the whole funnel's front door and cheap to A/B (doc 19-b infrastructure). Recommendation: run A vs B for 2 weeks before anything else; C held in reserve.
2. **Teacher pitch** — Variant A (peer/warm) vs B (money-explicit). Test first among teachers because the two models attract different teacher psychologies (institutes vs creators); decision changes doc 06 emphasis. 
3. **Video V1 vs V12** — fear-hook vs honesty-flex. V12 is the trust anchor but riskier as a cold opener; test V1 first for reach, V12 as the pinned profile video.
