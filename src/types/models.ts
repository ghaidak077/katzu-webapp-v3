// TypeScript models mapping Android Kotlin Models.kt & ContentEntities.kt

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';
export type SessionMode = 'quick' | 'immersion';

/**
 * Why the learner is learning German. This is the one personalisation input the
 * product thesis says matters most: someone preparing for a job needs the
 * Bürgeramt and the interview, while someone already here needs the doctor and
 * the landlord. Choosing a goal must visibly change what the home screen asks
 * for, otherwise the question was data collection, not personalisation.
 */
export type LearnerGoal = 'daily_life' | 'work' | 'university' | 'exam';

/** Where the learner is in the move: it decides which situations are urgent. */
export type ArrivalStatus = 'preparing' | 'recently_arrived' | 'living_in_germany';

/** What an optional target date refers to. */
export type TargetDateKind = 'move' | 'exam' | 'job';

/**
 * What the learner has tried before Katzu.
 *
 * It is asked once, and it changes one decision honestly: whether the placement
 * check is offered first (someone who has studied German before should not be
 * started at A1 on a guess) or the learner can simply begin. It never sets a
 * level by itself — only the check does that.
 */
export type PreviousGerman = 'first_time' | 'some_basics' | 'can_hold';

/** Presets the onboarding offers for daily study time. */
export const DAILY_MINUTE_CHOICES = [5, 10, 20] as const;
export type DailyMinuteChoice = (typeof DAILY_MINUTE_CHOICES)[number];

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
  /**
   * The scenario's own 16:9 artwork, set per scenario in the content editor.
   * Absent means "use the built-in placeholder for this scenario or category" —
   * never "no banner", because a card with no image is a card nobody taps.
   */
  banner_url?: string;
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
  /** @deprecated Security (Phase 1.1b): raw Google ID tokens are NEVER persisted.
   * Kept optional for schema compatibility with old local rows; credential use is
   * session tokens only. Sign-in converts the ID token to a session and discards it. */
  idToken?: string;
  sessionToken?: string;
  isLoggedIn: boolean;
  subscriptionExpiresAt: string | null;
  isSubscriptionActive: boolean;
  lastCheckedAt: number;
  updatedAt: number;
  // Preferences & Progress
  cefrLevel: CEFRLevel;
  /** Set when the learner finished the placement check. */
  placementCompletedAt?: number;
  /** What the staircase estimated at that moment; `cefrLevel` may be overridden later. */
  placementEstimatedLevel?: CEFRLevel;
  /** Set when the learner chose to pick their own level instead of being measured. */
  placementSkippedAt?: number;
  streakDays: number;
  lastActiveDate: string; // YYYY-MM-DD
  totalXp: number;
  speechSpeed: number; // 0.8 or 1.0
  sarcasmLevel: SarcasmLevel;
  freeSessionsRemaining: number;
  dailyGoalMinutes: number;
  weeklyGoalDays: number;
  // --- Onboarding preferences (all optional: rows written before onboarding
  // existed simply lack them, and the UI asks for what is missing instead of
  // assuming a value). `dailyMinutes` deliberately reuses `dailyGoalMinutes`
  // above rather than adding a duplicate field. ---
  /** Set once the learner finished the onboarding questions. */
  onboardingCompletedAt?: number;
  primaryGoal?: LearnerGoal;
  arrivalStatus?: ArrivalStatus;
  /** Self-reported prior exposure; decides the placement offer, never the level. */
  previousGerman?: PreviousGerman;
  /** Epoch ms of the learner's optional target date (move/exam/interview). */
  targetDate?: number;
  targetDateKind?: TargetDateKind;
  /** HH:mm the learner prefers to be reminded; display only, no notifications. */
  preferredReminderTime?: string;
  /** BCP-47 locale the learner's device reported (e.g. 'ar'). */
  locale?: string;
  /** IANA timezone the learner's device reported (e.g. 'Europe/Berlin'). */
  timezone?: string;
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
  /**
   * Set when the learner deliberately chose "skip to conversation" at scenario
   * entry. It is an explicit override of the Study -> Quiz on-ramp only: it never
   * skips CEFR level gating or vocabulary injection into the live prompts, which
   * do not read this record at all. Absent on records written before this field.
   */
  trainingSkippedAt?: number;
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

