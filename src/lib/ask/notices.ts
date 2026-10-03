/**
 * Ask Katzu notices (V28 Stage 2A).
 *
 * The legal notice deliberately reuses the exact wording of the official-category
 * disclaimer in `src/lib/utils/scenarioVocab.ts` (`safetyDisclaimerFor`), so the
 * app says the same thing about legal German everywhere — a scenario screen and
 * the ask screen can never disagree about whether advice is being given.
 */
export const ASK_LEGAL_NOTICE_AR =
  'هذا شرح للغة الألمانية فقط، وليس استشارة قانونية أو هجرة. تحقق دائماً من المعلومات الرسمية لدى الجهات المختصة.';

/** What the practice section promises — never mastery from one answer. */
export const ASK_PRACTICE_NOTE_AR =
  'أجب لتتأكد أنك فهمت — الإجابة الخطأ تعود إليك في مراجعتك المجدولة بدل أن تُنسى.';

/** The prompt suggestions, keyed by the intent the learner is most likely to want. */
/**
 * V32: the example the input's placeholder used to show. Placeholders cannot be
 * tapped and disappear the moment you type, so it was the one piece of guidance
 * a first-timer could not act on. It is now a real, fillable suggestion.
 */
export const ASK_EXAMPLE_AR = 'ما الفرق بين «seit» و«vor»؟';

export const ASK_SUGGESTIONS: Array<{ labelAr: string; promptAr: string }> = [
  { labelAr: 'ترجمة', promptAr: 'ترجم هذه الجملة إلى الألمانية: أحتاج موعداً مع الطبيب.' },
  { labelAr: 'قاعدة', promptAr: 'اشرح لي الفرق بين Akkusativ و Dativ ببساطة.' },
  { labelAr: 'كلمة', promptAr: 'ما معنى كلمة «Termin» وكيف أستخدمها؟' },
  { labelAr: 'صحّح جملتي', promptAr: 'صحّح جملتي: «Ich habe gegangen zum Arzt gestern.»' },
  {
    labelAr: 'ألمانية رسمية',
    promptAr: 'اشرح لي معنى هذا النص الرسمي بالألمانية: «Sehr geehrte Damen und Herren, hiermit widerspreche ich dem Bescheid vom 12.03.»',
  },
];
