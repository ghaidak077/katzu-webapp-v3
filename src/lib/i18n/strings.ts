/**
 * The UI dictionary: every string the app says to the learner, in the three
 * languages it ships in.
 *
 * Why keys and not "translate the Arabic literal": a key names the *meaning*
 * (`language.uiTitle`), so a screen never depends on the exact wording of
 * another language, and a copy change in Arabic does not silently orphan the
 * English. `UiStringKey` is derived from the Arabic table, and the other two are
 * typed `Record<UiStringKey, string>` — so a missing English or Indonesian line
 * is a TypeScript error, not an Arabic sentence appearing in an English screen.
 * `tests/languages.test.ts` holds the same rule at runtime, for the case where
 * someone edits the table through a cast.
 *
 * Arabic stays the reference: it is the product's first language, not a
 * translation. English and Indonesian are written as native copy, not as
 * literal renderings of the Arabic.
 *
 * Scope: this table grows screen by screen (see
 * `docs/plans/010-multilanguage-master-plan.md`, Phase 1b). A key exists here
 * only once its screen actually reads it; the plan's coverage script is what
 * measures the remaining surface, so nothing claims full coverage early.
 */

import type { UiLanguage } from './languages';

const AR = {
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',

  'nav.trail': 'الرحلة',
  'nav.practice': 'التدريب',
  'nav.progress': 'التقدم',
  'nav.profile': 'الملف',
  'nav.lockedHint': '{label} — مقفل حتى أول محادثة',
  'shell.checkingAccount': 'جاري التحقق من الحساب...',

  'onboarding.back': 'رجوع',
  'onboarding.progress': 'تقدم الأسئلة',
  'onboarding.editBadge': 'تعديل التفضيلات',
  'onboarding.firstRunNote': 'سؤال واحد فقط — ثم أفتح لك أول موقف.',
  'onboarding.goal.title': 'ما هدفك من الألمانية؟',
  'onboarding.goal.body':
    'سؤال واحد فقط. به أرتّب الوحدات التي أضعها أمامك — لا أريد أن أُضيع وقتك في شيء لن تحتاجه.',
  'onboarding.goal.question': 'لماذا تتعلّم الألمانية؟',
  'onboarding.goal.hint': 'هذا يغيّر ترتيب المواقف التي أضعها أمامك أولاً.',
  'onboarding.goal.skip': 'تخطَّ الآن وابدأ',
  'onboarding.arrival.title': 'وأين أنت الآن من ألمانيا؟',
  'onboarding.arrival.body':
    'من يستعد للسفر يحتاج الأوراق أولاً، ومن وصل يحتاج السكن والطبيب. هذا يحدد ما أقدّمه لك اليوم.',
  'onboarding.previous.title': 'هل جرّبت الألمانية قبل اليوم؟',
  'onboarding.previous.body':
    'لا لجعل الأمور أسهل أو أصعب — فقط لأعرف من أين أبدأ معك. لن أفترض أنك تعرف شيئاً لم تخبرني به.',
  'onboarding.time.title': 'وكم دقيقة تستطيع أن تعطيني يومياً؟',
  'onboarding.time.body':
    'العادة أهم من المدة. اختر ما تستطيع الالتزام به فعلاً — سأبني مهمة اليوم على هذا الرقم، ويمكنك تغييره لاحقاً.',
  'onboarding.time.unit': 'دقائق',
  'onboarding.skipAll': 'تخطَّ الأسئلة وابدأ الآن',
  'onboarding.target.title': 'هل هناك تاريخ تنتظره؟ (اختياري)',
  'onboarding.target.body':
    'امتحان أو مقابلة أو سفر — إن أخبرتني بالتاريخ سأذكّرك بما يتبقى منه داخل التطبيق فقط. لن أرسل لك إشعارات، ولن أضغط عليك.',
  'onboarding.target.dateLabel': 'التاريخ',
  'onboarding.target.continueHint': 'سؤال أخير: هل أقيس مستواك الآن؟',
  'onboarding.target.save': 'حفظ التفضيلات',
  'onboarding.target.saving': 'جارٍ الحفظ…',
  'onboarding.continue': 'تابع',
  'onboarding.target.none': 'لا يوجد تاريخ محدد',
  'onboarding.placement.minutes': 'دقيقتان تقريباً',
  'onboarding.placement.title': 'هل أقيس مستواك الآن؟',
  'onboarding.placement.body':
    'الاختبار القصير يحدد نقطة البداية الصحيحة (من A0 إلى B2) حتى لا أعلّمك ما تعرفه ولا أتجاوز ما لا تعرفه. يمكنك تخطّيه — وسأترك مستواك «غير مقيس» بصراحة، ولن أدّعي أنك أتقنت شيئاً لم أقسْه.',
  'onboarding.placement.skip': 'لا الآن — ابدأ من A1 وسجّل مستواي كغير مقيس',
  'onboarding.placement.startDirect': 'ابدأ من A1 مباشرة — سنبدأ بأول مشهد اليوم',
  'onboarding.placement.privacy':
    'لا أطلب أي بيانات شخصية إضافية، ولا أفعّل إشعارات تلقائياً، ولا أطلب دفعاً. الهدف أن تبدأ أول درس لك بأسرع وقت.',
  'onboarding.placement.take': 'ابدأ القياس',
  'onboarding.placement.takeHint': 'يمكنك الخروج منه في أي وقت — تقدّمك محفوظ.',
  'onboarding.placement.takeLater': 'أمّا القياس فمتاح في أي وقت — ابدأه الآن',
  'onboarding.backLink': 'رجوع للسؤال السابق',

  'onboarding.goal.family.label': 'لمّ الشمل',
  'onboarding.goal.family.hint': 'الأوراق، السكن، الطبيب، حياة العائلة',
  'onboarding.goal.work.label': 'العمل',
  'onboarding.goal.work.hint': 'المقابلة، الزملاء، Ausbildung، المكتب',
  'onboarding.goal.study.label': 'الدراسة',
  'onboarding.goal.study.hint': 'الجامعة، التسجيل، المحاضرات، الامتحان',
  'onboarding.goal.travel.label': 'السفر',
  'onboarding.goal.travel.hint': 'المطار، القطار، الحجز، التنقّل',
  'onboarding.goal.general.label': 'عام',
  'onboarding.goal.general.hint': 'أبدأ من الأساسيات وأبني يوماً بيوم',
  'onboarding.goal.daily_life.label': 'الحياة اليومية في ألمانيا',
  'onboarding.goal.daily_life.hint': 'السكن، الطبيب، التسوق، المواصلات',
  'onboarding.goal.university.label': 'الجامعة',
  'onboarding.goal.university.hint': 'التسجيل، المحاضرات، التواصل مع الإدارة',
  'onboarding.goal.exam.label': 'التحضير للامتحان',
  'onboarding.goal.exam.hint': 'تدريب محادثة B1 بأسلوب الامتحان — وليس الصيغة الرسمية',

  'onboarding.arrival.preparing': 'ما زلت أستعد للسفر',
  'onboarding.arrival.recently_arrived': 'وصلت حديثاً',
  'onboarding.arrival.living_in_germany': 'أعيش في ألمانيا بالفعل',

  'onboarding.previous.first_time.label': 'لم أجرّب الألمانية قبل',
  'onboarding.previous.first_time.hint': 'نبدأ من الصفر — وهذا أفضل مكان للبداية',
  'onboarding.previous.some_basics.label': 'تعلّمت قليلاً في المدرسة أو تطبيق',
  'onboarding.previous.some_basics.hint': 'تعرف كلمات وجُملاً — سنقيس أين وصلت بالضبط',
  'onboarding.previous.can_hold.label': 'أستطيع إدارة محادثة بسيطة',
  'onboarding.previous.can_hold.hint': 'مستواك أعلى من البداية — القياس يوفّر عليك وقتاً كبيراً',

  'onboarding.targetDate.move': 'تاريخ السفر',
  'onboarding.targetDate.exam': 'تاريخ الامتحان',
  'onboarding.targetDate.job': 'موعد العمل أو المقابلة',

  'onboarding.recommend.start':
    'يمكنك أن تبدأ الآن مباشرة — سنختار معاً من أول مشهد، والقياس متاح في أي وقت.',
  'onboarding.recommend.someBasics':
    'قلت إنك تعلّمت شيئاً قبلاً — القياس يحدد نقطة البداية الصحيحة بدقة بدل التخمين.',
  'onboarding.recommend.canHold':
    'قلت إنك تستطيع إدارة محادثة بسيطة — دقيقتان من القياس قد توفّر عليك شهوراً من البداية الخاطئة.',

  'welcome.badge': 'Katzu AI • رفيقك الذكي',
  'welcome.headline': 'تحدث الألمانية بدون خوف',
  'welcome.subline':
    'تعلّم المحادثة الواقعية مع كَاتْزُو — رفيقك الذي يصحّح نطقك وقواعدك داخل مواقف حقيقية.',
  'welcome.demoLabel': 'مثال من محادثة حقيقية',
  'welcome.demoCaption': 'مثال — في المقهى',
  'welcome.demoSceneGloss': 'طاب يومك! ماذا تريد؟',
  'welcome.demoLearnerLine': 'أريد قهوة، من فضلك.',
  'welcome.demoSpeaker': 'كَاتْزُو:',
  'welcome.demoCoach': 'قريب جداً — «einen Kaffee» بعد «möchte» في حالة النصب. قل:',
  'welcome.start': 'إنشاء حساب جديد وابدأ',
  'welcome.quickDivider': 'أو المتابعة السريعة',
  'welcome.continueWithGoogle': 'المتابعة باستخدام Google',
  'welcome.haveAccount': 'لديك حساب بالفعل؟',
  'welcome.signIn': 'تسجيل الدخول إلى حسابي',
  'welcome.attribution': 'صُنع بواسطة غيدق علوش — ghaidak.com',
  'welcome.defaultName': 'متعلم',

  'signin.modeSignin': 'تسجيل الدخول',
  'signin.modeSignup': 'إنشاء حساب جديد',
  'signin.welcomeBackTitle': 'مرحباً بك مجدداً في كَاتْزُو',
  'signin.joinTitle': 'انضم إلى عائلة كَاتْزُو',
  'signin.welcomeBackBody':
    'سجل دخولك بحساب Google لمزامنة تقدمك السحابي واشتراكك وبنك أخطائك بأمان.',
  'signin.joinBody':
    'سجل بحساب Google لحفظ كل محادثة، كلمة جديدة، وتقرير تقدم تتقنه عبر كافة أجهزتك.',
  'signin.googleSignup': 'التسجيل السريع باستخدام Google',
  'signin.checking': 'جارٍ التحقق من الحساب...',
  'signin.errorGoogle': 'فشل التحقق من تسجيل الدخول عبر Google، يرجى المحاولة ثانية.',
  'signin.errorPopup':
    'لم تظهر نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع أو حاول مرة أخرى.',
  'signin.noticePreparing': 'جارٍ تجهيز خدمة Google… انتظر لحظة ثم اضغط مرة أخرى.',
  'signin.errorLoad': 'تعذر تحميل خدمة Google الآن. تحقق من الاتصال وحاول مجدداً.',
  'signin.unavailableTitle': 'تسجيل الدخول غير متاح الآن',
  'signin.unavailableBody':
    'لا يمكن إكمال تسجيل الدخول بحساب Google في هذه النسخة. يمكنك متابعة التعلم بدون حساب الآن، وسنعيد فتح تسجيل الدخول لاحقاً.',
  'signin.unavailableAction': 'العودة والمتابعة بدون حساب',
  'signin.privacyShort': 'حسابك وبياناتك محمية عبر Google Identity Services.',
  'signin.privacyFull': 'حسابك وبياناتك محمية ومشفرة عبر Google Identity Services.',
  'signin.defaultName': 'مستخدم كَاتْزُو',
  'signin.defaultStudentName': 'طالب كَاتْزُو',
  'signin.successSignup': 'تم إنشاء حسابك بنجاح! جاري الدخول...',
  'signin.successSignin': 'تم تسجيل الدخول بنجاح! مرحباً بعودتك...',
  'signin.errorSession':
    'تعذر تأمين جلسة الدخول. تحقق من اتصالك وحاول تسجيل الدخول مرة أخرى.',
  'signin.errorCredential': 'تعذر استلام بيانات الاعتماد من Google.',

  'language.sectionTitle': 'اللغة',
  'language.sectionHint': 'لغة الواجهة واللغة التي تتعلّمها',
  'language.uiTitle': 'لغة التطبيق',
  'language.uiBody': 'كل ما يخاطبك به التطبيق — العناوين والأزرار والملاحظات والتصحيح — بهذه اللغة.',
  'language.uiRowLabel': 'لغة الواجهة',
  'language.targetTitle': 'اللغة التي تتعلّمها',
  'language.targetBody': 'المحادثات والقواعد والكلمات التي تتدرب عليها تكون بهذه اللغة.',
  'language.targetRowLabel': 'أتعلّم',
  'language.currentBadge': 'الحالية',
  'language.chooseUiTitle': 'اختر لغة التطبيق',
  'language.chooseTargetTitle': 'اختر اللغة التي تتعلّمها',
  'language.savedNotice': 'تم حفظ اختيار اللغة.',
  'language.soonBadge': 'قريباً',
  'language.dutchSoon':
    'الهولندية قيد الإعداد: المحادثات والقواعد الهولندية لم تُنشر بعد، لذلك لا يمكن اختيارها الآن. اختيارك الحالي بالألمانية وسيبقى محفوظاً.',
  'language.nativeNote': 'تُشرح لك الأخطاء والملاحظات بلغتك هذه.',
} as const;