/**
 * The kinds of knowledge the review engine schedules. Each drives how a review
 * prompt is rendered: vocabulary/phrases ask for a German production from the
 * Arabic meaning, mistakes ask for the corrected sentence from the rule that
 * was broken.
 */
export type ReviewKind = 'vocab' | 'phrase' | 'mistake';

/**
 * Self-assessed recall quality after the answer is revealed. Three grades are
 * deliberate: 'hard' and 'good' both advance the item, 'again' resets it. More
 * grades add decisions without adding learning.
 */
export type ReviewGrade = 'again' | 'hard' | 'good';

/**
 * One scheduled knowledge item. Kept local-first in Dexie: the review queue must
 * work offline, exactly like the rest of the learning loop, and it is wiped on
 * sign-out with all other user-scoped data.
 */
export interface ReviewItemEntity {
  id?: number;
  userId: string;
  kind: ReviewKind;
  /** Stable identity of the source row, so enrolment is idempotent. */
  refId: string;
  /** Dexie row id of the source mistake, when `kind === 'mistake'`. */
  sourceId?: number;
  /** The Arabic side — what the learner is asked to produce German for. */
  promptAr: string;
  /** What the learner must produce in German. */
  answerDe: string;
  /** Optional German context (example sentence, or the learner's own earlier wording). */
  contextDe?: string;
  /** Arabic explanation revealed with the answer. */
  explanationAr?: string;
  scenarioId?: string;
  level?: CEFRLevel;
  /** Epoch ms when this item becomes due again. */
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  /** How many times the learner has graded it, for honest progress display. */
  reviews: number;
  lastReviewedAt?: number;
  createdAt: number;
}

/**
 * A finished scenario's capability state, derived from recorded evidence only.
 * The order is the honest ladder: INTRODUCED means they met it, PRACTISING
 * means they worked it, INDEPENDENT means they produced it unaided, and
 * RETAINED means they succeeded again after the schedule brought it back.
 */
export type CapabilityState = 'NOT_STARTED' | 'INTRODUCED' | 'PRACTISING' | 'INDEPENDENT' | 'RETAINED';

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
  /**
   * Lifecycle of a translation that arrives separately from the turn itself
   * (the scenario opener, which no AI call produces). Absent once
   * `arabicTranslation` is set; `'unavailable'` means the fetch failed and the
   * learner can retry it.
   */
  translationState?: 'pending' | 'unavailable';
  /** Arabic invitation to continue the conversation (KATZU messages only). */
  followupAr?: string;
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
  /**
   * Which conversational move this option makes (answer / agree / disagree /
   * add_detail / ask_followup / clarify / express_uncertainty / deflect).
   * Absent on the single hint embedded in a conversation turn response.
   */
  intent?: string;
}

export type WritingTaskType = 'short_message' | 'appointment_request' | 'formal_email' | 'complaint';

export type WritingRubricDimension = 'task' | 'coherence' | 'grammar' | 'vocabulary';

export interface WritingMistake {
  /** The learner's exact words. */
  original: string;
  corrected: string;
  /** Short German rule name, e.g. "Akkusativ nach 'für'". */
  ruleDe: string;
  explanationAr: string;
}

/**
 * A graded written task. `percent` and the scores come from the worker, which
 * owns the rubric — the client only renders them, so a score shown to a learner
 * is never a number the app invented.
 */
export interface WritingFeedback {
  scores: Partial<Record<WritingRubricDimension, number>>;
  maxScore: number;
  percent: number;
  correctedDe: string;
  summaryAr: string;
  mistakes: WritingMistake[];
}

/** The skills that can currently be measured beyond the conversation itself. */
export type PracticeSkill = 'listening' | 'writing';

/**
 * One measured focus drill. The skills card may only show what was actually
 * recorded — an unmeasured skill stays empty rather than becoming a zero.
 */
export interface SkillPracticeEntity {
  id?: number;
  userId: string;
  skill: PracticeSkill;
  /** 0-100, the one shape both drills can honestly report. */
  score: number;
  at: number;
  refId?: string;
}

export interface TurnAiResponse {
  germanReply: string;
  arabicTranslation: string;
  hints?: ContextualHint[];
  /** Inviting Arabic question from Katzu to keep the learner chatting. */
  followupAr?: string;
  isCorrect?: boolean;
  mistakeSegment?: string;
  correctedSegment?: string;
  grammarRule?: string;
  explanationAr?: string;
  roastComment?: string;
  positiveNoteAr?: string;
}
