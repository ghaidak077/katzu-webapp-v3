import Dexie, { type EntityTable } from 'dexie';
import { INTRO_SCENARIO_ID } from '@/lib/mission/selectMission';
import type {
  ScenarioEntity,
  StarterPhraseEntity,
  VocabularyEntity,
  GrammarEntity,
  SavedWordEntity,
  UserEntity,
  RedeemedCodeEntity,
  SessionEntity,
  ScenarioTrainingEntity,
  MistakeEntity,
  ReviewItemEntity,
  SkillPracticeEntity,
  SyncQueueEntity,
  MemoryPatternEntity,
} from '@/types/models';

class KatzuDatabase extends Dexie {
  scenarios!: EntityTable<ScenarioEntity, 'id'>;
  starter_phrases!: EntityTable<StarterPhraseEntity, 'id'>;
  vocabulary!: EntityTable<VocabularyEntity, 'id'>;
  grammar!: EntityTable<GrammarEntity, 'id'>;
  saved_words!: EntityTable<SavedWordEntity, 'wordId'>;
  users!: EntityTable<UserEntity, 'id'>;
  redeemed_codes!: EntityTable<RedeemedCodeEntity, 'code'>;
  sessions!: EntityTable<SessionEntity, 'id'>;
  scenario_training!: EntityTable<ScenarioTrainingEntity, 'scenarioId'>;
  mistakes!: EntityTable<MistakeEntity, 'id'>;
  sync_queue!: EntityTable<SyncQueueEntity, 'id'>;
  review_items!: EntityTable<ReviewItemEntity, 'id'>;
  skill_practice!: EntityTable<SkillPracticeEntity, 'id'>;
  memory_patterns!: EntityTable<MemoryPatternEntity, 'patternId'>;

  constructor() {
    super('KatzuWebDB');
    // Schema matching Android Room Database v8
    this.version(1).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, timestamp, wasHintUsed',
    });
    // Additive sync metadata. Existing rows are retained and receive safe defaults.
    this.version(2).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
      sync_queue: '++id, createdAt, nextRetryAt',
    }).upgrade(async (tx) => {
      await tx.table('sessions').toCollection().modify((session: SessionEntity) => {
        session.independentSentences ??= session.sentencesSpoken;
        session.hintAssistedSentences ??= 0;
        session.updatedAt ??= session.timestamp;
      });
      await tx.table('mistakes').toCollection().modify((mistake: MistakeEntity) => {
        mistake.updatedAt ??= mistake.timestamp;
        mistake.syncId ??= `${mistake.userId}:${mistake.scenarioId}:${mistake.timestamp}:${mistake.original}`;
      });
    });
    // Security migration (Phase 1.1b): strip raw Google ID tokens from any legacy
    // user rows. Session tokens are the only stored credential. Additive — no
    // learning data is touched; users re-sign-in only if they had no session yet.
    this.version(3).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
      sync_queue: '++id, createdAt, nextRetryAt',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user: UserEntity) => {
        if (user.idToken) user.idToken = undefined;
      });
    });
    // Spaced-repetition queue (docs/LEARNING-ROADMAP.md, phase 1). Purely
    // additive: a new table only, no existing row is read or rewritten.
    this.version(4).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
      sync_queue: '++id, createdAt, nextRetryAt',
      review_items: '++id, userId, dueAt, kind, refId, [kind+refId]',
    });

    // v5: focus-drill results. Additive like every migration before it — the
    // skills card must show measured practice (writing, dictation), and until
    // now nothing recorded it, so the app could not honestly answer "how is
    // your listening?" at all.
    this.version(5).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
      sync_queue: '++id, createdAt, nextRetryAt',
      review_items: '++id, userId, dueAt, kind, refId, [kind+refId]',
      skill_practice: '++id, userId, skill, at',
    });

    // v6 (V21 Phase 3): the long-memory store. Additive — one new table and one
    // new index; no existing row is read or rewritten by the upgrade, so a v5
    // database keeps every mistake, review item and session it ever had. The
    // pattern rows are DERIVED views (rebuilt from sources, never authoritative),
    // so even a wipe loses nothing: the next rebuild reconstructs them.
    this.version(6).stores({
      scenarios: 'id, category',
      starter_phrases: 'id, scenario_id, level, sort_order',
      vocabulary: 'id, level, topic, part_of_speech',
      grammar: 'id, level',
      saved_words: 'wordId, savedAt',
      users: 'id, email',
      redeemed_codes: 'code, redeemedAt',
      sessions: 'id, scenarioId, cefrLevel, timestamp, updatedAt',
      scenario_training: 'scenarioId, userId, updatedAt',
      mistakes: '++id, userId, scenarioId, syncId, timestamp, wasHintUsed, updatedAt',
      sync_queue: '++id, createdAt, nextRetryAt',
      review_items: '++id, userId, dueAt, kind, refId, [kind+refId]',
      skill_practice: '++id, userId, skill, at',
      memory_patterns: 'patternId, kind, updatedAt',
    });
  }
}

export const db = new KatzuDatabase();

// Wipes all user-scoped data (sessions, mistakes, saved words, training, redeemed codes) on sign-out
export async function wipeUserScopedData(): Promise<void> {
  await Promise.all([
    db.sessions.clear(),
    db.mistakes.clear(),
    db.saved_words.clear(),
    db.scenario_training.clear(),
    db.redeemed_codes.clear(),
    db.review_items.clear(),
    db.skill_practice.clear(),
  ]);

  await db.users.put({
    id: 'current_user',
    email: '',
    googleAccountEmail: '',
    displayName: 'مستكشف كَاتْزُو',
    isLoggedIn: false,
    subscriptionExpiresAt: null,
    isSubscriptionActive: false,
    lastCheckedAt: Date.now(),
    updatedAt: Date.now(),
    cefrLevel: 'A1',
    streakDays: 0,
    lastActiveDate: '', // empty = never active; streak engine starts on first session
    totalXp: 0,
    speechSpeed: 1.0,
    sarcasmLevel: 'SASSY',
    freeSessionsRemaining: 3,
    dailyGoalMinutes: 15,
    weeklyGoalDays: 5,
  });

  try {
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.id?.disableAutoSelect) {
      (window as any).google.accounts.id.disableAutoSelect();
    }
  } catch {}
}

/**
 * A browser that has already run a newer bundle holds a database version this
 * bundle does not know about, and every query would reject — leaving a returning
 * learner on a blank screen. One reload picks the newer bundle up from the
 * service worker; the session flag stops that from becoming a reload loop.
 * Returns false when a reload is already in flight, so the caller does not keep
 * querying a database that is about to be replaced.
 */
