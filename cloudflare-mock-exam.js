/**
 * The free B1 Sprechen mock — the exam's words, in one place.
 *
 * WHY A MODULE
 * The three parts, their briefs and the examiner's behaviour are server-owned,
 * exactly like the price table and the scenario identity: a client that could
 * invent its own exam instructions could promise a learner a score the app never
 * computed. So the worker mints the brief (`mockExamBrief`) and the grader
 * prompt (`mockExamInstructionForPart`); the client renders what it is given and
 * never invents a rubric, a score or a pass mark.
 *
 * HONESTY RULES, pinned in tests
 *  - nothing here mentions Goethe, telc, ÖSD or any exam body;
 *  - no part claims a pass/fail threshold, because the app computes a practice
 *    estimate from the learner's own sentences, never an official grade;
 *  - the Arabic notice may never be omitted.
 *
 * THE TIMINGS ARE AN APPROXIMATION, not an official specification. They follow
 * the common shape of a B1 Sprechen (plan together · present a topic · react to
 * questions) at roughly five minutes each, and they live in one array so the
 * owner can change them without touching logic. UNPROVEN against any real exam
 * specification — confirm before selling the mock as preparation.
 */

/** The level this mock simulates. Never used to claim certification. */
export const MOCK_EXAM_LEVEL = 'B1';

/**
 * The scenario identity an exam turn runs under, overriding the scenario row.
 *
 * A scenario's own persona is server-authoritative for an ordinary turn (a café
 * server stays a café server). For an exam turn the server replaces it here,
 * because the persona belongs to the exam, not to the scene the conversation
 * engine borrows: without this the model is told it is a café server AND an
 * examiner in one prompt. Only a signed `/mock/start` grant reaches it.
 */
export const MOCK_EXAM_SCENARIO_TITLE = 'B1 Sprechen — Prüfungssimulation';

export const MOCK_EXAM_PERSONA =
  'a B1 speaking-exam partner who asks short exam-style questions, never grades and never claims to be an exam body';

/**
 * An exam turn runs at B1 whatever level the request asked for.
 *
 * The mock IS a B1 exam; letting the request decide would let a client run the
 * free mock as an A1 conversation and call the result a B1 estimate. It also
 * means exam turns never qualify as "easy" for cheap-model routing — the
 * flagship tier pays for the mock, which is the honest cost of a graded
 * conversation.
 */
export const MOCK_EXAM_FORCED_LEVEL = 'B1';

/** The one sentence that may never be dropped from any mock surface. */
export const MOCK_EXAM_NOTICE_AR =
  'محاكاة تدريب بأسلوب امتحان B1 — ليست الامتحان الرسمي ولا تمنح درجة معتمدة.';

/** Short form for tight spaces (headers, the paywall link). */
export const MOCK_EXAM_SHORT_AR = 'محاكاة B1';

/**
 * The three parts of a B1 Sprechen, in order.
 *
 * `seconds` is the practice budget for the part. The timer in the app warns at
 * zero and never blocks the learner: a mock that stops talking when the clock
 * runs out teaches nothing.
 */