export type UiStringKey = keyof typeof AR;

const EN: Record<UiStringKey, string> = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',

  'nav.trail': 'Journey',
  'nav.practice': 'Practice',
  'nav.progress': 'Progress',
  'nav.profile': 'Profile',
  'nav.lockedHint': '{label} — locked until your first conversation',
  'shell.checkingAccount': 'Checking your account…',

  'onboarding.back': 'Back',
  'onboarding.progress': 'Question progress',
  'onboarding.editBadge': 'Edit preferences',
  'onboarding.firstRunNote': 'One question only — then I open your first situation.',
  'onboarding.goal.title': 'What is your goal with German?',
  'onboarding.goal.body':
    'One question only. It sets the order of the units I put in front of you — I would rather not waste your time on something you will never need.',
  'onboarding.goal.question': 'Why are you learning German?',
  'onboarding.goal.hint': 'This changes which situations I put first.',
  'onboarding.goal.skip': 'Skip for now and start',
  'onboarding.arrival.title': 'And where are you with Germany right now?',
  'onboarding.arrival.body':
    'Someone preparing to travel needs the paperwork first; someone who has arrived needs housing and a doctor. This decides what I bring you today.',
  'onboarding.previous.title': 'Have you tried German before today?',
  'onboarding.previous.body':
    'Not to make things easier or harder — only so I know where to start with you. I will not assume you know something you have not told me.',
  'onboarding.time.title': 'How many minutes can you give me each day?',
  'onboarding.time.body':
    'The habit matters more than the length. Pick what you can really commit to — today’s mission is built on that number, and you can change it later.',
  'onboarding.time.unit': 'minutes',
  'onboarding.skipAll': 'Skip the questions and start now',
  'onboarding.target.title': 'Is there a date you are waiting for? (optional)',
  'onboarding.target.body':
    'An exam, an interview or a trip — if you tell me the date I will remind you how long is left, inside the app only. No notifications, no pressure.',
  'onboarding.target.dateLabel': 'Date',
  'onboarding.target.continueHint': 'One last question: shall I measure your level now?',
  'onboarding.target.save': 'Save preferences',
  'onboarding.target.saving': 'Saving…',
  'onboarding.continue': 'Continue',
  'onboarding.target.none': 'No particular date',
  'onboarding.placement.minutes': 'About two minutes',
  'onboarding.placement.title': 'Shall I measure your level now?',
  'onboarding.placement.body':
    'The short check finds your real starting point (A0 to B2), so I neither teach you what you already know nor skip what you do not. You can skip it — your level then stays honestly “unmeasured”, and I will not claim you mastered something I never measured.',
  'onboarding.placement.skip': 'Not now — start at A1 and record my level as unmeasured',
  'onboarding.placement.startDirect': 'Start straight at A1 — we begin with today’s first scene',
  'onboarding.placement.privacy':
    'I ask for no extra personal data, I never switch notifications on for you, and I ask for no payment. The point is that your first lesson starts as soon as possible.',
  'onboarding.placement.take': 'Start the check',
  'onboarding.placement.takeHint': 'You can leave it at any time — your progress is saved.',
  'onboarding.placement.takeLater': 'The check is available at any time — start it now',
  'onboarding.backLink': 'Back to the previous question',

  'onboarding.goal.family.label': 'Family reunion',
  'onboarding.goal.family.hint': 'Paperwork, housing, doctor, family life',
  'onboarding.goal.work.label': 'Work',
  'onboarding.goal.work.hint': 'Interview, colleagues, Ausbildung, office',
  'onboarding.goal.study.label': 'Study',
  'onboarding.goal.study.hint': 'University, enrolment, lectures, exams',
  'onboarding.goal.travel.label': 'Travel',
  'onboarding.goal.travel.hint': 'Airport, train, booking, getting around',
  'onboarding.goal.general.label': 'General',
  'onboarding.goal.general.hint': 'Start from the basics and build day by day',
  'onboarding.goal.daily_life.label': 'Daily life in Germany',
  'onboarding.goal.daily_life.hint': 'Housing, doctor, shopping, transport',
  'onboarding.goal.university.label': 'University',
  'onboarding.goal.university.hint': 'Enrolment, lectures, dealing with the administration',
  'onboarding.goal.exam.label': 'Exam preparation',
  'onboarding.goal.exam.hint': 'B1 speaking practice in exam style — not the official format',

  'onboarding.arrival.preparing': 'I am still preparing to travel',
  'onboarding.arrival.recently_arrived': 'I arrived recently',
  'onboarding.arrival.living_in_germany': 'I already live in Germany',

  'onboarding.previous.first_time.label': 'I have never tried German',
  'onboarding.previous.first_time.hint': 'We start from zero — and that is the best place to begin',
  'onboarding.previous.some_basics.label': 'I learned a little at school or in an app',
  'onboarding.previous.some_basics.hint': 'You know words and sentences — we measure exactly where you are',
  'onboarding.previous.can_hold.label': 'I can handle a simple conversation',
  'onboarding.previous.can_hold.hint': 'You are past the beginning — the check saves you a lot of time',

  'onboarding.targetDate.move': 'Travel date',
  'onboarding.targetDate.exam': 'Exam date',
  'onboarding.targetDate.job': 'Job or interview date',

  'onboarding.recommend.start':
    'You can start right now — we pick the first scene together, and the check stays available at any time.',
  'onboarding.recommend.someBasics':
    'You said you have learned some before — the check finds the right starting point instead of guessing.',
  'onboarding.recommend.canHold':
    'You said you can handle a simple conversation — two minutes of checking can save you months of starting in the wrong place.',

  'welcome.badge': 'Katzu AI • your sharp-witted companion',
  'welcome.headline': 'Speak German without fear',
  'welcome.subline':
    'Learn the conversation people actually have, with Katzu — the companion that fixes your pronunciation and grammar inside situations that really happen.',
  'welcome.demoLabel': 'A real exchange',
  'welcome.demoCaption': 'Example — at the café',
  'welcome.demoSceneGloss': 'Good day! What can I get you?',
  'welcome.demoLearnerLine': 'A coffee, please.',
  'welcome.demoSpeaker': 'Katzu:',
  'welcome.demoCoach': 'Almost — «einen Kaffee» is accusative after «möchte». Say:',
  'welcome.start': 'Create an account and start',
  'welcome.quickDivider': 'or jump straight in',
  'welcome.continueWithGoogle': 'Continue with Google',
  'welcome.haveAccount': 'Already have an account?',
  'welcome.signIn': 'Sign in to my account',
  'welcome.attribution': 'Built by Ghaidak — ghaidak.com',
  'welcome.defaultName': 'learner',

  'signin.modeSignin': 'Sign in',
  'signin.modeSignup': 'Create account',
  'signin.welcomeBackTitle': 'Welcome back to Katzu',
  'signin.joinTitle': 'Join the Katzu family',
  'signin.welcomeBackBody':
    'Sign in with Google to sync your progress, your subscription and your error bank securely.',
  'signin.joinBody':
    'Sign up with Google to keep every conversation, every new word and a progress report across all your devices.',
  'signin.googleSignup': 'Sign up quickly with Google',
  'signin.checking': 'Checking your account…',
  'signin.errorGoogle': 'Google sign-in could not be verified. Please try again.',
  'signin.errorPopup': 'Google did not open its window. Allow pop-ups for this site, or try again.',
  'signin.noticePreparing': 'Google is still starting up — wait a moment, then tap again.',
  'signin.errorLoad': 'Google could not be loaded right now. Check your connection and try again.',
  'signin.unavailableTitle': 'Sign-in is unavailable right now',
  'signin.unavailableBody':
    'Google sign-in cannot be completed in this build. You can keep learning without an account now, and we will reopen sign-in later.',
  'signin.unavailableAction': 'Go back and continue without an account',
  'signin.privacyShort': 'Your account and data are protected by Google Identity Services.',
  'signin.privacyFull':
    'Your account and data are protected and encrypted through Google Identity Services.',
  'signin.defaultName': 'Katzu learner',
  'signin.defaultStudentName': 'Katzu student',
  'signin.successSignup': 'Your account is created — signing you in…',
  'signin.successSignin': 'Signed in — welcome back…',
  'signin.errorSession': 'We could not secure your session. Check your connection and sign in again.',
  'signin.errorCredential': 'Google credentials could not be received.',

  'language.sectionTitle': 'Language',
  'language.sectionHint': 'The app language and the language you are learning',
  'language.uiTitle': 'App language',
  'language.uiBody': 'Everything the app says to you — headings, buttons, notes and corrections — appears in this language.',
  'language.uiRowLabel': 'App language',
  'language.targetTitle': 'Language you are learning',
  'language.targetBody': 'The conversations, grammar and vocabulary you practise are in this language.',
  'language.targetRowLabel': 'Learning',
  'language.currentBadge': 'Current',
  'language.chooseUiTitle': 'Choose the app language',
  'language.chooseTargetTitle': 'Choose the language you are learning',
  'language.savedNotice': 'Your language choice has been saved.',
  'language.soonBadge': 'Soon',
  'language.dutchSoon':
    'Dutch is in preparation: the Dutch conversations and grammar are not published yet, so it cannot be selected today. Your current choice stays German and is kept.',
  'language.nativeNote': 'Corrections and notes are explained to you in this language.',
};

