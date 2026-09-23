import { db } from '../db/katzuDb';
import type {
  ScenarioEntity,
  StarterPhraseEntity,
  VocabularyEntity,
  GrammarEntity,
  TurnAiResponse,
  ContextualHint,
  CEFRLevel,
} from '@/types/models';

// Default worker URL matching deployment config
const WORKER_BASE_URL = (import.meta as any).env?.VITE_WORKER_URL || '';
const AI_REQUEST_TIMEOUT_MS = 30000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError: any = new Error('انتهت مهلة الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.');
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
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
        const token = db.users.get('current_user').then((user) => user?.idToken || '');
        token.then((value) => { if (value) void this.flushPendingSync(value); });
      });
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
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

  async getEffectiveAuthToken(explicitToken?: string): Promise<string> {
    if (explicitToken && explicitToken.trim()) {
      return explicitToken.trim();
    }
    let currentUser;
    try {
      currentUser = await db.users.get('current_user');
    } catch {
      currentUser = undefined;
    }
    if (currentUser?.sessionToken) {
      return currentUser.sessionToken;
    }
    // If user has idToken but not sessionToken, attempt to exchange
    if (currentUser?.idToken) {
      const exchange = await this.exchangeGoogleToken(currentUser.idToken);
      if (exchange?.session_token) {
        await db.users.update('current_user', { sessionToken: exchange.session_token });
        return exchange.session_token;
      }
      return currentUser.idToken;
    }
    return '';
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
    const token = await this.getEffectiveAuthToken(params.idToken);

    // Map history to worker's expected { role: 'user' | 'model', text: string }
    const historyLimit = params.mode === 'extended' ? 10 : 6;
    const formattedHistory = (params.history || []).slice(-historyLimit).map((h) => ({
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
      id_token: token,
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

    const res = await fetchWithTimeout(`${this.baseUrl}/ai/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

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
        throw error;
      }

      return {
        germanReply: data.reply_de,
        arabicTranslation: data.reply_ar,
        isCorrect: evalData.is_correct,
        mistakeSegment: evalData.original_mistake || '',
        correctedSegment: evalData.corrected_german || '',
        grammarRule: evalData.grammar_rule || '',
        explanationAr: evalData.explanation_ar || '',
        positiveNoteAr: evalData.positive_note_ar || '',
        hints: [],
      };
    }

    throw new Error(`Server returned status ${res.status}`);
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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
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
      if (token) {
        bodyPayload.id_token = token;
      }

      const res = await fetchWithTimeout(`${this.baseUrl}/ai/hints`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
      });

      if (res.status === 402 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        const err: any = new Error(data.message || 'Subscription required for hints');
        err.code = 'PAYWALL_REQUIRED';
        throw err;
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hints) && data.hints.length > 0) {
          return data.hints.map((h: any) => ({
            german: h.german || '',
            arabic: h.translation_ar || h.arabic || '',
          }));
        }
      }
    } catch (e: any) {
      if (e?.code === 'PAYWALL_REQUIRED') {
        throw e;
      }
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
      const res = await fetch(`${this.baseUrl}/ai/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: trimmed, ...(token ? { id_token: token } : {}) }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.translation_ar || '';
      }
    } catch (e) {
      console.warn('Translate fetch failed:', e);
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
          id_token: token,
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
        body: JSON.stringify({ id_token: token }),
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
        body: JSON.stringify({ id_token: token }),
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
        body: JSON.stringify({ referral_code: cleanCode, id_token: token }),
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
        body: JSON.stringify({ ...payload, id_token: token }),
      });
      return res.ok;
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
        body: JSON.stringify({ id_token: token }),
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

  // --- Delete User Account & Cloud Data (/user/delete) ---

  async deleteAccount(idToken?: string): Promise<boolean> {
    const token = await this.getEffectiveAuthToken(idToken);
    if (!token) return false;
    try {
      const res = await fetch(`${this.baseUrl}/user/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ id_token: token }),
      });
      return res.ok;
    } catch (e) {
      console.error('Delete account failed:', e);
      return false;
    }
  }
}

export const workerClient = new WorkerClient();
