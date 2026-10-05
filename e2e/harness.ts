import { expect, type Page, type Route } from '@playwright/test';

/**
 * What these tests stand on.
 *
 * Three things would make a browser suite here either flaky or dishonest, so each
 * is handled explicitly rather than left to the environment:
 *
 *  1. **The backend.** Every request that is not the preview origin is answered
 *     from a canned map. The app must therefore work off its own local content and
 *     state, which is exactly how it behaves offline.
 *  2. **Sign-in.** Google Identity Services cannot be driven headlessly, so a
 *     signed-in `users` row is written straight into the Dexie database the app
 *     itself created. The app then boots through its real authenticated route.
 *  3. **Speech.** The app records with `MediaRecorder` and recognises on the
 *     worker, so the suite stubs two things and no more: a `getUserMedia` stream
 *     whose tone the test can switch on and off (that is what moves the orb's
 *     analyser, and therefore what the app's own endpointing reads), and a
 *     `MediaRecorder` that emits chunks on a timer. Everything the app decides
 *     with them — when to stop, whether a recording is too short, whether a
 *     transcript is usable, when to send the turn — runs for real.
 *
 *     Why the recorder is stubbed rather than real: the audio bytes never leave
 *     this process (the worker is mocked), so a real encoder would add a codec to
 *     the suite without adding a fact. The real container meeting the real model
 *     is verified against the deployed worker by `scripts/verify-stt-live.mjs`,
 *     which is the only place that check can honestly live.
 */

/**
 * What "the learner is audible" means to this harness.
 *
 * The app decides "the learner spoke" when its smoothed RMS crosses
 * `VOICE_ACTIVITY_THRESHOLD` (0.11, `src/lib/audio/useMicLevel.ts`). `AUDIBLE_RMS`
 * is the same signal measured one node earlier in the same graph, so it is
 * deliberately in the same order of magnitude rather than an exact copy.
 * `SPEECH_HOLD_MS` mirrors the app's own `MIN_RECORDING_MS` (400 ms) — the floor
 * below which the app refuses to send a recording at all — and
 * `SPEECH_CEILING_MS` bounds the wait so a stream that never becomes audible
 * cannot hang a test.
 */
const AUDIBLE_RMS = 0.05;
const SPEECH_HOLD_MS = 400;
const SPEECH_CEILING_MS = 1500;

/**
 * Extra time the scripted recogniser waits for the live caption to appear.
 *
 * `interimHoldMs` (the `holdMs` a test asks for) is the floor: the interim must
 * survive at least that long, because that is how long `say()` takes to raise the
 * scripted microphone level. This grace is the ceiling on top of it — the engine
 * waits this much longer when the caption still is not in the DOM, which happens
 * when a loaded runner batches the interim and the final into one render.
 */
const INTERIM_GRACE_MS = 1000;

/** The orb's accessible name while the app is recording. */
const RECORDING_ACTION = /إيقاف التسجيل/;

export interface ScriptedTurn {
  reply_de: string;
  reply_ar: string;
  is_correct: boolean;
  original_mistake?: string;
  corrected_german?: string;
  grammar_rule?: string;
  explanation_ar?: string;
  /** The on-demand suggestion the turn carries (the dock's 💡 pill). */
  hints?: Array<{ german: string; translation_ar: string }>;
}

/** A well-formed `/ai/turn` payload: the client rejects a reply it cannot parse. */
export function turn(overrides: Partial<ScriptedTurn> = {}): ScriptedTurn {
  return {
    reply_de: 'Sehr gern. Möchten Sie noch etwas?',
    reply_ar: 'بكل سرور. هل تريد شيئاً آخر؟',
    is_correct: true,
    ...overrides,
  };
}

