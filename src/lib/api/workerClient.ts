import { db } from '../db/katzuDb';
import { WORKER_BASE_URL } from './workerUrl';
import { adoptRemoteReviewItems, loadReviewItems } from '@/lib/srs/store';
import { logError, logEvent, logNetwork } from '../utils/diagnostics';
import type {
  ScenarioEntity,
  StarterPhraseEntity,
  VocabularyEntity,
  GrammarEntity,
  TurnAiResponse,
  ContextualHint,
  CEFRLevel,
  ReviewItemEntity,
  WritingFeedback,
  WritingTaskType,
} from '@/types/models';

const AI_REQUEST_TIMEOUT_MS = 30000;
/** A translation is one short sentence; nobody is waiting three minutes for it. */
const TRANSLATE_TIMEOUT_MS = 12000;

/**
 * Normalizes raw browser network failures (TypeError: Failed to fetch, CORS
 * rejection, DNS failure, aborted by user agent) into typed Arabic errors
 * instead of leaking English browser messages into the chat UI.
 */
function normalizeNetworkError(error: unknown, endpoint: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    const timeoutError: any = new Error('انتهت مهلة الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.');
    timeoutError.code = 'REQUEST_TIMEOUT';
    timeoutError.status = 408;
    return timeoutError;
  }
  if (!WORKER_BASE_URL) {
    const configError: any = new Error('تعذر الاتصال بالخادم: رابط الخادم غير مضبوط في هذا الإصدار. أضف VITE_WORKER_URL في إعدادات النشر.');
    configError.code = 'WORKER_URL_MISSING';
    configError.status = 0;
    logError(endpoint, 'VITE_WORKER_URL is not configured in this build');
    return configError;
  }
  const networkError: any = new Error('تعذر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت وحاول مجدداً.');
  networkError.code = 'NETWORK_ERROR';
  networkError.status = 0;
  logNetwork(endpoint, `Network failure: ${error instanceof Error ? error.message : String(error)}`);
  return networkError;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } catch (error) {
    const urlStr = typeof input === 'string' ? input : String(input);
    let tag = urlStr;
    try {
      tag = new URL(urlStr, window.location.href).pathname;
    } catch { /* keep raw string as tag */ }
    throw normalizeNetworkError(error, tag);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export interface ProgressPayload {
  id_token?: string;
  stats: Record<string, any>;
  trainings: any[];
  saved_word_ids: number[];
  mistakes: any[];
  session_summaries: any[];
}

const updatedAt = (value: any): number => typeof value === 'number' ? value : -Infinity;

function mergeLatest<T extends Record<string, any>>(local: T | undefined, remote: T | undefined): T | undefined {
  if (!local) return remote;
  if (!remote) return local;
  return updatedAt(remote.updated_at ?? remote.updatedAt) >= updatedAt(local.updated_at ?? local.updatedAt)
    ? { ...local, ...remote }
    : { ...remote, ...local };
}

function mergeRecords<T extends Record<string, any>>(
  local: T[] = [],
  remote: T[] = [],
  key: (record: T) => string | number | undefined,
  merge: (a: T, b: T) => T = (a, b) => mergeLatest(a, b) as T,
): T[] {
  const records = new Map<string | number, T>();
  [...local, ...remote].forEach((record) => {
    const id = key(record);
    if (id == null) return;
    const existing = records.get(id);
    records.set(id, existing ? merge(existing, record) : record);
  });
  return [...records.values()];
}

/** Deterministic client-side merge used both before upload and after restore. */
export function mergeProgressPayloads(local: ProgressPayload, remote: ProgressPayload): ProgressPayload {
  const mistakes = mergeRecords(local.mistakes, remote.mistakes, (m) => m.sync_id ?? m.syncId ?? m.id, (a, b) => {
    const latest = mergeLatest(a, b) || a;
    return {
      ...latest,
      id: a.id ?? b.id,
      is_mastered: !!a.is_mastered || !!a.isMastered || !!b.is_mastered || !!b.isMastered,
    };
  });
  return {
    stats: mergeLatest(local.stats, remote.stats) || {},
    trainings: mergeRecords(local.trainings, remote.trainings, (t) => t.scenario_id ?? t.scenarioId),
    saved_word_ids: [...new Set([...(local.saved_word_ids || []), ...(remote.saved_word_ids || [])])],
    mistakes,
    session_summaries: mergeRecords(
      local.session_summaries,
      remote.session_summaries,
      (s) => s.id,
    ),
  };
}

export function mapRedemptionReasonToArabic(reason?: string): string {
  switch (reason) {
    case 'missing_id_token':
      return 'يرجى تسجيل الدخول بحسابك أولاً لربط كود التفعيل به.';
    case 'invalid_id_token':
      return 'جلسة تسجيل الدخول غير صالحة، يرجى إعادة تسجيل الدخول والمحاولة ثانية.';
    case 'malformed':
      return 'صيغة كود التفعيل غير صحيحة. مثال: DE-1M-A1B2C3D4-E5F6G7H8';
    case 'invalid_signature':
      return 'كود التفعيل غير صالح، يرجى التأكد من كتابة الكود بشكل دقيق.';
    case 'already_redeemed':
      return 'تم تفعيل هذا الكود مسبقاً، ولا يمكن استخدامه مرة أخرى.';
    default:
      return 'كود التفعيل غير صالح أو حدث خطأ أثناء التفعيل.';
  }
}

export class WorkerClient {
  private baseUrl: string;

  constructor(baseUrl: string = WORKER_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const token = db.users.get('current_user').then((user) => user?.sessionToken || '');
        token.then((value) => { if (value) void this.flushPendingSync(value); });
      });
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** One consistent authenticated-call helper: session token in the Authorization
   * header ONLY — the request body never carries credentials (Phase 1.1b). */
  private async authedFetch(path: string, body: Record<string, unknown>, opts: { explicitToken?: string } = {}): Promise<Response> {
    const token = await this.getEffectiveAuthToken(opts.explicitToken);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  // --- Auth Session Exchange (/auth/session) ---

  async exchangeGoogleToken(idToken: string): Promise<{ session_token: string; expires_in: number } | null> {
    if (!idToken) return null;
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.session_token === 'string') {
          return {
            session_token: data.session_token,
            expires_in: data.expires_in || 30 * 86400,
          };
        }
      }
    } catch (e) {
      console.warn('Google token exchange failed:', e);
    }
    return null;
  }

  /**
   * Resolves the credential for an authenticated call. Security contract (Phase 1.1b):
   * - Session tokens are the ONLY stored credential (never raw Google ID tokens).
   * - One consistent transport: Authorization Bearer header only.
   * - No raw-token fallback: a missing/expired session means re-authentication
   *   (sign-in re-runs the Google flow and re-exchanges). Returns '' when signed out.
   */
  async getEffectiveAuthToken(explicitToken?: string): Promise<string> {
    if (explicitToken && explicitToken.trim()) {
      // Only session tokens may be injected explicitly; raw ID tokens are refused.
      const t = explicitToken.trim();
      return t.startsWith('sess_') ? t : '';
    }
    let currentUser;
    try {
      currentUser = await db.users.get('current_user');
    } catch {
      currentUser = undefined;
    }
    return currentUser?.sessionToken || '';
  }

  // --- Curriculum Content Sync ---

  async fetchScenarios(): Promise<ScenarioEntity[]> {
    try {
      const res = await fetch(`${this.baseUrl}/scenarios`);
      if (res.ok) {
        const scenarios: ScenarioEntity[] = await res.json();
        if (Array.isArray(scenarios) && scenarios.length > 0) {
          await db.scenarios.bulkPut(scenarios);
          return scenarios;
        }
      }
    } catch (e) {
      console.warn('Worker scenarios fetch failed, using offline cache:', e);
    }
    return db.scenarios.toArray();
  }

  async fetchScenarioDetail(id: string): Promise<{ scenario: ScenarioEntity | null; starterPhrases: StarterPhraseEntity[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/scenarios/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          const starterPhrases: StarterPhraseEntity[] = Array.isArray(data.starter_phrases)
            ? data.starter_phrases
            : [];

          const scenarioObj: ScenarioEntity = {
            id: data.id,
            title_de: data.title_de || '',
            title_ar: data.title_ar || '',
            ai_persona: data.ai_persona || '',
            category: data.category || '',
            icon: data.icon || 'message-square',
            initial_message_a1: data.initial_message_a1 || '',
            initial_message_a2: data.initial_message_a2 || '',
            initial_message_b1: data.initial_message_b1 || '',
            initial_message_b2: data.initial_message_b2 || '',
          };

          await db.scenarios.put(scenarioObj);
          if (starterPhrases.length > 0) {
            await db.starter_phrases.bulkPut(starterPhrases);
          }

          return { scenario: scenarioObj, starterPhrases };
        }
      }
    } catch (e) {
      console.warn(`Scenario ${id} fetch failed, using offline cache:`, e);
    }

    const cachedScenario = await db.scenarios.get(id);
    const cachedPhrases = await db.starter_phrases.where('scenario_id').equals(id).sortBy('sort_order');
    return { scenario: cachedScenario || null, starterPhrases: cachedPhrases };
  }

  async fetchVocabulary(level?: CEFRLevel, topic?: string): Promise<VocabularyEntity[]> {
    try {
      const url = new URL(`${this.baseUrl}/vocabulary`);
      if (level) url.searchParams.set('level', level);
      if (topic) url.searchParams.set('topic', topic);

      const res = await fetch(url.toString());
      if (res.ok) {
        const vocab: VocabularyEntity[] = await res.json();
        if (Array.isArray(vocab) && vocab.length > 0) {
          await db.vocabulary.bulkPut(vocab);
          return vocab;
        }
      }
    } catch (e) {
      console.warn('Worker vocabulary fetch failed, using offline cache:', e);
    }

    if (level && topic) {
      return db.vocabulary.filter((v) => v.level === level && v.topic === topic).toArray();
    } else if (level) {
      return db.vocabulary.filter((v) => v.level === level).toArray();
    }
    return db.vocabulary.toArray();
  }

  async fetchGrammar(level?: CEFRLevel): Promise<GrammarEntity[]> {
    try {
      const url = level ? `${this.baseUrl}/grammar?level=${encodeURIComponent(level)}` : `${this.baseUrl}/grammar`;
      const res = await fetch(url);
      if (res.ok) {
        const grammar: GrammarEntity[] = await res.json();
        if (Array.isArray(grammar) && grammar.length > 0) {
          await db.grammar.bulkPut(grammar);
          return grammar;
        }
      }
    } catch (e) {
      console.warn('Worker grammar fetch failed, using offline cache:', e);
    }
    if (level) {
      return db.grammar.filter((g) => g.level === level).toArray();
    }
    return db.grammar.toArray();
  }

  // --- AI Conversation Turn Loop (Unified with cloudflare-unified-worker.js) ---

  /** Clears the stored session token so the next auth resolution re-exchanges. */
  private async invalidateSession(): Promise<void> {
    try {
      await db.users.update('current_user', { sessionToken: undefined });
      logEvent('auth', 'Stale session token invalidated — will re-exchange on next call');
    } catch {
      /* user row may not exist yet; nothing to invalidate */
    }
  }

  async sendTurn(params: {
    scenarioId: string;
    scenarioTitle: string;
    persona?: string;
    userMessage: string;
    history: Array<{ sender?: string; role?: string; text: string }>;
    cefrLevel: CEFRLevel;
    sarcasmLevel?: string;
    isFinalTurn?: boolean;
    mode?: 'roleplay' | 'extended';
    idToken?: string;
    sessionId?: string;
    learnerMemory?: Array<{ rule: string; example?: string }>;
  }): Promise<TurnAiResponse> {
    try {
      return await this.sendTurnOnce(params);
    } catch (e: any) {
      // Security (Phase 1.1b): no raw-token fallback exists, so a 401 cannot be
      // silently recovered by re-exchanging. The stale session is invalidated and
      // the learner is asked to re-sign-in — honest failure over fake recovery.
      if (e?.code === 'UNAUTHENTICATED') {
        logError('ai/turn', '401 received — session invalid/absent; requiring re-authentication');
        await this.invalidateSession();
        const err: any = new Error('انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى للمتابعة.');
        err.code = 'UNAUTHENTICATED';
        err.status = 401;
        throw err;
      }
      throw e;
    }
  }

  private async sendTurnOnce(params: {
    scenarioId: string;
    scenarioTitle: string;
    persona?: string;
    userMessage: string;
    history: Array<{ sender?: string; role?: string; text: string }>;
    cefrLevel: CEFRLevel;
    sarcasmLevel?: string;
    isFinalTurn?: boolean;
    mode?: 'roleplay' | 'extended';
    idToken?: string;
    sessionId?: string;
    learnerMemory?: Array<{ rule: string; example?: string }>;
  }): Promise<TurnAiResponse> {
    // Resolve credential early so a signed-out user fails fast (header-only transport;
    // the body never carries tokens).
    const token = await this.getEffectiveAuthToken(params.idToken);

    // Map history to worker's expected { role: 'user' | 'model', text: string }.
    // Not sliced here: the worker owns the window (it also has to drop the
    // duplicate of the message being answered), and two independent slices meant
    // the client could trim away turns the worker's own window was relying on.
    const formattedHistory = (params.history || []).map((h) => ({
      role: (h.sender?.toLowerCase() === 'user' || h.role === 'user') ? 'user' : 'model',
      text: h.text || '',
    }));

    const sessionId = params.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const payload: Record<string, any> = {
      scenario_id: params.scenarioId,
      scenario_title: params.scenarioTitle,
      persona: params.persona || 'friendly conversational partner and native German teacher',
      cefr_level: params.cefrLevel || 'A1',
      user_message: params.userMessage,
      history: formattedHistory,
      mode: params.mode || 'roleplay',
      session_id: sessionId,
      is_final_turn: !!params.isFinalTurn,
      sarcasm_level: params.sarcasmLevel || 'SASSY',
    };
    if (params.learnerMemory && params.learnerMemory.length > 0) {
      payload.learner_memory = params.learnerMemory;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    logNetwork('ai/turn', `POST ${this.baseUrl}/ai/turn (${formattedHistory.length} history msgs, final=${!!params.isFinalTurn})`);
    const res = await fetchWithTimeout(`${this.baseUrl}/ai/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    logNetwork('ai/turn', `HTTP ${res.status}`);

    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      const error: any = new Error(data.message || 'يرجى تسجيل الدخول أولاً للمتابعة.');
      error.code = 'UNAUTHENTICATED';
      error.status = 401;
      throw error;
    }

    if (res.status === 402 || res.status === 403) {
      const data = await res.json().catch(() => ({}));
      const error: any = new Error(data.message || 'هذه الميزة تتطلب اشتراك Katzu Pro نشط.');
      error.code = data.code || 'PAYWALL_REQUIRED';
      error.status = res.status;
      throw error;
    }

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const error: any = new Error(data.message || 'تم تجاوز الحد الأقصى للطلبات مؤقتاً.');
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.status = 429;
      throw error;
    }

    if (res.status === 503) {
      const data = await res.json().catch(() => ({}));
      const error: any = new Error(data.message || 'خدمة المحادثة غير متاحة مؤقتاً. يرجى المحاولة لاحقاً.');
      error.code = data.code || 'SERVICE_UNAVAILABLE';
      error.status = 503;
      throw error;
    }

    if (!res.ok) {
      // Every non-OK status carries a JSON error body from the worker with an
      // Arabic user-facing message — read it ONCE and surface it verbatim so
      // the error card shows the real cause, never a raw English status line.
      const data = await res.json().catch(() => ({} as any));
      const friendlyByStatus: Record<number, string> = {
        500: 'حدث خطأ غير متوقع في الخادم. حاول مرة أخرى.',
        502: 'تعذر توليد رد الذكاء الاصطناعي حالياً. حاول إعادة الإرسال بعد لحظات.',
        504: 'استغرق توليد الرد وقتاً طويلاً جداً. حاول إعادة الإرسال.',
      };
      const error: any = new Error(
        data?.message || friendlyByStatus[res.status] || `تعذر إكمال المحادثة (رمز ${res.status}). حاول مرة أخرى.`,
      );
      error.status = res.status;
      error.code = data?.code || 'AI_TURN_HTTP_ERROR';
      if (data?.detail) error.detail = data.detail;
      logError('ai/turn', `AI turn failure HTTP ${res.status} code=${error.code}${error.detail ? ` detail=${error.detail}` : ''}`);
      throw error;
    }

    if (res.ok) {
      const data = await res.json();
      const evalData = data.evaluation;
      if (
        !data ||
        typeof data.reply_de !== 'string' ||
        typeof data.reply_ar !== 'string' ||
        !evalData ||
        typeof evalData.is_correct !== 'boolean'
      ) {
        const error: any = new Error('تعذر التحقق من رد المحادثة. لم يتم احتساب هذه الجملة.');
        error.code = 'INVALID_AI_RESPONSE';
        error.status = 502;
        logError('ai/turn', 'Response failed schema validation (missing reply_de/reply_ar/evaluation)');
        throw error;
      }

      logEvent('ai/turn', `OK (is_correct=${evalData.is_correct}, level=${params.cefrLevel})`);
      return {
        germanReply: data.reply_de,
        arabicTranslation: data.reply_ar,
        isCorrect: evalData.is_correct,
        mistakeSegment: evalData.original_mistake || '',
        correctedSegment: evalData.corrected_german || '',
        grammarRule: evalData.grammar_rule || '',
        explanationAr: evalData.explanation_ar || '',
        roastComment: evalData.roast_comment || '',
        positiveNoteAr: evalData.positive_note_ar || '',
        hints: Array.isArray(data.hints)
          ? data.hints
              .filter((h: any) => h && typeof h.german === 'string' && h.german.trim())
              .map((h: any) => ({ german: h.german, arabic: h.translation_ar || '' }))
          : [],
        followupAr: typeof data.followup_ar === 'string' ? data.followup_ar : '',
      };
    }

    // Unreachable in practice: every non-OK status is handled above; this
    // satisfies the return-type contract for unexpected response shapes.
    const unexpected: any = new Error(`Server returned unexpected status ${res.status}`);
    unexpected.status = res.status;
    unexpected.code = 'AI_TURN_HTTP_ERROR';
    throw unexpected;
  }

  // --- Dynamic Hints via /ai/hints ---

  async fetchHints(params: {
    scenarioTitle: string;
    cefrLevel: CEFRLevel;
    lastAiReply: string;
    history?: Array<{ sender?: string; role?: string; text: string }>;
    idToken?: string;
  }): Promise<ContextualHint[]> {
    try {
      const token = await this.getEffectiveAuthToken(params.idToken);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }

      const bodyPayload: Record<string, any> = {
        scenario_title: params.scenarioTitle,
        cefr_level: params.cefrLevel,
        last_ai_reply: params.lastAiReply,
        history: (params.history || []).slice(-4).map((h) => ({
          role: (h.sender?.toLowerCase() === 'user' || h.role === 'user') ? 'user' : 'model',
          text: h.text || '',
        })),
        mode: 'hints',
      };

      const res = await fetchWithTimeout(`${this.baseUrl}/ai/hints`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
      });

      logNetwork('ai/hints', `HTTP ${res.status}`);

      if (res.status === 402 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        const err: any = new Error(data.message || 'Subscription required for hints');
        err.code = 'PAYWALL_REQUIRED';
        throw err;
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hints) && data.hints.length > 0) {
          // 2-4 distinct moves per request; the worker already filtered
          // duplicates, this just normalizes the shape the UI renders.
          return data.hints.map((h: any) => ({
            german: h.german || '',
            arabic: h.translation_ar || h.arabic || '',
            intent: h.intent || undefined,
          }));
        }
        logEvent('ai/hints', '200 OK but empty hints array — will use starter phrases');
      }
    } catch (e: any) {
      if (e?.code === 'PAYWALL_REQUIRED') {
        throw e;
      }
      logError('ai/hints', `Hints fetch failed: ${e?.code || 'NETWORK'} ${e?.status || ''}`);
      console.warn('Hints fetch failed:', e);
    }

    return [];
  }

  // --- Edge-Cached Translation via /ai/translate ---

  async translateText(text: string, idToken?: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return '';

    try {
      const token = await this.getEffectiveAuthToken(idToken);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
      const res = await fetchWithTimeout(
        `${this.baseUrl}/ai/translate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: trimmed }),
        },
        TRANSLATE_TIMEOUT_MS,
      );

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.translation_ar || '';
      }
      logNetwork('ai/translate', `HTTP ${res.status}`);
    } catch (e) {
      console.warn('Translate fetch failed:', e);
    }
    return '';
  }

  /**
   * Translation for text that has no AI behind it — the scenario opener, whose
   * Arabic is fetched on its own at mount and can race the session-token exchange.
   *
   * Each attempt re-resolves the credential, so a retry is exactly what covers
   * the race: the first call can leave before the session token is in the store
   * and be answered 401, and the retry a moment later carries it. The delays
   * widen (fast enough to feel immediate, long enough to outlast a cold start);
   * a real failure still returns '', so the caller can say "translation
   * unavailable" with a retry instead of showing a wrong translation.
   */
  async translateTextReliable(
    text: string,
    { delays = [500, 1500] }: { delays?: number[] } = {},
  ): Promise<string> {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const translation = await this.translateText(text);
      if (translation) return translation;
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    return '';
  }

  // --- Verification & Paid Promo Code Redemption (/verify) ---

  async verifyCode(
    code: string,
    idToken?: string
  ): Promise<{
    success: boolean;
    valid?: boolean;
    months?: number;
    expiresAt?: string;
    email?: string;
    reason?: string;
    error?: string;
  }> {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, error: 'يرجى إدخال كود التفعيل.' };
    }
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) {
      return {
        success: false,
        reason: 'missing_id_token',
        error: mapRedemptionReasonToArabic('missing_id_token'),
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          code: cleanCode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid === true) {
        return {
          success: true,
          valid: true,
          months: data.months,
          expiresAt: data.expiresAt,
          email: data.email,
        };
      }

      const reason = data.reason || (res.status === 401 ? 'invalid_id_token' : 'invalid_code');
      return {
        success: false,
        valid: false,
        reason,
        error: mapRedemptionReasonToArabic(reason),
      };
    } catch (e) {
      return { success: false, error: 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت.' };
    }
  }

  // --- Subscription Status Check (/check-status) ---

  async checkSubscriptionStatus(idToken?: string): Promise<{
    active: boolean;
    daysRemaining?: number;
    expiresAt?: string | null;
    serverTime?: string;
  }> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) {
      const user = await db.users.get('current_user');
      if (user?.subscriptionExpiresAt) {
        const isActive = new Date(user.subscriptionExpiresAt).getTime() > Date.now();
        return { active: isActive, expiresAt: user.subscriptionExpiresAt };
      }
      return { active: false, expiresAt: null };
    }

    try {
      const res = await fetch(`${this.baseUrl}/check-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          active: !!data.active,
          daysRemaining: data.days_remaining ?? 0,
          expiresAt: data.expiresAt || null,
          serverTime: data.server_time,
        };
      }
    } catch (e) {
      console.warn('Check subscription failed:', e);
    }
    return { active: false };
  }

  // --- Referral Program (/referral/info, /referral/claim) ---

  async getReferralInfo(idToken?: string): Promise<{
    referral_code: string;
    reward_months: number;
    verified_referrals: number;
    pending_referrals: number;
    total_reward_months: number;
    referrals: Array<{ invited_email_masked: string; status: 'pending' | 'verified'; awarded_at: string | null }>;
  } | null> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return null;
    try {
      const res = await fetch(`${this.baseUrl}/referral/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.referral_code === 'string') return data;
      }
    } catch (e) {
      console.warn('Referral info fetch failed:', e);
    }
    return null;
  }

  async claimReferral(code: string, idToken?: string): Promise<{
    success: boolean;
    status?: 'pending' | 'verified';
    error?: string;
    errorCode?: string;
  }> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) {
      return { success: false, errorCode: 'UNAUTHENTICATED', error: 'يرجى تسجيل الدخول أولاً لتطبيق كود الإحالة.' };
    }
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, errorCode: 'MALFORMED', error: 'يرجى إدخال كود الإحالة.' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/referral/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ referral_code: cleanCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        return { success: true, status: data.status || 'pending' };
      }
      const errorMap: Record<string, string> = {
        INVALID_REFERRAL: 'كود الإحالة غير صحيح. تأكد من كتابته بدقة.',
        SELF_REFERRAL: 'لا يمكن استخدام كود الإحالة الخاص بك.',
        ALREADY_REFERRED: 'تم ربط حسابك بكود إحالة مسبقاً.',
        ONLY_FOR_NEW_ACCOUNTS: 'كود الإحالة متاح للحسابات الجديدة غير المشتركة فقط.',
      };
      return {
        success: false,
        errorCode: data.code || 'UNKNOWN',
        error: errorMap[data.code] || 'تعذر تطبيق كود الإحالة. حاول لاحقاً.',
      };
    } catch {
      return { success: false, errorCode: 'NETWORK', error: 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت.' };
    }
  }

  // --- Progress Sync (/progress/sync) ---

  async syncProgress(idToken: string): Promise<boolean> {
    if (!idToken) return false;

    try {
      const user = await db.users.get('current_user');
      const trainings = await db.scenario_training.toArray();
      const savedWords = await db.saved_words.toArray();
      const mistakes = await db.mistakes.toArray();
      const sessions = await db.sessions.toArray();

      const payload: ProgressPayload = {
        stats: {
          level: user?.cefrLevel || 'A1',
          streak_days: user?.streakDays || 0,
          total_points: user?.totalXp || 0,
          last_active_date: user?.lastActiveDate || null,
          updated_at: Date.now(),
        },
        trainings: trainings.map((t) => ({
          scenario_id: t.scenarioId,
          studied_at: t.studiedAt,
          quiz_attempted: t.quizAttempted,
          last_score: t.lastScore,
          effective_level: t.effectiveLevel,
          updated_at: t.updatedAt || Date.now(),
        })),
        saved_word_ids: savedWords.map((sw) => sw.wordId),
        mistakes: mistakes.map((m) => ({
          id: m.id,
          sync_id: m.syncId || `${m.userId}:${m.scenarioId}:${m.timestamp}:${m.original}`,
          user_id: m.userId,
          scenario_id: m.scenarioId,
          original: m.original,
          corrected: m.corrected,
          grammar_rule: m.grammarRule,
          roast_comment: m.roastComment,
          timestamp: m.timestamp,
          was_hint_used: m.wasHintUsed,
          is_mastered: !!m.isMastered,
          updated_at: m.updatedAt || m.timestamp,
        })),
        session_summaries: sessions.map((s) => ({
          id: s.id,
          scenario_id: s.scenarioId,
          scenario_title: s.scenarioTitle,
          cefr_level: s.cefrLevel,
          sentences_spoken: s.sentencesSpoken,
          words_learned: s.wordsLearned,
          accuracy_percent: s.accuracyPercent,
          duration_seconds: s.durationSeconds,
          timestamp: s.timestamp,
          independent_sentences: s.independentSentences ?? 0,
          hint_assisted_sentences: s.hintAssistedSentences ?? 0,
          updated_at: s.updatedAt || s.timestamp,
        })),
      };

      const ok = await this.postProgressPayload(payload, idToken);
      if (ok) await this.flushPendingSync(idToken);
      else await this.queueSyncPayload(payload);
      return ok;
    } catch (e) {
      console.error('Progress sync failed:', e);
      return false;
    }
  }

  private async postProgressPayload(payload: ProgressPayload, idToken?: string): Promise<boolean> {
    try {
      const token = await this.getEffectiveAuthToken(idToken);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
      const res = await fetch(`${this.baseUrl}/progress/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return false;
      // A 200 carrying an error body is NOT a stored payload. The legacy worker
      // answered an expired session exactly that way, and trusting `res.ok` alone
      // made flushPendingSync delete progress it had just failed to save.
      const body = await res.json().catch(() => ({}));
      return !body?.error;
    } catch (e) {
      return false;
    }
  }

  private async queueSyncPayload(payload: ProgressPayload): Promise<void> {
    await db.sync_queue.add({
      payload,
      createdAt: Date.now(),
      attempts: 0,
      nextRetryAt: Date.now(),
    });
  }

  async flushPendingSync(idToken?: string): Promise<void> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return;
    const pending = await db.sync_queue.where('nextRetryAt').belowOrEqual(Date.now()).toArray();
    for (const item of pending) {
      const ok = await this.postProgressPayload(item.payload as ProgressPayload, token);
      if (ok) {
        if (item.id != null) await db.sync_queue.delete(item.id);
      } else if (item.id != null) {
        await db.sync_queue.update(item.id, {
          attempts: item.attempts + 1,
          nextRetryAt: Date.now() + Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(item.attempts, 10)),
        });
      }
    }
  }

  // --- Progress Restore (/progress/get) ---

  async restoreProgress(idToken?: string): Promise<boolean> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return false;
    // Retry queued writes opportunistically; restoration itself remains UI-blocking only on its read.
    void this.flushPendingSync(token);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      };
      const res = await fetch(`${this.baseUrl}/progress/get`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.stats) {
          const localTrainings = await db.scenario_training.toArray();
          const localMistakes = await db.mistakes.toArray();
          const localSessions = await db.sessions.toArray();
          const localUser = await db.users.get('current_user');
          const localPayload: ProgressPayload = {
            stats: {
              level: localUser?.cefrLevel || 'A1',
              streak_days: localUser?.streakDays || 0,
              total_points: localUser?.totalXp || 0,
              last_active_date: localUser?.lastActiveDate || null,
              updated_at: localUser?.updatedAt || 0,
            },
            trainings: localTrainings.map((t) => ({ scenario_id: t.scenarioId, studied_at: t.studiedAt, quiz_attempted: t.quizAttempted, last_score: t.lastScore, effective_level: t.effectiveLevel, updated_at: t.updatedAt })),
            saved_word_ids: (await db.saved_words.toArray()).map((w) => w.wordId),
            mistakes: localMistakes.map((m) => ({ ...m, sync_id: m.syncId || `${m.userId}:${m.scenarioId}:${m.timestamp}:${m.original}`, is_mastered: m.isMastered, updated_at: m.updatedAt || m.timestamp })),
            session_summaries: localSessions,
          };
          const merged = mergeProgressPayloads(localPayload, {
            stats: data.stats,
            trainings: data.trainings || [],
            saved_word_ids: data.saved_word_ids || [],
            mistakes: data.mistakes || [],
            session_summaries: data.session_summaries || data.sessions || [],
          });
          const stats = merged.stats;
          await db.users.update('current_user', {
            cefrLevel: stats.level || 'A1',
            streakDays: stats.streak_days ?? 0,
            totalXp: stats.total_points ?? 0,
            lastActiveDate: stats.last_active_date || null,
            updatedAt: stats.updated_at || data.updated_at || Date.now(),
          });

          if (merged.trainings.length > 0) {
            const mappedTrainings = merged.trainings.map((t: any) => ({
              scenarioId: t.scenario_id,
              userId: 'current_user',
              studiedAt: t.studied_at || null,
              quizAttempted: !!t.quiz_attempted,
              lastScore: t.last_score ?? 0,
              effectiveLevel: t.effective_level || 'A1',
              updatedAt: t.updated_at || Date.now(),
            }));
            await db.scenario_training.bulkPut(mappedTrainings);
          }

          if (merged.saved_word_ids.length > 0) {
            const mappedSavedWords = merged.saved_word_ids.map((id: number) => ({
              wordId: id,
              savedAt: Date.now(),
            }));
            await db.saved_words.bulkPut(mappedSavedWords);
          }

          if (merged.mistakes.length > 0) {
            await db.mistakes.bulkPut(merged.mistakes.map((m: any) => ({
              id: m.id,
              syncId: m.sync_id || m.syncId,
              userId: m.user_id || m.userId || 'current_user',
              scenarioId: m.scenario_id || m.scenarioId,
              original: m.original || '',
              corrected: m.corrected || '',
              grammarRule: m.grammar_rule || m.grammarRule || '',
              roastComment: m.roast_comment || m.roastComment,
              timestamp: m.timestamp || Date.now(),
              wasHintUsed: !!(m.was_hint_used ?? m.wasHintUsed),
              isMastered: !!(m.is_mastered ?? m.isMastered),
              updatedAt: m.updated_at || m.updatedAt || m.timestamp || Date.now(),
            })));
          }
          if (merged.session_summaries.length > 0) {
            await db.sessions.bulkPut(merged.session_summaries.map((s: any) => ({
              id: s.id,
              scenarioId: s.scenario_id || s.scenarioId,
              scenarioTitle: s.scenario_title || s.scenarioTitle || '',
              cefrLevel: s.cefr_level || s.cefrLevel || 'A1',
              sentencesSpoken: s.sentences_spoken ?? s.sentencesSpoken ?? 0,
              wordsLearned: s.words_learned ?? s.wordsLearned ?? 0,
              accuracyPercent: s.accuracy_percent ?? s.accuracyPercent ?? 0,
              durationSeconds: s.duration_seconds ?? s.durationSeconds ?? 0,
              timestamp: s.timestamp || Date.now(),
              independentSentences: s.independent_sentences ?? s.independentSentences ?? 0,
              hintAssistedSentences: s.hint_assisted_sentences ?? s.hintAssistedSentences ?? 0,
              updatedAt: s.updated_at ?? s.updatedAt ?? s.timestamp ?? Date.now(),
            })));
          }

          return true;
        }
      }
    } catch (e) {
      console.error('Progress restore failed:', e);
    }
    return false;
  }

  // --- Graded Writing (/ai/check-writing) ---

  /**
   * One model call, marked against the worker's rubric. Returns a typed failure
   * rather than throwing, because the screen must keep the learner's paragraph
   * on any error — losing what someone just wrote is the worst possible outcome
   * of an AI hiccup.
   */
  async checkWriting(params: {
    text: string;
    taskType: WritingTaskType;
    cefrLevel: CEFRLevel;
    scenarioTitle: string;
    targetPhrases?: string[];
    idToken?: string;
  }): Promise<
    | { ok: true; feedback: WritingFeedback; taskType: WritingTaskType }
    | { ok: false; code: string; error: string }
  > {
    const token = await this.getEffectiveAuthToken(params.idToken);
    if (!token) {
      return { ok: false, code: 'UNAUTHENTICATED', error: 'انتهت جلسة الدخول. سجّل الدخول من جديد ثم أعد المحاولة — نصّك محفوظ هنا.' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/ai/check-writing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({
          text: params.text,
          task_type: params.taskType,
          cefr_level: params.cefrLevel,
          scenario_title: params.scenarioTitle,
          target_phrases: params.targetPhrases || [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.feedback) {
        return {
          ok: true,
          feedback: data.feedback as WritingFeedback,
          taskType: (data.task_type as WritingTaskType) || params.taskType,
        };
      }
      return { ok: false, code: data?.code || 'WRITING_FAILED', error: this.writingErrorMessage(res.status, data) };
    } catch (e) {
      logNetwork('ai/check-writing', `Writing check failed: ${e instanceof Error ? e.message : String(e)}`);
      return {
        ok: false,
        code: 'NETWORK_ERROR',
        error: 'تعذر الوصول إلى الخادم. نصّك محفوظ هنا — أعد المحاولة عند عودة الاتصال.',
      };
    }
  }

  /** Server messages are Arabic and specific (too short, wrong task); use them when present. */
  private writingErrorMessage(status: number, data: any): string {
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (status === 402) return 'التصحيح الكتابي متاح ضمن الاشتراك بعد انتهاء الجلسات المجانية. رقّي حسابك لمتابعة الكتابة.';
    if (status === 429) return 'وصلت إلى الحد المسموح من الطلبات الآن. جرّب بعد دقيقة — نصّك محفوظ.';
    if (status === 503) return 'خدمة التصحيح غير متاحة مؤقتاً. جرّب بعد قليل — نصّك محفوظ.';
    if (status === 401) return 'انتهت جلسة الدخول. سجّل الدخول من جديد — نصّك محفوظ هنا.';
    return 'تعذر تصحيح النص الآن. نصّك محفوظ هنا — أعد المحاولة.';
  }

  // --- Review Queue Sync (/review/sync) ---

  /**
   * One call, both directions: this device's queue goes up, the worker merges it
   * into the account's stored queue (it owns that rule) and returns the merged
   * result, which is adopted locally. That is also how a new phone gets its
   * schedule back — an empty local queue still returns the stored one.
   *
   * Offline or unsigned-in this is a no-op by design: the local queue remains
   * the learner's real queue, and nothing is queued or lost.
   */
  async syncReviewQueue(idToken?: string): Promise<boolean> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return false;
    try {
      const items = await loadReviewItems();
      const res = await fetch(`${this.baseUrl}/review/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!Array.isArray(data?.items)) return false;
      await adoptRemoteReviewItems(data.items as ReviewItemEntity[]);
      return true;
    } catch (e) {
      logNetwork('review/sync', `Review sync failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  // --- Session revocation (/auth/signout) ---
  // Best-effort: never blocks local sign-out; server session is revoked so a
  // stolen/copied token dies immediately instead of living out its 30-day TTL.
  async signOutSession(): Promise<boolean> {
    try {
      const token = await this.getEffectiveAuthToken();
      if (!token) return false;
      const res = await fetch(`${this.baseUrl}/auth/signout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false; // network failure must not prevent local sign-out
    }
  }

  // --- Delete User Account & Cloud Data (/user/delete) ---

  /** Full server-side deletion result (Phase 3): success is true only when every
   * required deletion step completed; DELETE_INCOMPLETE is retryable. */
  async deleteAccount(idToken?: string): Promise<{ success: boolean; message?: string; code?: string; failedSteps?: string[] }> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return { success: false, message: 'جلسة الدخول غير صالحة. سجّل الدخول وأعد المحاولة.' };
    try {
      const res = await fetch(`${this.baseUrl}/user/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        return { success: true, message: body.message };
      }
      return {
        success: false,
        code: body.code,
        message: body.message || 'تعذر حذف الحساب. يرجى إعادة المحاولة.',
        failedSteps: Array.isArray(body.failed_steps) ? body.failed_steps : undefined,
      };
    } catch (e) {
      console.error('Delete account failed:', e);
      return { success: false, message: 'تعذر الاتصال بالخادم. تحقق من الاتصال وأعد المحاولة.' };
    }
  }

  // --- Data Export (/user/export, Phase 4) ---

  /** Downloads this learner's server-held data as katzu-data-export.json.
   * Returns false on network/auth failure without writing a file. */
  async exportUserData(idToken?: string): Promise<boolean> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return false;
    try {
      const res = await fetch(`${this.baseUrl}/user/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const text = await res.text();
      // Validate the payload is JSON before offering it as a download.
      JSON.parse(text);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'katzu-data-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) {
      console.error('Data export failed:', e);
      return false;
    }
  }
}

export const workerClient = new WorkerClient();