async function ensureDatabaseOpen(): Promise<boolean> {
  try {
    await db.open();
    return true;
  } catch (error) {
    if ((error as { name?: string })?.name !== 'VersionError') throw error;
    const RELOAD_FLAG = 'katzu_db_version_reload';
    if (typeof window !== 'undefined' && !window.sessionStorage.getItem(RELOAD_FLAG)) {
      window.sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return false;
    }
    throw error;
  }
}

// Default seed data to ensure immediate offline & first-run availability
export async function initializeDatabaseSeed(): Promise<void> {
  if (!(await ensureDatabaseOpen())) return;

  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.put({
      id: 'current_user',
      email: '',
      displayName: 'مستكشف كَاتْزُو',
      isLoggedIn: false,
      subscriptionExpiresAt: null,
      isSubscriptionActive: false,
      lastCheckedAt: Date.now(),
      updatedAt: Date.now(),
    cefrLevel: 'A1',
    streakDays: 0,
    lastActiveDate: '', // empty = never active; streak engine starts on first session
    totalXp: 0,
      speechSpeed: 1.0,
      sarcasmLevel: 'SASSY',
      freeSessionsRemaining: 3,
      dailyGoalMinutes: 15,
      weeklyGoalDays: 5,
    });
  }

  // Production curriculum is owned by D1/Worker. Fall back to local fixtures
  // if the database is empty (offline or first run).
  const scenarioCount = await db.scenarios.count();
  if (scenarioCount === 0) {
    await db.scenarios.bulkPut([
      {
        id: 'cafe_order',
        title_de: 'Im Café bestellen',
        title_ar: 'الطلب في المقهى',
        ai_persona: 'Barista katze',
        category: 'daily_life',
        icon: 'coffee',
        initial_message_a1: 'Hallo! Willkommen im Katzu Café. Was möchten Sie trinken?',
        initial_message_a2: 'Guten Tag! Schön, dass Sie da sind. Möchten Sie die Getränkekarte sehen oder wissen Sie schon, was Sie möchten?',
        initial_message_b1: 'Hallo! Schönen Nachmittag. Wir haben heute frischen Apfelkuchen und tolle Kaffeespezialitäten. Darf ich Ihnen schon etwas bringen?',
        initial_message_b2: 'Herzlich willkommen! Nehmen Sie gerne Platz. Kann ich Ihnen vielleicht eine Empfehlung aus unserer Spezialitätenröstung aussprechen?',
      },
      {
        id: 'bakery_shopping',
        title_de: 'Beim Bäcker einkaufen',
        title_ar: 'التسوق عند الخباز',
        ai_persona: 'Bäcker katze',
        category: 'daily_life',
        icon: 'shopping-bag',
        initial_message_a1: 'Guten Morgen! Was darf es sein?',
        initial_message_a2: 'Guten Morgen! Möchten Sie Brot oder Brötchen?',
        initial_message_b1: 'Guten Morgen! Suchen Sie ein bestimmtes Brot, oder darf ich Ihnen etwas empfehlen?',
        initial_message_b2: 'Guten Morgen! Wenn Sie möchten, schneide ich Ihnen das Brot gleich auf. Was darf ich einpacken?',
      },
      {
        id: 'doctor_visit',
        title_de: 'Beim Arzt',
        title_ar: 'زيارة الطبيب',
        ai_persona: 'Doktor katze',
        category: 'health',
        icon: 'heart-pulse',
        initial_message_a1: 'Guten Tag. Was fehlt Ihnen denn?',
        initial_message_a2: 'Guten Tag! Kommen Sie herein und nehmen Sie Platz. Welche Beschwerden haben Sie?',
        initial_message_b1: 'Guten Tag. Seit wann haben Sie diese Beschwerden, und wo genau tut es weh?',
        initial_message_b2: 'Guten Tag. Könnten Sie mir bitte genauer beschreiben, welche Beschwerden Sie haben und seit wann sie bestehen?',
      },
      {
        id: 'apartment_viewing',
        title_de: 'Wohnungsbesichtigung',
        title_ar: 'معاينة شقة',
        ai_persona: 'Vermieter katze',
        category: 'housing',
        icon: 'home',
        initial_message_a1: 'Guten Tag! Gefällt Ihnen die Wohnung?',
        initial_message_a2: 'Guten Tag! Willkommen zur Besichtigung. Haben Sie Fragen zur Lage oder zu den Nebenkosten?',
        initial_message_b1: 'Guten Tag. Wie Sie sehen, ist die Wohnung hell. Ab wann würden Sie gern einziehen?',
        initial_message_b2: 'Guten Tag. Sehen Sie sich gern in Ruhe um. Welche Fragen haben Sie zum Mietvertrag oder zur Kaution?',
      },
      {
        id: 'job_interview',
        title_de: 'Das Vorstellungsgespräch',
        title_ar: 'مقابلة العمل',
        ai_persona: 'Chef katze',
        category: 'work',
        icon: 'briefcase',
        initial_message_a1: 'Guten Tag! Erzählen Sie mir ein bisschen über sich.',
        initial_message_a2: 'Willkommen bei uns! Warum interessieren Sie sich für diese Stelle?',
        initial_message_b1: 'Guten Tag! Schön, dass Sie da sind. Welche Erfahrungen bringen Sie für diese Position mit?',
        initial_message_b2: 'Herzlich willkommen zu unserem Gespräch. Was reizt Sie besonders an unserem Unternehmen und wie gehen Sie mit stressigen Situationen um?',
      },
      {
        id: 'train_station',
        title_de: 'Am Bahnhof',
        title_ar: 'في محطة القطار',
        ai_persona: 'Bahn katze',
        category: 'travel',
        icon: 'train',
        initial_message_a1: 'Guten Tag. Wohin möchten Sie fahren?',
        initial_message_a2: 'Guten Tag! Möchten Sie eine Fahrkarte kaufen oder eine Verbindung suchen?',
        initial_message_b1: 'Guten Tag. Welche Strecke möchten Sie fahren, und wann möchten Sie abfahren?',
        initial_message_b2: 'Guten Tag. Wenn sich Ihre Verbindung ändert, helfe ich Ihnen gern, eine passende Alternative zu finden. Wohin möchten Sie reisen?',
      }
    ]);
  }

  const starterCount = await db.starter_phrases.count();
  if (starterCount === 0) {
    await db.starter_phrases.bulkPut([
      { id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'Ich möchte bitte einen Kaffee.', translation_en: 'I would like a coffee please.', translation_ar: 'أريد قهوة من فضلك.', sort_order: 1 },
      { id: 2, scenario_id: 'cafe_order', level: 'A1', german: 'Haben Sie auch Tee?', translation_en: 'Do you also have tea?', translation_ar: 'هل لديكم شاي أيضاً؟', sort_order: 2 },
      { id: 3, scenario_id: 'cafe_order', level: 'A1', german: 'Wie viel kostet das?', translation_en: 'How much does that cost?', translation_ar: 'كم يكلف هذا؟', sort_order: 3 },
      { id: 4, scenario_id: 'cafe_order', level: 'A1', german: 'Ich bezahle mit Karte, bitte.', translation_en: 'I will pay by card, please.', translation_ar: 'سأدفع بالبطاقة من فضلك.', sort_order: 4 },
      { id: 5, scenario_id: 'cafe_order', level: 'A1', german: 'Ein Glas Wasser, bitte.', translation_en: 'A glass of water, please.', translation_ar: 'كأس ماء من فضلك.', sort_order: 5 },
      { id: 6, scenario_id: 'cafe_order', level: 'A1', german: 'Die Rechnung, bitte.', translation_en: 'The bill, please.', translation_ar: 'الحساب من فضلك.', sort_order: 6 },
      { id: 7, scenario_id: 'bakery_shopping', level: 'A1', german: 'Zwei Brötchen und eine Brezel, bitte.', translation_en: 'Two bread rolls and a pretzel, please.', translation_ar: 'قطعتا خبز صغيرتان وكعكة بريتزل، من فضلك.', sort_order: 1 },
      { id: 8, scenario_id: 'bakery_shopping', level: 'A1', german: 'Ich hätte gern ein Vollkornbrot.', translation_en: 'I would like a whole-grain loaf.', translation_ar: 'أود رغيف خبز من الحبوب الكاملة.', sort_order: 2 },
      { id: 9, scenario_id: 'bakery_shopping', level: 'A1', german: 'Ist das Brot frisch?', translation_en: 'Is the bread fresh?', translation_ar: 'هل هذا الخبز طازج؟', sort_order: 3 },
      { id: 10, scenario_id: 'bakery_shopping', level: 'A1', german: 'Ich nehme ein Croissant und ein Stück Kuchen.', translation_en: 'I will take a croissant and a piece of cake.', translation_ar: 'سآخذ كرواسون وقطعة كعك.', sort_order: 4 },
      { id: 11, scenario_id: 'bakery_shopping', level: 'A1', german: 'Könnten Sie das Brot bitte schneiden?', translation_en: 'Could you please slice the bread?', translation_ar: 'هل يمكنك تقطيع الخبز من فضلك؟', sort_order: 5 },
      { id: 12, scenario_id: 'bakery_shopping', level: 'A1', german: 'Bitte legen Sie das Brot in eine Tüte.', translation_en: 'Please put the bread in a bag.', translation_ar: 'ضع الخبز في كيس من فضلك.', sort_order: 6 },
      { id: 13, scenario_id: 'bakery_shopping', level: 'A1', german: 'Kann ich das mitnehmen?', translation_en: 'Can I take this with me?', translation_ar: 'هل يمكنني أخذ هذا معي؟', sort_order: 7 },
      { id: 14, scenario_id: 'bakery_shopping', level: 'A1', german: 'Ich hätte gern eine Scheibe Brot.', translation_en: 'I would like a slice of bread.', translation_ar: 'أود شريحة خبز.', sort_order: 8 },
      { id: 15, scenario_id: 'doctor_visit', level: 'A1', german: 'Mein Kopf tut weh.', translation_en: 'My head hurts.', translation_ar: 'رأسي يؤلمني.', sort_order: 1 },
      { id: 16, scenario_id: 'doctor_visit', level: 'A1', german: 'Ich habe seit gestern Fieber.', translation_en: 'I have had a fever since yesterday.', translation_ar: 'لدي حمى منذ الأمس.', sort_order: 2 },
      { id: 17, scenario_id: 'airport_arrival', level: 'A1', german: 'Mein Koffer ist nicht angekommen.', translation_en: 'My suitcase has not arrived.', translation_ar: 'لم تصل حقيبتي.', sort_order: 1 },
      { id: 18, scenario_id: 'airport_arrival', level: 'A1', german: 'Hier ist mein Pass.', translation_en: 'Here is my passport.', translation_ar: 'هذا جواز سفري.', sort_order: 2 },
      { id: 19, scenario_id: 'airport_arrival', level: 'A1', german: 'Hier ist meine Bordkarte.', translation_en: 'Here is my boarding pass.', translation_ar: 'هذه بطاقة صعودي.', sort_order: 3 },
      { id: 20, scenario_id: 'airport_arrival', level: 'A1', german: 'Ich bin am Flughafen angekommen.', translation_en: 'I have arrived at the airport.', translation_ar: 'وصلت إلى المطار.', sort_order: 4 },
      { id: 21, scenario_id: 'airport_arrival', level: 'A1', german: 'Seit meiner Ankunft fehlt mein Gepäck.', translation_en: 'My luggage has been missing since I arrived.', translation_ar: 'أمتعتي مفقودة منذ وصولي.', sort_order: 5 },
      { id: 22, scenario_id: 'airport_arrival', level: 'A1', german: 'Können Sie mir bitte helfen?', translation_en: 'Could you please help me?', translation_ar: 'هل يمكنك مساعدتي من فضلك؟', sort_order: 6 },
      { id: 23, scenario_id: 'airport_arrival', level: 'A1', german: 'Wo ist der Gepäckschalter?', translation_en: 'Where is the baggage desk?', translation_ar: 'أين مكتب الأمتعة؟', sort_order: 7 },
      { id: 24, scenario_id: 'airport_arrival', level: 'A1', german: 'Können Sie das bitte wiederholen?', translation_en: 'Could you please repeat that?', translation_ar: 'هل يمكنك إعادة ذلك من فضلك؟', sort_order: 8 },
      { id: 25, scenario_id: 'train_station', level: 'A1', german: 'Ich möchte eine Fahrkarte nach Berlin.', translation_en: 'I would like a ticket to Berlin.', translation_ar: 'أريد تذكرة إلى برلين.', sort_order: 1 },
      { id: 26, scenario_id: 'train_station', level: 'A1', german: 'Wo ist der Bahnsteig?', translation_en: 'Where is the platform?', translation_ar: 'أين رصيف القطار؟', sort_order: 2 },
      { id: 27, scenario_id: 'train_station', level: 'A1', german: 'Von welchem Gleis fährt der Zug?', translation_en: 'Which track does the train leave from?', translation_ar: 'من أي رصيف ينطلق القطار؟', sort_order: 3 },
      { id: 28, scenario_id: 'train_station', level: 'A1', german: 'Wann ist die Abfahrt?', translation_en: 'When is the departure?', translation_ar: 'متى موعد المغادرة؟', sort_order: 4 },
      { id: 29, scenario_id: 'train_station', level: 'A1', german: 'Ich muss in Hamburg umsteigen.', translation_en: 'I have to change trains in Hamburg.', translation_ar: 'عليّ تغيير القطار في هامبورغ.', sort_order: 5 },
      { id: 30, scenario_id: 'train_station', level: 'A1', german: 'Gibt es eine direkte Verbindung?', translation_en: 'Is there a direct connection?', translation_ar: 'هل توجد رحلة مباشرة؟', sort_order: 6 },
      { id: 31, scenario_id: 'train_station', level: 'A1', german: 'Hat der Zug Verspätung?', translation_en: 'Is the train delayed?', translation_ar: 'هل القطار متأخر؟', sort_order: 7 },
      { id: 32, scenario_id: 'train_station', level: 'A1', german: 'Können Sie mir den Fahrplan zeigen?', translation_en: 'Could you show me the timetable?', translation_ar: 'هل يمكنك أن تريني جدول المواعيد؟', sort_order: 8 },
      { id: 33, scenario_id: 'train_station', level: 'A1', german: 'Mein Zug fährt von Gleis vier.', translation_en: 'My train leaves from platform four.', translation_ar: 'ينطلق قطاري من الرصيف الرابع.', sort_order: 9 },
    ]);
  }

  const vocabCount = await db.vocabulary.count();
  if (vocabCount === 0) {
    await db.vocabulary.bulkPut([
      { id: 1, german: 'Kaffee', article: 'der', plural: 'Kaffees', part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: 'Coffee', example_de: 'Der Kaffee ist sehr heiß.', example_ar: 'القهوة ساخنة جداً.', topic: 'food', level: 'A1' },
      { id: 2, german: 'Tee', article: 'der', plural: 'Tees', part_of_speech: 'Noun', translation_ar: 'شاي', translation_en: 'Tea', example_de: 'Ich trinke gerne grünen Tee.', example_ar: 'أحب شرب الشاي الأخضر.', topic: 'food', level: 'A1' },
      { id: 3, german: 'Rechnung', article: 'die', plural: 'Rechnungen', part_of_speech: 'Noun', translation_ar: 'الحساب', translation_en: 'Bill', example_de: 'Die Rechnung, bitte.', example_ar: 'الحساب من فضلك.', topic: 'food', level: 'A1' },
      { id: 4, german: 'Wasser', article: 'das', plural: 'Wässer', part_of_speech: 'Noun', translation_ar: 'ماء', translation_en: 'Water', example_de: 'Ein Glas Wasser, bitte.', example_ar: 'كأس ماء من فضلك.', topic: 'food', level: 'A1' },
      { id: 5, german: 'Brötchen', article: 'das', plural: 'Brötchen', part_of_speech: 'Noun', translation_ar: 'قطعة خبز صغيرة', translation_en: 'Bread roll', example_de: 'Zwei Brötchen, bitte.', example_ar: 'قطعتا خبز صغيرتان، من فضلك.', topic: 'food', level: 'A1' },
      { id: 6, german: 'Schmerz', article: 'der', plural: 'Schmerzen', part_of_speech: 'Noun', translation_ar: 'ألم', translation_en: 'Pain', example_de: 'Ich habe starke Schmerzen.', example_ar: 'لدي آلام شديدة.', topic: 'health', level: 'A1' },
      { id: 7, german: 'Termin', article: 'der', plural: 'Termine', part_of_speech: 'Noun', translation_ar: 'موعد', translation_en: 'Appointment', example_de: 'Ich habe morgen einen Termin.', example_ar: 'لدي موعد غداً.', topic: 'health', level: 'A1' },
      { id: 8, german: 'Fahrkarte', article: 'die', plural: 'Fahrkarten', part_of_speech: 'Noun', translation_ar: 'تذكرة سفر', translation_en: 'Ticket', example_de: 'Ich möchte eine Fahrkarte kaufen.', example_ar: 'أريد شراء تذكرة سفر.', topic: 'travel', level: 'A1' },
      { id: 1100, german: 'Brezel', article: 'die', plural: 'Brezeln', part_of_speech: 'Noun', translation_ar: 'بريتزل (معجنات مالحة)', translation_en: 'pretzel', example_de: 'Ich nehme eine Brezel.', example_ar: 'سآخذ قطعة بريتزل.', topic: 'food', level: 'A1' },
      { id: 1101, german: 'Vollkornbrot', article: 'das', plural: 'Vollkornbrote', part_of_speech: 'Noun', translation_ar: 'خبز من الحبوب الكاملة', translation_en: 'whole-grain bread', example_de: 'Ich hätte gern ein Vollkornbrot.', example_ar: 'أود رغيف خبز من الحبوب الكاملة.', topic: 'food', level: 'A1' },
      { id: 1102, german: 'Croissant', article: 'das', plural: 'Croissants', part_of_speech: 'Noun', translation_ar: 'كرواسون', translation_en: 'croissant', example_de: 'Ich nehme ein Croissant.', example_ar: 'سآخذ كرواسون.', topic: 'food', level: 'A1' },
      { id: 1103, german: 'Kuchen', article: 'der', plural: 'Kuchen', part_of_speech: 'Noun', translation_ar: 'كعك', translation_en: 'cake', example_de: 'Ich nehme ein Stück Kuchen.', example_ar: 'سآخذ قطعة كعك.', topic: 'food', level: 'A1' },
      { id: 1104, german: 'Stück', article: 'das', plural: 'Stücke', part_of_speech: 'Noun', translation_ar: 'قطعة', translation_en: 'piece', example_de: 'Ein Stück Kuchen, bitte.', example_ar: 'قطعة كعك من فضلك.', topic: 'food', level: 'A1' },
      { id: 1105, german: 'Tüte', article: 'die', plural: 'Tüten', part_of_speech: 'Noun', translation_ar: 'كيس ورقي', translation_en: 'bag', example_de: 'Bitte legen Sie das Brot in eine Tüte.', example_ar: 'ضع الخبز في كيس من فضلك.', topic: 'food', level: 'A1' },
      { id: 1106, german: 'Scheibe', article: 'die', plural: 'Scheiben', part_of_speech: 'Noun', translation_ar: 'شريحة', translation_en: 'slice', example_de: 'Ich hätte gern eine Scheibe Brot.', example_ar: 'أود شريحة خبز.', topic: 'food', level: 'A1' },
      { id: 1107, german: 'mitnehmen', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يأخذ معه', translation_en: 'to take along', example_de: 'Kann ich das mitnehmen?', example_ar: 'هل يمكنني أخذ هذا معي؟', topic: 'food', level: 'A1' },
      { id: 1108, german: 'frisch', article: '', plural: null, part_of_speech: 'Adjective', translation_ar: 'طازج', translation_en: 'fresh', example_de: 'Ist das Brot frisch?', example_ar: 'هل هذا الخبز طازج؟', topic: 'food', level: 'A1' },
      { id: 1109, german: 'schneiden', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يقطّع', translation_en: 'to slice', example_de: 'Könnten Sie das Brot bitte schneiden?', example_ar: 'هل يمكنك تقطيع الخبز من فضلك؟', topic: 'food', level: 'A1' },
      { id: 1110, german: 'Bahnhof', article: 'der', plural: 'Bahnhöfe', part_of_speech: 'Noun', translation_ar: 'محطة قطار', translation_en: 'train station', example_de: 'Ich bin am Bahnhof.', example_ar: 'أنا في محطة القطار.', topic: 'travel', level: 'A1' },
      { id: 1111, german: 'Bahnsteig', article: 'der', plural: 'Bahnsteige', part_of_speech: 'Noun', translation_ar: 'رصيف القطار', translation_en: 'platform', example_de: 'Wo ist der Bahnsteig?', example_ar: 'أين رصيف القطار؟', topic: 'travel', level: 'A1' },
      { id: 1112, german: 'Gleis', article: 'das', plural: 'Gleise', part_of_speech: 'Noun', translation_ar: 'مسار / رصيف القطار', translation_en: 'track', example_de: 'Von welchem Gleis fährt der Zug?', example_ar: 'من أي رصيف ينطلق القطار؟', topic: 'travel', level: 'A1' },
      { id: 1113, german: 'Abfahrt', article: 'die', plural: 'Abfahrten', part_of_speech: 'Noun', translation_ar: 'المغادرة', translation_en: 'departure', example_de: 'Wann ist die Abfahrt?', example_ar: 'متى موعد المغادرة؟', topic: 'travel', level: 'A1' },
      { id: 1114, german: 'umsteigen', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يغيّر القطار', translation_en: 'to change trains', example_de: 'Ich muss in Hamburg umsteigen.', example_ar: 'عليّ تغيير القطار في هامبورغ.', topic: 'travel', level: 'A1' },
      { id: 1115, german: 'Verbindung', article: 'die', plural: 'Verbindungen', part_of_speech: 'Noun', translation_ar: 'رحلة / وصلة قطار', translation_en: 'connection', example_de: 'Gibt es eine direkte Verbindung?', example_ar: 'هل توجد رحلة مباشرة؟', topic: 'travel', level: 'A1' },
      { id: 1116, german: 'Verspätung', article: 'die', plural: 'Verspätungen', part_of_speech: 'Noun', translation_ar: 'تأخير', translation_en: 'delay', example_de: 'Hat der Zug Verspätung?', example_ar: 'هل القطار متأخر؟', topic: 'travel', level: 'A1' },
      { id: 1117, german: 'Fahrplan', article: 'der', plural: 'Fahrpläne', part_of_speech: 'Noun', translation_ar: 'جدول مواعيد الرحلات', translation_en: 'timetable', example_de: 'Können Sie mir den Fahrplan zeigen?', example_ar: 'هل يمكنك أن تريني جدول المواعيد؟', topic: 'travel', level: 'A1' },
    ]);
  }

  const grammarCount = await db.grammar.count();
  if (grammarCount === 0) {
    await db.grammar.bulkPut([
      {
        id: 'g_polite_requests_a1',
        title_ar: 'الطلب والاستفسار بأدب (können)',
        rule_de: 'Können Sie ...? ist eine höfliche Frage; der Infinitiv steht am Ende.',
        rule_ar: 'للسؤال أو الطلب بأدب استخدم Können Sie ...? ويأتي الفعل في المصدر في نهاية الجملة.',
        level: 'A1',
        explanation_ar: 'تساعد هذه الصيغة على طلب المساعدة أو الاستفسار من موظف أو بائع. مثال: Können Sie mir helfen?',
        example_de: 'Können Sie mir bitte helfen?',
        example_ar: 'هل يمكنك مساعدتي من فضلك؟',
      },
      {
        id: 'g_articles_a1',
        title_ar: 'أدوات التعريف والتنكير (der, die, das)',
        rule_de: 'Bestimmte Artikel: der (maskulin), die (feminin), das (neutral).',
        rule_ar: 'في الألمانية لكل اسم جنس محدد يجب حفظه مع الكلمة: der للمذكر، die للمؤنث، das للمحايد.',
        level: 'A1',
        explanation_ar: 'الألوان في كَاتْزُو تميز الجنس دائماً: الأزرق للمذكر، الوردي للمؤنث، والأخضر للمحايد.',
        example_de: 'Der Kaffee ist lecker. Die Milch ist frisch. Das Wasser ist kalt.',
        example_ar: 'القهوة لذيذة. الحليب طازج. الماء بارد.',
      },
      {
        id: 'g_verb_position_a1',
        title_ar: 'موقع الفعل في الجملة الرئيسية (Verbposition 2)',
        rule_de: 'Das finite Verb steht im Aussagesatz immer an Position 2.',
        rule_ar: 'الفعل المصرف يأتي دائماً في المركز الثاني في الجملة الخبرية العادية.',
        level: 'A1',
        explanation_ar: 'مهما كان العنصر الأول (فاعل أو زمان أو مكان)، الفعل دائماً في المركز الثاني.',
        example_de: 'Heute trinke ich einen Tee. / Ich trinke heute einen Tee.',
        example_ar: 'اليوم أشرب شاياً. / أنا أشرب اليوم شاياً.',
      },
      {
        id: 'g_modal_moechte',
        title_ar: 'صيغة الطلب المؤدب (möchte)',
        rule_de: 'Ich möchte + Akkusativ-Objekt / Infinitiv am Ende.',
        rule_ar: 'استخدم möchte للطلب بأدب بدلاً من will غير اللبقة في المطاعم والمقاهي.',
        level: 'A1',
        explanation_ar: 'تتبع باسم منصوب (Ich möchte einen Kaffee) أو بفعل في المصدر في نهاية الجملة.',
        example_de: 'Ich möchte bitte bezahlen.',
        example_ar: 'أود أن أدفع من فضلك.',
      }
    ]);
  }

  // Additive and independent of the empty-table guards above — see the function.
  await seedStoryOpening();
}

/**
 * The story's opening scene: arriving in Germany.
 *
 * Why this is not part of the fixtures above: those are inserted only while a
 * content table is *empty*, so a device that already holds the six teaching
 * scenarios would never be given a seventh — and the arrival scene is the episode
 * the whole story starts from, so a learner updating from a previous build has to
 * receive it too. `selectDailyMission` and `buildJourneyContext` read
 * `INTRO_SCENARIO_ID`, which is the same id this row carries.
 *
 * Three rules keep it safe to run on every launch:
 *   - `add`, never `put`: an id that already exists is skipped, so a real D1 row
 *     is never overwritten by a fixture;
 *   - ids start at `OPENING_FIXTURE_ID`, far above the range D1 assigns to
 *     curriculum rows, so an accidental collision would require a thousand rows
 *     of that type — and even then the existence check skips rather than clobbers;
 *   - it is idempotent: on the second run every lookup finds its row and nothing
 *     is written.
 *
 * The German and Arabic below are authored seed text for the offline/first-run
 * fallback, exactly like the six fixtures above it. Production curriculum is owned
 * by D1: once the same `id` exists there, `fetchScenarios` replaces this copy on
 * the next content fetch. It has **not** passed the curriculum gate in docs/agent/CONTENT-GATE.md,
 * so it is a starting scene to review, not an approved lesson.
 */
const OPENING_FIXTURE_ID = 1000;

async function seedStoryOpening(): Promise<void> {
  const scenario: ScenarioEntity = {
    id: INTRO_SCENARIO_ID,
    // D1 is authoritative for content and the approved module2 draft titles this
    // scenario "Am Flughafen: das Gepäck" / "في المطار: الأمتعة". The fixture used
    // to say "fehlendes Gepäck" / "الأمتعة المفقودة", so the offline first run and
    // the live catalogue disagreed (V14-1); aligned in V15.
    title_de: 'Am Flughafen: das Gepäck',
    title_ar: 'في المطار: الأمتعة',
    ai_persona: 'Mitarbeiterin am Gepäckschalter katze',
    category: 'travel',
    icon: 'plane',
    initial_message_a1: 'Guten Tag. Fehlt Ihr Koffer?',
    initial_message_a2:
      'Guten Tag. Ist Ihr Koffer nicht angekommen? Haben Sie Ihre Bordkarte dabei?',
    initial_message_b1:
      'Guten Tag. Wenn Ihr Koffer fehlt, nehme ich Ihre Meldung auf. Können Sie ihn kurz beschreiben?',
    initial_message_b2:
      'Guten Tag. Da Ihr Gepäck nicht angekommen ist, fülle ich gern mit Ihnen eine Verlustmeldung aus. Können Sie Ihren Koffer bitte beschreiben?',
  };
  if (!(await db.scenarios.get(scenario.id))) await db.scenarios.add(scenario);

  const phrases: StarterPhraseEntity[] = [
    {
      id: OPENING_FIXTURE_ID + 1,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Guten Tag. Hier ist mein Pass.',
      translation_en: 'Good day. Here is my passport.',
      translation_ar: 'نهارك سعيد. هذا جواز سفري.',
      sort_order: 1,
    },
    {
      id: OPENING_FIXTURE_ID + 2,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Ich bin zum ersten Mal in Deutschland.',
      translation_en: 'This is my first time in Germany.',
      translation_ar: 'هذه أول مرة لي في ألمانيا.',
      sort_order: 2,
    },
    {
      id: OPENING_FIXTURE_ID + 3,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Ich bleibe zwei Wochen.',
      translation_en: 'I am staying for two weeks.',
      translation_ar: 'سأبقى أسبوعين.',
      sort_order: 3,
    },
    {
      id: OPENING_FIXTURE_ID + 4,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Ich habe eine Adresse in Berlin.',
      translation_en: 'I have an address in Berlin.',
      translation_ar: 'لدي عنوان في برلين.',
      sort_order: 4,
    },
    {
      id: OPENING_FIXTURE_ID + 5,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Wo ist mein Koffer, bitte?',
      translation_en: 'Where is my suitcase, please?',
      translation_ar: 'أين حقيبتي، من فضلك؟',
      sort_order: 5,
    },
    {
      id: OPENING_FIXTURE_ID + 6,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Können Sie das bitte wiederholen?',
      translation_en: 'Could you please repeat that?',
      translation_ar: 'هل يمكنك إعادة ذلك من فضلك؟',
      sort_order: 6,
    },
    {
      id: OPENING_FIXTURE_ID + 7,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Wo ist der Gepäckschalter?',
      translation_en: 'Where is the baggage desk?',
      translation_ar: 'أين مكتب الأمتعة؟',
      sort_order: 7,
    },
    {
      id: OPENING_FIXTURE_ID + 8,
      scenario_id: INTRO_SCENARIO_ID,
      level: 'A1',
      german: 'Seit meiner Ankunft fehlt mein Gepäck.',
      translation_en: 'My luggage has been missing since I arrived.',
      translation_ar: 'أمتعتي مفقودة منذ وصولي.',
      sort_order: 8,
    },
  ];
  const missingPhrases: StarterPhraseEntity[] = [];
  for (const phrase of phrases) {
    if (!(await db.starter_phrases.get(phrase.id))) missingPhrases.push(phrase);
  }
  if (missingPhrases.length > 0) await db.starter_phrases.bulkAdd(missingPhrases);

  // `topic: 'travel'` is the join Study, Quiz and Guided Practice read; without
  // it these words load into a pool no screen ever queries.
  const words: VocabularyEntity[] = [
    {
      id: OPENING_FIXTURE_ID + 1,
      german: 'Pass',
      article: 'der',
      plural: 'Pässe',
      part_of_speech: 'Noun',
      translation_ar: 'جواز سفر',
      translation_en: 'passport',
      example_de: 'Hier ist mein Pass.',
      example_ar: 'هذا جواز سفري.',
      topic: 'travel',
      level: 'A1',
    },
    {
      id: OPENING_FIXTURE_ID + 2,
      german: 'Koffer',
      article: 'der',
      plural: 'Koffer',
      part_of_speech: 'Noun',
      translation_ar: 'حقيبة سفر',
      translation_en: 'suitcase',
      example_de: 'Wo ist mein Koffer?',
      example_ar: 'أين حقيبتي؟',
      topic: 'travel',
      level: 'A1',
    },
    {
      id: OPENING_FIXTURE_ID + 3,
      german: 'Flughafen',
      article: 'der',
      plural: 'Flughäfen',
      part_of_speech: 'Noun',
      translation_ar: 'مطار',
      translation_en: 'airport',
      example_de: 'Wir landen am Flughafen Berlin.',
      example_ar: 'نهبط في مطار برلين.',
      topic: 'travel',
      level: 'A1',
    },
    {
      id: OPENING_FIXTURE_ID + 4,
      german: 'Bordkarte',
      article: 'die',
      plural: 'Bordkarten',
      part_of_speech: 'Noun',
      translation_ar: 'بطاقة الصعود',
      translation_en: 'boarding pass',
      example_de: 'Hier ist meine Bordkarte.',
      example_ar: 'هذه بطاقة صعودي.',
      topic: 'travel',
      level: 'A1',
    },
    {
      id: OPENING_FIXTURE_ID + 5,
      german: 'Ankunft',
      article: 'die',
      plural: 'Ankünfte',
      part_of_speech: 'Noun',
      translation_ar: 'الوصول',
      translation_en: 'arrival',
      example_de: 'Seit meiner Ankunft fehlt mein Gepäck.',
      example_ar: 'أمتعتي مفقودة منذ وصولي.',
      topic: 'travel',
      level: 'A1',
    },
    {
      id: OPENING_FIXTURE_ID + 6,
      german: 'Gepäck',
      article: 'das',
      plural: 'Gepäck',
      part_of_speech: 'Noun',
      translation_ar: 'الأمتعة',
      translation_en: 'luggage',
      example_de: 'Mein Gepäck ist noch im Flugzeug.',
      example_ar: 'أمتعتي ما زالت في الطائرة.',
      topic: 'travel',
      level: 'A1',
    },
  ];
  const missingWords: VocabularyEntity[] = [];
  for (const word of words) {
    if (!(await db.vocabulary.get(word.id))) missingWords.push(word);
  }
  if (missingWords.length > 0) await db.vocabulary.bulkAdd(missingWords);
}

/**
 * Additive content top-ups for existing installs (B3 decisions, final):
 *
 * The empty-table guards above only fire on a fresh database, so a device that
 * already has content never receives later improvements to those fixtures. This
 * layer complements them without ever overwriting anything:
 *
 *   - it uses ids >= 2000, above every other fixture range and far above the
 *     range D1 assigns, so a collision would be extremely unlikely — and the
 *     per-id existence check below makes one harmless anyway;
 *   - every write is `add`, never `put`: an id that already exists is skipped,
 *     so no existing row — local or D1-authoritative — is ever replaced;
 *   - it is idempotent: on the second run every lookup finds its row and nothing
 *     is written;
 *   - it only touches the `travel` and `food` pools, which the arrival story
 *     reads (see SCENARIO_GRAMMAR_IDS and scenarioVocab.ts).
 *
 * New installs get these rows through this same path (their tables are not
 * empty but these specific ids are missing), so there is exactly one seeding
 * behaviour for everyone.
 */
const ADDITIVE_SEED_ID = 2000;

/**
 * The arrival story's two new scenarios, as additive rows only.
 *
 * `landlord_followup` reuses the exact `Vermieter katze` persona string from the
 * apartment_viewing fixture (story continuity, no schema field needed).
 * `friend_catchup` is the module's du-register scene. These two ids do not exist
 * anywhere in the old fixtures, so `add` can never clobber a live row that a
 * learner already trains with — and if D1 later ships its own rows with these
 * ids, the same per-id guard keeps the local copy out.
 */
const ARRIVAL_TOPUP_SCENARIOS: ScenarioEntity[] = [
  {
    id: 'landlord_followup',
    title_de: 'Anruf beim Vermieter',
    title_ar: 'اتصال بالمؤجّر',
    ai_persona: 'Vermieter katze',
    category: 'housing',
    icon: 'home',
    initial_message_a1: 'Guten Tag. Was kann ich für Sie tun?',
    initial_message_a2: 'Guten Tag. Haben Sie einen Termin, oder geht es um etwas Dringendes?',
    initial_message_b1:
      'Guten Tag. Sie haben gesagt, die Heizung ist kaputt? Dann schauen wir, wann ich vorbeikommen kann.',
    initial_message_b2:
      'Guten Tag. Zu Ihrer Frage zum Mietvertrag und zur Kaution: Am besten lesen wir die Stelle gemeinsam durch. Wann passt es Ihnen?',
  },
  {
    id: 'friend_catchup',
    title_de: 'Mit einer Freundin plaudern',
    title_ar: 'دردشة مع صديقة',
    ai_persona: 'Freundin katze',
    category: 'daily_life',
    icon: 'users',
    initial_message_a1: 'Hallo! Schön, dich zu sehen!',
    initial_message_a2: 'Na, wie geht es dir? Erzähl mal!',
    initial_message_b1: 'Was machst du am Wochenende? Hast du Zeit für einen Kaffee?',
    initial_message_b2: 'Lass uns zusammen essen gehen. Wie wäre es, wenn wir uns morgen treffen?',
  },
];

/** Starter phrases for the two new scenarios only — ids from the >= 2000 range. */
const ARRIVAL_TOPUP_PHRASES: StarterPhraseEntity[] = [
  // landlord_followup: 6 phrases, contiguous from 1
  { id: ADDITIVE_SEED_ID + 1, scenario_id: 'landlord_followup', level: 'A1', german: 'Bei mir ist die Heizung kaputt.', translation_en: 'My heating is broken.', translation_ar: 'التدفئة عندي معطّلة.', sort_order: 1 },
  { id: ADDITIVE_SEED_ID + 2, scenario_id: 'landlord_followup', level: 'A1', german: 'In der Küche tropft der Wasserhahn.', translation_en: 'The tap in the kitchen is dripping.', translation_ar: 'في المطبخ تسيل الحنفية.', sort_order: 2 },
  { id: ADDITIVE_SEED_ID + 3, scenario_id: 'landlord_followup', level: 'A1', german: 'Könnten Sie das bitte reparieren?', translation_en: 'Could you please repair this?', translation_ar: 'هل يمكنك إصلاح هذا من فضلك؟', sort_order: 3 },
  { id: ADDITIVE_SEED_ID + 4, scenario_id: 'landlord_followup', level: 'A1', german: 'Wann könnten Sie vorbeikommen?', translation_en: 'When could you come by?', translation_ar: 'متى يمكنك المرور بالزيارة؟', sort_order: 4 },
  { id: ADDITIVE_SEED_ID + 5, scenario_id: 'landlord_followup', level: 'A2', german: 'Ich habe eine Frage zur Miete und zur Kaution.', translation_en: 'I have a question about the rent and the deposit.', translation_ar: 'لدي سؤال عن الإيجار ومبلغ الضمان.', sort_order: 5 },
  { id: ADDITIVE_SEED_ID + 6, scenario_id: 'landlord_followup', level: 'A1', german: 'Vielen Dank für Ihre Hilfe.', translation_en: 'Thank you very much for your help.', translation_ar: 'شكراً جزيلاً على مساعدتك.', sort_order: 6 },
  // friend_catchup: 6 phrases, contiguous from 1
  { id: ADDITIVE_SEED_ID + 7, scenario_id: 'friend_catchup', level: 'A1', german: 'Wie geht es dir?', translation_en: 'How are you?', translation_ar: 'كيف حالك؟', sort_order: 1 },
  { id: ADDITIVE_SEED_ID + 8, scenario_id: 'friend_catchup', level: 'A1', german: 'Was machst du am Wochenende?', translation_en: 'What are you doing at the weekend?', translation_ar: 'ماذا ستفعل في عطلة نهاية الأسبوع؟', sort_order: 2 },
  { id: ADDITIVE_SEED_ID + 9, scenario_id: 'friend_catchup', level: 'A1', german: 'Hast du am Samstag Zeit?', translation_en: 'Do you have time on Saturday?', translation_ar: 'هل عندك وقت يوم السبت؟', sort_order: 3 },
  { id: ADDITIVE_SEED_ID + 10, scenario_id: 'friend_catchup', level: 'A1', german: 'Lass uns einen Kaffee trinken.', translation_en: "Let's have a coffee.", translation_ar: 'لنشرب قهوة معاً.', sort_order: 4 },
  { id: ADDITIVE_SEED_ID + 11, scenario_id: 'friend_catchup', level: 'A1', german: 'Das passt mir gut.', translation_en: 'That works for me.', translation_ar: 'هذا يناسبني.', sort_order: 5 },
  { id: ADDITIVE_SEED_ID + 12, scenario_id: 'friend_catchup', level: 'A1', german: 'Schreib mir, wenn du Zeit hast.', translation_en: 'Message me when you have time.', translation_ar: 'راسلني عندما يكون عندك وقت.', sort_order: 6 },
];

/** Vocabulary for the two new scenarios' topics, ids from the >= 2000 range. */
const ARRIVAL_TOPUP_VOCAB: VocabularyEntity[] = [
  { id: ADDITIVE_SEED_ID + 1, german: 'Heizung', article: 'die', plural: 'Heizungen', part_of_speech: 'Noun', translation_ar: 'التدفئة', translation_en: 'heating', example_de: 'Die Heizung ist kaputt.', example_ar: 'التدفئة معطّلة.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 2, german: 'kaputt', article: '', plural: null, part_of_speech: 'Adjective', translation_ar: 'معطّل', translation_en: 'broken', example_de: 'Bei mir ist die Heizung kaputt.', example_ar: 'التدفئة عندي معطّلة.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 3, german: 'Wasserhahn', article: 'der', plural: 'Wasserhähne', part_of_speech: 'Noun', translation_ar: 'حنفية الماء', translation_en: 'tap', example_de: 'Der Wasserhahn tropft.', example_ar: 'الحنفية تسيل.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 4, german: 'Küche', article: 'die', plural: 'Küchen', part_of_speech: 'Noun', translation_ar: 'المطبخ', translation_en: 'kitchen', example_de: 'Der Wasserhahn in der Küche tropft.', example_ar: 'حنفية المطبخ تسيل.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 5, german: 'tropfen', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يقطر / تسيل', translation_en: 'to drip', example_de: 'Der Wasserhahn tropft.', example_ar: 'الحنفية تسيل.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 6, german: 'reparieren', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يُصلّح', translation_en: 'to repair', example_de: 'Könnten Sie das bitte reparieren?', example_ar: 'هل يمكنك إصلاح هذا من فضلك؟', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 7, german: 'vorbeikommen', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يمرّ بالزيارة', translation_en: 'to come by', example_de: 'Wann könnten Sie vorbeikommen?', example_ar: 'متى يمكنك المرور بالزيارة؟', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 8, german: 'Termin', article: 'der', plural: 'Termine', part_of_speech: 'Noun', translation_ar: 'موعد', translation_en: 'appointment', example_de: 'Haben Sie einen Termin?', example_ar: 'هل لديك موعد؟', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 9, german: 'Dienstag', article: 'der', plural: 'Dienstage', part_of_speech: 'Noun', translation_ar: 'يوم الثلاثاء', translation_en: 'Tuesday', example_de: 'Der Dienstag passt mir gut.', example_ar: 'يوم الثلاثاء يناسبني.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 10, german: 'schicken', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يرسل', translation_en: 'to send', example_de: 'Können Sie mir das bitte schicken?', example_ar: 'هل يمكنك إرسال ذلك لي من فضلك؟', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 11, german: 'Hilfe', article: 'die', plural: 'Hilfen', part_of_speech: 'Noun', translation_ar: 'مساعدة', translation_en: 'help', example_de: 'Vielen Dank für Ihre Hilfe.', example_ar: 'شكراً جزيلاً على مساعدتك.', topic: 'housing', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 12, german: 'Wochenende', article: 'das', plural: 'Wochenenden', part_of_speech: 'Noun', translation_ar: 'عطلة نهاية الأسبوع', translation_en: 'weekend', example_de: 'Was machst du am Wochenende?', example_ar: 'ماذا ستفعل في عطلة نهاية الأسبوع؟', topic: 'food', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 13, german: 'Samstag', article: 'der', plural: 'Samstage', part_of_speech: 'Noun', translation_ar: 'يوم السبت', translation_en: 'Saturday', example_de: 'Hast du am Samstag Zeit?', example_ar: 'هل عندك وقت يوم السبت؟', topic: 'food', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 14, german: 'Zeit', article: 'die', plural: 'Zeiten', part_of_speech: 'Noun', translation_ar: 'وقت', translation_en: 'time', example_de: 'Hast du Zeit?', example_ar: 'هل عندك وقت؟', topic: 'food', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 15, german: 'morgen', article: '', plural: null, part_of_speech: 'Adverb', translation_ar: 'غداً', translation_en: 'tomorrow', example_de: 'Wie wäre es morgen?', example_ar: 'ما رأيك بالغد؟', topic: 'food', level: 'A1' },
  { id: ADDITIVE_SEED_ID + 16, german: 'passen', article: '', plural: null, part_of_speech: 'Verb', translation_ar: 'يناسب', translation_en: 'to suit', example_de: 'Das passt mir gut.', example_ar: 'هذا يناسبني.', topic: 'food', level: 'A1' },
];

/**
 * Runs the additive top-ups on every launch. Safe to call repeatedly: the
 * per-id existence checks make the second run write nothing.
 */
export async function seedArrivalTopUps(): Promise<void> {
  if (!(await ensureDatabaseOpen())) return;

  // Per-id guarded adds: an existing row — fixture, previously seeded, or
  // D1-authoritative — is always left exactly as it is.
  for (const scenario of ARRIVAL_TOPUP_SCENARIOS) {
    if (!(await db.scenarios.get(scenario.id))) await db.scenarios.add(scenario);
  }

  const missingPhrases: StarterPhraseEntity[] = [];
  for (const phrase of ARRIVAL_TOPUP_PHRASES) {
    if (!(await db.starter_phrases.get(phrase.id))) missingPhrases.push(phrase);
  }
  if (missingPhrases.length > 0) await db.starter_phrases.bulkAdd(missingPhrases);

  const missingWords: VocabularyEntity[] = [];
  for (const word of ARRIVAL_TOPUP_VOCAB) {
    if (!(await db.vocabulary.get(word.id))) missingWords.push(word);
  }
  if (missingWords.length > 0) await db.vocabulary.bulkAdd(missingWords);
}