export interface MockOptions {
  turns?: ScriptedTurn[];
  /** Keeps a turn in flight long enough for the orb's in-progress states to be observed. */
  turnDelayMs?: number;
  /**
   * Keeps a translation in flight long enough for the in-progress UI to be observed.
   *
   * Added in V18 after a CI-only failure of `journey.spec.ts` "the thinking
   * indicator survives the episode opening": that test has to see the indicator
   * *while* the opener's translation is in flight, and an instant mock can close
   * that window before Playwright's first poll looks — so the assertion waited its
   * full 45 s for an element that had legitimately already unmounted. The fix is
   * to make the trigger deterministic instead of hoping the machine is slow, which
   * is the same discipline as the `turnDelayMs` option above.
   */
  translateDelayMs?: number;
  /** What `/ai/transcribe` answers when the test queued nothing via `say()`. */
  defaultUtterance?: string;
  /**
   * How long the platform recogniser holds an interim result before finalising it.
   * Long enough to assert the live caption on a loaded sandbox, short enough that
   * an ordinary test does not wait on it.
   */
  interimHoldMs?: number;
  /**
   * Whether the canned account carries an active subscription.
   *
   * The backend mock enforces the Worker's level rule, so this has to agree with
   * the seeded `users` row or the suite would test a state the app can never be
   * in. `bootSignedIn` sets both from this one flag.
   */
  isPro?: boolean;
  /**
   * What `/mock/start` answers.
   *
   * `false` (the default) mints the one free mock; `true` answers 402 so a test
   * can drive the honest refusal a learner gets after using it.
   */
  mockCreditRequired?: boolean;
  /** What `/pricing` answers. `null` (the default) makes the call fail. */
  pricing?: {
    prices: Array<{ product: string; amountCents: number; currency: string; group: string; cell: number | null }>;
    group: string;
    /** The experiment bucket the account was assigned, or null when none runs. */
    cell?: number | null;
  } | null;
}

/** The three B1 parts, mirroring `cloudflare-mock-exam.js` for the offline suite. */
const MOCK_PARTS_AR = [
  {
    id: 'plan',
    index: 1,
    seconds: 300,
    titleAr: 'الجزء الأول: التخطيط مع شريك المحادثة',
    titleDe: 'Teil 1 — Gemeinsam planen',
    briefAr: 'تخطّط مع شريك المحادثة، واتفقا معاً على التفاصيل.',
    briefDe: 'Planen Sie mit Ihrem Partner.',
    openerDe: 'Guten Tag! Erzählen Sie mir bitte: Was möchten Sie gemeinsam planen?',
    openerAr: 'الآن لديك حوالي خمس دقائق.',
  },
  {
    id: 'present',
    index: 2,
    seconds: 300,
    titleAr: 'الجزء الثاني: تقديم موضوع',
    titleDe: 'Teil 2 — Ein Thema präsentieren',
    briefAr: 'قدّم الموضوع المعطى واذكر سبب رأيك.',
    briefDe: 'Präsentieren Sie das gegebene Thema.',
    openerDe: 'Bitte präsentieren Sie jetzt das Thema.',
    openerAr: 'قدّم الموضوع الآن.',
  },
  {
    id: 'react',
    index: 3,
    seconds: 300,
    titleAr: 'الجزء الثالث: التفاعل مع الأسئلة',
    titleDe: 'Teil 3 — Auf Fragen reagieren',
    briefAr: 'أجب عن الأسئلة، واذكر رأيك بوضوح.',
    briefDe: 'Antworten Sie auf die Fragen des Prüfers.',
    openerDe: 'Jetzt stelle ich Ihnen einige Fragen.',
    openerAr: 'الآن سأسألك بعض الأسئلة.',
  },
];

/**
 * The Worker's level rule, mirrored.
 *
 * `checkUserEntitlement` serves A1 and refuses every other level without an
 * active subscription. The mock enforces it because a screen that builds a
 * session at a level the deployed Worker rejects is a bug, and a mock that
 * answers anything would let that bug pass the suite green.
 *
 * A turn carrying a mock grant is the one exception, mirroring the Worker: the
 * mock is metered by the MOCK entitlement (`/mock/start`), not by this floor.
 */
function refusesLevel(route: Route, isPro: boolean | undefined): boolean {
  const body = JSON.parse(route.request().postData() || '{}') as {
    cefr_level?: string;
    mock_grant?: string;
  };
  if (typeof body.mock_grant === 'string' && body.mock_grant.length > 0) return false;
  return !isPro && String(body.cefr_level || 'A1').toUpperCase() !== 'A1';
}

/** Transcripts the mocked recogniser returns, oldest first (`say()` queues them). */
const transcribeQueue: string[] = [];

/** The sentence a test gets when it records without queueing one. */
const DEFAULT_UTTERANCE = 'Ich möchte einen Kaffee, bitte.';

const LEVEL_WALL_MESSAGE_AR =
  'المستويات المتقدمة (A2, B1, B2) تتطلب اشتراك Katzu Pro نشط أو كود تفعيل.';

/** The 402 the Worker returns for a level the free tier does not serve. */
function wall(route: Route) {
  return route.fulfill({
    status: 402,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'PAYWALL_REQUIRED', message: LEVEL_WALL_MESSAGE_AR }),
  });
}