export const MOCK_EXAM_PARTS = [
  {
    id: 'plan',
    index: 1,
    seconds: 300,
    titleAr: 'الجزء الأول: التخطيط مع شريك المحادثة',
    titleDe: 'Teil 1 — Gemeinsam planen',
    briefAr:
      'تخطّط مع شريك المحادثة: أخبره بما تنوي فعله، واتفقا معاً على التفاصيل. اذكر سبباً ووقته.',
    briefDe:
      'Planen Sie mit Ihrem Partner: Was möchten Sie machen? Einigen Sie sich auf die Details. Nennen Sie einen Grund und eine Zeit.',
    /** The examiner speaks first — this is the partner role. */
    openerDe: 'Guten Tag! Wir haben etwa fünf Minuten Zeit. Erzählen Sie mir bitte zuerst: Was möchten Sie gemeinsam planen?',
    openerAr: 'الآن لديك حوالي خمس دقائق. أخبرني أولاً: ماذا تريد أن تخطّطا معاً؟',
    /** How the AI must behave in this part. */
    instructionEn:
      'You are the speaking-partner in a B1 practice exam, PART 1 (planning together). You are NOT the examiner and you do NOT grade anything. Keep every reply to ONE short question (max 2 sentences), exactly as a partner planning with you would: ask who, where, when, why, how much, and confirm one detail they said. Never give feedback, never correct their German, never mention a score, never claim to be an exam body. Open the part with the given opener.',
  },
  {
    id: 'present',
    index: 2,
    seconds: 300,
    titleAr: 'الجزء الثاني: تقديم موضوع',
    titleDe: 'Teil 2 — Ein Thema präsentieren',
    briefAr:
      'قدّم الموضوع المعطى: أعطِ رأيك واشرح سبب رأيك، ثم ذكّر بشيء واحد تفعله عادةً في هذا الموضوع.',
    briefDe:
      'Präsentieren Sie das gegebene Thema: Geben Sie Ihre Meinung und begründen Sie sie. Nennen Sie außerdem etwas, was Sie dazu gewöhnlich tun.',
    openerDe: 'Bitte präsentieren Sie jetzt das Thema. Beginnen Sie ruhig — ich höre zu und stelle danach Fragen.',
    openerAr: 'قدّم الموضوع الآن بهدوء — سأستمع ثم أسأل أسئلة.',
    instructionEn:
      'You are an examiner in a B1 practice exam, PART 2 (presenting a topic). You do NOT grade and you never state a score or a pass/fail. Your own lines stay short: acknowledge the presentation in ONE short sentence, then ask ONE short follow-up question (max 2 sentences). Never correct their German mid-presentation, never summarise what they said as feedback, never mention any exam body. Open the part with the given opener.',
  },
  {
    id: 'react',
    index: 3,
    seconds: 300,
    titleAr: 'الجزء الثالث: التفاعل مع الأسئلة',
    titleDe: 'Teil 3 — Auf Fragen reagieren',
    briefAr:
      'أجب عن أسئلة الممتحِن، وبيّن رأيك بوضوح. إن لم تفهم سؤالاً فاطلب إعادة صياغته — هذا جزء طبيعي من الاختبار.',
    briefDe:
      'Antworten Sie auf die Fragen des Prüfers und sagen Sie klar Ihre Meinung. Wenn Sie eine Frage nicht verstehen, bitten Sie um Umformulierung — das gehört zur Aufgabe.',
    openerDe: 'Danke, Ihre Präsentation ist zu Ende. Jetzt stelle ich Ihnen einige Fragen.',
    openerAr: 'شكراً، انتهى تقديمك. الآن سأسألك بعض الأسئلة.',
    instructionEn:
      'You are an examiner in a B1 practice exam, PART 3 (reacting to questions). Ask ONE short question per turn (max 2 sentences), then wait. Stay on the topic. If the learner says they did not understand, repeat the question in simpler words. Never correct their German, never give a grade, never mention an exam body. Open the part with the given opener.',
  },
];

/**
 * B1 topics for the presentation part. Short enough to read on a phone, and
 * each one has a card the learner presents from — the same way a real exam hands
 * out a topic card.
 */
export const MOCK_EXAM_TOPICS = [
  {
    id: 'wohnen',
    titleDe: 'Wohnen in einer Großstadt',
    titleAr: 'السكن في مدينة كبيرة',
    cardDe:
      'Wohnen in einer Großstadt: Mieten oder kaufen? Wie ist das Leben in einer Stadt mit über einer Million Einwohnern?',
    cardAr: 'السكن في مدينة كبيرة: الإيجار أم الشراء؟ وكيف هي الحياة في مدينة يتجاوز عدد سكانها المليون؟',
  },
  {
    id: 'lernen',
    titleDe: 'Sprachen lernen',
    titleAr: 'تعلّم اللغات',
    cardDe:
      'Sprachen lernen: Wie lernt man am besten eine neue Sprache? Sollte man sie in jedem Alter lernen?',
    cardAr: 'تعلّم اللغات: ما أفضل طريقة لتعلّم لغة جديدة؟ وهل يجب تعلّمها في كل الأعمار؟',
  },
  {
    id: 'umwelt',
    titleDe: 'Umwelt und Alltag',
    titleAr: 'البيئة واليوم اليومي',
    cardDe:
      'Umwelt im Alltag: Was kann man selbst tun, um die Umwelt zu schonen? Sollten Unternehmen mehr tun?',
    cardAr: 'البيئة في الحياة اليومية: ما الذي يمكن للفرد فعله لحماية البيئة؟ وهل على الشركات أن تفعل المزيد؟',
  },
  {
    id: 'arbeit',
    titleDe: 'Arbeit und Lebenslauf',
    titleAr: 'العمل والمسار المهني',
    cardDe:
      'Arbeit: Wie wichtig ist der Beruf für ein gutes Leben? Was macht eine Arbeit gut?',
    cardAr: 'العمل: كم مهم أن تكون المهنة في حياة سعيدة؟ وما الذي يجعل العمل جيداً؟',
  },
  {
    id: 'freizeit',
    titleDe: 'Freizeit und Sport',
    titleAr: 'وقت الفراغ والرياضة',
    cardDe:
      'Freizeit: Was macht Menschen in der Freizeit glücklich? Sollte Sport im Alltag Pflicht sein?',
    cardAr: 'وقت الفراغ: ما الذي يجعل الناس سعداء في وقت فراغهم؟ وهل يجب أن تكون الرياضة جزءاً من الحياة اليومية؟',
  },
];



