// TypeScript models mapping Android Kotlin Models.kt & ContentEntities.kt

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type SessionMode = 'quick' | 'immersion';

export type TrailNodeStatus = 'MASTERED' | 'ACTIVE' | 'UPCOMING' | 'LOCKED';

export type GermanGender = 'MASCULINE' | 'FEMININE' | 'NEUTER' | 'PLURAL_ONLY' | 'NONE';

export type MessageSender = 'USER' | 'KATZU' | 'SYSTEM';

export type SarcasmLevel = 'DEADPAN' | 'SASSY' | 'GENTLE';

export interface ScenarioEntity {
  id: string;
  title_de: string;
  title_ar: string;
  ai_persona: string;
  category: string;
  icon: string;
  initial_message_a1: string;
  initial_message_a2: string;
  initial_message_b1: string;
  initial_message_b2: string;
}

export interface StarterPhraseEntity {
  id: number;
  scenario_id: string;
  level: CEFRLevel;
  german: string;
  translation_en: string;
  translation_ar: string;
  sort_order: number;
}

export interface VocabularyEntity {
  id: number;
  german: string;
  article: 'der' | 'die' | 'das' | '' | null;
  plural: string | null;
  part_of_speech: string;
  translation_ar: string;
  translation_en: string;
  example_de: string;
  example_ar: string;
  topic: string;
  level: CEFRLevel;
}

export interface GrammarEntity {
  id: string;
  title_ar: string;
  rule_de: string;
  rule_ar: string;
  level: CEFRLevel;
  explanation_ar: string;
  example_de: string;
  example_ar: string;
}

export interface SavedWordEntity {
  wordId: number;
  savedAt: number;
}

export interface UserEntity {
  id: string; // 'current_user'
  email: string;
  googleAccountEmail?: string;
  displayName: string;
  idToken?: string;
  sessionToken?: string;
  isLoggedIn: boolean;
  subscriptionExpiresAt: string | null;
  isSubscriptionActive: boolean;
  lastCheckedAt: number;
  updatedAt: number;
  // Preferences & Progress
  cefrLevel: CEFRLevel;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  totalXp: number;
  speechSpeed: number; // 0.8 or 1.0
  sarcasmLevel: SarcasmLevel;
  // Server-authoritative access status, refreshed from /check-status (never trusted for enforcement).
  tier?: 'pro' | 'trial' | 'free';
  trialEndsAt?: string | null;
  sessionsUsedToday?: number;
  sessionsLimitToday?: number | null;
  quotaDay?: string; // server UTC day the counters above belong to
  allowedLevels?: CEFRLevel[];
  dailyGoalMinutes: number;
  weeklyGoalDays: number;
}

export interface RedeemedCodeEntity {
  code: string;
  redeemedAt: number;
  monthsGranted: number;
}

export interface SessionEntity {
  id: string; // UUID
  scenarioId: string;
  scenarioTitle: string;
  cefrLevel: CEFRLevel;
  sentencesSpoken: number;
  wordsLearned: number;
  accuracyPercent: number | null;
  durationSeconds: number;
  timestamp: number;
  wasIndependentOnly?: boolean;
  independentSentences?: number;
  hintAssistedSentences?: number;
  updatedAt?: number;
  mode?: SessionMode;
}

export interface ScenarioTrainingEntity {
  id?: string; // compound key scenarioId_userId
  scenarioId: string;
  userId: string;
  studiedAt: number | null;
  quizAttempted: boolean;
  lastScore: number;
  effectiveLevel: CEFRLevel;
  updatedAt: number;
}

export interface MistakeEntity {
  id?: number;
  syncId?: string;
  userId: string;
  scenarioId: string;
  original: string;
  corrected: string;
  grammarRule: string;
  roastComment?: string;
  timestamp: number;
  wasHintUsed: boolean;
  isMastered?: boolean;
  updatedAt?: number;
}

export interface SyncQueueEntity {
  id?: number;
  payload: unknown;
  createdAt: number;
  attempts: number;
  nextRetryAt: number;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  germanText: string;
  arabicTranslation?: string;
  hasCorrection?: boolean;
  originalMistake?: string;
  correctedGerman?: string;
  roastComment?: string;
  grammarRule?: string;
  explanationAr?: string;
  positiveNoteAr?: string;
  wasHintUsed?: boolean;
  isGenerating?: boolean;
  timestamp: number;
}

export interface ContextualHint {
  german: string;
  arabic: string;
}

export interface TurnAiResponse {
  germanReply: string;
  arabicTranslation: string;
  hints?: ContextualHint[];
  isCorrect?: boolean;
  mistakeSegment?: string;
  correctedSegment?: string;
  grammarRule?: string;
  explanationAr?: string;
  roastComment?: string;
  positiveNoteAr?: string;
}