/** A graded written task: short, well-formed, and not a plausible real grade. */
const WRITING_FEEDBACK = {
  scores: { task: 3, coherence: 3, grammar: 2, vocabulary: 3 },
  maxScore: 4,
  percent: 85,
  correctedDe: 'Ich möchte einen Termin am Montag vereinbaren.',
  summaryAr: 'نصّ واضح ومفهوم. انتبه إلى حالة النصب بعد möchte.',
  mistakes: [],
};

/**
 * Answers every off-origin request. Localhost is left alone so the preview server
 * under test still serves the app itself.
 */
export async function mockBackend(page: Page, options: MockOptions = {}): Promise<void> {
  let turnIndex = 0;
  transcribeQueue.length = 0;

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (isLocal) return route.continue();

    // Google Identity Services is never exercised here; answering with an empty
    // script keeps the suite fully offline instead of waiting on a CDN.
    if (url.hostname.endsWith('google.com') || url.hostname.endsWith('gstatic.com')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* blocked in e2e */' });
    }

    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    switch (true) {
      case url.pathname === '/mock/start': {
        if (options.mockCreditRequired) {
          return route.fulfill({
            status: 402,
            contentType: 'application/json',
            body: JSON.stringify({
              allowed: false,
              code: 'MOCK_CREDIT_REQUIRED',
              reason: 'mock_credit_required',
              message: 'انتهت المحاكاة المجانية الواحدة، والمحاكاة التالية تحتاج إلى اشتراك أو رصيد محاكاة.',
              debrief: { fullDebrief: false, repeatMock: false, correctionsVisible: 2 },
            }),
          });
        }
        return json({
          allowed: true,
          source: 'free',
          freeUsed: 1,
          creditsRemaining: 0,
          grant: 'MOCK1.1800000000000.TESTTESTSIG01',
          grantExpiresAt: Date.now() + 45 * 60_000,
          debrief: { fullDebrief: false, repeatMock: false, correctionsVisible: 2 },
          brief: {
            level: 'B1',
            noticeAr: 'محاكاة تدريب بأسلوب امتحان B1 — ليست الامتحان الرسمي ولا تمنح درجة معتمدة.',
            unproven: true,
            topic: {
              id: 'wohnen',
              titleDe: 'Wohnen in einer Großstadt',
              titleAr: 'السكن في مدينة كبيرة',
              cardDe: 'Wohnen in einer Großstadt: Mieten oder kaufen?',
              cardAr: 'السكن في مدينة كبيرة: الإيجار أم الشراء؟',
            },
            parts: MOCK_PARTS_AR,
          },
        });
      }
      case url.pathname === '/ai/turn': {
        if (refusesLevel(route, options.isPro)) return wall(route);
        const scripted = options.turns?.[turnIndex] ?? turn();
        turnIndex += 1;
        if (options.turnDelayMs) await new Promise((resolve) => setTimeout(resolve, options.turnDelayMs));
        return json({
          reply_de: scripted.reply_de,
          reply_ar: scripted.reply_ar,
          hints: scripted.hints ?? [],
          followup_ar: '',
          evaluation: {
            is_correct: scripted.is_correct,
            original_mistake: scripted.original_mistake ?? '',
            corrected_german: scripted.corrected_german ?? '',
            grammar_rule: scripted.grammar_rule ?? '',
            explanation_ar: scripted.explanation_ar ?? '',
            roast_comment: '',
            positive_note_ar: '',
          },
        });
      }
      case url.pathname === '/ai/check-writing': {
        if (refusesLevel(route, options.isPro)) return wall(route);
        return json({ task_type: 'short_message', feedback: WRITING_FEEDBACK });
      }
      case url.pathname === '/ai/ask': {
        const body = JSON.parse(route.request().postData() || '{}') as { question?: string };
        const question = String(body.question || '');
        // The German-only contract is enforced by the real worker; the mock mirrors
        // it so the refusal path is exercised end to end.
        // The client consumes the worker's already-normalized camelCase answer.
        if (/weather|wetter|الطقس|رياضيات|بلوكشين/i.test(question)) {
          return json({
            answer: {
              inScope: false,
              refusalAr: 'كَاتْزُو هنا لتعليم الألمانية فقط — اسألني عن كلمة أو قاعدة أو جملة بالألمانية.',
              intent: null,
              explanationAr: '',
              examples: [],
              practice: [],
              legal: false,
            },
            level: 'A1',
            quota: { daily_limit: 8, is_pro: false },
          });
        }
        const legal = /bescheid|amt|رسمي|قانوني/i.test(question);
        return json({
          answer: {
            inScope: true,
            refusalAr: '',
            intent: legal ? 'official' : 'grammar',
            explanationAr: 'الأكوزاتيف حالة النصب: الاسم المذكر يتغيّر فيه der إلى den.',
            examples: [{ de: 'Ich kaufe den Kaffee.', ar: 'أشتري القهوة.' }],
            practice: [
              { type: 'translate', promptAr: 'أشتري التفاحة.', promptDe: '', answerDe: 'Ich kaufe den Apfel.' },
              { type: 'fill', promptAr: 'املأ الفراغ بالأداة الصحيحة.', promptDe: 'Ich sehe ___ Mann.', answerDe: 'den' },
              { type: 'reorder', promptAr: 'رتّب الكلمات لتكوين جملة.', promptDe: 'Kaffee / Ich / den / kaufe', answerDe: 'Ich kaufe den Kaffee' },
            ],
            legal,
          },
          level: 'A1',
          quota: { daily_limit: 8, is_pro: false },
        });
      }
      case url.pathname === '/ai/transcribe': {
        const text = transcribeQueue.shift() ?? options.defaultUtterance ?? DEFAULT_UTTERANCE;
        return json({ text, word_count: text.split(/\s+/).length, empty: false });
      }
      case url.pathname === '/ai/translate': {
        if (options.translateDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.translateDelayMs));
        }
        return json({ translation_ar: 'ترجمة الاختبار' });
      }
      case url.pathname === '/ai/hints':
        return json({ hints: [] });
      case url.pathname === '/check-status':
        return json({ active: false, expires_at: null });
      case url.pathname === '/pricing': {
        // `null` means "the server could not be reached", which the paywall must
        // render as no price at all rather than as a number of its own.
        if (!options.pricing) {
          return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        }
        return json({ ...options.pricing, currency: 'EUR', unproven: true });
      }
      case url.pathname === '/review/sync':
        return json({ items: [] });
      case url.pathname === '/progress/sync' || url.pathname === '/progress/get':
        return json({ ok: true });
      case url.pathname === '/analytics/events':
        return json({ ok: true });
      case url.pathname === '/client-error':
        return json({ ok: true });
      // Content: an empty array means "nothing to overwrite locally", so the app
      // keeps the fixture content it seeded and the suite stays deterministic.
      case url.pathname === '/scenarios' || url.pathname === '/vocabulary' || url.pathname === '/grammar':
        return json([]);
      case url.pathname.startsWith('/scenarios/'):
        return json({});
      default:
        return json({});
    }
  });
}

