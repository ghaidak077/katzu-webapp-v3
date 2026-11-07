/**
 * The deterministic answer bank behind the hint sheet.
 *
 * WHY THIS EXISTS
 * A real A1 session produced an EMPTY hint sheet after Katzu asked
 * «Wie heißt du?» / «Wie geht es dir?», and the hints that did appear did not
 * answer the question that was on screen (`rankHintFloor` reordered the
 * scenario's canned phrases, it did not know how to answer a question type).
 *
 * This module keys the first hint on the LAST question the other side asked:
 * the learner always sees a direct answer first, alternatives after it, and the
 * "I didn't understand / please repeat" family dead last. It is pure data and
 * pure functions — no model call, no network — and it covers A0–A2 with more
 * than forty question types.
 *
 * Every German string here is shipped content, so every string is checked by
 * the local German corrector in the test suite and at runtime in dev: an
 * unchanged suggestion must never come back "corrected".
 */

import type { CEFRLevel } from '@/types/models';
import { checkGerman } from './germanChecker';
import { isDevBuild } from '@/lib/utils/env';

export interface BankAnswer {
  german: string;
  arabic: string;
}

export interface QuestionType {
  id: string;
  /** Tested against the lowercased last AI line. */
  match: RegExp;
  answers: [BankAnswer, BankAnswer, BankAnswer];
}

/**
 * The "I didn't understand" family. It is a legitimate reply to any question,
 * so it is offered — but always at the END of the list, never before the answer
 * the learner actually needs.
 */
export const REPEAT_FAMILY: readonly BankAnswer[] = [
  { german: 'Ich verstehe nicht.', arabic: 'لا أفهم.' },
  { german: 'Können Sie das bitte wiederholen?', arabic: 'هل يمكنك إعادة ذلك من فضلك؟' },
  { german: 'Wie bitte?', arabic: 'عذراً، ماذا قلت؟' },
];

/** The honest floor when no question type matches: never an empty sheet. */
export const GENERIC_SAFE_FAMILY: readonly BankAnswer[] = [
  { german: 'Ich verstehe nicht.', arabic: 'لا أفهم.' },
  { german: 'Können Sie das wiederholen?', arabic: 'هل يمكنك إعادة ذلك؟' },
  { german: 'Ja, bitte.', arabic: 'نعم، من فضلك.' },
  { german: 'Nein, danke.', arabic: 'لا، شكراً.' },
];

const NAME = '{name}';

/**
 * A0–A2 question types. Order matters: the specific question wins over the
 * generic one («Was möchten Sie trinken?» is a drink question, not a plain
 * "what would you like").
 */