const ID: Record<UiStringKey, string> = {
  'common.cancel': 'Batal',
  'common.close': 'Tutup',

  'nav.trail': 'Perjalanan',
  'nav.practice': 'Latihan',
  'nav.progress': 'Kemajuan',
  'nav.profile': 'Profil',
  'nav.lockedHint': '{label} — terkunci sampai percakapan pertamamu',
  'shell.checkingAccount': 'Memeriksa akun…',

  'onboarding.back': 'Kembali',
  'onboarding.progress': 'Kemajuan pertanyaan',
  'onboarding.editBadge': 'Ubah preferensi',
  'onboarding.firstRunNote': 'Satu pertanyaan saja — lalu aku buka situasi pertamamu.',
  'onboarding.goal.title': 'Apa tujuanmu belajar bahasa Jerman?',
  'onboarding.goal.body':
    'Satu pertanyaan saja. Dari jawabanmu aku menyusun urutan unit yang kusiapkan — aku tidak mau membuang waktumu untuk hal yang tidak akan kamu pakai.',
  'onboarding.goal.question': 'Kenapa kamu belajar bahasa Jerman?',
  'onboarding.goal.hint': 'Ini mengubah urutan situasi yang kutampilkan lebih dulu.',
  'onboarding.goal.skip': 'Lewati dulu dan mulai',
  'onboarding.arrival.title': 'Dan sekarang posisimu dengan Jerman bagaimana?',
  'onboarding.arrival.body':
    'Yang masih bersiap berangkat butuh urusan dokumen dulu; yang sudah tiba butuh tempat tinggal dan dokter. Ini menentukan apa yang kusiapkan untukmu hari ini.',
  'onboarding.previous.title': 'Pernah mencoba bahasa Jerman sebelum hari ini?',
  'onboarding.previous.body':
    'Bukan untuk membuatnya lebih mudah atau lebih sulit — hanya supaya aku tahu harus mulai dari mana. Aku tidak akan menganggap kamu tahu sesuatu yang belum kamu bilang.',
  'onboarding.time.title': 'Berapa menit yang bisa kamu beri setiap hari?',
  'onboarding.time.body':
    'Kebiasaan lebih penting daripada durasinya. Pilih yang benar-benar bisa kamu pegang — misi hari ini kubangun dari angka itu, dan nanti bisa kamu ubah.',
  'onboarding.time.unit': 'menit',
  'onboarding.skipAll': 'Lewati pertanyaannya dan mulai sekarang',
  'onboarding.target.title': 'Ada tanggal yang kamu tunggu? (opsional)',
  'onboarding.target.body':
    'Ujian, wawancara, atau perjalanan — kalau kamu beri tanggalnya, aku akan mengingatkan sisa waktunya, hanya di dalam aplikasi. Tanpa notifikasi, tanpa menekan.',
  'onboarding.target.dateLabel': 'Tanggal',
  'onboarding.target.continueHint': 'Satu pertanyaan terakhir: mau kucek levelmu sekarang?',
  'onboarding.target.save': 'Simpan preferensi',
  'onboarding.target.saving': 'Menyimpan…',
  'onboarding.continue': 'Lanjut',
  'onboarding.target.none': 'Tidak ada tanggal tertentu',
  'onboarding.placement.minutes': 'Sekitar dua menit',
  'onboarding.placement.title': 'Mau kucek levelmu sekarang?',
  'onboarding.placement.body':
    'Tes singkat ini menemukan titik awalmu yang sebenarnya (A0 sampai B2), supaya aku tidak mengajarimu hal yang sudah kamu tahu dan tidak melompati yang belum. Kamu boleh melewatinya — levelmu lalu tetap “belum diukur” dengan jujur, dan aku tidak akan bilang kamu sudah menguasai sesuatu yang belum kuukur.',
  'onboarding.placement.skip': 'Jangan sekarang — mulai dari A1 dan catat levelku belum diukur',
  'onboarding.placement.startDirect': 'Mulai langsung dari A1 — kita mulai dari adegan pertama hari ini',
  'onboarding.placement.privacy':
    'Aku tidak meminta data pribadi tambahan, tidak menyalakan notifikasi sendiri, dan tidak meminta pembayaran. Tujuannya supaya pelajaran pertamamu mulai secepat mungkin.',
  'onboarding.placement.take': 'Mulai tes',
  'onboarding.placement.takeHint': 'Kamu bisa keluar kapan saja — kemajuanmu tersimpan.',
  'onboarding.placement.takeLater': 'Tes ini tersedia kapan saja — mulai sekarang',
  'onboarding.backLink': 'Kembali ke pertanyaan sebelumnya',

  'onboarding.goal.family.label': 'Menyatukan keluarga',
  'onboarding.goal.family.hint': 'Dokumen, tempat tinggal, dokter, kehidupan keluarga',
  'onboarding.goal.work.label': 'Kerja',
  'onboarding.goal.work.hint': 'Wawancara, rekan kerja, Ausbildung, kantor',
  'onboarding.goal.study.label': 'Studi',
  'onboarding.goal.study.hint': 'Universitas, pendaftaran, kuliah, ujian',
  'onboarding.goal.travel.label': 'Perjalanan',
  'onboarding.goal.travel.hint': 'Bandara, kereta, pemesanan, transportasi',
  'onboarding.goal.general.label': 'Umum',
  'onboarding.goal.general.hint': 'Mulai dari dasar dan bangun hari demi hari',
  'onboarding.goal.daily_life.label': 'Kehidupan sehari-hari di Jerman',
  'onboarding.goal.daily_life.hint': 'Tempat tinggal, dokter, belanja, transportasi',
  'onboarding.goal.university.label': 'Universitas',
  'onboarding.goal.university.hint': 'Pendaftaran, kuliah, urusan administrasi',
  'onboarding.goal.exam.label': 'Persiapan ujian',
  'onboarding.goal.exam.hint': 'Latihan berbicara B1 gaya ujian — bukan format resmi',

  'onboarding.arrival.preparing': 'Aku masih bersiap berangkat',
  'onboarding.arrival.recently_arrived': 'Aku baru tiba',
  'onboarding.arrival.living_in_germany': 'Aku sudah tinggal di Jerman',

  'onboarding.previous.first_time.label': 'Aku belum pernah mencoba bahasa Jerman',
  'onboarding.previous.first_time.hint': 'Kita mulai dari nol — dan itu titik awal terbaik',
  'onboarding.previous.some_basics.label': 'Aku belajar sedikit di sekolah atau aplikasi',
  'onboarding.previous.some_basics.hint': 'Kamu tahu kata dan kalimat — kita ukur tepatnya di mana',
  'onboarding.previous.can_hold.label': 'Aku bisa mengurus percakapan sederhana',
  'onboarding.previous.can_hold.hint': 'Kamu sudah di atas awal — tes ini menghemat banyak waktu',

  'onboarding.targetDate.move': 'Tanggal berangkat',
  'onboarding.targetDate.exam': 'Tanggal ujian',
  'onboarding.targetDate.job': 'Tanggal kerja atau wawancara',

  'onboarding.recommend.start':
    'Kamu bisa mulai sekarang — kita pilih adegan pertama bersama, dan tes tetap tersedia kapan saja.',
  'onboarding.recommend.someBasics':
    'Kamu bilang pernah belajar sedikit — tes ini menemukan titik awal yang tepat, bukan menebak.',
  'onboarding.recommend.canHold':
    'Kamu bilang bisa mengurus percakapan sederhana — dua menit tes bisa menghemat berbulan-bulan salah mulai.',

  'welcome.badge': 'Katzu AI • teman cerdasmu',
  'welcome.headline': 'Bicara bahasa Jerman tanpa takut',
  'welcome.subline':
    'Pelajari percakapan yang benar-benar terjadi bersama Katzu — teman yang membetulkan pelafalan dan tata bahasamu di situasi nyata.',
  'welcome.demoLabel': 'Contoh percakapan nyata',
  'welcome.demoCaption': 'Contoh — di kafe',
  'welcome.demoSceneGloss': 'Selamat siang! Mau pesan apa?',
  'welcome.demoLearnerLine': 'Kopi, tolong.',
  'welcome.demoSpeaker': 'Katzu:',
  'welcome.demoCoach': 'Hampir — «einen Kaffee» memakai akusatif setelah «möchte». Ucapkan:',
  'welcome.start': 'Buat akun dan mulai',
  'welcome.quickDivider': 'atau langsung masuk',
  'welcome.continueWithGoogle': 'Lanjutkan dengan Google',
  'welcome.haveAccount': 'Sudah punya akun?',
  'welcome.signIn': 'Masuk ke akun saya',
  'welcome.attribution': 'Dibuat oleh Ghaidak — ghaidak.com',
  'welcome.defaultName': 'pelajar',

  'signin.modeSignin': 'Masuk',
  'signin.modeSignup': 'Buat akun',
  'signin.welcomeBackTitle': 'Selamat datang kembali di Katzu',
  'signin.joinTitle': 'Bergabung dengan keluarga Katzu',
  'signin.welcomeBackBody':
    'Masuk dengan Google untuk menyinkronkan kemajuan, langganan, dan bank kesalahanmu dengan aman.',
  'signin.joinBody':
    'Daftar dengan Google supaya setiap percakapan, kata baru, dan laporan kemajuan tersimpan di semua perangkatmu.',
  'signin.googleSignup': 'Daftar cepat dengan Google',
  'signin.checking': 'Memeriksa akun…',
  'signin.errorGoogle': 'Login Google tidak bisa diverifikasi. Coba lagi.',
  'signin.errorPopup': 'Jendela Google tidak muncul. Izinkan pop-up untuk situs ini, atau coba lagi.',
  'signin.noticePreparing': 'Google masih disiapkan — tunggu sebentar, lalu ketuk lagi.',
  'signin.errorLoad': 'Layanan Google belum bisa dimuat. Periksa koneksimu dan coba lagi.',
  'signin.unavailableTitle': 'Login belum tersedia',
  'signin.unavailableBody':
    'Login dengan Google belum bisa diselesaikan di versi ini. Kamu bisa lanjut belajar tanpa akun sekarang, dan login akan kami buka lagi nanti.',
  'signin.unavailableAction': 'Kembali dan lanjut tanpa akun',
  'signin.privacyShort': 'Akun dan datamu dilindungi Google Identity Services.',
  'signin.privacyFull':
    'Akun dan datamu dilindungi serta dienkripsi lewat Google Identity Services.',
  'signin.defaultName': 'Pelajar Katzu',
  'signin.defaultStudentName': 'Pelajar Katzu',
  'signin.successSignup': 'Akunmu sudah dibuat — sedang masuk…',
  'signin.successSignin': 'Berhasil masuk — selamat datang kembali…',
  'signin.errorSession': 'Sesi masuk belum bisa diamankan. Periksa koneksimu lalu coba masuk lagi.',
  'signin.errorCredential': 'Kredensial Google tidak bisa diterima.',

  'language.sectionTitle': 'Bahasa',
  'language.sectionHint': 'Bahasa aplikasi dan bahasa yang kamu pelajari',
  'language.uiTitle': 'Bahasa aplikasi',
  'language.uiBody': 'Semua yang dikatakan aplikasi kepadamu — judul, tombol, catatan, dan koreksi — tampil dalam bahasa ini.',
  'language.uiRowLabel': 'Bahasa aplikasi',
  'language.targetTitle': 'Bahasa yang kamu pelajari',
  'language.targetBody': 'Percakapan, tata bahasa, dan kosakata yang kamu latih memakai bahasa ini.',
  'language.targetRowLabel': 'Mempelajari',
  'language.currentBadge': 'Saat ini',
  'language.chooseUiTitle': 'Pilih bahasa aplikasi',
  'language.chooseTargetTitle': 'Pilih bahasa yang kamu pelajari',
  'language.savedNotice': 'Pilihan bahasamu sudah disimpan.',
  'language.soonBadge': 'Segera',
  'language.dutchSoon':
    'Bahasa Belanda sedang disiapkan: percakapan dan tata bahasanya belum terbit, jadi belum bisa dipilih sekarang. Pilihanmu tetap Jerman dan tetap tersimpan.',
  'language.nativeNote': 'Koreksi dan catatan dijelaskan kepadamu dalam bahasa ini.',
};

export const UI_STRINGS: Record<UiLanguage, Record<UiStringKey, string>> = {
  ar: AR,
  en: EN,
  id: ID,
};

/**
 * The largest value any `{placeholder}` may be given. Numbers and short names
 * qualify; an object or a stack trace does not, and must never be stringified
 * into the sentence a learner reads.
 */
type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * One translation. Falls back to Arabic rather than to the key: a learner who
 * sees "language.uiTitle" on a button has been shown the implementation, and an
 * Arabic sentence in an English screen is at least a sentence.
 */
export function translate(language: UiLanguage, key: UiStringKey, vars?: Vars): string {
  const table = UI_STRINGS[language] || UI_STRINGS.ar;
  const template = table[key] ?? UI_STRINGS.ar[key] ?? key;
  return interpolate(template, vars);
}

/** For a caller that has a key it cannot prove at compile time (a server payload). */
export function isUiStringKey(value: unknown): value is UiStringKey {
  return typeof value === 'string' && value in UI_STRINGS.ar;
}