/** The signed-in learner the suite drives. Mirrors the shape the app seeds itself. */
export const E2E_USER = {
  id: 'current_user',
  email: 'e2e@katzu.test',
  googleAccountEmail: 'e2e@katzu.test',
  displayName: 'متعلم الاختبار',
  isLoggedIn: true,
  sessionToken: 'sess_e2e',
  isSubscriptionActive: false,
  subscriptionExpiresAt: null,
  lastCheckedAt: 0,
  updatedAt: 0,
  cefrLevel: 'A1',
  placementSkippedAt: 0,
  streakDays: 0,
  lastActiveDate: '',
  totalXp: 0,
  speechSpeed: 1,
  sarcasmLevel: 'SASSY',
  freeSessionsRemaining: 3,
  dailyGoalMinutes: 10,
  weeklyGoalDays: 5,
  primaryGoal: 'daily_life',
  arrivalStatus: 'preparing',
  onboardingCompletedAt: 0,
};

/**
 * How far the app's own first-run seeding has got.
 *
 * The app creates its database, seeds fixture content, and only then writes its
 * placeholder `current_user` row — so writing our signed-in row too early lets
 * that placeholder overwrite it, and the learner silently ends up signed out (the
 * tests then hang on "جاري التحقق من الحساب"). Waiting for the content tables to
 * be populated is the signal that the seed has finished.
 */
async function seedProgress(page: Page): Promise<{ hasUser: boolean; scenarios: number } | null> {
  return page.evaluate(async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KatzuWebDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('blocked'));
      });
      if (!db.objectStoreNames.contains('users') || !db.objectStoreNames.contains('scenarios')) {
        db.close();
        return null;
      }
      const count = (store: string) =>
        new Promise<number>((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const scenarios = await count('scenarios');
      const users = await count('users');
      db.close();
      return { hasUser: users > 0, scenarios };
    } catch {
      return null;
    }
  });
}