export const QUESTION_TYPES: readonly QuestionType[] = [
  {
    id: 'name_again',
    match: /\b(wie heißt du nochmal|wie heißt du noch mal|wie heißen sie nochmal|wie war (dein|ihr) name)\b/,
    answers: [
      { german: `Ich heiße ${NAME}.`, arabic: `اسمي ${NAME}.` },
      { german: `Mein Name ist ${NAME}.`, arabic: `اسمي ${NAME}.` },
      { german: `Entschuldigung, ich heiße ${NAME}.`, arabic: `عذراً، اسمي ${NAME}.` },
    ],
  },
  {
    id: 'name',
    match: /\b(wie heißt du|wie heißen sie|wie heisst du|wie heissen sie|dein name|ihr name)\b/,
    answers: [
      { german: `Ich heiße ${NAME}.`, arabic: `اسمي ${NAME}.` },
      { german: `Mein Name ist ${NAME}.`, arabic: `اسمي ${NAME}.` },
      { german: `Ich bin ${NAME}.`, arabic: `أنا ${NAME}.` },
    ],
  },
  {
    id: 'wellbeing',
    match: /\b(wie geht es (dir|ihnen)|wie gehts|wie geht's)\b/,
    answers: [
      { german: 'Mir geht es gut, danke.', arabic: 'أنا بخير، شكراً.' },
      { german: 'Gut, danke.', arabic: 'بخير، شكراً.' },
      { german: 'Es geht, danke.', arabic: 'لا بأس، شكراً.' },
    ],
  },
  {
    id: 'origin',
    match: /\b(woher kommst du|woher kommen sie|aus welchem land)\b/,
    answers: [
      { german: 'Ich komme aus …', arabic: 'أنا من …' },
      { german: 'Ich bin aus …', arabic: 'أنا من …' },
      { german: 'Ich wohne jetzt hier.', arabic: 'أنا أسكن هنا الآن.' },
    ],
  },
  {
    id: 'residence',
    match: /\b(wo wohnst du|wo wohnen sie|wo lebt ihr|wo ist ihre wohnung)\b/,
    answers: [
      { german: 'Ich wohne in …', arabic: 'أسكن في …' },
      { german: 'Ich wohne in der Stadt.', arabic: 'أسكن في المدينة.' },
      { german: 'Ich wohne hier.', arabic: 'أسكن هنا.' },
    ],
  },
  {
    id: 'age',
    match: /\bwie alt\b/,
    answers: [
      { german: 'Ich bin … Jahre alt.', arabic: 'عمري … سنة.' },
      { german: 'Ich bin einundzwanzig.', arabic: 'عمري واحد وعشرون.' },
      { german: 'Das ist ein Geheimnis.', arabic: 'هذا سر.' },
    ],
  },
  {
    id: 'profession',
    match: /\b(was machst du beruflich|was machen sie beruflich|von beruf|was sind sie von beruf)\b/,
    answers: [
      { german: 'Ich arbeite als …', arabic: 'أعمل …' },
      { german: 'Ich bin Student.', arabic: 'أنا طالب.' },
      { german: 'Ich arbeite im Büro.', arabic: 'أعمل في المكتب.' },
    ],
  },
  {
    id: 'languages',
    match: /\b(welche sprachen|sprichst du|sprechen sie)\b/,
    answers: [
      { german: 'Ich spreche Arabisch und ein bisschen Deutsch.', arabic: 'أتحدث العربية وقليلاً من الألمانية.' },
      { german: 'Ich spreche drei Sprachen.', arabic: 'أتحدث ثلاث لغات.' },
      { german: 'Ich lerne Deutsch.', arabic: 'أتعلم الألمانية.' },
    ],
  },
  {
    id: 'family',
    match: /\b(familie|kinder|verheiratet|geschwister)\b/,
    answers: [
      { german: 'Ich bin verheiratet.', arabic: 'أنا متزوج.' },
      { german: 'Ich habe keine Kinder.', arabic: 'ليس لدي أطفال.' },
      { german: 'Ich habe zwei Kinder.', arabic: 'لدي طفلان.' },
    ],
  },
  {
    id: 'hobbies',
    match: /\b(hobbys|hobby|freizeit|was machst du gern|was machen sie gern)\b/,
    answers: [
      { german: 'In meiner Freizeit lese ich gern.', arabic: 'في وقت فراغي أحب القراءة.' },
      { german: 'Ich spiele gern Fußball.', arabic: 'أحب لعب كرة القدم.' },
      { german: 'Ich höre gern Musik.', arabic: 'أحب الاستماع إلى الموسيقى.' },
    ],
  },
  {
    id: 'transport',
    match: /\b(wie kommst du|wie kommen sie|mit welchem (bus|zug)|welche linie)\b/,
    answers: [
      { german: 'Ich komme mit dem Bus.', arabic: 'آتي بالباص.' },
      { german: 'Mit dem Zug.', arabic: 'بالقطار.' },
      { german: 'Zu Fuß.', arabic: 'سيراً على الأقدام.' },
    ],
  },
  {
    id: 'direction',
    match: /\bwohin\b/,
    answers: [
      { german: 'Ich gehe zum Bahnhof.', arabic: 'أذهب إلى محطة القطار.' },
      { german: 'Nach Hause.', arabic: 'إلى المنزل.' },
      { german: 'In die Stadt.', arabic: 'إلى المدينة.' },
    ],
  },
  {
    id: 'place',
    match: /\b(wo ist|wo sind|wo liegt|wo finde ich)\b/,
    answers: [
      { german: 'Es ist dort.', arabic: 'إنه هناك.' },
      { german: 'Neben dem Bahnhof.', arabic: 'بجانب محطة القطار.' },
      { german: 'Ich weiß nicht.', arabic: 'لا أعرف.' },
    ],
  },
  {
    id: 'time',
    match: /\b(wie spät|um wie viel uhr|wie viel uhr|wann öffnet|wann schließt|öffnungszeiten)\b/,
    answers: [
      { german: 'Es ist zehn Uhr.', arabic: 'الساعة العاشرة.' },
      { german: 'Um neun Uhr.', arabic: 'في التاسعة.' },
      { german: 'Bis acht Uhr.', arabic: 'حتى الثامنة.' },
    ],
  },
  {
    id: 'when',
    match: /\b(wann)\b/,
    answers: [
      { german: 'Um zehn Uhr.', arabic: 'في العاشرة.' },
      { german: 'Heute Abend.', arabic: 'هذا المساء.' },
      { german: 'Morgen früh.', arabic: 'غداً صباحاً.' },
    ],
  },
  {
    id: 'price',
    match: /\b(wie viel|wie viele|was kostet|was kosten|preis)\b/,
    answers: [
      { german: 'Das kostet fünf Euro.', arabic: 'هذا يكلف خمسة يورو.' },
      { german: 'Fünf Euro, bitte.', arabic: 'خمسة يورو، من فضلك.' },
      { german: 'Das ist zu teuer.', arabic: 'هذا غالٍ جداً.' },
    ],
  },
  {
    id: 'payment',
    match: /\b(wie möchten sie bezahlen|bar oder mit karte|mit karte oder bar|bezahlen)\b/,
    answers: [
      { german: 'Mit Karte, bitte.', arabic: 'بالبطاقة، من فضلك.' },
      { german: 'Bar, bitte.', arabic: 'نقداً، من فضلك.' },
      { german: 'Ich bezahle mit Karte.', arabic: 'أدفع بالبطاقة.' },
    ],
  },
  {
    id: 'drink',
    match: /\b(etwas trinken|möchten sie trinken|möchtest du trinken|was trinken)\b/,
    answers: [
      { german: 'Ich möchte einen Tee, bitte.', arabic: 'أريد شاياً، من فضلك.' },
      { german: 'Ein Wasser, bitte.', arabic: 'ماءً، من فضلك.' },
      { german: 'Nichts, danke.', arabic: 'لا شيء، شكراً.' },
    ],
  },
  {
    id: 'food',
    match: /\b(etwas essen|möchten sie essen|möchtest du essen|was essen)\b/,
    answers: [
      { german: 'Ich möchte einen Salat, bitte.', arabic: 'أريد سلطة، من فضلك.' },
      { german: 'Ich nehme die Suppe.', arabic: 'سآخذ الشوربة.' },
      { german: 'Nichts, danke.', arabic: 'لا شيء، شكراً.' },
    ],
  },
  {
    id: 'order',
    match: /\b(bestellen|möchten sie bestellen)\b/,
    answers: [
      { german: 'Ich möchte bestellen.', arabic: 'أريد أن أطلب.' },
      { german: 'Ja, bitte.', arabic: 'نعم، من فضلك.' },
      { german: 'Noch nicht, danke.', arabic: 'ليس بعد، شكراً.' },
    ],
  },
  {
    id: 'bill',
    match: /\b(rechnung|zahlen|zusammen oder getrennt)\b/,
    answers: [
      { german: 'Die Rechnung, bitte.', arabic: 'الفاتورة، من فضلك.' },
      { german: 'Ich möchte zahlen.', arabic: 'أريد أن أدفع.' },
      { german: 'Zusammen, bitte.', arabic: 'معاً، من فضلك.' },
    ],
  },
  {
    id: 'help',
    match: /\b(kann ich ihnen helfen|brauchen sie hilfe|wie kann ich helfen|kann ich dir helfen)\b/,
    answers: [
      { german: 'Ja, bitte.', arabic: 'نعم، من فضلك.' },
      { german: 'Nein, danke.', arabic: 'لا، شكراً.' },
      { german: 'Ich suche …', arabic: 'أبحث عن …' },
    ],
  },
  {
    id: 'apology',
    match: /\b(entschuldigung|verzeihung|es tut mir leid)\b/,
    answers: [
      { german: 'Kein Problem.', arabic: 'لا مشكلة.' },
      { german: 'Macht nichts.', arabic: 'لا بأس.' },
      { german: 'Schon gut.', arabic: 'لا بأس.' },
    ],
  },
  {
    id: 'understanding',
    match: /\b(verstehen sie|verstehst du|haben sie verstanden)\b/,
    answers: [
      { german: 'Ja, ich verstehe.', arabic: 'نعم، أفهم.' },
      { german: 'Nein, bitte wiederholen.', arabic: 'لا، أعد من فضلك.' },
      { german: 'Ein bisschen.', arabic: 'قليلاً.' },
    ],
  },
  {
    id: 'repeat',
    match: /\b(wiederholen|noch einmal|langsamer)\b/,
    answers: [
      { german: 'Ja, gern.', arabic: 'نعم، بكل سرور.' },
      { german: 'Bitte langsamer.', arabic: 'ببطء أكثر، من فضلك.' },
      { german: 'Können Sie das wiederholen?', arabic: 'هل يمكنك إعادة ذلك؟' },
    ],
  },
  {
    id: 'spell',
    match: /\b(buchstabieren|wie schreibt man)\b/,
    answers: [
      { german: 'Ja, gern.', arabic: 'نعم، بكل سرور.' },
      { german: `Mein Name ist ${NAME}.`, arabic: `اسمي ${NAME}.` },
      { german: 'Entschuldigung, noch einmal.', arabic: 'عذراً، مرة أخرى.' },
    ],
  },
  {
    id: 'appointment',
    match: /\b(termin|wann haben sie zeit|wann hast du zeit|passt es|wann passt es)\b/,
    answers: [
      { german: 'Am Montag um zehn Uhr.', arabic: 'يوم الاثنين في العاشرة.' },
      { german: 'Das passt gut.', arabic: 'هذا يناسبني.' },
      { german: 'Leider nicht, geht es auch am Dienstag?', arabic: 'للأسف لا، هل ينفع الثلاثاء أيضاً؟' },
    ],
  },
  {
    id: 'doctor',
    match: /\b(was fehlt ihnen|wo tut es weh|haben sie schmerzen|tut es weh)\b/,
    answers: [
      { german: 'Ich habe Kopfschmerzen.', arabic: 'أشعر بصداع.' },
      { german: 'Es tut hier weh.', arabic: 'يؤلمني هنا.' },
      { german: 'Ja, sehr.', arabic: 'نعم، كثيراً.' },
    ],
  },
  {
    id: 'medicine',
    match: /\b(medikament|rezept|tablette|apotheke)\b/,
    answers: [
      { german: 'Ich brauche ein Medikament.', arabic: 'أحتاج دواءً.' },
      { german: 'Ja, bitte ein Rezept.', arabic: 'نعم، وصفة طبية من فضلك.' },
      { german: 'Nein, danke.', arabic: 'لا، شكراً.' },
    ],
  },
  {
    id: 'weather',
    match: /\b(wie ist das wetter|regnet es|ist es kalt|ist es warm)\b/,
    answers: [
      { german: 'Es ist sonnig.', arabic: 'الجو مشمس.' },
      { german: 'Es regnet.', arabic: 'إنها تمطر.' },
      { german: 'Es ist kalt.', arabic: 'الجو بارد.' },
    ],
  },
  {
    id: 'hotel',
    match: /\b(haben sie ein zimmer|reservierung|buchung|einzelzimmer|doppelzimmer|wie lange bleiben)\b/,
    answers: [
      { german: 'Ich habe eine Reservierung.', arabic: 'لدي حجز.' },
      { german: 'Ein Einzelzimmer, bitte.', arabic: 'غرفة فردية، من فضلك.' },
      { german: 'Für zwei Nächte.', arabic: 'لمدة ليلتين.' },
    ],
  },
  {
    id: 'route',
    match: /\b(wie komme ich|wo ist der weg|wie gehe ich)\b/,
    answers: [
      { german: 'Nehmen Sie die Linie zwei.', arabic: 'خذ الخط رقم اثنين.' },
      { german: 'Gehen Sie geradeaus.', arabic: 'امشِ مباشرة.' },
      { german: 'Ist es weit?', arabic: 'هل هو بعيد؟' },
    ],
  },
  {
    id: 'ticket',
    match: /\b(fahrkarte|ticket|wohin fahren|hin und zurück|einfach oder hin)\b/,
    answers: [
      { german: 'Eine Fahrkarte nach …, bitte.', arabic: 'تذكرة إلى …، من فضلك.' },
      { german: 'Hin und zurück, bitte.', arabic: 'ذهاب وإياب، من فضلك.' },
      { german: 'Einfach, bitte.', arabic: 'ذهاب فقط، من فضلك.' },
    ],
  },
  {
    id: 'luggage',
    match: /\b(gepäck|koffer|bordkarte|flug|flughafen)\b/,
    answers: [
      { german: 'Hier ist mein Koffer.', arabic: 'هذه حقيبتي.' },
      { german: 'Ja, ich habe mein Gepäck.', arabic: 'نعم، لدي أمتعتي.' },
      { german: 'Meine Bordkarte, bitte.', arabic: 'بطاقة صعودي، من فضلك.' },
    ],
  },
  {
    id: 'flat',
    match: /\b(wohnung|miete|zimmer frei|wie hoch ist die miete)\b/,
    answers: [
      { german: 'Die Wohnung ist schön.', arabic: 'الشقة جميلة.' },
      { german: 'Wie hoch ist die Miete?', arabic: 'كم قيمة الإيجار؟' },
      { german: 'Ich suche eine Wohnung.', arabic: 'أبحث عن شقة.' },
    ],
  },
  {
    id: 'neighbour',
    match: /\b(nachbar|im haus|welcher stock)\b/,
    answers: [
      { german: 'Ich wohne im dritten Stock.', arabic: 'أسكن في الطابق الثالث.' },
      { german: 'Mein Nachbar ist freundlich.', arabic: 'جاري لطيف.' },
      { german: 'Ja, gern.', arabic: 'نعم، بكل سرور.' },
    ],
  },
  {
    id: 'invitation',
    match: /\b(möchtest du|haben sie lust|hast du lust|kommen sie mit|können sie kommen)\b/,
    answers: [
      { german: 'Ja, gern.', arabic: 'نعم، بكل سرور.' },
      { german: 'Leider habe ich keine Zeit.', arabic: 'للأسف ليس لدي وقت.' },
      { german: 'Wann denn?', arabic: 'متى إذن؟' },
    ],
  },
  {
    id: 'what_is_that',
    match: /\b(was ist das|was ist das denn)\b/,
    answers: [
      { german: 'Das ist ein …, glaube ich.', arabic: 'هذا …، أعتقد.' },
      { german: 'Ich weiß nicht.', arabic: 'لا أعرف.' },
      { german: 'Das ist neu.', arabic: 'هذا جديد.' },
    ],
  },
  {
    id: 'colour_size',
    match: /\b(welche farbe|welche größe|welche groesse)\b/,
    answers: [
      { german: 'In Blau, bitte.', arabic: 'بالأزرق، من فضلك.' },
      { german: 'Größe M, bitte.', arabic: 'مقاس M، من فضلك.' },
      { german: 'Das ist zu klein.', arabic: 'هذا صغير جداً.' },
    ],
  },
  {
    id: 'farewell',
    match: /\b(schönen tag|bis bald|auf wiedersehen|tschüss|schönen abend)\b/,
    answers: [
      { german: 'Danke, Ihnen auch.', arabic: 'شكراً، ولك أيضاً.' },
      { german: 'Tschüss!', arabic: 'إلى اللقاء!' },
      { german: 'Bis später.', arabic: 'إلى وقت لاحق.' },
    ],
  },
  {
    id: 'thanks',
    match: /\b(vielen dank|danke schön|danke)\b/,
    answers: [
      { german: 'Bitte, gern.', arabic: 'على الرحب والسعة.' },
      { german: 'Danke schön.', arabic: 'شكراً جزيلاً.' },
      { german: 'Ihnen auch.', arabic: 'ولك أيضاً.' },
    ],
  },
  {
    id: 'plans',
    match: /\b(was machst du morgen|was machen sie am wochenende|hast du pläne|haben sie pläne|was machst du am wochenende)\b/,
    answers: [
      { german: 'Ich arbeite morgen.', arabic: 'سأعمل غداً.' },
      { german: 'Ich bleibe zu Hause.', arabic: 'سأبقى في المنزل.' },
      { german: 'Ich weiß noch nicht.', arabic: 'لا أعرف بعد.' },
    ],
  },
  {
    id: 'interests',
    match: /\b(interessierst du dich|interessieren sie sich|was magst du|was mögen sie)\b/,
    answers: [
      { german: 'Ich interessiere mich für Musik.', arabic: 'أهتم بالموسيقى.' },
      { german: 'Ich mag Sport.', arabic: 'أحب الرياضة.' },
      { german: 'Nicht so sehr.', arabic: 'ليس كثيراً.' },
    ],
  },
  {
    id: 'quantity',
    match: /\b(wie viele (personen|nächte|zimmer)|für wie viele)\b/,
    answers: [
      { german: 'Für zwei Personen.', arabic: 'لشخصين.' },
      { german: 'Für zwei Nächte.', arabic: 'لمدة ليلتين.' },
      { german: 'Nur eine Person.', arabic: 'شخص واحد فقط.' },
    ],
  },
  {
    id: 'address',
    match: /\b(wo ist ihre adresse|wie ist ihre adresse|adresse)\b/,
    answers: [
      { german: 'Meine Adresse ist …', arabic: 'عنواني هو …' },
      { german: 'Ich wohne in der Hauptstraße.', arabic: 'أسكن في الشارع الرئيسي.' },
      { german: 'Das steht auf dem Formular.', arabic: 'هذا مكتوب في الاستمارة.' },
    ],
  },
  {
    id: 'phone',
    match: /\b(telefonnummer|wie ist ihre nummer|ihre nummer)\b/,
    answers: [
      { german: 'Meine Nummer ist …', arabic: 'رقمي هو …' },
      { german: 'Ich habe keine Nummer.', arabic: 'ليس لدي رقم.' },
      { german: 'Schreiben Sie sie bitte auf.', arabic: 'اكتبها من فضلك.' },
    ],
  },
  {
    id: 'birthday',
    match: /\b(geburtstag)\b/,
    answers: [
      { german: 'Am zwölften Mai.', arabic: 'في الثاني عشر من مايو.' },
      { german: 'Im Mai.', arabic: 'في مايو.' },
      { german: 'Das weiß ich nicht.', arabic: 'لا أعرف ذلك.' },
    ],
  },
  {
    id: 'wish',
    match: /\b(was möchten sie|was möchtest du|was nehmen sie|was darf es sein|was hätten sie gern)\b/,
    answers: [
      { german: 'Ich möchte …, bitte.', arabic: 'أريد …، من فضلك.' },
      { german: 'Für mich das, bitte.', arabic: 'لي هذا، من فضلك.' },
      { german: 'Ich nehme das.', arabic: 'سآخذ هذا.' },
    ],
  },
  {
    id: 'yes_no',
    match: /^(kann|können|haben|hast|ist|sind|möchten|möchtest|wollen|willst|darf|dürfen|brauchen|brauchst|gibt es|ist da)\b/,
    answers: [
      { german: 'Ja, bitte.', arabic: 'نعم، من فضلك.' },
      { german: 'Nein, danke.', arabic: 'لا، شكراً.' },
      { german: 'Vielleicht.', arabic: 'ربما.' },
    ],
  },
];

const lower = (value: string) => String(value || '').toLowerCase();

/** The question type a line asks, or null when it asks nothing we know. */
export function classifyQuestion(lastAiGerman: string | null | undefined): QuestionType | null {
  const text = lower(String(lastAiGerman || '')).trim();
  if (!text) return null;
  for (const type of QUESTION_TYPES) {
    if (type.match.test(text)) return type;
  }
  return null;
}

const NAME_PATTERN = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{0,23}$/;

/** Fill the `{name}` slot: a real first name wins, a placeholder otherwise. */
function fillName(german: string, arabic: string, learnerName: string | null | undefined): BankAnswer {
  const clean = String(learnerName || '').trim();
  if (clean && NAME_PATTERN.test(clean)) {
    const name = clean[0].toUpperCase() + clean.slice(1);
    return {
      german: german.replaceAll(NAME, name),
      arabic: arabic.replaceAll(NAME, name),
    };
  }
  return {
    german: german.replaceAll(NAME, '…'),
    arabic: arabic.replaceAll(NAME, '…'),
  };
}

/**
 * The hints for the last AI line, answer first and the repeat family last.
 *
 * Returns at least the generic safe family, so the sheet can never be empty.
 * `level` is accepted for the stable signature; the bank is written inside the
 * A0–A2 caps and the same policy serves every level band.
 */
export function answerHintsFor(
  lastAiGerman: string | null | undefined,
  options: { learnerName?: string | null; level?: CEFRLevel } = {},
): BankAnswer[] {
  const text = String(lastAiGerman || '').trim();
  // A statement asks nothing: it has no answer, so the caller keeps the
  // scenario's own phrase floor. Only a QUESTION needs this bank.
  if (!text.includes('?')) return [];
  const type = classifyQuestion(text);
  if (!type) return [...GENERIC_SAFE_FAMILY];
  const direct = type.answers.map((answer) => fillName(answer.german, answer.arabic, options.learnerName));
  return [...direct, ...REPEAT_FAMILY];
}

/** True when the local corrector would change this shipped German line. */
export function suggestionIsClean(german: string): boolean {
  return checkGerman(german).errors.length === 0;
}

/**
 * Runtime invariant: an unchanged suggestion must never be "corrected".
 * Called in dev/test; a violation is a content bug, not a learner turn.
 */
export function assertSuggestionClean(german: string): void {
  const result = checkGerman(german);
  if (result.errors.length > 0) {
    throw new Error(`Suggestion would be corrected: "${german}" → "${result.corrected}"`);
  }
}

/** Drops any hint the corrector would change. A wrong hint is worse than none. */
export function filterCleanHints<T extends { german: string }>(hints: readonly T[]): T[] {
  return hints.filter((hint) => {
    const clean = suggestionIsClean(hint.german);
    if (!clean && isDevBuild) {
      // The invariant, surfaced loudly in dev: shipped/AI content must never be
      // handed to the learner if saying it unchanged would earn a correction.
      console.error(`Suggestion rejected: "${hint.german}" would be corrected.`);
    }
    return clean;
  });
}

/** Coverage numbers for the docs/checklist and the tests. */
export function answerBankCoverage(): { types: number; answers: number; levels: string } {
  return {
    types: QUESTION_TYPES.length,
    answers: QUESTION_TYPES.reduce((total, type) => total + type.answers.length, 0),
    levels: 'A0–A2',
  };
}
