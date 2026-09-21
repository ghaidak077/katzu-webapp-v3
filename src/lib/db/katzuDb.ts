import Dexie, { type EntityTable } from 'dexie';
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
  SyncQueueEntity,
} from '@/types/models';
import { toLocalDateKey, updateStreak } from '@/features/report/metrics';

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
  }
}

export const db = new KatzuDatabase();

// Call once per completed learning activity (session or quiz); keeps the daily streak honest.
export async function recordDailyActivity(): Promise<void> {
  const user = await db.users.get('current_user');
  if (!user) return;
  const next = updateStreak(
    { streakDays: user.streakDays || 0, lastActiveDate: user.lastActiveDate || null },
    toLocalDateKey(),
  );
  await db.users.update('current_user', { ...next, updatedAt: Date.now() });
}

// Wipes all user-scoped data (sessions, mistakes, saved words, training, redeemed codes) on sign-out
export async function wipeUserScopedData(): Promise<void> {
  await Promise.all([
    db.sessions.clear(),
    db.mistakes.clear(),
    db.saved_words.clear(),
    db.scenario_training.clear(),
    db.redeemed_codes.clear(),
    db.sync_queue.clear(),
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
    lastActiveDate: new Date().toISOString().split('T')[0],
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

// Default seed data to ensure immediate offline & first-run availability
export async function initializeDatabaseSeed(): Promise<void> {
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
      lastActiveDate: new Date().toISOString().split('T')[0],
      totalXp: 0,
      speechSpeed: 1.0,
      sarcasmLevel: 'SASSY',
      freeSessionsRemaining: 3,
      dailyGoalMinutes: 15,
      weeklyGoalDays: 5,
    });
  }

  // Production curriculum is owned by D1/Worker. Keep local fixtures available
  // only for development so the browser cannot silently become the source of truth.
  if (!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) return;

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
        initial_message_a1: 'Guten Morgen! Was darf es denn heute sein?',
        initial_message_a2: 'Hallo! Wir haben heute frische Brötchen und Brezeln. Was hätten Sie gerne?',
        initial_message_b1: 'Guten Morgen! Schauen Sie sich gerne um. Unsere Dinkelbrötchen sind heute besonders knusprig.',
        initial_message_b2: 'Guten Tag! Wie kann ich Ihnen behilflich sein? Suchen Sie etwas Bestimmtes für das Frühstück?',
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
        initial_message_b1: 'Hallo! Nehmen Sie bitte Platz. Seit wann haben Sie denn diese Symptome und wo genau tut es weh?',
        initial_message_b2: 'Guten Tag. Ich sehe in Ihren Unterlagen, dass Sie über Unwohlsein klagen. Beschreiben Sie mir das doch bitte im Detail.',
      },
      {
        id: 'apartment_viewing',
        title_de: 'Wohnungsbesichtigung',
        title_ar: 'معاينة شقة',
        ai_persona: 'Vermieter katze',
        category: 'housing',
        icon: 'home',
        initial_message_a1: 'Hallo! Gefällt Ihnen die Wohnung?',
        initial_message_a2: 'Guten Tag! Willkommen zur Besichtigung. Haben Sie Fragen zur Lage oder den Nebenkosten?',
        initial_message_b1: 'Guten Tag! Wie Sie sehen, ist die Wohnung sehr hell geschnitten. Ab wann würden Sie denn einziehen wollen?',
        initial_message_b2: 'Schönen guten Tag! Schön, dass Sie pünktlich sind. Schauen Sie sich in Ruhe um und fragen Sie gerne nach der Hausordnung und Kaution.',
      },
      {
        id: 'job_interview',
        title_de: 'Das Vorstellungsgespräch',
        title_ar: 'مقابلة العمل',
        ai_persona: 'Chef katze',
        category: 'career',
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
        initial_message_a2: 'Hallo! Suchen Sie eine Verbindung oder möchten Sie ein Ticket kaufen?',
        initial_message_b1: 'Guten Tag am Infoschalter der Deutschen Bahn. Haben Sie eine BahnCard oder reisen Sie zum Normalpreis?',
        initial_message_b2: 'Guten Tag! Wegen einer Stellwerkstörung gibt es aktuell Verspätungen. Wie kann ich Ihre Weiterreise organisieren?',
      }
    ]);
  }

  const starterCount = await db.starter_phrases.count();
  if (starterCount === 0) {
    await db.starter_phrases.bulkPut([
      { id: 1, scenario_id: 'cafe_order', level: 'A1', german: 'Ich möchte bitte einen Kaffee.', translation_en: 'I would like a coffee please.', translation_ar: 'أريد قهوة من فضلك.', sort_order: 1 },
      { id: 2, scenario_id: 'cafe_order', level: 'A1', german: 'Haben Sie auch Tee?', translation_en: 'Do you also have tea?', translation_ar: 'هل لديكم شاي أيضاً؟', sort_order: 2 },
      { id: 3, scenario_id: 'cafe_order', level: 'A1', german: 'Wie viel kostet das?', translation_en: 'How much does that cost?', translation_ar: 'كم يكلف هذا؟', sort_order: 3 },
      { id: 4, scenario_id: 'cafe_order', level: 'A1', german: 'Ich bezahle mit Karte bitte.', translation_en: 'I will pay by card please.', translation_ar: 'سأدفع بالبطاقة من فضلك.', sort_order: 4 },
      { id: 5, scenario_id: 'bakery_shopping', level: 'A1', german: 'Zwei Brötchen, bitte.', translation_en: 'Two bread rolls, please.', translation_ar: 'قطعتان من الخبز الصغير، من فضلك.', sort_order: 1 },
      { id: 6, scenario_id: 'bakery_shopping', level: 'A1', german: 'Ist das Brot frisch?', translation_en: 'Is this bread fresh?', translation_ar: 'هل هذا الخبز طازج؟', sort_order: 2 },
      { id: 7, scenario_id: 'doctor_visit', level: 'A1', german: 'Mein Kopf tut weh.', translation_en: 'My head hurts.', translation_ar: 'رأسي يؤلمني.', sort_order: 1 },
      { id: 8, scenario_id: 'doctor_visit', level: 'A1', german: 'Ich habe seit gestern Fieber.', translation_en: 'I have had a fever since yesterday.', translation_ar: 'لدي حمى منذ الأمس.', sort_order: 2 },
    ]);
  }

  const vocabCount = await db.vocabulary.count();
  if (vocabCount === 0) {
    await db.vocabulary.bulkPut([
      { id: 1, german: 'Kaffee', article: 'der', plural: 'Kaffees', part_of_speech: 'Noun', translation_ar: 'قهوة', translation_en: 'Coffee', example_de: 'Der Kaffee ist sehr heiß.', example_ar: 'القهوة ساخنة جداً.', topic: 'cafe_order', level: 'A1' },
      { id: 2, german: 'Tee', article: 'der', plural: 'Tees', part_of_speech: 'Noun', translation_ar: 'شاي', translation_en: 'Tea', example_de: 'Ich trinke gerne grünen Tee.', example_ar: 'أحب شرب الشاي الأخضر.', topic: 'cafe_order', level: 'A1' },
      { id: 3, german: 'Rechnung', article: 'die', plural: 'Rechnungen', part_of_speech: 'Noun', translation_ar: 'فاتورة / الحساب', translation_en: 'Bill', example_de: 'Die Rechnung bitte!', example_ar: 'الحساب من فضلك!', topic: 'cafe_order', level: 'A1' },
      { id: 4, german: 'Wasser', article: 'das', plural: 'Wässer', part_of_speech: 'Noun', translation_ar: 'ماء', translation_en: 'Water', example_de: 'Ein Glas Wasser bitte.', example_ar: 'كأس ماء من فضلك.', topic: 'cafe_order', level: 'A1' },
      { id: 5, german: 'Brötchen', article: 'das', plural: 'Brötchen', part_of_speech: 'Noun', translation_ar: 'لفافة خبز صغيرة', translation_en: 'Bread roll', example_de: 'Das Brötchen schmeckt lecker.', example_ar: 'لفافة الخبز لذيذة.', topic: 'bakery_shopping', level: 'A1' },
      { id: 6, german: 'Schmerz', article: 'der', plural: 'Schmerzen', part_of_speech: 'Noun', translation_ar: 'ألم', translation_en: 'Pain', example_de: 'Ich habe starke Schmerzen.', example_ar: 'لدي آلام شديدة.', topic: 'doctor_visit', level: 'A1' },
      { id: 7, german: 'Termin', article: 'der', plural: 'Termine', part_of_speech: 'Noun', translation_ar: 'موعد', translation_en: 'Appointment', example_de: 'Ich habe morgen einen Termin.', example_ar: 'لدي موعد غداً.', topic: 'doctor_visit', level: 'A1' },
      { id: 8, german: 'Fahrkarte', article: 'die', plural: 'Fahrkarten', part_of_speech: 'Noun', translation_ar: 'تذكرة سفر', translation_en: 'Ticket', example_de: 'Wo kann ich die Fahrkarte kaufen?', example_ar: 'أين يمكنني شراء التذكرة؟', topic: 'train_station', level: 'A1' },
    ]);
  }

  const grammarCount = await db.grammar.count();
  if (grammarCount === 0) {
    await db.grammar.bulkPut([
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
}