async function writeUser(page: Page, user: Record<string, unknown>): Promise<boolean> {
  return page.evaluate(async (row) => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KatzuWebDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('blocked'));
      });
      if (!db.objectStoreNames.contains('users')) {
        db.close();
        return false;
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('users', 'readwrite');
        tx.objectStore('users').put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return true;
    } catch {
      return false;
    }
  }, user);
}

/** The learner's stored profile row — used to assert what onboarding persisted. */
export async function readStoredUser(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('KatzuWebDB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const request = db.transaction('users').objectStore('users').get('current_user');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return row;
  });
}

/** Reads the stored row back, so a clobbered sign-in fails loudly instead of silently. */
async function readUserIsSignedIn(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KatzuWebDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = db.transaction('users').objectStore('users').get('current_user');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return row?.isLoggedIn === true;
    } catch {
      return false;
    }
  });
}

/**
 * Signs the learner in for the duration of the tests.
 *
 * The row goes into the database the *app* created (so the schema is the app's
 * own), once that database has finished seeding, and it is read back to prove the
 * sign-in survived — a test that silently runs signed out would otherwise fail
 * later for a reason that has nothing to do with the screen under test.
 */
export async function seedSignedInUser(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
  const user = { ...E2E_USER, ...overrides };

  // A real sign-in is `SignInScreen`'s `onSuccess`, which also records that
  // onboarding is done (`App.tsx` reads `katzu_onboarding_completed` to choose
  // where a signed-out learner goes). This harness writes the row straight into
  // Dexie and skipped that step, so a `bootSignedIn` learner looked like a
  // first-time visitor to the auth guard — which then raced the sign-out handler
  // to `/welcome` instead of `/signin` (measured on CI: 33 polls on /welcome).
  // Record it here so the seeded learner is the same learner a real sign-in makes.
  await page.evaluate(() => {
    try {
      localStorage.setItem('katzu_onboarding_completed', 'true');
    } catch {
      /* private mode / storage disabled: the guard falls back to /welcome */
    }
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const progress = await seedProgress(page);
    if (progress?.hasUser && progress.scenarios > 0) {
      if (await writeUser(page, user)) {
        if (await readUserIsSignedIn(page)) return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Could not seed a signed-in learner: the local database never settled.');
}

/**
 * The microphone and the recorder, scripted.
 *
 * The returned stream really carries audio (an oscillator into a
 * `MediaStreamAudioDestinationNode`), so the app's `AnalyserNode` reads genuine
 * samples and its own voice-activity endpointing runs on real amplitude. The test
 * drives that voice with `say()` (tone on, transcript queued) and `silence()`
 * (tone off, which is what makes the app end the recording by itself).
 */
/**
 * The microphone, the recorder and the platform recogniser, scripted.
 *
 * The stub is authoritative for all three, in both directions: it can *provide* a
 * platform recogniser (which is the app's default path now) or remove the one
 * Chromium ships, so a test that means "this browser has no native recognition"
 * actually tests that. `deny` is the permission refusal, in the shape each engine
 * reports it — a rejected `getUserMedia` for the recorder, an `not-allowed` error
 * event for the recogniser.
 */
export async function installVoiceStub(
  page: Page,
  {
    native = true,
    interimHoldMs = 250,
    deny = false,
    zombie = false,
  }: { native?: boolean; interimHoldMs?: number; deny?: boolean; zombie?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    // Constants that `speak()` needs are passed in, not read from this module:
    // `page.evaluate` serialises the function and runs it in the page, where
    // module scope does not exist.
    ({ installNative, holdMs, denyPermission, zombieNative, audibleRms, speechHoldMs, speechCeilingMs, interimGraceMs }) => {
    type Scope = Record<string, unknown>;
    const scope = window as unknown as Scope;
    const bridge = (scope.__katzuE2E as Record<string, unknown>) || {};
    scope.__katzuE2E = bridge;

    /**
     * The platform's own recogniser, scripted.
     *
     * The app uses this first now (`nativeSpeech.ts`), so the suite has to drive it
     * the way a phone does: `start()` opens a session, the learner speaks *after*
     * that, words arrive as interim results, then the engine finalises and closes.
     * Two details are deliberately realistic because the app depends on them — the
     * result list is cumulative (each event re-sends everything heard so far), and
     * the session ends on its own rather than after a tap.
     *
     * `say()` is what makes the learner speak, in either engine: it queues the
     * sentence here and raises the scripted microphone level for the recorder path.
     */
    let listening: ScriptedRecognition | null = null;
    const queued: string[] = [];

    class ScriptedRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      private closed = false;
      /**
       * The engine that exists and never answers.
       *
       * Desktop Edge, some Android builds and every embedded Chromium (Electron)
       * expose `webkitSpeechRecognition` and then fire no `onstart`, no result and
       * no error when it is started. That is the exact engine the owner's "the
       * microphone does not work" report describes, so the suite can build one.
       */
      private zombie = zombieNative;

      /** The shape the real API sends: cumulative results, `resultIndex` at the change. */
      private static event(items: Array<{ transcript: string; isFinal: boolean }>, resultIndex: number) {
        return { resultIndex, results: Object.assign(items.map((item) => Object.assign([item], { isFinal: item.isFinal })), { length: items.length }) };
      }

      start() {
        listening = this;
        this.closed = false;
        // Silent engine: consume the call and answer nothing at all, ever.
        if (this.zombie) return;
        if (denyPermission) {
          // A refused microphone, as the platform recogniser reports it.
          setTimeout(() => {
            this.closed = true;
            this.onerror?.({ error: 'not-allowed' });
            this.onend?.();
            if (listening === this) listening = null;
          }, 0);
          return;
        }
        setTimeout(() => !this.closed && this.onstart?.(), 0);
        const alreadyQueued = queued.shift();
        if (alreadyQueued) this.deliver(alreadyQueued);
      }

      deliver(text: string) {
        const split = Math.max(1, Math.floor(text.length / 2));
        // Partial words first: the app renders them as a live caption. A real
        // engine re-sends the *whole* utterance when it finalises, which is why the
        // final event below carries the complete sentence rather than the tail —
        // the app must never have to stitch two events together to hear one
        // sentence.
        setTimeout(() => {
          if (this.closed) return;
          this.onresult?.(ScriptedRecognition.event([{ transcript: text.slice(0, split), isFinal: false }], 0));
        }, 40);
        // Then the finalised sentence, and the engine closes on its own.
        //
        // The interim is held for at least `holdMs` — that is the whole point of
        // the flag, and shortening it finalises the utterance before `say()` has
        // even finished raising the scripted level, so the caption is gone by the
        // time anyone looks for it. On top of that floor, the engine waits for the
        // page to actually *render* `[data-testid="live-caption"]`, up to one grace
        // period more. A fixed hold alone is the bug the 2026-09-29 note below
        // describes: on a loaded runner React can batch the interim and the final
        // into one render, the caption never exists, and the test fails with
        // "element not found" while the product is right — measured 2026-10-04 as
        // exactly that, 1 failure in a 67-test run that passed in isolation.
        const interimRendered = () => document.querySelector('[data-testid="live-caption"]') !== null;
        const startedAt = Date.now();
        const poll = () => {
          if (this.closed) return;
          const elapsed = Date.now() - startedAt;
          const done =
            elapsed >= holdMs && (interimRendered() || elapsed >= holdMs + interimGraceMs);
          if (done) {
            this.onresult?.(ScriptedRecognition.event([{ transcript: text, isFinal: true }], 0));
            this.closed = true;
            this.onend?.();
            if (listening === this) listening = null;
            return;
          }
          setTimeout(poll, 25);
        };
        setTimeout(poll, 40);
      }

      stop() {
        if (this.zombie) {
          this.closed = true;
          if (listening === this) listening = null;
          return;
        }
        // A learner tapping stop: whatever was said is finalised, nothing is invented.
        const text = queued.shift();
        this.closed = true;
        if (text) this.onresult?.(ScriptedRecognition.event([{ transcript: text, isFinal: true }], 0));
        this.onend?.();
        if (listening === this) listening = null;
      }

      abort() {
        this.closed = true;
        // A silent engine ignores the abort too, exactly as the real ones do.
        if (this.zombie) {
          if (listening === this) listening = null;
          return;
        }
        this.onend?.();
        if (listening === this) listening = null;
      }
    }

    bridge.queueSpeech = (text: string) => {
      if (listening) listening.deliver(text);
      else queued.push(text);
    };

    // The stub is authoritative in both directions. Chromium exposes a real
    // `SpeechRecognition` of its own, so a test that means "this browser has no
    // platform recogniser" (Firefox) has to remove it as well — otherwise that
    // test would drive Google's engine in a sandbox with no route to it and
    // prove nothing.
    const scopeWithRecognition = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    if (installNative) {
      scopeWithRecognition.SpeechRecognition = ScriptedRecognition;
      delete scopeWithRecognition.webkitSpeechRecognition;
    } else {
      delete scopeWithRecognition.SpeechRecognition;
      delete scopeWithRecognition.webkitSpeechRecognition;
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    }

    let gain: GainNode | null = null;
    let stream: MediaStream | null = null;
    let probe: AnalyserNode | null = null;

    /** Built on first use: an AudioContext needs the learner's tap behind it. */
    const ensureVoice = () => {
      if (gain && stream && probe) return;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const context = new Ctor();
      // This suite launches with `--autoplay-policy=no-user-gesture-required`, so the
      // context is normally already running; resuming is still correct and harmless.
      try {
        void context.resume();
      } catch {
        /* an engine without `resume` is still usable */
      }
      const destination = context.createMediaStreamDestination();
      const node = context.createGain();
      node.gain.value = 0;
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 220;
      oscillator.connect(node);
      node.connect(destination);
      // Tapped after the gain node, so `speak()` below measures exactly what leaves
      // for the app's own analyser on the same stream.
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      node.connect(analyser);
      oscillator.start();
      gain = node;
      stream = destination.stream;
      probe = analyser;
    };

    const mediaDevices = navigator.mediaDevices as MediaDevices;
    mediaDevices.getUserMedia = async () => {
      if (denyPermission) {
        throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
      }
      ensureVoice();
      return stream as MediaStream;
    };

    bridge.speak = () => {
      if (denyPermission) return Promise.resolve();
      ensureVoice();
      if (gain) gain.gain.value = 0.6;
      // Hold the level until the speech is *measurably* audible, never for a fixed
      // number of frames. Six frames was a race: on a loaded runner the app's rAF
      // loop can miss the window, the app then takes its honest `no_speech` path
      // (`NO_SPEECH_MS`, 7 s), never asks the worker to transcribe, and the turn
      // never lands — measured on 2026-09-29 as roughly one preview run in three,
      // presenting as a stalled composer rather than as a missing transcript. The
      // app samples the same scripted stream, so this analyser reads the signal the
      // app's endpointing reads; the condition is energy above `AUDIBLE_RMS`
      // sustained for `SPEECH_HOLD_MS`, which mirrors the app's own
      // `MIN_RECORDING_MS` floor below which it refuses to send a recording at all.
      const analyser = probe;
      if (!analyser) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const buffer = new Float32Array(analyser.fftSize);
        const startedAt = performance.now();
        let audibleSince = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let index = 0; index < buffer.length; index += 1) sum += buffer[index] * buffer[index];
          const rms = Math.sqrt(sum / buffer.length);
          const now = performance.now();
          audibleSince = rms > audibleRms ? audibleSince || now : 0;
          const heldLongEnough = audibleSince !== 0 && now - audibleSince >= speechHoldMs;
          // Bounded both ways: the ceiling keeps a stream that never becomes
          // audible from hanging a test, and it still holds the level an order of
          // magnitude longer than the frame count it replaces.
          if (heldLongEnough || now - startedAt >= speechCeilingMs) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    };
    bridge.silence = () => {
      if (gain) gain.gain.value = 0;
    };

    class ScriptedRecorder extends EventTarget {
      static isTypeSupported = (type: string) =>
        type.startsWith('audio/webm') || type.startsWith('audio/mp4') || type.startsWith('audio/ogg');

      state: 'inactive' | 'recording' = 'inactive';
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      private timer: ReturnType<typeof setInterval> | null = null;

      constructor(_stream: MediaStream, options: { mimeType?: string } = {}) {
        super();
        this.mimeType = options.mimeType || 'audio/webm';
      }

      start(): void {
        this.state = 'recording';
        this.timer = setInterval(() => {
          this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
        }, 100);
      }

      stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.state = 'inactive';
        setTimeout(() => this.onstop?.({}), 10);
      }

      abort(): void {
        this.stop();
      }
    }

    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = ScriptedRecorder;
    },
    {
      installNative: native,
      holdMs: interimHoldMs,
      denyPermission: deny,
      zombieNative: zombie,
      audibleRms: AUDIBLE_RMS,
      speechHoldMs: SPEECH_HOLD_MS,
      speechCeilingMs: SPEECH_CEILING_MS,
      interimGraceMs: INTERIM_GRACE_MS,
    },
  );
}

/**
 * The learner speaks: the scripted microphone goes live and the recogniser is
 * queued to return `text`. Pair it with `silence()` so the app ends the recording
 * on its own — the same way a real learner stops talking.
 */
export async function say(page: Page, text: string): Promise<void> {
  // One queue for both engines: the platform recogniser answers from the page-side
  // queue, and `/ai/transcribe` answers from this one when the app is on the
  // recorder fallback.
  transcribeQueue.push(text);
  await page.evaluate(
    async ({ utterance }) => {
      const bridge = (window as unknown as { __katzuE2E?: Record<string, unknown> }).__katzuE2E;
      (bridge?.queueSpeech as ((value: string) => void) | undefined)?.(utterance);
      await (bridge?.speak as (() => Promise<void> | void) | undefined)?.();
    },
    { utterance: text },
  );
}

/**
 * The learner stops talking. The app's own endpointing ends the recording about
 * `SILENCE_END_MS` (1.2 s) later and then transcribes.
 *
 * This waits for the screen to leave the recording state before returning, so a
 * caller asserts on a settled screen instead of racing that gap. It also turns the
 * failure into something legible: before, a turn that never landed surfaced as a
 * 15 s timeout on the composer with no clue which stage stalled.
 */
export async function silence(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __katzuE2E?: { silence?: () => void } }).__katzuE2E?.silence?.();
  });
  await expect(page.getByRole('button', { name: RECORDING_ACTION })).toHaveCount(0, {
    timeout: 10_000,
  });
}

