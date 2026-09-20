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
  }

  getBaseUrl(): string {
    return this.baseUrl;
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
    idToken?: string;
  }): Promise<TurnAiResponse> {
    const currentUser = await db.users.get('current_user');
    const token = params.idToken || currentUser?.idToken;

    // Map history to worker's expected { role: 'user' | 'model', text: string }
    const formattedHistory = (params.history || []).slice(-6).map((h) => ({
      role: (h.sender?.toLowerCase() === 'user' || h.role === 'user') ? 'user' : 'model',
      text: h.text || '',
    }));

    const payload = {
      scenario_id: params.scenarioId,
      scenario_title: params.scenarioTitle,
      persona: params.persona || 'friendly conversational partner and native German teacher',
      cefr_level: params.cefrLevel || 'A1',
      user_message: params.userMessage,
      history: formattedHistory,
      id_token: token,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}/ai/turn`, {
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
      const error: any = new Error(data.message || 'انتهت الجلسات المجانية. يلزم تفعيل اشتراك Katzu Pro.');
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

    if (res.ok) {
      const data = await res.json();
      const evalData = data.evaluation || {};

      return {
        germanReply: data.reply_de || 'Danke für Ihre Nachricht!',
        arabicTranslation: data.reply_ar || 'شكراً لرسالتك!',
        isCorrect: typeof evalData.is_correct === 'boolean' ? evalData.is_correct : true,
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
    idToken?: string;
  }): Promise<ContextualHint[]> {
    try {
      const currentUser = await db.users.get('current_user');
      const token = params.idToken || currentUser?.idToken;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${this.baseUrl}/ai/hints`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scenario_title: params.scenarioTitle,
          cefr_level: params.cefrLevel,
          last_ai_reply: params.lastAiReply,
          id_token: token,
        }),
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

    return [
      { german: 'Ja, gerne.', arabic: 'نعم، بكل سرور.' },
      { german: 'Nein, danke.', arabic: 'لا، شكراً.' },
      { german: 'Wie bitte?', arabic: 'عفواً، ماذا قلت؟' },
    ];
  }

  // --- Edge-Cached Translation via /ai/translate ---

  async translateText(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return '';

    try {
      const res = await fetch(`${this.baseUrl}/ai/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
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
    if (!idToken) {
      return {
        success: false,
        reason: 'missing_id_token',
        error: mapRedemptionReasonToArabic('missing_id_token'),
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          id_token: idToken,
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
    if (!idToken) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
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

  // --- Progress Sync (/progress/sync) ---

  async syncProgress(idToken: string): Promise<boolean> {
    if (!idToken) return false;

    try {
      const user = await db.users.get('current_user');
      const trainings = await db.scenario_training.toArray();
      const savedWords = await db.saved_words.toArray();

      const payload = {
        id_token: idToken,
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
      };

      const res = await fetch(`${this.baseUrl}/progress/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch (e) {
      console.error('Progress sync failed:', e);
      return false;
    }
  }

  // --- Progress Restore (/progress/get) ---

  async restoreProgress(idToken: string): Promise<boolean> {
    if (!idToken) return false;

    try {
      const res = await fetch(`${this.baseUrl}/progress/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.stats) {
          const stats = data.stats;
          await db.users.update('current_user', {
            cefrLevel: stats.level || 'A1',
            streakDays: stats.streak_days ?? 0,
            totalXp: stats.total_points ?? 0,
            lastActiveDate: stats.last_active_date || null,
            updatedAt: data.updated_at || Date.now(),
          });

          if (Array.isArray(data.trainings) && data.trainings.length > 0) {
            const mappedTrainings = data.trainings.map((t: any) => ({
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

          if (Array.isArray(data.saved_word_ids) && data.saved_word_ids.length > 0) {
            const mappedSavedWords = data.saved_word_ids.map((id: number) => ({
              wordId: id,
              savedAt: Date.now(),
            }));
            await db.saved_words.bulkPut(mappedSavedWords);
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

  async deleteAccount(idToken: string): Promise<boolean> {
    if (!idToken) return false;
    try {
      const res = await fetch(`${this.baseUrl}/user/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id_token: idToken }),
      });
      return res.ok;
    } catch (e) {
      console.error('Delete account failed:', e);
      return false;
    }
  }
}

export const workerClient = new WorkerClient();
