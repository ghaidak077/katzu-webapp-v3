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
 *  3. **Speech.** Chromium has no Web Speech API. A scripted `SpeechRecognition`
 *     is installed before boot so the voice path is driven by the same events a
 *     real browser would emit — including an interim result before the final one.
 */

export interface ScriptedTurn {
  reply_de: string;
  reply_ar: string;
  is_correct: boolean;
  original_mistake?: string;
  corrected_german?: string;
  grammar_rule?: string;
  explanation_ar?: string;
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
   * Whether the canned account carries an active subscription.
   *
   * The backend mock enforces the Worker's level rule, so this has to agree with
   * the seeded `users` row or the suite would test a state the app can never be
   * in. `bootSignedIn` sets both from this one flag.
   */
  isPro?: boolean;
}

/**
 * The Worker's level rule, mirrored.
 *
 * `checkUserEntitlement` serves A1 and refuses every other level without an
 * active subscription. The mock enforces it because a screen that builds a
 * session at a level the deployed Worker rejects is a bug, and a mock that
 * answers anything would let that bug pass the suite green.
 */
function refusesLevel(route: Route, isPro: boolean | undefined): boolean {
  const body = JSON.parse(route.request().postData() || '{}') as { cefr_level?: string };
  return !isPro && String(body.cefr_level || 'A1').toUpperCase() !== 'A1';
}

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
      case url.pathname === '/ai/turn': {
        if (refusesLevel(route, options.isPro)) return wall(route);
        const scripted = options.turns?.[turnIndex] ?? turn();
        turnIndex += 1;
        if (options.turnDelayMs) await new Promise((resolve) => setTimeout(resolve, options.turnDelayMs));
        return json({
          reply_de: scripted.reply_de,
          reply_ar: scripted.reply_ar,
          hints: [],
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
      case url.pathname === '/ai/translate':
        return json({ translation_ar: 'ترجمة الاختبار' });
      case url.pathname === '/ai/hints':
        return json({ hints: [] });
      case url.pathname === '/check-status':
        return json({ active: false, expires_at: null });
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
 * A scripted Web Speech API.
 *
 * Emits exactly what the real recogniser emits — `onstart`, an interim result,
 * then a final one — so the screen's own guards (`isUsableTranscript`, turn
 * submission, mic release) run for real. Utterances are queued from the test via
 * `say()`; with an empty queue the default sentence is used.
 */
export async function installSpeechStub(
  page: Page,
  { defaultUtterance = 'Ich möchte einen Kaffee, bitte.' }: { defaultUtterance?: string } = {},
): Promise<void> {
  await page.addInitScript((fallback) => {
    const scope = window as unknown as Record<string, unknown>;
    const queue: string[] = [];
    scope.__katzuE2E = {
      queue,
      say: (text: string) => queue.push(text),
    };

    class ScriptedRecognition {
      lang = 'de-DE';
      continuous = false;
      interimResults = true;
      maxAlternatives = 1;
      onstart: ((event: unknown) => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: ((event: unknown) => void) | null = null;
      private timers: Array<ReturnType<typeof setTimeout>> = [];

      start(): void {
        this.timers.push(setTimeout(() => this.onstart?.({}), 20));
        const utterance = queue.shift() || fallback;
        const half = Math.max(1, Math.ceil(utterance.length / 2));
        this.timers.push(setTimeout(() => this.emit(utterance.slice(0, half), false), 140));
        this.timers.push(setTimeout(() => this.emit(utterance, true), 340));
      }

      private emit(transcript: string, isFinal: boolean): void {
        const alternative = Object.assign([{ transcript, confidence: 1 }], { isFinal, length: 1 });
        const results = Object.assign([alternative], { length: 1 });
        this.onresult?.({ resultIndex: 0, results });
      }

      stop(): void {
        this.timers.forEach(clearTimeout);
        this.timers = [];
        setTimeout(() => this.onend?.({}), 20);
      }

      abort(): void {
        this.stop();
      }
    }

    scope.SpeechRecognition = ScriptedRecognition;
    scope.webkitSpeechRecognition = ScriptedRecognition;
  }, defaultUtterance);
}

/** Rejects the microphone the way a denied permission does. */
export async function installDeniedMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
    if (!mediaDevices) return;
    mediaDevices.getUserMedia = () =>
      Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
  });
}

/** Queues the next utterance for the scripted recogniser. */
export async function say(page: Page, text: string): Promise<void> {
  await page.evaluate((utterance) => {
    (window as unknown as { __katzuE2E?: { say: (value: string) => void } }).__katzuE2E?.say(utterance);
  }, text);
}

export interface BootOptions extends MockOptions {
  user?: Record<string, unknown>;
  installSpeech?: boolean;
  denyMicrophone?: boolean;
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
  if (options.denyMicrophone) await installDeniedMicrophone(page);
  else if (options.installSpeech !== false) await installSpeechStub(page);

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
  return page.getByRole('button', { name: /ابدأ التحدث|إيقاف الاستماع|جارٍ التعرف|كَاتْزُو يعمل|لا يوجد اتصال|انتهت الجلسات/ });
}