export interface BootOptions extends MockOptions {
  user?: Record<string, unknown>;
  /** `false` measures the platform's real (silent) capture device instead. */
  installVoice?: boolean;
  denyMicrophone?: boolean;
  /**
   * `false` omits the platform recogniser, which is how a Firefox learner's device
   * looks: the app must then record and recognise on the worker instead.
   */
  nativeSpeech?: boolean;
  /**
   * `true` installs a recogniser that exists but never answers (Electron, some
   * Android/Edge builds), so the hand-off to the recorder is exercised.
   */
  zombieNative?: boolean;
}

/**
 * Boots the app with a signed-in learner and lands on Journey Home.
 *
 * Order matters: the first visit lets the app create and seed its own local
 * database, the sign-in row is written on top of it, and only then does the suite
 * navigate into the episode.
 */
/**
 * Writes rows into one of the app's own Dexie tables.
 *
 * Tests that need recorded history (a finished session, a mistake, a scheduled
 * review item) seed it here rather than driving the UI for ten minutes first: the
 * screens read these tables directly, so seeding them is the same input the app
 * would have produced.
 */
export async function seedRows(
  page: Page,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await page.evaluate(
    async ({ tableName, payload }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('KatzuWebDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!db.objectStoreNames.contains(tableName)) {
        db.close();
        throw new Error(`No such table: ${tableName}`);
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(tableName, 'readwrite');
        const store = tx.objectStore(tableName);
        for (const row of payload) store.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { tableName: table, payload: rows },
  );
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    // A React crash is otherwise swallowed by the ErrorBoundary and shows up only
    // as a friendly card, which makes the failure look like a missing element.
    console.error('[e2e] page error:', error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[e2e] console error:', message.text());
  });
  return errors;
}

export async function bootSignedIn(page: Page, options: BootOptions = {}): Promise<void> {
  collectPageErrors(page);
  await mockBackend(page, options);
  if (options.installVoice !== false) {
    await installVoiceStub(page, {
      native: options.nativeSpeech !== false,
      interimHoldMs: options.interimHoldMs,
      deny: options.denyMicrophone === true,
      zombie: options.zombieNative === true,
    });
  }

  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  const user = options.isPro
    ? { isSubscriptionActive: true, subscriptionExpiresAt: null, ...options.user }
    : options.user;
  await seedSignedInUser(page, user);

  await page.goto('/app/trail');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** The orb, addressed by the accessible name that carries its live state. */
export function orb(page: Page) {
  return page.getByRole('button', { name: /ابدأ التحدث|إيقاف التسجيل|جارٍ التعرف|كَاتْزُو يعمل|لا يوجد اتصال|انتهت الجلسات/ });
}
