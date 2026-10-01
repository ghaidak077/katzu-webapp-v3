# 15 — In-app copy SPEC (strings only; NOT implementation — future engineering run reads this)

Voice: doc 04. Existing app copy is the baseline (MARKETING-KIT §1–§3); new strings extend it. All ⚠️ native read. Event names in {} map to doc 19 SPEC.

## Onboarding (post-signup, first session)
- O1 welcome: «أهلاً {اسم}! أول هدف: محاكاة تشخيصية — ١٠ دقائق بتعرفك مستواك الحقيقي.» {onboarding_start}
- O2 level confirm: «درست ألمانية قبل؟ شو أقرب مستوى ليك؟» (A0–B2 pills; placement exists)
- O3 permission ask (mic, before first live scene, never cold): «حتى نسمعك، منحتاج إذن الميك. تقدر تكتب أيضاً — بس الصوت أقرب لامتحانك.»
- O4 first-win toast: «أول جملة بألماني منك اليوم 🐱» {first_sentence}

## Exam-date prompt (the commitment lever — fires after the free mock, once, dismissible)
- E1: «متى موعد امتحانك الشفوي؟ (اختياري) — بنستخدمه لنرسل لك خطة تدريب وعداد جاهزية.» {exam_date_set}
- E2 skip: «ما عندي موعد بعد» — honest label, no dark-pattern nudge.
- E3 confirm: «تمام. {عدد الأيام} يوم على امتحانك — منهم بنسوي خطتك.»

## Free-mock end screen
- F1 score reveal (honest, non-brutal): «نتيجتك بالمحاكاة: {score}/١٠٠. مقياس تدريبي تقريبي — مش نتيجة امتحان حقيقية.» {mock_completed}
- F2 strengths: «بتتقن: {top 2 skills}»
- F3 the gap (loss aversion, stated kindly): «الفرق بينك وبين الجاهزية: {gap}. وخبر حلو: هيدا بالضبط اللي التدريب بسّييصلحه.» → «شو بتلاقي داخل الباقة»
- F4 CTA: «كمّل تدريبك — باقة ٣ شهور ({price} €)» / secondary: «محاكاة وحدة بس (٧ €)»
- F5 no-pressure exit: «بس مش هلق» — always present; end screen never traps.

## Paywall (post trial, pre-purchase — matches doc 12 pricing table)
- P1 header: «كمّل جاهزيتك»
- P2 bullet proofs (short): «محاكيات غير محدودة* · تصحيح عربي من جملك · أخطاؤك بترجعلك لحتى تظبط · عدّاد جاهزية لحد يوم امتحانك»
- P3 payment honesty: «تحويل بنكي/Wise — بدون فيزا» + refund line IF lawyer-approved (12).
- P4 teacher-attributed disclosure (doc 06 wording) when code source = teacher {teacher_disclosed}

## Empty states (existing pattern: explain cause + next action — firstRun spec precedent)
- Empty mistake bank: «لسه ما سجّلنا غلطات — كل جملة نطقتها صح. أول محاكاة بتبلش البنك.»
- Empty review queue: «ما في بطاقات مستحقة هلق — ارجع بعد {التاريخ}. أو خذ محاكاة جديدة.»
- No exam date set: «حدد تاريخ امتحانك (اختياري) — العداد والخطة بيشتغلوا بعده.»

## Errors (calm; never blame)
- Network: «ما في اتصال. جملتك محفوظة عندك — جرّب تاني لما يرجع النت.»
- AI timeout: «التصحيح تأخر أكتر من اللازم. جملتك ما ضاعت — إعادة المحاولة بثواني.»
- Mic denied mid-scene: «الميك مقفول. فيك تكتب الآن، أو اسمح بالميك من إعدادات المتصفح.»

## PWA install prompt (post-free-mock value moment)
- I1: «ثبّت كَاتْزُو على شاشتك الرئيسية — بيشتغل بدون نت للتكرار.» [ثبّت] [ليس الآن]
- I2 after install: «تم ✅ من هنا وبعدين: أيقونة القط.»

## Content-flag confirmation (trust loop, doc 03 objection 5)
- C1 after tapping «بلغ عن خطأ»: «وصل البلاغ. رقم الإحالة {id}. بنراجعه يدوياً وبنعلمك إذا تغيّر شي.» {content_flagged}
- C2 on resolution: «تصحيحك اتنشر: {الجملة} تم تعديلها. شكراً — أنت بتسوي التطبيق أدق.»

## Hard rules for engineering parity
No guilt streaks copy (never «خسرت سلسلتك!»); deadlines shown = only the learner's exam date; scores always carry the «تدريبي تقريبي» qualifier; any teacher attribution shows disclosure (P4). Before ship: native read + legal check on O1–C2.
