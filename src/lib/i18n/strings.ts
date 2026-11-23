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

  /* B1 — the Pro screen and the free allowance it states. */
  'sub.title': 'عضوية Katzu Pro',
  'sub.headline': 'أطلق العنان لقدراتك مع Pro',
  'sub.statusLabel': 'حالة الاشتراك',
  'sub.statusPro': 'Pro نشط',
  'sub.statusFree': 'الحساب المجاني',
  'sub.expiresOn': 'ينتهي الاشتراك في {date} — يمكنك تفعيل كود جديد في أي وقت لإضافة المدة.',
  'sub.noExpiry': 'اشتراكك نشط بدون تاريخ انتهاء محدد.',
  'sub.paymentNote':
    'الدفع يتم على صفحة الشراء الرسمية، ثم تُفعّل الكود هنا. لا نحتفظ بأي بيانات بطاقة في التطبيق.',
  'sub.haveCode': 'اشتريت كوداً بالفعل؟ فعّله الآن',
  'sub.valueLine':
    'محادثات ذكية بلا حدّ على عدد الجلسات، مع تصحيح فوري للنطق والقواعد لجميع المستويات (A0 - B2).',
  'sub.feature.voice': 'محادثات صوتية بلا حدّ جلسات مع كَاتْزُو بالذكاء الاصطناعي',
  'sub.feature.levels': 'فتح كامل مسار المستويات الواقعية من A0 إلى B2',
  'sub.feature.corrections': 'تحليل وتصحيح فوري للقواعد مع شرح باللغة العربية',
  'sub.feature.bank': 'بنك مخصص لمراجعة الأخطاء وتثبيت المفردات',
  'sub.fairUse': 'نطبّق حدّاً عادلاً للاستخدام يحمي الخدمة من الإساءة، ولا يمسّ الاستخدام اليومي العادي.',
  'sub.connectedAccount': 'الحساب المتصل:',
  'sub.noCodeQuestion': 'لا تملك كود تفعيل بعد؟',
  'sub.buyWithPrice':
    'اشترِ كوداً من صفحة الشراء الرسمية بـ {price} — الدفع بالبطاقة أو العملات الرقمية، وللمقيمين في سوريا خيارات الدفع المحلي (سيرياتيل كاش، MTN كاش، حوالة بنكية). يصل الكود إليك مباشرة ثم تفعّله هنا.',
  'sub.buyWithoutPrice':
    'اشترِ كوداً من صفحة الشراء الرسمية — الدفع بالبطاقة أو العملات الرقمية، وللمقيمين في سوريا خيارات الدفع المحلي (سيرياتيل كاش، MTN كاش، حوالة بنكية). يظهر السعر على صفحة الشراء، ويصل الكود إليك مباشرة ثم تفعّله هنا.',
  'sub.buyCta': 'اشترِ كود تفعيل الآن',
  'sub.codeQuestion': 'هل لديك كود تفعيل؟ (مثال: DE-1M-...)',
  'sub.codeAria': 'كود تفعيل الاشتراك',
  'sub.activate': 'تفعيل',
  'sub.referralQuestion': 'كود إحالة من صديق؟ (اختياري)',
  'sub.referralAria': 'كود إحالة من صديق',
  'sub.referralSignIn': 'يلزم تسجيل الدخول بحساب Google أولاً.',
  'sub.referralLinked': 'تم ربط حسابك بكود الإحالة ✓ بعد أول اشتراك سيحصل صديقك على شهر Pro.',
  'sub.referralFailed': 'تعذر تطبيق كود الإحالة.',
  'sub.link': 'ربط',
  'sub.seePrices': 'لا يوجد لديك كود؟ اعرف الأسعار',
  'sub.tryMock': 'جرّب محاكاة B1 مجاناً — محادثة واحدة بثلاثة أجزاء',
  'sub.continueFree': 'المتابعة بالحساب المجاني',
  'sub.signInRequired': 'يلزم تسجيل الدخول بحساب Google موثّق قبل تفعيل الكود.',
  'sub.redeemed': 'تم تفعيل اشتراك Katzu Pro بنجاح لمدة {months} أشهر! مبروك 🎉',
  'sub.invalidCode': 'كود التفعيل غير صالح أو انتهت صلاحيته.',
  'sub.networkError': 'حدث خطأ أثناء الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت.',

  /* The free allowance, in one place: the Pro screen and «المزيد» both read it. */
  'trial.unknown':
    'رصيد جلساتك التجريبية يُحسب على خوادمنا — لم نتمكن من تحديثه الآن. المراجعة وكل ما تعلّمته مجانيان بلا حد.',
  'trial.exhausted': 'انتهت جلساتك التجريبية المجانية. المراجعة وكل ما تعلّمته مجانيان بلا حد.',
  'trial.remainingOne': 'لديك جلسة واحدة محادثة تجريبية متبقية. المراجعة وكل ما تعلّمته مجانيان بلا حد.',
  'trial.remaining': 'لديك {sessions} محادثة تجريبية متبقية. المراجعة وكل ما تعلّمته مجانيان بلا حد.',

  /* The shell's empty report. */
  'shell.noReportTitle': 'لا يوجد تقرير محفوظ',
  'shell.noReportBody':
    'لم نجد محادثة مكتملة محفوظة على هذا الجهاز — ربما أُغلقت الصفحة قبل حفظ التقرير. المراجعة والأخطاء التي سجّلتها ما زالت هنا.',
  'shell.startScene': 'ابدأ مشهداً جديداً',

  /* B2 — the journey layer: the home screen, and the copy tables it renders.
     The Arabic here is the shipped wording, moved verbatim, so an Arabic build
     is byte-identical to the one that shipped before the language work. */
  'journey.chapter.steps': 'الخطوات الأولى في ألمانيا',
  'journey.chapter.daily': 'الحياة اليومية والمواصلات',
  'journey.chapter.work': 'العمل والمكتب',
  'journey.chapter.study': 'الجامعة والجهات الرسمية',
  'journey.chapter.independent': 'الاستقلال باللغة',

  'journey.situation.livingInGermany': 'أنت في ألمانيا بالفعل',
  'journey.situation.arrived': 'وصلت حديثاً',
  'journey.situation.exam': 'لديك امتحان قادم',
  'journey.situation.work': 'تستعد للعمل أو Ausbildung',
  'journey.situation.university': 'تستعد للدراسة',
  'journey.situation.travelling': 'أنت في طريقك إلى ألمانيا',

  'journey.reason.intro':
    'أول موقف في القصة — قاعة القدوم في المطار، حيث تبدأ رحلة كل متعلّم.',
  'journey.reason.reviewOne': 'عنصر واحد على وشك أن يُنسى — تثبيته الآن يوفّر عليك إعادة تعلّمه.',
  'journey.reason.reviewMany':
    '{items} على وشك أن تُنسى — تثبيتها الآن أرخص من إعادة تعلّمها.',
  'journey.reason.continue':
    'بدأت هذا المشهد ولم تُكمله — إكماله اليوم هو ما يثبّت ما تعلّمته فيه.',
  'journey.reason.weakSkill':
    'هذه أضعف مهارة قِسناها عندك — دقائق عليها الآن تغيّر نتيجتك القادمة.',
  'journey.reason.new': 'أول مرة تخوض هذا الموقف — أسهل مما يبدو، ولن تُترك وحدك فيه.',
  'journey.reason.noContent':
    'المحتوى غير محفوظ على هذا الجهاز بعد — نحتاج اتصالاً واحداً لتنزيله.',

  'journey.reality.health': 'ستحتاج هذه الجُمل في العيادة أو الصيدلية',
  'journey.reality.housing': 'هذه هي نفس الأسئلة التي سيسألها المالك',
  'journey.reality.workExam': 'صيغة قريبة مما يظهر في امتحان العمل',
  'journey.reality.work': 'هذه محادثة حقيقية في العمل أو المقابلة',
  'journey.reality.travel': 'ستستخدمها في المحطة عندما تحتاج مساعدة',
  'journey.reality.official': 'هذه هي اللغة التي تسمعها في الدوائر الرسمية',
  'journey.reality.daily': 'موقف يومي تتكرر فيه هذه الجُمل',
  'journey.reality.exam':
    'تدريب بأسلوب الامتحان — ليس الامتحان الرسمي، لكنه يقيس الشيء نفسه',
  'journey.reality.study': 'لغة الدرس والجامعة التي ستحتاجها في أول أسبوع',
  'journey.reality.visa': 'أسئلة التأشيرة والإقامة بالجمل التي تسمعها فعلاً في السفارة',
  'journey.reality.services': 'مكالمة موفّر خدمة — بالضبط ما ستحتاجه لتصفير موعد',
  'journey.reality.trades': 'لغة الورشة والصيانة التي تصلح كل موقف فني في بيتك',
  'journey.reality.basics': 'الأساسيات التي يتكرر عليها كل يوم',
  'journey.reality.other': 'موقف حقيقي ستخوضه بالألمانية',

  'journey.katzu.offlineCached': 'بدون اتصال الآن — المهمة محفوظة على جهازك وستعمل كما هي.',
  'journey.katzu.offlineNoMission':
    'بدون اتصال، ولا توجد مهمة محفوظة بعد. المراجعة المحفوظة تعمل في كل الأحوال.',
  'journey.katzu.firstRun': 'هذه أول مهمة لك. لنبدأ بشيء تخوضه فعلاً في ألمانيا.',
  'journey.katzu.afterBreak': 'مرّ {days} أيام. لنبدأ من شيء تعرفه — بلا ضغط وبلا مقارنة.',
  'journey.katzu.allCaughtUp': 'لا شيء ينتظرك اليوم: أنهيت ما لديك ومراجعتك نظيفة.',
  'journey.katzu.review': 'قبل أي شيء جديد: عندك ما يستحق التثبيت أولاً.',
  'journey.katzu.continue': 'المشهد المفتوح نصفه جاهز — النصف الثاني أسرع مما تتوقع.',

  'story.situation.returning':
    'عاد المشهد إلى صندوق مهمتك: أنت الآن في {location}، والمحادثة تنتظرك من حيث توقفت تقريباً.',
  'story.situation.named':
    '{name}، أنت الآن في {location}. {who} يقترب منك ويبدأ الحديث بالألمانية.',
  'story.situation.plain': 'أنت الآن في {location}. {who} يقترب منك ويبدأ الحديث بالألمانية.',
  'story.task': 'ستتحدث مع {who} وتُخرج جُملَك بنفسك — بالألمانية، بصوتك أو بكتابتك.',
  'story.katzu.roleWithName': 'أنا كَاتْزُو، رفيقك هنا. ',
  'story.katzu.roleGeneric': 'أنا كَاتْزُو، رفيقك في هذه الرحلة. ',
  'story.katzu.returning': 'لا نحتاج أن نتذكر كل شيء — سنستمع أولاً، ثم تتحدث أنت.',
  'story.katzu.preparing':
    '{vocative}{role}سنتدرّب على هذا الموقف قبل أن تقف فيه فعلاً — بلا ضغط وبلا حكم.',
  'story.katzu.arrived': '{vocative}{role}وصلت حديثاً، فلنبدأ بأول موقف ستقابله هنا.',
  'story.katzu.default':
    '{vocative}{role}استمع للجملة الأولى مرة أو مرتين، ثم تحدّث أنت — سأصحّح لك {correctionLanguage} بعدها.',

  'story.role.border': 'موظف جوازات المطار',
  'story.role.cafe': 'عامل المقهى',
  'story.role.baker': 'الخبّاز',
  'story.role.doctor': 'الطبيب',
  'story.role.landlord': 'صاحب الشقة',
  'story.role.hiring': 'مسؤول التوظيف',
  'story.role.station': 'موظف الاستعلامات في المحطة',
  'story.role.official': 'موظف في الدائرة الرسمية',
  'story.role.examiner': 'ممتحن في الامتحان التجريبي',
  'story.role.teacher': 'أستاذ في الدورة اللغوية',
  'story.role.visa': 'موظف شؤون التأشيرات',
  'story.role.tradesperson': 'حرفي أو فني صيانة',
  'story.role.neighbour': 'جارك',
  'story.role.colleague': 'زميلك في العمل',
  'story.role.other': 'شخص ألماني في هذا الموقف',

  'capability.state.NOT_STARTED': 'لم يبدأ',
  'capability.state.INTRODUCED': 'تعرّفت عليه',
  'capability.state.PRACTISING': 'قيد التدريب',
  'capability.state.INDEPENDENT': 'مستقل',
  'capability.state.RETAINED': 'ثابت في الذاكرة',
  'capability.description.NOT_STARTED': 'لم تفتح هذا المشهد بعد.',
  'capability.description.INTRODUCED': 'درست المفردات والعبارات، لكن لم تُنتج جملة بعد.',
  'capability.description.PRACTISING': 'تدرّبت عليه (اختبار أو محادثة) وما زال يحتاج تثبيتاً.',
  'capability.description.INDEPENDENT': 'أتممت محادثة كاملة بدون تلميحات وبأداء جيد.',
  'capability.description.RETAINED': 'نجحت فيه مرة أخرى بعد مراجعة مجدولة — المعرفة بقيت.',
  'capability.canDo.retained': 'تستطيع التعامل مع «{title}» بثقة، وقد ثبّتناها بالمراجعة.',
  'capability.canDo.independent': 'تستطيع التعامل مع «{title}» بالألمانية بدون مساعدة.',
  'capability.canDo.practising': 'تتدرّب الآن على «{title}» — لم تصبح مستقلة فيه بعد.',
  'capability.canDo.introduced': 'تعرّفت على «{title}» وما زلت في البداية.',
  'capability.canDo.notStarted': 'لم تبدأ «{title}» بعد.',

  'daily.scenario.label': 'محادثة مشهد واحدة',
  'daily.scenario.action': 'ابدأ محادثة',
  'daily.scenario.hint': 'جلسة مشهد واحدة كاملة — تدريب أو محادثة حقيقية.',
  'daily.grammar.label': 'خطوة قواعد واحدة',
  'daily.grammar.action': 'افتح القاعدة',
  'daily.grammar.hint': 'درس قواعد واحد في مسارك المفتوح.',
  'daily.review.label': 'دفعة مراجعة',
  'daily.review.action': 'ابدأ المراجعة',
  'daily.review.hint': 'راجع ما حان وقته — {size} عناصر أو إفراغ قائمة اليوم.',

  'home.dayChapter': 'اليوم {day} · الفصل {index} من {count}',
  'home.scenesOf': '{done} من {total} مشاهد',
  'home.scenesWord': 'مشاهد',
  'home.preferencesTitle': 'أكمل تفضيلاتك (30 ثانية)',
  'home.preferencesBody': 'هدفك ووقتك يجعلان مهمة اليوم أدق',
  'home.dismissBanner': 'إخفاء هذا التنبيه',
  'home.badge.arrival': 'لحظة الوصول · أول موقف في القصة',
  'home.badge.review': 'مراجعة اليوم · {items}',
  'home.badge.reviewQuick': 'مراجعة سريعة',
  'home.badge.nextScene': 'المشهد التالي',
  'home.badge.continue': 'أكمل مشهداً مفتوحاً',
  'home.badge.weakSkill': 'تدريب على أضعف مهارة',
  'home.badge.daily': 'مهمة اليوم',
  'home.badge.new': 'مشهد جديد',
  'home.badge.waiting': 'بانتظار المحتوى',
  'home.reviewToday': 'مراجعة اليوم',
  'home.missionPreparing': 'مهمتك اليومية قيد التجهيز',
  'home.levelNote': 'هذه المهمة بمستوى {level} — وهو المتاح في الخطة المجانية.',
  'home.ctaContinue': 'تابع التعلّم',
  'home.reviewRow': 'مراجعة سريعة · {items} · {minutes}',
  'home.more': 'المزيد',
  'home.reviewDue': 'مراجعة مستحقة: {count}',
  'home.capabilityEarned': 'قدرة مكتسبة · {label}',
  'home.capabilityLine': 'تستطيع التعامل مع «{title}» بالألمانية بدون مساعدة.',
  'home.chapterGoalTitle': 'هدفك في هذا الفصل',
  'home.chapterGoalBody': 'أنهِ مشاهد هذا الفصل لتتقن التعامل مع موقفه بالألمانية بدون مساعدة.',
  'home.renew': 'تجديد الاشتراك',
  'home.weeklyTitle': 'أسبوعك في كَاتْزُو',
  'home.weeklyTop': 'أكثر مشهد زرته:',
  'home.grammarChip': 'القواعد',
  'home.libraryChip': 'كل المشاهد والمستويات',
  'home.levelChip': 'المستوى {level}',

  'daily.panelTitle': 'مهام اليوم',
  'daily.streakLine': '{streak} في مهام اليوم',
  'daily.streakForgiving': ' — يوم واحد مسموح ومُتجاوَز',
  'daily.allDone': 'أتممت مهام اليوم الثلاث — غداً تتجدد خطوتك اليومية لتثبيت ما تدرّبت عليه.',
  'daily.doneAria': '{label} — تم',
  'daily.more': 'المزيد',

  'more.title': 'المزيد',
  'more.learn': 'تابع التعلّم',
  'more.library': 'كل المشاهد والمستويات',
  'more.libraryHint': 'كل المواقف، مرتّبة بالمستوى',
  'more.grammar': 'القواعد',
  'more.grammarHint': 'قاعدة واحدة في كل مرة، مع تمرين قصير',
  'more.listening': 'الاستماع',
  'more.listeningHint': 'تدرّب على فهم الألمانية المنطوقة',
  'more.writing': 'الكتابة',
  'more.writingHint': 'اكتب سطوراً قصيرة وتُصحَّح',
  'more.coach': 'المدرّب',
  'more.coachHint': 'اسأل عن أي شيء في الألمانية',
  'more.reviewSection': 'المراجعة',
  'more.reviewLabel': 'مراجعة مستحقة: {count}',
  'more.reviewHint': 'البطاقات جاهزة على جهازك وتعمل بدون اتصال',
  'more.progressSection': 'تقدّمك',
  'more.levelLine': 'مستواك الحالي',
  'more.accountSection': 'حسابك وخطتك',
  'more.proActive': 'عضوية Pro نشطة — كل المستويات وجلسات بلا حدود.',
  'more.managePlan': 'إدارة الاشتراك',
  'more.managePlanHint': 'الفوترة والتجديد',
  'more.pro': 'Katzu Pro',
  'more.proHint': 'يفتح بقية المستويات حتى B2',
  'more.preferencesSection': 'تفضيلاتك',
  'more.preferences': 'تفضيلاتي',
  'more.preferencesHint': 'هدفك ووقتك ومستواك — تغييرها يغيّر مهمة اليوم',
  'more.footer': 'كل ما تعلّمته يبقى على جهازك.',

  'lock.title': 'هذا القسم يفتح بعد أول محادثة',
  'lock.body': 'محادثة واحدة قصيرة تكفي — وبعدها كل ما هنا مفتوح.',
  'lock.start': 'ابدأ أول محادثة',
  'lock.later': 'لاحقاً',

  'story.whyFallback': 'هذا الموقف من المواقف التي ستخوضها فعلاً في ألمانيا.',
  'storySetup.missingTitle': 'لم نجد هذا المشهد على هذا الجهاز بعد.',
  'storySetup.stalled': 'تأخّر تجهيز المشهد — قد يكون التحديث معلّقاً في تبويب آخر.',
  'storySetup.loading': 'جارٍ تجهيز المشهد…',
  'storySetup.missingBody':
    'قد يكون هذا المشهد لم يُنزَّل على الجهاز بعد — يمكنك المتابعة بمشهد آخر من مسارك.',
  'storySetup.retry': 'إعادة المحاولة',
  'storySetup.back': 'العودة',
  'storySetup.backAria': 'العودة',
  'storySetup.you': 'أنت: {name}',
  'storySetup.returned': 'عدت إلى هذا المشهد',
  'storySetup.why': 'لماذا اليوم: ',
  'storySetup.taskLabel': 'مهمتك: ',
  'storySetup.listenAria': 'استمع للجملة الأولى',
  'storySetup.translating': 'جارٍ الترجمة…',
  'storySetup.translateFailed': 'تعذرت الترجمة — إعادة المحاولة',
  'storySetup.offline': 'المحادثة الحيّة تحتاج اتصالاً — يمكنك التدريب الآن',
  'storySetup.hintDayZero': 'ستستمع أولاً، ثم تتحدث أنت — لا يوجد اختبار ولا حكم.',
  'storySetup.hintReturning': 'خطوتان قصيرتان ثم تبدأ المحادثة.',
  'storySetup.start': 'ابدأ التدريب',
  'storySetup.notNow': 'ليس الآن',

  'practice.backAria': 'العودة إلى القصة',
  'practice.title': 'تدريب موجّه · {count} عبارات',
  'practice.prepare': 'جهّز لسانك — ثم نتحدث',
  'practice.emptyTitle': 'لا توجد عبارات محفوظة لهذا المشهد على جهازك بعد.',
  'practice.emptyBody': 'يمكنك المتابعة إلى المحادثة الآن؛ ستحتاج اتصالاً بالإنترنت.',
  'practice.listenAria': 'استمع: {text}',
  'practice.grammarTitle': 'قاعدة اليوم',
  'practice.grammarInstruction': 'اكتب بالألمانية ما تعنيه: ',
  'practice.answerLabelGrammar': 'إجابتك عن القاعدة بالألمانية',
  'practice.placeholderGrammar': 'اكتب جملتك بالألمانية هنا…',
  'practice.ariaGrammar': 'اكتب جملة القاعدة بالألمانية',
  'practice.check': 'تحقق',
  'practice.showCorrect': 'أرني الصحيحة',
  'practice.correctSentence': 'الجملة الصحيحة: {sentence}',
  'practice.retrievalTitle': 'استرجاع سريع',
  'practice.retrievalPrompt': 'قل أو اكتب بالألمانية: ',
  'practice.answerLabelRetrieval': 'جملتك بالألمانية',
  'practice.placeholderRetrieval': 'اكتب الجملة التي قالها Katzu…',
  'practice.ariaRetrieval': 'اكتب الجملة بالألمانية',
  'practice.listeningTitle': 'استمع وكرّر',
  'practice.listen': 'استمع',
  'practice.stopRecording': 'أوقف التسجيل',
  'practice.repeatVoice': 'كرّر بصوتك',
  'practice.voiceUnavailable': 'الإدخال الصوتي غير متاح في هذا المتصفح — اكتب ما سمعته.',
  'practice.ariaHeard': 'اكتب ما سمعته بالألمانية',
  'practice.placeholderHeard': 'اكتب ما سمعته…',
  'practice.hearing': 'أسمع',
  'practice.deep': 'تدريب أعمق على هذا المشهد (اختياري)',
  'practice.readiness': 'جاهزيتك لهذا الموقف',
  'practice.handled': '{done} من {total}',
  'practice.hint': 'بعدها تبدأ المحادثة الحقيقية — بالصوت أو بالكتابة.',
  'practice.ready': 'أنا جاهز',
  'practice.reassurance': 'هذا ليس تقييماً — إنه تمرين.',
  'practice.bankOrder': 'رتّب الكلمات',
  'practice.preparing': 'نُجهّز تدريب اليوم…',
  'practice.feedback.correct': 'صحيحة تماماً — هذه هي الجملة التي ستقولها هناك.',
  'practice.feedback.article':
    'الكلمة صحيحة، لكن أداة التعريف مختلفة. الأداة جزء من الكلمة في الألمانية — أعدها مع الأداة الصحيحة.',
  'practice.feedback.wrong': 'ليست المطلوبة بعد. انظر إلى الجملة الصحيحة ثم قلّدها مرة واحدة.',
  'practice.repeat.all': 'سمعنا كل الكلمات ({matched} من {total}).',
  'practice.repeat.partial': 'سمعنا {matched} من {total} كلمات — الباقي: {missed}.',
  'practice.repeat.none': 'لم نسمع كلمات واضحة هذه المرة. أعد المحاولة، أو اكتب ما سمعته.',
  'practice.listSeparator': '، ',
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

  'sub.title': 'Katzu Pro membership',
  'sub.headline': 'Unlock everything Pro gives you',
  'sub.statusLabel': 'Subscription status',
  'sub.statusPro': 'Pro active',
  'sub.statusFree': 'Free account',
  'sub.expiresOn': 'Your subscription ends on {date} — you can activate a new code at any time to add months.',
  'sub.noExpiry': 'Your subscription is active with no end date.',
  'sub.paymentNote':
    'Payment happens on the official sales page, then you activate the code here. No card details are ever stored in the app.',
  'sub.haveCode': 'Already bought a code? Activate it now',
  'sub.valueLine':
    'Unlimited AI conversations, with immediate correction of pronunciation and grammar at every level (A0 – B2).',
  'sub.feature.voice': 'Unlimited voice conversations with Katzu, powered by AI',
  'sub.feature.levels': 'Open the whole real-life path, from A0 to B2',
  'sub.feature.corrections': 'Grammar checked and corrected as you speak, explained in your language',
  'sub.feature.bank': 'A personal bank for reviewing your mistakes and fixing vocabulary',
  'sub.fairUse': 'We apply a fair-use limit that protects the service from abuse and does not touch ordinary daily use.',
  'sub.connectedAccount': 'Connected account:',
  'sub.noCodeQuestion': 'No activation code yet?',
  'sub.buyWithPrice':
    'Buy a code on the official sales page for {price} — card or crypto, and learners in Syria can pay locally (Syriatel Cash, MTN Cash, bank transfer). The code arrives straight away, then you activate it here.',
  'sub.buyWithoutPrice':
    'Buy a code on the official sales page — card or crypto, and learners in Syria can pay locally (Syriatel Cash, MTN Cash, bank transfer). The price is shown there, the code arrives straight away, then you activate it here.',
  'sub.buyCta': 'Buy an activation code',
  'sub.codeQuestion': 'Have an activation code? (example: DE-1M-…)',
  'sub.codeAria': 'Subscription activation code',
  'sub.activate': 'Activate',
  'sub.referralQuestion': 'A friend’s referral code? (optional)',
  'sub.referralAria': 'Referral code from a friend',
  'sub.referralSignIn': 'Sign in with Google first.',
  'sub.referralLinked':
    'Your account is linked to the referral ✓ your friend gets a month of Pro after your first subscription.',
  'sub.referralFailed': 'That referral code could not be applied.',
  'sub.link': 'Link',
  'sub.seePrices': 'No code yet? See the prices',
  'sub.tryMock': 'Try the B1 mock free — one conversation in three parts',
  'sub.continueFree': 'Continue with the free account',
  'sub.signInRequired': 'Sign in with a verified Google account before activating a code.',
  'sub.redeemed': 'Katzu Pro is active for {months} months. Congratulations 🎉',
  'sub.invalidCode': 'That activation code is not valid, or it has expired.',
  'sub.networkError': 'Could not reach the server. Check your internet connection.',

  'trial.unknown':
    'Your free conversations are counted on our servers — we could not refresh the balance just now. Review and everything you have learned stay free, with no limit.',
  'trial.exhausted': 'Your free conversations are used up. Review and everything you have learned stay free, with no limit.',
  'trial.remainingOne':
    'You have one free conversation left. Review and everything you have learned stay free, with no limit.',
  'trial.remaining':
    'You have {sessions} free conversations left. Review and everything you have learned stay free, with no limit.',

  'shell.noReportTitle': 'No saved report',
  'shell.noReportBody':
    'We could not find a finished conversation saved on this device — the page may have closed before the report was saved. Your review and the mistakes you recorded are still here.',
  'shell.startScene': 'Start a new scene',

  'journey.chapter.steps': 'First steps in Germany',
  'journey.chapter.daily': 'Daily life and getting around',
  'journey.chapter.work': 'Work and the office',
  'journey.chapter.study': 'University and official offices',
  'journey.chapter.independent': 'Independent in German',

  'journey.situation.livingInGermany': 'You already live in Germany',
  'journey.situation.arrived': 'You have just arrived',
  'journey.situation.exam': 'You have an exam coming',
  'journey.situation.work': 'You are preparing for work or an Ausbildung',
  'journey.situation.university': 'You are preparing to study',
  'journey.situation.travelling': 'You are on your way to Germany',

  'journey.reason.intro':
    'The first moment of the story — the arrivals hall at the airport, where every learner’s journey starts.',
  'journey.reason.reviewOne': 'One item is about to slip — fixing it now saves you relearning it.',
  'journey.reason.reviewMany':
    '{items} are about to slip — fixing them now is cheaper than relearning them.',
  'journey.reason.continue':
    'You started this scene and did not finish it — finishing it today is what makes it stick.',
  'journey.reason.weakSkill':
    'This is the weakest skill we have measured in you — a few minutes on it now changes your next result.',
  'journey.reason.new':
    'Your first time in this situation — easier than it looks, and you will not be left alone in it.',
  'journey.reason.noContent':
    'The content is not saved on this device yet — one connection is all it takes to download it.',

  'journey.reality.health': 'You will need these sentences at the clinic or the pharmacy',
  'journey.reality.housing': 'These are the exact questions the landlord will ask',
  'journey.reality.workExam': 'Close to the phrasing that turns up in a work exam',
  'journey.reality.work': 'A real conversation at work or in the interview',
  'journey.reality.travel': 'You will use these at the station when you need help',
  'journey.reality.official': 'This is the language you hear at official offices',
  'journey.reality.daily': 'An everyday situation these sentences keep coming back in',
  'journey.reality.exam':
    'Exam-style practice — not the official exam, but it measures the same thing',
  'journey.reality.study': 'The lesson and university language you need in your first week',
  'journey.reality.visa': 'Visa and residence questions, in the sentences you really hear at the embassy',
  'journey.reality.services': 'A call to a service provider — exactly what you need to book a slot',
  'journey.reality.trades': 'Workshop and repair language that solves every practical problem at home',
  'journey.reality.basics': 'The basics that come up every single day',
  'journey.reality.other': 'A real situation you will handle in German',

  'journey.katzu.offlineCached':
    'Offline right now — your mission is saved on this device and will work as it is.',
  'journey.katzu.offlineNoMission':
    'Offline, and no mission is saved yet. Your saved review works either way.',
  'journey.katzu.firstRun':
    'This is your first mission. Let us start with something you will really face in Germany.',
  'journey.katzu.afterBreak':
    'It has been {days} days. Let us start with something you know — no pressure, no comparison.',
  'journey.katzu.allCaughtUp':
    'Nothing is waiting for you today: you finished what you had and your review is clean.',
  'journey.katzu.review': 'Before anything new: you have something worth fixing first.',
  'journey.katzu.continue':
    'The half-finished scene is ready — the second half goes faster than you expect.',

  'story.situation.returning':
    'This scene is back in your mission box: you are in {location}, and the conversation is waiting about where you left it.',
  'story.situation.named':
    '{name}, you are in {location}. {who} comes up to you and opens in German.',
  'story.situation.plain': 'You are in {location}. {who} comes up to you and opens in German.',
  'story.task':
    'You will talk to {who} and produce your own sentences — in German, spoken or typed.',
  'story.katzu.roleWithName': 'I am Katzu, right here with you. ',
  'story.katzu.roleGeneric': 'I am Katzu, with you on this journey. ',
  'story.katzu.returning': 'We do not need to remember everything — we listen first, then you speak.',
  'story.katzu.preparing':
    '{vocative}{role}We will rehearse this situation before you stand in it for real — no pressure, no judgement.',
  'story.katzu.arrived':
    '{vocative}{role}You have just arrived, so let us start with the first situation you will meet here.',
  'story.katzu.default':
    '{vocative}{role}Listen to the first sentence once or twice, then you speak — I will correct you {correctionLanguage} afterwards.',

  'story.role.border': 'the airport passport officer',
  'story.role.cafe': 'the café server',
  'story.role.baker': 'the baker',
  'story.role.doctor': 'the doctor',
  'story.role.landlord': 'the landlord',
  'story.role.hiring': 'the hiring manager',
  'story.role.station': 'the station information clerk',
  'story.role.official': 'the official at the public office',
  'story.role.examiner': 'the examiner in the mock exam',
  'story.role.teacher': 'the teacher on your language course',
  'story.role.visa': 'the visa officer',
  'story.role.tradesperson': 'a tradesperson or repair technician',
  'story.role.neighbour': 'your neighbour',
  'story.role.colleague': 'your colleague at work',
  'story.role.other': 'a German speaker in this situation',

  'capability.state.NOT_STARTED': 'Not started',
  'capability.state.INTRODUCED': 'Introduced',
  'capability.state.PRACTISING': 'Practising',
  'capability.state.INDEPENDENT': 'Independent',
  'capability.state.RETAINED': 'Retained',
  'capability.description.NOT_STARTED': 'You have not opened this scene yet.',
  'capability.description.INTRODUCED':
    'You studied the words and phrases, but have not produced a sentence yet.',
  'capability.description.PRACTISING':
    'You have practised it (quiz or conversation) and it still needs fixing.',
  'capability.description.INDEPENDENT':
    'You finished a whole conversation with no hints and a good score.',
  'capability.description.RETAINED':
    'You succeeded again after a scheduled review — the knowledge stayed.',
  'capability.canDo.retained':
    'You can handle “{title}” with confidence, and we have locked it in with review.',
  'capability.canDo.independent': 'You can handle “{title}” in German without help.',
  'capability.canDo.practising': 'You are practising “{title}” — it is not independent yet.',
  'capability.canDo.introduced': 'You have met “{title}” and are still at the beginning.',
  'capability.canDo.notStarted': 'You have not started “{title}” yet.',

  'daily.scenario.label': 'One scene conversation',
  'daily.scenario.action': 'Start a conversation',
  'daily.scenario.hint': 'One full scene session — practice or a real conversation.',
  'daily.grammar.label': 'One grammar step',
  'daily.grammar.action': 'Open the rule',
  'daily.grammar.hint': 'One grammar lesson on your open path.',
  'daily.review.label': 'One review batch',
  'daily.review.action': 'Start the review',
  'daily.review.hint': 'Review what is due — {size} items or until today’s queue is empty.',

  'home.dayChapter': 'Day {day} · chapter {index} of {count}',
  'home.scenesOf': '{done} of {total} scenes',
  'home.scenesWord': 'scenes',
  'home.preferencesTitle': 'Finish your preferences (30 seconds)',
  'home.preferencesBody': 'Your goal and your time make today’s mission sharper',
  'home.dismissBanner': 'Dismiss this notice',
  'home.badge.arrival': 'Arrival · the first moment of the story',
  'home.badge.review': 'Today’s review · {items}',
  'home.badge.reviewQuick': 'Quick review',
  'home.badge.nextScene': 'The next scene',
  'home.badge.continue': 'Finish an open scene',
  'home.badge.weakSkill': 'Practice on your weakest skill',
  'home.badge.daily': 'Today’s mission',
  'home.badge.new': 'A new scene',
  'home.badge.waiting': 'Waiting for content',
  'home.reviewToday': 'Today’s review',
  'home.missionPreparing': 'Today’s mission is being prepared',
  'home.levelNote': 'This mission runs at {level} — the level the free plan serves.',
  'home.ctaContinue': 'Continue learning',
  'home.reviewRow': 'Quick review · {items} · {minutes}',
  'home.more': 'More',
  'home.reviewDue': 'Review due: {count}',
  'home.capabilityEarned': 'Earned · {label}',
  'home.capabilityLine': 'You can handle “{title}” in German without help.',
  'home.chapterGoalTitle': 'Your goal for this chapter',
  'home.chapterGoalBody':
    'Finish this chapter’s scenes to handle its situation in German without help.',
  'home.renew': 'Renew the subscription',
  'home.weeklyTitle': 'Your week in Katzu',
  'home.weeklyTop': 'Scene you visited most:',
  'home.grammarChip': 'Grammar',
  'home.libraryChip': 'All scenes and levels',
  'home.levelChip': 'Level {level}',

  'daily.panelTitle': 'Today’s tasks',
  'daily.streakLine': '{streak} in a row on your daily tasks',
  'daily.streakForgiving': ' — one missed day forgiven',
  'daily.allDone':
    'All three of today’s tasks are done — tomorrow your daily step renews to lock in what you practised.',
  'daily.doneAria': '{label} — done',
  'daily.more': 'More',

  'more.title': 'More',
  'more.learn': 'Keep learning',
  'more.library': 'All scenes and levels',
  'more.libraryHint': 'Every situation, ordered by level',
  'more.grammar': 'Grammar',
  'more.grammarHint': 'One rule at a time, with a short drill',
  'more.listening': 'Listening',
  'more.listeningHint': 'Practise understanding spoken German',
  'more.writing': 'Writing',
  'more.writingHint': 'Write short lines and get them corrected',
  'more.coach': 'Coach',
  'more.coachHint': 'Ask anything about German',
  'more.reviewSection': 'Review',
  'more.reviewLabel': 'Review due: {count}',
  'more.reviewHint': 'The cards are on your device and work offline',
  'more.progressSection': 'Your progress',
  'more.levelLine': 'Your current level',
  'more.accountSection': 'Your account and plan',
  'more.proActive': 'Pro is active — every level, unlimited sessions.',
  'more.managePlan': 'Manage subscription',
  'more.managePlanHint': 'Billing and renewal',
  'more.pro': 'Katzu Pro',
  'more.proHint': 'Opens the rest of the levels up to B2',
  'more.preferencesSection': 'Your preferences',
  'more.preferences': 'My preferences',
  'more.preferencesHint': 'Your goal, your time and your level — changing them changes today’s mission',
  'more.footer': 'Everything you have learned stays on your device.',

  'lock.title': 'This section opens after your first conversation',
  'lock.body': 'One short conversation is enough — after that everything here is open.',
  'lock.start': 'Start the first conversation',
  'lock.later': 'Later',

  'story.whyFallback': 'This is one of the situations you will really face in Germany.',
  'storySetup.missingTitle': 'We could not find this scene on this device yet.',
  'storySetup.stalled':
    'Preparing the scene took too long — the update may be stuck in another tab.',
  'storySetup.loading': 'Preparing the scene…',
  'storySetup.missingBody':
    'This scene may not have been downloaded to the device yet — you can carry on with another scene from your path.',
  'storySetup.retry': 'Try again',
  'storySetup.back': 'Go back',
  'storySetup.backAria': 'Go back',
  'storySetup.you': 'You: {name}',
  'storySetup.returned': 'You came back to this scene',
  'storySetup.why': 'Why today: ',
  'storySetup.taskLabel': 'Your task: ',
  'storySetup.listenAria': 'Listen to the first sentence',
  'storySetup.translating': 'Translating…',
  'storySetup.translateFailed': 'Translation failed — try again',
  'storySetup.offline': 'The live conversation needs a connection — you can practise now',
  'storySetup.hintDayZero': 'You listen first, then you speak — no test, no judgement.',
  'storySetup.hintReturning': 'Two short steps, then the conversation starts.',
  'storySetup.start': 'Start practising',
  'storySetup.notNow': 'Not now',

  'practice.backAria': 'Back to the story',
  'practice.title': 'Guided practice · {count} phrases',
  'practice.prepare': 'Warm up your tongue — then we talk',
  'practice.emptyTitle': 'No phrases for this scene are saved on your device yet.',
  'practice.emptyBody': 'You can go on to the conversation now; it needs an internet connection.',
  'practice.listenAria': 'Listen: {text}',
  'practice.grammarTitle': 'Today’s rule',
  'practice.grammarInstruction': 'Write in German what it means: ',
  'practice.answerLabelGrammar': 'Your answer for the rule, in German',
  'practice.placeholderGrammar': 'Write your sentence in German here…',
  'practice.ariaGrammar': 'Write the rule’s sentence in German',
  'practice.check': 'Check',
  'practice.showCorrect': 'Show me the right one',
  'practice.correctSentence': 'The right sentence: {sentence}',
  'practice.retrievalTitle': 'Quick recall',
  'practice.retrievalPrompt': 'Say or write it in German: ',
  'practice.answerLabelRetrieval': 'Your sentence in German',
  'practice.placeholderRetrieval': 'Write the sentence Katzu said…',
  'practice.ariaRetrieval': 'Write the sentence in German',
  'practice.listeningTitle': 'Listen and repeat',
  'practice.listen': 'Listen',
  'practice.stopRecording': 'Stop recording',
  'practice.repeatVoice': 'Repeat out loud',
  'practice.voiceUnavailable': 'Voice input is not available in this browser — type what you heard.',
  'practice.ariaHeard': 'Write what you heard in German',
  'practice.placeholderHeard': 'Write what you heard…',
  'practice.hearing': 'I hear',
  'practice.deep': 'Deeper practice on this scene (optional)',
  'practice.readiness': 'Your readiness for this situation',
  'practice.handled': '{done} of {total}',
  'practice.hint': 'After that the real conversation starts — by voice or by typing.',
  'practice.ready': 'I am ready',
  'practice.reassurance': 'This is not a test — it is a rehearsal.',
  'practice.bankOrder': 'Put the words in order',
  'practice.preparing': 'Preparing today’s practice…',
  'practice.feedback.correct': 'Exactly right — this is the sentence you will say out there.',
  'practice.feedback.article':
    'The word is right, but the article is different. In German the article is part of the word — say it again with the right one.',
  'practice.feedback.wrong': 'Not the one yet. Look at the right sentence, then copy it once.',
  'practice.repeat.all': 'We heard every word ({matched} of {total}).',
  'practice.repeat.partial': 'We heard {matched} of {total} words — the rest: {missed}.',
  'practice.repeat.none': 'We did not hear clear words that time. Try again, or type what you heard.',
  'practice.listSeparator': ', ',
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

  'sub.title': 'Keanggotaan Katzu Pro',
  'sub.headline': 'Buka semua yang bisa kamu lakukan dengan Pro',
  'sub.statusLabel': 'Status langganan',
  'sub.statusPro': 'Pro aktif',
  'sub.statusFree': 'Akun gratis',
  'sub.expiresOn': 'Langgananmu berakhir pada {date} — kamu bisa mengaktifkan kode baru kapan saja untuk menambah bulan.',
  'sub.noExpiry': 'Langgananmu aktif tanpa tanggal berakhir.',
  'sub.paymentNote':
    'Pembayaran dilakukan di halaman penjualan resmi, lalu kode diaktifkan di sini. Tidak ada data kartu yang disimpan di aplikasi.',
  'sub.haveCode': 'Sudah beli kode? Aktifkan sekarang',
  'sub.valueLine':
    'Percakapan AI tanpa batas, dengan koreksi pengucapan dan tata bahasa saat itu juga untuk semua level (A0 – B2).',
  'sub.feature.voice': 'Percakapan suara tanpa batas dengan Katzu, bertenaga AI',
  'sub.feature.levels': 'Buka seluruh jalur situasi nyata, dari A0 sampai B2',
  'sub.feature.corrections': 'Tata bahasa dianalisis dan dikoreksi langsung, dijelaskan dalam bahasamu',
  'sub.feature.bank': 'Bank pribadi untuk mengulas kesalahan dan menguatkan kosakata',
  'sub.fairUse': 'Kami menerapkan batas wajar yang melindungi layanan dari penyalahgunaan, tanpa mengganggu pemakaian harian.',
  'sub.connectedAccount': 'Akun terhubung:',
  'sub.noCodeQuestion': 'Belum punya kode aktivasi?',
  'sub.buyWithPrice':
    'Beli kode di halaman penjualan resmi seharga {price} — kartu atau kripto, dan untuk yang tinggal di Suriah ada pembayaran lokal (Syriatel Cash, MTN Cash, transfer bank). Kode langsung dikirim, lalu kamu aktifkan di sini.',
  'sub.buyWithoutPrice':
    'Beli kode di halaman penjualan resmi — kartu atau kripto, dan untuk yang tinggal di Suriah ada pembayaran lokal (Syriatel Cash, MTN Cash, transfer bank). Harga tampil di sana, kode langsung dikirim, lalu kamu aktifkan di sini.',
  'sub.buyCta': 'Beli kode aktivasi',
  'sub.codeQuestion': 'Punya kode aktivasi? (contoh: DE-1M-…)',
  'sub.codeAria': 'Kode aktivasi langganan',
  'sub.activate': 'Aktifkan',
  'sub.referralQuestion': 'Kode rujukan dari teman? (opsional)',
  'sub.referralAria': 'Kode rujukan dari teman',
  'sub.referralSignIn': 'Masuk dengan Google dulu.',
  'sub.referralLinked':
    'Akunmu sudah terhubung ke kode rujukan ✓ temanmu mendapat satu bulan Pro setelah langganan pertamamu.',
  'sub.referralFailed': 'Kode rujukan tidak bisa diterapkan.',
  'sub.link': 'Hubungkan',
  'sub.seePrices': 'Belum punya kode? Lihat harga',
  'sub.tryMock': 'Coba simulasi B1 gratis — satu percakapan dalam tiga bagian',
  'sub.continueFree': 'Lanjut dengan akun gratis',
  'sub.signInRequired': 'Masuk dengan akun Google terverifikasi dulu sebelum mengaktifkan kode.',
  'sub.redeemed': 'Langganan Katzu Pro aktif untuk {months} bulan. Selamat 🎉',
  'sub.invalidCode': 'Kode aktivasi ini tidak berlaku atau sudah kedaluwarsa.',
  'sub.networkError': 'Gagal menghubungi server. Periksa koneksi internetmu.',

  'trial.unknown':
    'Saldo percakapan gratis dihitung di server kami — kami tidak bisa memperbaruinya sekarang. Ulasan dan semua yang sudah kamu pelajari tetap gratis, tanpa batas.',
  'trial.exhausted': 'Percakapan gratismu sudah habis. Ulasan dan semua yang sudah kamu pelajari tetap gratis, tanpa batas.',
  'trial.remainingOne':
    'Kamu punya satu percakapan gratis tersisa. Ulasan dan semua yang sudah kamu pelajari tetap gratis, tanpa batas.',
  'trial.remaining':
    'Kamu punya {sessions} percakapan gratis tersisa. Ulasan dan semua yang sudah kamu pelajari tetap gratis, tanpa batas.',

  'shell.noReportTitle': 'Tidak ada laporan tersimpan',
  'shell.noReportBody':
    'Kami tidak menemukan percakapan selesai yang tersimpan di perangkat ini — halaman mungkin tertutup sebelum laporan disimpan. Ulasan dan kesalahan yang kamu catat masih ada di sini.',
  'shell.startScene': 'Mulai adegan baru',

  'journey.chapter.steps': 'Langkah pertama di Jerman',
  'journey.chapter.daily': 'Kehidupan sehari-hari dan transportasi',
  'journey.chapter.work': 'Kerja dan kantor',
  'journey.chapter.study': 'Universitas dan instansi resmi',
  'journey.chapter.independent': 'Mandiri dalam bahasa Jerman',

  'journey.situation.livingInGermany': 'Kamu sudah tinggal di Jerman',
  'journey.situation.arrived': 'Kamu baru tiba',
  'journey.situation.exam': 'Kamu punya ujian mendatang',
  'journey.situation.work': 'Kamu bersiap untuk kerja atau Ausbildung',
  'journey.situation.university': 'Kamu bersiap untuk studi',
  'journey.situation.travelling': 'Kamu sedang dalam perjalanan ke Jerman',

  'journey.reason.intro':
    'Momen pertama dalam cerita — aula kedatangan di bandara, tempat perjalanan setiap pelajar dimulai.',
  'journey.reason.reviewOne':
    'Satu item hampir terlupa — menstabilkannya sekarang menghemat waktu belajarmu nanti.',
  'journey.reason.reviewMany':
    '{items} hampir terlupa — menstabilkannya sekarang lebih murah daripada mempelajarinya ulang.',
  'journey.reason.continue':
    'Kamu sudah mulai adegan ini dan belum menyelesaikannya — menyelesaikannya hari ini yang membuatnya melekat.',
  'journey.reason.weakSkill':
    'Ini keterampilan paling lemah yang kami ukur darimu — beberapa menit sekarang mengubah hasilmu berikutnya.',
  'journey.reason.new':
    'Pertama kali kamu menghadapi situasi ini — lebih mudah dari kelihatannya, dan kamu tidak akan ditinggal sendiri.',
  'journey.reason.noContent':
    'Materi belum tersimpan di perangkat ini — cukup satu koneksi untuk mengunduhnya.',

  'journey.reality.health': 'Kamu akan butuh kalimat ini di klinik atau apotek',
  'journey.reality.housing': 'Ini persis pertanyaan yang akan diajukan pemilik tempat tinggal',
  'journey.reality.workExam': 'Mirip dengan frasa yang muncul di ujian kerja',
  'journey.reality.work': 'Percakapan nyata di tempat kerja atau wawancara',
  'journey.reality.travel': 'Kamu akan memakainya di stasiun saat butuh bantuan',
  'journey.reality.official': 'Ini bahasa yang kamu dengar di instansi resmi',
  'journey.reality.daily': 'Situasi sehari-hari yang membuat kalimat ini terus muncul',
  'journey.reality.exam':
    'Latihan gaya ujian — bukan ujian resmi, tapi mengukur hal yang sama',
  'journey.reality.study': 'Bahasa kuliah dan universitas yang kamu butuhkan di minggu pertama',
  'journey.reality.visa': 'Pertanyaan visa dan izin tinggal, dengan kalimat yang benar-benar kamu dengar di kedutaan',
  'journey.reality.services': 'Telepon ke penyedia layanan — persis yang kamu butuhkan untuk memesan jadwal',
  'journey.reality.trades': 'Bahasa bengkel dan perbaikan yang menyelesaikan setiap masalah teknis di rumah',
  'journey.reality.basics': 'Dasar-dasar yang muncul setiap hari',
  'journey.reality.other': 'Situasi nyata yang akan kamu hadapi dalam bahasa Jerman',

  'journey.katzu.offlineCached':
    'Sedang offline — misimu tersimpan di perangkat ini dan tetap berjalan apa adanya.',
  'journey.katzu.offlineNoMission':
    'Offline, dan belum ada misi yang tersimpan. Ulasan yang tersimpan tetap berjalan.',
  'journey.katzu.firstRun':
    'Ini misi pertamamu. Mari mulai dengan sesuatu yang benar-benar kamu hadapi di Jerman.',
  'journey.katzu.afterBreak':
    'Sudah {days} hari. Mari mulai dari sesuatu yang kamu kenal — tanpa tekanan, tanpa perbandingan.',
  'journey.katzu.allCaughtUp':
    'Tidak ada yang menunggu hari ini: kamu sudah menyelesaikan semuanya dan ulasanmu bersih.',
  'journey.katzu.review': 'Sebelum hal baru: ada yang layak distabilkan dulu.',
  'journey.katzu.continue':
    'Adegan yang setengah jalan sudah siap — paruh keduanya lebih cepat dari dugaanmu.',

  'story.situation.returning':
    'Adegan ini kembali ke kotak misimu: kamu sekarang di {location}, dan percakapannya menunggu hampir dari tempat kamu berhenti.',
  'story.situation.named':
    '{name}, kamu sekarang di {location}. {who} menghampirimu dan membuka percakapan dalam bahasa Jerman.',
  'story.situation.plain':
    'Kamu sekarang di {location}. {who} menghampirimu dan membuka percakapan dalam bahasa Jerman.',
  'story.task':
    'Kamu akan berbicara dengan {who} dan menyusun kalimatmu sendiri — dalam bahasa Jerman, dengan suara atau tulisan.',
  'story.katzu.roleWithName': 'Aku Katzu, temanmu di sini. ',
  'story.katzu.roleGeneric': 'Aku Katzu, temanmu dalam perjalanan ini. ',
  'story.katzu.returning': 'Kita tidak perlu mengingat semuanya — kita dengarkan dulu, lalu kamu bicara.',
  'story.katzu.preparing':
    '{vocative}{role}Kita akan melatih situasi ini sebelum kamu benar-benar mengalaminya — tanpa tekanan, tanpa penilaian.',
  'story.katzu.arrived':
    '{vocative}{role}Kamu baru tiba, jadi mari mulai dari situasi pertama yang akan kamu temui di sini.',
  'story.katzu.default':
    '{vocative}{role}Dengarkan kalimat pertama sekali atau dua kali, lalu kamu bicara — aku akan mengoreksimu {correctionLanguage} setelahnya.',

  'story.role.border': 'petugas paspor bandara',
  'story.role.cafe': 'pelayan kafe',
  'story.role.baker': 'tukang roti',
  'story.role.doctor': 'dokter',
  'story.role.landlord': 'pemilik tempat tinggal',
  'story.role.hiring': 'manajer perekrutan',
  'story.role.station': 'petugas informasi stasiun',
  'story.role.official': 'petugas di kantor resmi',
  'story.role.examiner': 'penguji dalam ujian simulasi',
  'story.role.teacher': 'pengajar di kursus bahasamu',
  'story.role.visa': 'petugas urusan visa',
  'story.role.tradesperson': 'tukang atau teknisi perbaikan',
  'story.role.neighbour': 'tetanggamu',
  'story.role.colleague': 'rekan kerjamu',
  'story.role.other': 'orang Jerman dalam situasi ini',

  'capability.state.NOT_STARTED': 'Belum dimulai',
  'capability.state.INTRODUCED': 'Sudah dikenali',
  'capability.state.PRACTISING': 'Sedang dilatih',
  'capability.state.INDEPENDENT': 'Mandiri',
  'capability.state.RETAINED': 'Melekat di ingatan',
  'capability.description.NOT_STARTED': 'Kamu belum membuka adegan ini.',
  'capability.description.INTRODUCED':
    'Kamu sudah mempelajari kata dan frasanya, tapi belum menghasilkan kalimat.',
  'capability.description.PRACTISING':
    'Kamu sudah melatihnya (kuis atau percakapan) dan masih perlu distabilkan.',
  'capability.description.INDEPENDENT':
    'Kamu menyelesaikan percakapan penuh tanpa petunjuk dengan hasil yang baik.',
  'capability.description.RETAINED':
    'Kamu berhasil lagi setelah ulasan terjadwal — pengetahuannya bertahan.',
  'capability.canDo.retained':
    'Kamu bisa menangani “{title}” dengan percaya diri, dan kami sudah menstabilkannya lewat ulasan.',
  'capability.canDo.independent': 'Kamu bisa menangani “{title}” dalam bahasa Jerman tanpa bantuan.',
  'capability.canDo.practising': 'Kamu sedang melatih “{title}” — belum mandiri.',
  'capability.canDo.introduced': 'Kamu sudah mengenal “{title}” dan masih di awal.',
  'capability.canDo.notStarted': 'Kamu belum memulai “{title}”.',

  'daily.scenario.label': 'Satu percakapan adegan',
  'daily.scenario.action': 'Mulai percakapan',
  'daily.scenario.hint': 'Satu sesi adegan penuh — latihan atau percakapan nyata.',
  'daily.grammar.label': 'Satu langkah tata bahasa',
  'daily.grammar.action': 'Buka aturannya',
  'daily.grammar.hint': 'Satu pelajaran tata bahasa di jalur yang terbuka.',
  'daily.review.label': 'Satu batch ulasan',
  'daily.review.action': 'Mulai ulasan',
  'daily.review.hint': 'Ulas yang sudah waktunya — {size} item atau sampai antrean hari ini kosong.',

  'home.dayChapter': 'Hari {day} · Bab {index} dari {count}',
  'home.scenesOf': '{done} dari {total} adegan',
  'home.scenesWord': 'adegan',
  'home.preferencesTitle': 'Lengkapi preferensimu (30 detik)',
  'home.preferencesBody': 'Tujuan dan waktumu membuat misi hari ini lebih tepat',
  'home.dismissBanner': 'Sembunyikan pemberitahuan ini',
  'home.badge.arrival': 'Momen kedatangan · situasi pertama dalam cerita',
  'home.badge.review': 'Ulasan hari ini · {items}',
  'home.badge.reviewQuick': 'Ulasan singkat',
  'home.badge.nextScene': 'Adegan berikutnya',
  'home.badge.continue': 'Selesaikan adegan yang terbuka',
  'home.badge.weakSkill': 'Latihan keterampilan terlemah',
  'home.badge.daily': 'Misi hari ini',
  'home.badge.new': 'Adegan baru',
  'home.badge.waiting': 'Menunggu materi',
  'home.reviewToday': 'Ulasan hari ini',
  'home.missionPreparing': 'Misi harianmu sedang disiapkan',
  'home.levelNote': 'Misi ini berjalan di level {level} — level yang tersedia di paket gratis.',
  'home.ctaContinue': 'Lanjut belajar',
  'home.reviewRow': 'Ulasan singkat · {items} · {minutes}',
  'home.more': 'Lainnya',
  'home.reviewDue': 'Ulasan jatuh tempo: {count}',
  'home.capabilityEarned': 'Kemampuan tercapai · {label}',
  'home.capabilityLine': 'Kamu bisa menangani “{title}” dalam bahasa Jerman tanpa bantuan.',
  'home.chapterGoalTitle': 'Tujuanmu di bab ini',
  'home.chapterGoalBody':
    'Selesaikan adegan di bab ini supaya kamu bisa menangani situasinya dalam bahasa Jerman tanpa bantuan.',
  'home.renew': 'Perpanjang langganan',
  'home.weeklyTitle': 'Pekanmu di Katzu',
  'home.weeklyTop': 'Adegan yang paling sering kamu buka:',
  'home.grammarChip': 'Tata bahasa',
  'home.libraryChip': 'Semua adegan dan level',
  'home.levelChip': 'Level {level}',

  'daily.panelTitle': 'Tugas hari ini',
  'daily.streakLine': '{streak} berturut-turut di tugas harianmu',
  'daily.streakForgiving': ' — satu hari terlewat dimaafkan',
  'daily.allDone':
    'Ketiga tugas hari ini selesai — besok langkah harianmu diperbarui untuk menguatkan yang sudah kamu latih.',
  'daily.doneAria': '{label} — selesai',
  'daily.more': 'Lainnya',

  'more.title': 'Lainnya',
  'more.learn': 'Lanjut belajar',
  'more.library': 'Semua adegan dan level',
  'more.libraryHint': 'Semua situasi, diurutkan menurut level',
  'more.grammar': 'Tata bahasa',
  'more.grammarHint': 'Satu aturan setiap kali, dengan latihan singkat',
  'more.listening': 'Menyimak',
  'more.listeningHint': 'Latih pemahaman bahasa Jerman lisan',
  'more.writing': 'Menulis',
  'more.writingHint': 'Tulis baris pendek dan dapatkan koreksinya',
  'more.coach': 'Pelatih',
  'more.coachHint': 'Tanya apa saja tentang bahasa Jerman',
  'more.reviewSection': 'Ulasan',
  'more.reviewLabel': 'Ulasan jatuh tempo: {count}',
  'more.reviewHint': 'Kartunya ada di perangkatmu dan berjalan offline',
  'more.progressSection': 'Kemajuanmu',
  'more.levelLine': 'Levelmu sekarang',
  'more.accountSection': 'Akun dan paketmu',
  'more.proActive': 'Pro aktif — semua level, sesi tanpa batas.',
  'more.managePlan': 'Kelola langganan',
  'more.managePlanHint': 'Tagihan dan perpanjangan',
  'more.pro': 'Katzu Pro',
  'more.proHint': 'Membuka level sisanya sampai B2',
  'more.preferencesSection': 'Preferensimu',
  'more.preferences': 'Preferensiku',
  'more.preferencesHint': 'Tujuan, waktu, dan levelmu — mengubahnya mengubah misi hari ini',
  'more.footer': 'Semua yang sudah kamu pelajari tetap di perangkatmu.',

  'lock.title': 'Bagian ini terbuka setelah percakapan pertamamu',
  'lock.body': 'Satu percakapan singkat sudah cukup — setelah itu semua di sini terbuka.',
  'lock.start': 'Mulai percakapan pertama',
  'lock.later': 'Nanti',

  'story.whyFallback': 'Ini salah satu situasi yang benar-benar akan kamu hadapi di Jerman.',
  'storySetup.missingTitle': 'Kami belum menemukan adegan ini di perangkatmu.',
  'storySetup.stalled':
    'Adegan terlalu lama disiapkan — mungkin pembaruan tersendat di tab lain.',
  'storySetup.loading': 'Menyiapkan adegan…',
  'storySetup.missingBody':
    'Adegan ini mungkin belum diunduh ke perangkat — kamu bisa lanjut dengan adegan lain dari jalurmu.',
  'storySetup.retry': 'Coba lagi',
  'storySetup.back': 'Kembali',
  'storySetup.backAria': 'Kembali',
  'storySetup.you': 'Kamu: {name}',
  'storySetup.returned': 'Kamu kembali ke adegan ini',
  'storySetup.why': 'Kenapa hari ini: ',
  'storySetup.taskLabel': 'Tugasmu: ',
  'storySetup.listenAria': 'Dengarkan kalimat pertama',
  'storySetup.translating': 'Menerjemahkan…',
  'storySetup.translateFailed': 'Terjemahan gagal — coba lagi',
  'storySetup.offline': 'Percakapan langsung butuh koneksi — kamu bisa berlatih sekarang',
  'storySetup.hintDayZero': 'Kamu mendengarkan dulu, lalu bicara — tanpa tes, tanpa penilaian.',
  'storySetup.hintReturning': 'Dua langkah singkat, lalu percakapan dimulai.',
  'storySetup.start': 'Mulai berlatih',
  'storySetup.notNow': 'Jangan sekarang',

  'practice.backAria': 'Kembali ke cerita',
  'practice.title': 'Latihan terbimbing · {count} frasa',
  'practice.prepare': 'Siapkan lidahmu — lalu kita bicara',
  'practice.emptyTitle': 'Belum ada frasa untuk adegan ini yang tersimpan di perangkatmu.',
  'practice.emptyBody': 'Kamu bisa lanjut ke percakapan sekarang; itu butuh koneksi internet.',
  'practice.listenAria': 'Dengarkan: {text}',
  'practice.grammarTitle': 'Aturan hari ini',
  'practice.grammarInstruction': 'Tulis dalam bahasa Jerman apa artinya: ',
  'practice.answerLabelGrammar': 'Jawabanmu untuk aturan ini, dalam bahasa Jerman',
  'practice.placeholderGrammar': 'Tulis kalimatmu dalam bahasa Jerman di sini…',
  'practice.ariaGrammar': 'Tulis kalimat aturan dalam bahasa Jerman',
  'practice.check': 'Periksa',
  'practice.showCorrect': 'Tunjukkan yang benar',
  'practice.correctSentence': 'Kalimat yang benar: {sentence}',
  'practice.retrievalTitle': 'Ingat cepat',
  'practice.retrievalPrompt': 'Ucapkan atau tulis dalam bahasa Jerman: ',
  'practice.answerLabelRetrieval': 'Kalimatmu dalam bahasa Jerman',
  'practice.placeholderRetrieval': 'Tulis kalimat yang diucapkan Katzu…',
  'practice.ariaRetrieval': 'Tulis kalimat dalam bahasa Jerman',
  'practice.listeningTitle': 'Dengarkan dan ulangi',
  'practice.listen': 'Dengarkan',
  'practice.stopRecording': 'Hentikan rekaman',
  'practice.repeatVoice': 'Ulangi dengan suaramu',
  'practice.voiceUnavailable': 'Input suara tidak tersedia di peramban ini — tulis apa yang kamu dengar.',
  'practice.ariaHeard': 'Tulis apa yang kamu dengar dalam bahasa Jerman',
  'practice.placeholderHeard': 'Tulis apa yang kamu dengar…',
  'practice.hearing': 'Aku dengar',
  'practice.deep': 'Latihan lebih dalam untuk adegan ini (opsional)',
  'practice.readiness': 'Kesiapanmu untuk situasi ini',
  'practice.handled': '{done} dari {total}',
  'practice.hint': 'Setelah itu percakapan sebenarnya dimulai — dengan suara atau tulisan.',
  'practice.ready': 'Aku siap',
  'practice.reassurance': 'Ini bukan penilaian — ini latihan.',
  'practice.bankOrder': 'Susun kata-katanya',
  'practice.preparing': 'Menyiapkan latihan hari ini…',
  'practice.feedback.correct': 'Tepat sekali — inilah kalimat yang akan kamu ucapkan di sana.',
  'practice.feedback.article':
    'Katanya benar, tapi artikelnya berbeda. Dalam bahasa Jerman artikel adalah bagian dari kata — ulangi dengan artikel yang benar.',
  'practice.feedback.wrong': 'Belum yang diminta. Lihat kalimat yang benar, lalu tirukan sekali.',
  'practice.repeat.all': 'Kami mendengar semua kata ({matched} dari {total}).',
  'practice.repeat.partial': 'Kami mendengar {matched} dari {total} kata — sisanya: {missed}.',
  'practice.repeat.none': 'Kami tidak mendengar kata yang jelas kali ini. Coba lagi, atau tulis apa yang kamu dengar.',
  'practice.listSeparator': ', ',
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