/**
 * One topic per account per day, stable within the day.
 *
 * `stableHash` is FNV-1a — the same cheap hash the price bucket uses. Rotating
 * once a day means a learner who practises tomorrow gets a different card
 * without the app needing to store anything, and a reload never changes the
 * topic mid-mock.
 */
export function mockTopicFor({ accountId = '', day = 0 } = {}) {
  const index = Math.abs(hashString(`mock:${accountId}:${Math.floor(Number(day) || 0)}`)) % MOCK_EXAM_TOPICS.length;
  return MOCK_EXAM_TOPICS[index];
}

function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The UTC day number, so every device on the same calendar day gets one topic. */
export function mockTopicDay(now = Date.now()) {
  return Math.floor(Number(now) / 86400000);
}

/**
 * The whole brief the app renders, minted by the server at `/mock/start`.
 *
 * Contains no score, no threshold and no exam-body name — only what the learner
 * will be asked to do and how long each part runs.
 */
export function mockExamBrief({ accountId = '', topic = null, now = Date.now() } = {}) {
  const chosen = topic || mockTopicFor({ accountId, day: mockTopicDay(now) });
  return {
    level: MOCK_EXAM_LEVEL,
    noticeAr: MOCK_EXAM_NOTICE_AR,
    unproven: true,
    topic: chosen,
    parts: MOCK_EXAM_PARTS.map((part) => ({
      id: part.id,
      index: part.index,
      seconds: part.seconds,
      titleAr: part.titleAr,
      titleDe: part.titleDe,
      briefAr: part.briefAr,
      briefDe: part.briefDe,
      openerDe: part.openerDe,
      openerAr: part.openerAr,
    })),
  };
}

/**
 * The part index a request is claiming, or null when it is not a part at all.
 * Out-of-range and non-numeric values fail closed: no part means no exam
 * instruction, so a bad value degrades to an ordinary conversation.
 */
export function normaliseMockPartIndex(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= MOCK_EXAM_PARTS.length) return null;
  return index;
}

/**
 * The examiner instruction for one part, or null when the part is unknown.
 *
 * Appended to the turn system instruction by `/ai/turn` when — and only when —
 * the request carries a grant the worker minted at `/mock/start`. A client
 * cannot reach this by sending a field: the grant is signed.
 */
export function mockExamInstructionForPart({ part } = {}) {
  const index = normaliseMockPartIndex(part);
  if (index === null) return null;
  const chosen = MOCK_EXAM_PARTS[index];
  const topic = MOCK_EXAM_TOPICS[index % MOCK_EXAM_TOPICS.length];
  const topicLine =
    chosen.id === 'present'
      ? `TOPIC CARD the learner presents from: "${chosen.cardDe}" (Arabic: ${chosen.cardAr}).`
      : `TOPIC under discussion: "${chosen.titleDe}" (Arabic: ${chosen.titleAr}).`;
  return [
    'EXAM MODE — this is a practice mock, not an official exam. Never state a grade, a percentage, a pass/fail or any exam-body name, and never claim certification.',
    `B1 SPEAKEN — PART ${chosen.index} of ${MOCK_EXAM_PARTS.length}: ${chosen.titleDe}. Time budget for this part: ${chosen.seconds} seconds.`,
    topicLine,
    `Part brief (Arabic, show it to the learner if they ask what to do): ${chosen.briefAr}`,
    `Your first line in this part must be, in German: ${chosen.openerDe}`,
    chosen.instructionEn,
  ].join(' ');
}