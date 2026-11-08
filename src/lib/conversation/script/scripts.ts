import type { CEFRLevel } from '@/types/models';
import type { AnswerMatch, PersonaGender, PersonaRole, ScenarioScript, ScriptStep } from './types';

/**
 * The migrated scenarios, authored as scripts.
 *
 * Pilot order (the owner's decision): the greetings scenario that failed, then
 * units 1 and 2. Unmigrated scenarios keep the legacy model-driven engine, so
 * this file grows unit by unit and never half-migrates a level.
 *
 * Every German line here is checked by `tests/scenarioScript.test.ts` against the
 * same corrector the learner's own sentence passes — a persona line the app would
 * "correct" is a bug, not content.
 */

const L = (de: string, ar: string) => ({ de, ar });

interface StepInput {
  id: string;
  slot?: string;
  asks: Array<[string, string]>;
  reasks: Array<[string, string]>;
  match: AnswerMatch;
  keywords?: string[];
  reactions: Array<[string, string]>;
  hint: [string, string];
  farewell?: boolean;
}

const step = (input: StepInput): ScriptStep => ({
  id: input.id,
  slot: input.slot,
  asks: input.asks.map(([de, ar]) => L(de, ar)),
  reasks: input.reasks.map(([de, ar]) => L(de, ar)),
  match: input.match,
  keywords: input.keywords,
  reactions: input.reactions.map(([de, ar]) => L(de, ar)),
  hints: [L(input.hint[0], input.hint[1])],
  farewell: input.farewell,
});

const script = (
  scenarioId: string,
  level: CEFRLevel,
  persona: { name: string; role: PersonaRole; gender: PersonaGender; personality: string },
  goalAr: string,
  steps: ScriptStep[],
): ScenarioScript => ({ scenarioId, level, persona, goalAr, steps });

const YESNO = { type: 'yesno' } as const;
const NUMBER = { type: 'number' } as const;

const keyword = (keywords: string[]): AnswerMatch => ({ type: 'keyword', keywords });

const GOODBYE: StepInput = {
  id: 'goodbye',
  asks: [['Schön, dass wir gesprochen haben. Auf Wiedersehen!', 'كان حديثنا جميلاً. إلى اللقاء!']],
  reasks: [['Auf Wiedersehen!', 'إلى اللقاء!'], ['Bis zum nächsten Mal!', 'إلى المرة القادمة!']],
  match: { type: 'anything' },
  reactions: [['Auf Wiedersehen! Einen schönen Tag noch.', 'إلى اللقاء! أتمنى لك يوماً جميلاً.']],
  hint: ['Auf Wiedersehen!', 'إلى اللقاء!'],
  farewell: true,
};

/* ── The greetings scenario that failed in the real session ─────────────── */

const firstGreetings = script(
  'first_greetings',
  'A1',
  { name: 'Frau Meier', role: 'host', gender: 'female', personality: 'دافئة وهادئة، تسأل سؤالاً واحداً في كل مرة' },
  'تتعرّف على جارتك، تتبادلان الاسم والبلد والمدينة، ثم تنهيان الحديث بتحية.',
  [
    step({
      id: 'name',
      slot: 'name',
      asks: [
        ['Hallo! Ich bin Frau Meier. Wie heißt du?', 'مرحباً! أنا السيدة ماير. ما اسمك؟'],
        ['Hallo! Schön, dich zu treffen. Wie heißt du?', 'مرحباً! سعيدة بلقائك. ما اسمك؟'],
        ['Hi! Ich wohne gleich nebenan. Wie heißt du?', 'أهلاً! أسكن بجوارك تماماً. ما اسمك؟'],
      ],
      reasks: [
        ['Entschuldigung, wie ist dein Name?', 'عذراً، ما اسمك؟'],
        ['Wie darf ich dich nennen?', 'بماذا أناديك؟'],
      ],
      match: { type: 'name' },
      reactions: [['Freut mich, {name}!', 'سعيدة بمعرفتك، {name}!']],
      hint: ['Ich heiße ___.', 'اسمي ___.'],
    }),
    step({
      id: 'origin',
      slot: 'origin',
      asks: [
        ['Woher kommst du, {name}?', 'من أين أنت؟'],
        ['Aus welchem Land kommst du?', 'من أي بلد أنت؟'],
        ['Und wo bist du geboren?', 'وأين وُلدت؟'],
      ],
      reasks: [
        ['Entschuldigung, aus welchem Land kommst du?', 'عذراً، من أي بلد أنت؟'],
        ['Woher kommst du noch einmal?', 'من أين أنت مرة أخرى؟'],
      ],
      match: { type: 'origin' },
      reactions: [['Ah, aus {origin}!', 'آه، من {origin}!']],
      hint: ['Ich komme aus ___.', 'أنا من ___.'],
    }),
    step({
      id: 'city',
      slot: 'city',
      asks: [
        ['Und wo wohnst du jetzt?', 'وأين تسكن الآن؟'],
        ['In welcher Stadt wohnst du?', 'في أي مدينة تسكن؟'],
        ['Wo lebst du gerade?', 'أين تعيش حالياً؟'],
      ],
      reasks: [
        ['In welcher Stadt wohnst du gerade?', 'في أي مدينة تسكن حالياً؟'],
        ['Wo wohnst du im Moment?', 'أين تسكن في الوقت الحالي؟'],
      ],
      match: { type: 'city' },
      reactions: [['{city} ist eine schöne Stadt.', '{city} مدينة جميلة.']],
      hint: ['Ich wohne in ___.', 'أسكن في ___.'],
    }),
    step({
      id: 'city_opinion',
      asks: [
        ['Wie gefällt dir {city}?', 'كيف تعجبك {city}؟'],
        ['Gefällt dir {city}?', 'هل تعجبك {city}؟'],
        ['Fühlst du dich in {city} wohl?', 'هل تشعر بالراحة في {city}؟'],
      ],
      reasks: [
        ['Und wie findest du {city}?', 'وما رأيك في {city}؟'],
        ['Magst du {city}?', 'هل تحب {city}؟'],
      ],
      match: keyword(['gut', 'schön', 'gefällt', 'ruhig', 'freundlich', 'wohl', 'gern', 'gerne', 'mag']),
      keywords: ['gut', 'schön', 'ruhig', 'freundlich', 'gern', 'mag'],
      reactions: [['Das freut mich sehr!', 'يسعدني ذلك كثيراً!']],
      hint: ['Die Stadt gefällt mir sehr gut.', 'المدينة تعجبني كثيراً.'],
    }),
    step(GOODBYE),
  ],
);

/* ── Unit 1 — first words: numbers, prices, café, bakery, market, restaurant ── */

const numbersAndPrices = script(
  'numbers_and_prices',
  'A1',
  { name: 'Herr Klein', role: 'clerk', gender: 'male', personality: 'صاحب دكان صبور، يكرّر السعر بوضوح' },
  'تسأل عن شيء وتدفع ثمنه، وتفهم السعر والعدد.',
  [
    step({
      id: 'item',
      slot: 'item',
      asks: [
        ['Hallo! Was möchten Sie?', 'مرحباً! ماذا تريد؟'],
        ['Guten Tag! Was darf es für Sie sein?', 'نهارك سعيد! ماذا تريد؟'],
        ['Hallo! Womit kann ich Ihnen helfen?', 'مرحباً! كيف أساعدك؟'],
      ],
      reasks: [
        ['Was möchten Sie kaufen?', 'ماذا تريد أن تشتري؟'],
        ['Welchen Artikel brauchen Sie?', 'أي شيء تحتاج؟'],
      ],
      match: keyword(['möchte', 'brauche', 'kaufen', 'brot', 'milch', 'apfel', 'wasser']),
      keywords: ['möchte', 'brauche', 'brot', 'milch', 'apfel', 'wasser'],
      reactions: [['Gern, das haben wir.', 'بكل سرور، لدينا ذلك.']],
      hint: ['Ich möchte Brot, bitte.', 'أريد خبزاً، من فضلك.'],
    }),
    step({
      id: 'quantity',
      slot: 'number',
      asks: [
        ['Wie viel brauchen Sie?', 'كم تحتاج؟'],
        ['Wie viele möchten Sie?', 'كم تريد؟'],
        ['Reicht ein Kilo?', 'هل يكفي كيلو واحد؟'],
      ],
      reasks: [
        ['Wie viele Stück, bitte?', 'كم قطعة، من فضلك؟'],
        ['Wie viel brauchen Sie, bitte?', 'كم تحتاج، من فضلك؟'],
      ],
      match: NUMBER,
      reactions: [['Gut, {number}.', 'حسناً، {number}.']],
      hint: ['Zwei Stück, bitte.', 'قطعتان، من فضلك.'],
    }),
    step({
      id: 'price',
      asks: [
        ['Das kostet vier Euro fünfzig. Ist das in Ordnung?', 'الثمن أربعة يورو وخمسون. هل هذا مناسب؟'],
        ['Der Preis ist vier Euro fünfzig. Passt das?', 'السعر أربعة يورو وخمسون. مناسب؟'],
        ['Vier Euro fünfzig, ja?', 'أربعة يورو وخمسون، صحيح؟'],
      ],
      reasks: [
        ['Ist der Preis in Ordnung?', 'هل السعر مناسب؟'],
        ['Sind vier Euro fünfzig okay für Sie?', 'هل أربعة يورو وخمسون مناسبة لك؟'],
      ],
      match: YESNO,
      reactions: [['Danke!', 'شكراً!']],
      hint: ['Ja, das ist in Ordnung.', 'نعم، هذا مناسب.'],
    }),
    step({
      id: 'payment',
      asks: [
        ['Wie möchten Sie bezahlen?', 'كيف تريد أن تدفع؟'],
        ['Bar oder mit Karte?', 'نقداً أم بالبطاقة؟'],
        ['Zahlen Sie bar oder mit Karte?', 'تدفع نقداً أم بالبطاقة؟'],
      ],
      reasks: [
        ['Bar oder Karte, bitte?', 'نقداً أم بطاقة، من فضلك؟'],
        ['Welche Zahlungsart möchten Sie?', 'أي طريقة دفع تريد؟'],
      ],
      match: keyword(['bar', 'karte', 'bargeld']),
      keywords: ['bar', 'karte', 'bargeld'],
      reactions: [['Alles klar, ich tippe es ein.', 'حسناً، سأسجّلها.']],
      hint: ['Mit Karte, bitte.', 'بالبطاقة، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const cafeOrder = script(
  'cafe_order',
  'A1',
  { name: 'Lena', role: 'barista', gender: 'female', personality: 'سريعة وودودة، تكرّر الطلب للتأكيد' },
  'تطلب مشروباً وتحدّد الحجم والمكان وتدفع.',
  [
    step({
      id: 'drink',
      slot: 'drink',
      asks: [
        ['Hallo! Was möchten Sie trinken?', 'مرحباً! ماذا تريد أن تشرب؟'],
        ['Guten Tag! Was darf ich Ihnen bringen?', 'نهارك سعيد! ماذا أحضر لك؟'],
        ['Hi! Möchten Sie einen Kaffee?', 'أهلاً! هل تريد قهوة؟'],
      ],
      reasks: [
        ['Welches Getränk möchten Sie?', 'أي مشروب تريد؟'],
        ['Kaffee, Tee oder etwas anderes?', 'قهوة، شاي أم شيء آخر؟'],
      ],
      match: keyword(['kaffee', 'tee', 'wasser', 'saft', 'milch', 'cola']),
      keywords: ['kaffee', 'tee', 'wasser', 'saft', 'milch', 'cola'],
      reactions: [['Gern, ich bringe das.', 'بكل سرور، سأحضره.']],
      hint: ['Einen Kaffee, bitte.', 'قهوة، من فضلك.'],
    }),
    step({
      id: 'size',
      asks: [
        ['Möchten Sie einen kleinen oder einen großen Kaffee?', 'تريد قهوة صغيرة أم كبيرة؟'],
        ['Klein oder groß?', 'صغيرة أم كبيرة؟'],
        ['Welche Größe darf es sein?', 'أي حجم تريد؟'],
      ],
      reasks: [
        ['Noch einmal: klein oder groß?', 'مرة أخرى: صغيرة أم كبيرة؟'],
        ['Welche Größe, bitte?', 'أي حجم، من فضلك؟'],
      ],
      match: keyword(['klein', 'groß', 'mittel']),
      keywords: ['klein', 'groß', 'mittel'],
      reactions: [['Gut, ich mache das fertig.', 'حسناً، سأحضّره.']],
      hint: ['Einen kleinen Kaffee, bitte.', 'قهوة صغيرة، من فضلك.'],
    }),
    step({
      id: 'place',
      asks: [
        ['Trinken Sie hier oder nehmen Sie mit?', 'تشرب هنا أم تأخذ معك؟'],
        ['Hier oder zum Mitnehmen?', 'هنا أم للطلب الخارجي؟'],
        ['Möchten Sie hier sitzen?', 'هل تريد الجلوس هنا؟'],
      ],
      reasks: [
        ['Hier oder zum Mitnehmen, bitte?', 'هنا أم معك، من فضلك؟'],
        ['Wo möchten Sie trinken?', 'أين تريد أن تشرب؟'],
      ],
      match: keyword(['hier', 'mitnehmen', 'mit']),
      keywords: ['hier', 'mitnehmen'],
      reactions: [['Alles klar.', 'حسناً.']],
      hint: ['Hier, bitte.', 'هنا، من فضلك.'],
    }),
    step({
      id: 'pay',
      asks: [
        ['Das macht drei Euro. Stimmt so?', 'المجموع ثلاثة يورو. هل هذا صحيح؟'],
        ['Drei Euro, bitte. Passt das?', 'ثلاثة يورو، من فضلك. مناسب؟'],
        ['Möchten Sie mit Karte zahlen?', 'هل تريد الدفع بالبطاقة؟'],
      ],
      reasks: [
        ['Sind drei Euro in Ordnung?', 'هل ثلاثة يورو مناسبة؟'],
        ['Möchten Sie bar oder mit Karte zahlen?', 'تدفع نقداً أم بالبطاقة؟'],
      ],
      match: YESNO,
      reactions: [['Danke schön!', 'شكراً جزيلاً!']],
      hint: ['Ja, mit Karte, bitte.', 'نعم، بالبطاقة، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const bakeryShopping = script(
  'bakery_shopping',
  'A1',
  { name: 'Frau Weber', role: 'baker', gender: 'female', personality: 'صبورة، تعرض ما طازج اليوم' },
  'تشتري خبزاً وتحدّد الكمية وتدفع.',
  [
    step({
      id: 'bread',
      slot: 'item',
      asks: [
        ['Hallo! Möchten Sie Brot?', 'مرحباً! هل تريد خبزاً؟'],
        ['Guten Morgen! Was darf es sein?', 'صباح الخير! ماذا تريد؟'],
        ['Hallo! Wir haben frisches Brot. Möchten Sie etwas?', 'مرحباً! لدينا خبز طازج. هل تريد شيئاً؟'],
      ],
      reasks: [
        ['Welches Brot möchten Sie?', 'أي خبز تريد؟'],
        ['Was möchten Sie kaufen?', 'ماذا تريد أن تشتري؟'],
      ],
      match: keyword(['brot', 'brötchen', 'kuchen', 'croissant']),
      keywords: ['brot', 'brötchen', 'kuchen', 'croissant'],
      reactions: [['Gern, das ist frisch.', 'بكل سرور، هذا طازج.']],
      hint: ['Ich möchte ein Brot, bitte.', 'أريد خبزاً، من فضلك.'],
    }),
    step({
      id: 'quantity',
      slot: 'number',
      asks: [
        ['Wie viele möchten Sie?', 'كم تريد؟'],
        ['Wie viel Brot brauchen Sie?', 'كم من الخبز تحتاج؟'],
        ['Ein Brot oder zwei?', 'خبز واحد أم اثنان؟'],
      ],
      reasks: [
        ['Wie viele Stück, bitte?', 'كم قطعة، من فضلك؟'],
        ['Wie viel, bitte?', 'كم، من فضلك؟'],
      ],
      match: NUMBER,
      reactions: [['Gut, {number}.', 'حسناً، {number}.']],
      hint: ['Zwei Brötchen, bitte.', 'قطعتا خبز صغيرتان، من فضلك.'],
    }),
    step({
      id: 'pay',
      asks: [
        ['Das macht zwei Euro. Möchten Sie bar zahlen?', 'المجموع يوروان. هل تريد الدفع نقداً؟'],
        ['Zwei Euro, bitte. Bar oder mit Karte?', 'يوروان، من فضلك. نقداً أم بالبطاقة؟'],
        ['Sind zwei Euro in Ordnung?', 'هل يوروان مناسب؟'],
      ],
      reasks: [
        ['Bar oder mit Karte?', 'نقداً أم بالبطاقة؟'],
        ['Wie möchten Sie bezahlen?', 'كيف تريد أن تدفع؟'],
      ],
      match: keyword(['bar', 'karte', 'ja', 'gern']),
      keywords: ['bar', 'karte'],
      reactions: [['Danke, guten Appetit!', 'شكراً، بالهناء والشفاء!']],
      hint: ['Bar, bitte.', 'نقداً، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const supermarketCheckout = script(
  'supermarket_checkout',
  'A1',
  { name: 'Herr Özdemir', role: 'cashier', gender: 'male', personality: 'عملي وسريع، يشرح كل خطوة' },
  'تمرّ من الصندوق: كيس، دفع، إيصال، ثم تنصرف.',
  [
    step({
      id: 'bag',
      asks: [
        ['Hallo! Haben Sie eine Tasche?', 'مرحباً! هل لديك كيس؟'],
        ['Guten Tag! Brauchen Sie eine Tüte?', 'نهارك سعيد! هل تحتاج كيساً؟'],
        ['Möchten Sie eine Tasche?', 'هل تريد كيساً؟'],
      ],
      reasks: [
        ['Brauchen Sie eine Tüte, ja oder nein?', 'هل تحتاج كيساً، نعم أم لا؟'],
        ['Möchten Sie eine Tasche kaufen?', 'هل تريد شراء كيس؟'],
      ],
      match: YESNO,
      reactions: [['Alles klar.', 'حسناً.']],
      hint: ['Nein, danke. Ich habe eine Tasche.', 'لا، شكراً. لديّ كيس.'],
    }),
    step({
      id: 'payment',
      asks: [
        ['Wie möchten Sie bezahlen?', 'كيف تريد أن تدفع؟'],
        ['Bar oder mit Karte?', 'نقداً أم بالبطاقة؟'],
        ['Zahlen Sie mit Karte?', 'هل تدفع بالبطاقة؟'],
      ],
      reasks: [
        ['Bar oder Karte, bitte?', 'نقداً أم بطاقة، من فضلك؟'],
        ['Welche Zahlungsart möchten Sie?', 'أي طريقة دفع تريد؟'],
      ],
      match: keyword(['bar', 'karte', 'bargeld']),
      keywords: ['bar', 'karte'],
      reactions: [['Danke, einen Moment bitte.', 'شكراً، لحظة من فضلك.']],
      hint: ['Mit Karte, bitte.', 'بالبطاقة، من فضلك.'],
    }),
    step({
      id: 'receipt',
      asks: [
        ['Möchten Sie den Kassenzettel?', 'هل تريد الإيصال؟'],
        ['Brauchen Sie den Beleg?', 'هل تحتاج الإيصال؟'],
        ['Soll ich den Kassenzettel ausdrucken?', 'هل أطبع الإيصال؟'],
      ],
      reasks: [
        ['Möchten Sie einen Beleg, ja oder nein?', 'هل تريد إيصالاً، نعم أم لا؟'],
        ['Brauchen Sie den Kassenzettel?', 'هل تحتاج الإيصال؟'],
      ],
      match: YESNO,
      reactions: [['Hier bitte, schönen Tag!', 'تفضّل، يوماً جميلاً!']],
      hint: ['Nein, danke.', 'لا، شكراً.'],
    }),
    step(GOODBYE),
  ],
);

const restaurantBesonders = script(
  'restaurant_besonders',
  'A1',
  { name: 'Herr Lang', role: 'waiter', gender: 'male', personality: 'مهذّب، يقترح الأطباق بهدوء' },
  'تطلب طبقاً ومشروباً وتدفع ثم تنصرف.',
  [
    step({
      id: 'dish',
      slot: 'item',
      asks: [
        ['Hallo! Möchten Sie bestellen?', 'مرحباً! هل تريد أن تطلب؟'],
        ['Guten Abend! Was möchten Sie bestellen?', 'مساء الخير! ماذا تريد أن تطلب؟'],
        ['Haben Sie schon gewählt?', 'هل اخترت بالفعل؟'],
      ],
      reasks: [
        ['Welches Gericht möchten Sie?', 'أي طبق تريد؟'],
        ['Was darf ich Ihnen bringen?', 'ماذا أحضر لك؟'],
      ],
      match: keyword(['schnitzel', 'suppe', 'salat', 'pasta', 'fisch', 'fleisch', 'hähnchen']),
      keywords: ['schnitzel', 'suppe', 'salat', 'pasta', 'fisch', 'fleisch'],
      reactions: [['Gute Wahl!', 'اختيار جيد!']],
      hint: ['Ich möchte die Suppe, bitte.', 'أريد الحساء، من فضلك.'],
    }),
    step({
      id: 'drink',
      asks: [
        ['Möchten Sie etwas trinken?', 'هل تريد أن تشرب شيئاً؟'],
        ['Was möchten Sie trinken?', 'ماذا تريد أن تشرب؟'],
        ['Ein Getränk dazu?', 'مشروب معه؟'],
      ],
      reasks: [
        ['Welches Getränk möchten Sie?', 'أي مشروب تريد؟'],
        ['Wasser, Saft oder etwas anderes?', 'ماء، عصير أم شيء آخر؟'],
      ],
      match: keyword(['wasser', 'saft', 'bier', 'wein', 'cola', 'tee']),
      keywords: ['wasser', 'saft', 'bier', 'wein', 'cola', 'tee'],
      reactions: [['Kommt sofort.', 'يأتي فوراً.']],
      hint: ['Ein Wasser, bitte.', 'ماء، من فضلك.'],
    }),
    step({
      id: 'pay',
      asks: [
        ['Möchten Sie bezahlen?', 'هل تريد أن تدفع؟'],
        ['Zusammen oder getrennt?', 'معاً أم منفصلين؟'],
        ['Möchten Sie mit Karte zahlen?', 'هل تريد الدفع بالبطاقة؟'],
      ],
      reasks: [
        ['Wie möchten Sie bezahlen?', 'كيف تريد أن تدفع؟'],
        ['Bar oder mit Karte?', 'نقداً أم بالبطاقة؟'],
      ],
      match: keyword(['zusammen', 'getrennt', 'karte', 'bar', 'bezahlen']),
      keywords: ['zusammen', 'getrennt', 'karte', 'bar'],
      reactions: [['Gern, ich komme gleich.', 'بكل سرور، آتي حالاً.']],
      hint: ['Zusammen, mit Karte, bitte.', 'معاً، بالبطاقة، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

/* ── Unit 2 — from the embassy to Germany ───────────────────────────────── */

const embassyAppointment = script(
  'embassy_appointment',
  'A1',
  { name: 'Frau Sahin', role: 'official', gender: 'female', personality: 'رسمية لكن لطيفة، تسأل خطوة بخطوة' },
  'تحجز موعداً في السفارة وتوضّح سبب الزيارة والوثائق.',
  [
    step({
      id: 'purpose',
      asks: [
        ['Hallo! Was ist Ihr Anliegen?', 'مرحباً! ما سبب زيارتك؟'],
        ['Guten Tag! Wie kann ich Ihnen helfen?', 'نهارك سعيد! كيف أساعدك؟'],
        ['Was möchten Sie beantragen?', 'ماذا تريد أن تقدّم؟'],
      ],
      reasks: [
        ['Was ist der Grund Ihres Besuchs?', 'ما سبب زيارتك؟'],
        ['Wofür brauchen Sie einen Termin?', 'لأي شيء تحتاج موعداً؟'],
      ],
      match: keyword(['visum', 'pass', 'termin', 'antrag', 'dokument']),
      keywords: ['visum', 'pass', 'termin', 'antrag', 'dokument'],
      reactions: [['Verstanden, danke.', 'فهمت، شكراً.']],
      hint: ['Ich brauche einen Termin für ein Visum.', 'أحتاج موعداً من أجل تأشيرة.'],
    }),
    step({
      id: 'documents',
      asks: [
        ['Haben Sie Ihre Dokumente dabei?', 'هل لديك وثائقك معك؟'],
        ['Welche Unterlagen haben Sie?', 'أي وثائق لديك؟'],
        ['Haben Sie Ihren Pass und ein Foto?', 'هل لديك جواز سفرك وصورة؟'],
      ],
      reasks: [
        ['Welche Dokumente können Sie zeigen?', 'أي وثائق يمكنك أن تُظهر؟'],
        ['Haben Sie einen Pass dabei?', 'هل لديك جواز سفر معك؟'],
      ],
      match: keyword(['pass', 'foto', 'formular', 'unterlagen', 'dokument']),
      keywords: ['pass', 'foto', 'formular', 'unterlagen'],
      reactions: [['Danke, das ist vollständig.', 'شكراً، هذا مكتمل.']],
      hint: ['Ja, hier ist mein Pass.', 'نعم، هذا جواز سفري.'],
    }),
    step({
      id: 'date',
      asks: [
        ['Wann haben Sie Zeit?', 'متى لديك وقت؟'],
        ['Welcher Tag passt Ihnen?', 'أي يوم يناسبك؟'],
        ['Möchten Sie einen Termin am Montag?', 'هل تريد موعداً يوم الاثنين؟'],
      ],
      reasks: [
        ['An welchem Tag möchten Sie kommen?', 'في أي يوم تريد أن تأتي؟'],
        ['Welches Datum passt Ihnen?', 'أي تاريخ يناسبك؟'],
      ],
      match: keyword(['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'morgen', 'heute']),
      keywords: ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'],
      reactions: [['Gut, ich notiere das.', 'حسناً، سأسجّل ذلك.']],
      hint: ['Am Montag, bitte.', 'يوم الاثنين، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const passUndDokumente = script(
  'pass_und_dokumente',
  'A1',
  { name: 'Herr Bauer', role: 'official', gender: 'male', personality: 'دقيق في الوثائق، يشرح ما ينقص' },
  'تُظهر جوازك ووثائقك وتتأكد مما ينقص.',
  [
    step({
      id: 'pass',
      asks: [
        ['Hallo! Haben Sie Ihren Pass?', 'مرحباً! هل لديك جواز سفرك؟'],
        ['Guten Tag! Können Sie mir Ihren Pass zeigen?', 'نهارك سعيد! هل يمكنك أن تُظهر جواز سفرك؟'],
        ['Ist das Ihr Pass?', 'هل هذا جواز سفرك؟'],
      ],
      reasks: [
        ['Haben Sie einen Reisepass dabei?', 'هل لديك جواز سفر معك؟'],
        ['Können Sie Ihren Pass zeigen?', 'هل يمكنك أن تُظهر جوازك؟'],
      ],
      match: YESNO,
      reactions: [['Danke, das ist in Ordnung.', 'شكراً، هذا سليم.']],
      hint: ['Ja, hier ist mein Pass.', 'نعم، هذا جواز سفري.'],
    }),
    step({
      id: 'more',
      asks: [
        ['Welche Dokumente haben Sie noch?', 'أي وثائق أخرى لديك؟'],
        ['Haben Sie eine Anmeldung oder ein Foto?', 'هل لديك إثبات سكن أو صورة؟'],
        ['Brauchen Sie noch ein Dokument?', 'هل تحتاج وثيقة أخرى؟'],
      ],
      reasks: [
        ['Welche Unterlagen fehlen Ihnen?', 'أي وثائق تنقصك؟'],
        ['Haben Sie noch andere Papiere?', 'هل لديك أوراق أخرى؟'],
      ],
      match: keyword(['anmeldung', 'foto', 'geburtsurkunde', 'ausweis', 'formular']),
      keywords: ['anmeldung', 'foto', 'geburtsurkunde', 'ausweis'],
      reactions: [['Gut, ich sehe es mir an.', 'حسناً، سأطّلع عليه.']],
      hint: ['Ich habe eine Anmeldung.', 'لديّ إثبات سكن.'],
    }),
    step({
      id: 'copies',
      asks: [
        ['Brauchen Sie Kopien?', 'هل تحتاج نسخاً؟'],
        ['Möchten Sie eine Kopie?', 'هل تريد نسخة؟'],
        ['Soll ich eine Kopie machen?', 'هل أصنع نسخة؟'],
      ],
      reasks: [
        ['Möchten Sie Kopien, ja oder nein?', 'هل تريد نسخاً، نعم أم لا؟'],
        ['Brauchen Sie eine Kopie?', 'هل تحتاج نسخة؟'],
      ],
      match: YESNO,
      reactions: [['Alles klar.', 'حسناً.']],
      hint: ['Ja, zwei Kopien, bitte.', 'نعم، نسختان، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const airportArrival = script(
  'airport_arrival',
  'A1',
  { name: 'Herr Novak', role: 'guard', gender: 'male', personality: 'هادئ ومحترف، سؤاله واحد واضح' },
  'تمرّ من مراقبة الجوازات وتوضّح رحلتك وسبب الزيارة.',
  [
    step({
      id: 'suitcase',
      asks: [
        ['Guten Tag. Fehlt Ihr Koffer?', 'نهارك سعيد. هل ينقصك حقيبتك؟'],
        ['Hallo! Ist das Ihr Koffer?', 'مرحباً! هل هذه حقيبتك؟'],
        ['Guten Tag! Gehört dieser Koffer Ihnen?', 'نهارك سعيد! هل هذه الحقيبة لك؟'],
      ],
      reasks: [
        ['Ist der Koffer Ihrer?', 'هل الحقيبة لك؟'],
        ['Gehört das Gepäck Ihnen?', 'هل الأمتعة لك؟'],
      ],
      match: YESNO,
      reactions: [['Danke.', 'شكراً.']],
      hint: ['Ja, das ist mein Koffer.', 'نعم، هذه حقيبتي.'],
    }),
    step({
      id: 'flight',
      slot: 'number',
      asks: [
        ['Wie lautet Ihre Flugnummer?', 'ما رقم رحلتك؟'],
        ['Welche Flugnummer haben Sie?', 'أي رقم رحلة لديك؟'],
        ['Aus welchem Flug kommen Sie?', 'من أي رحلة أتيت؟'],
      ],
      reasks: [
        ['Wie lautet die Flugnummer, bitte?', 'ما رقم الرحلة، من فضلك؟'],
        ['Können Sie mir die Flugnummer sagen?', 'هل يمكنك أن تخبرني برقم الرحلة؟'],
      ],
      match: NUMBER,
      reactions: [['Danke, {number}.', 'شكراً، {number}.']],
      hint: ['Meine Flugnummer ist ___.', 'رقم رحلتي هو ___.'],
    }),
    step({
      id: 'purpose',
      asks: [
        ['Was ist der Grund Ihrer Reise?', 'ما سبب سفرك؟'],
        ['Warum kommen Sie nach Deutschland?', 'لماذا تأتي إلى ألمانيا؟'],
        ['Sind Sie hier im Urlaub?', 'هل أنت هنا في عطلة؟'],
      ],
      reasks: [
        ['Was machen Sie in Deutschland?', 'ماذا تفعل في ألمانيا؟'],
        ['Reisen Sie zum Arbeiten oder zum Studieren?', 'هل تسافر للعمل أم للدراسة؟'],
      ],
      match: keyword(['urlaub', 'arbeit', 'studium', 'besuch', 'familie', 'arbeit']),
      keywords: ['urlaub', 'arbeit', 'studium', 'besuch', 'familie'],
      reactions: [['Verstehe, danke.', 'فهمت، شكراً.']],
      hint: ['Ich bin hier im Urlaub.', 'أنا هنا في عطلة.'],
    }),
    step(GOODBYE),
  ],
);

const trainStation = script(
  'train_station',
  'A1',
  { name: 'Frau Krüger', role: 'clerk', gender: 'female', personality: 'منظّمة، تعطي الخيارات بسرعة' },
  'تشتري تذكرة قطار: الوجهة، الوقت، ونوع التذكرة.',
  [
    step({
      id: 'destination',
      slot: 'city',
      asks: [
        ['Hallo! Wohin möchten Sie?', 'مرحباً! إلى أين تريد؟'],
        ['Guten Tag! Wohin fahren Sie?', 'نهارك سعيد! إلى أين تسافر؟'],
        ['Welches Ziel haben Sie?', 'ما وجهتك؟'],
      ],
      reasks: [
        ['Zu welchem Bahnhof möchten Sie?', 'إلى أي محطة تريد؟'],
        ['Wohin soll die Reise gehen?', 'إلى أين الرحلة؟'],
      ],
      match: { type: 'city' },
      reactions: [['Nach {city}, gut.', 'إلى {city}، حسناً.']],
      hint: ['Ich möchte nach ___.', 'أريد الذهاب إلى ___.'],
    }),
    step({
      id: 'time',
      slot: 'number',
      asks: [
        ['Wann möchten Sie fahren?', 'متى تريد أن تسافر؟'],
        ['Um welche Uhrzeit?', 'في أي ساعة؟'],
        ['Möchten Sie jetzt fahren?', 'هل تريد السفر الآن؟'],
      ],
      reasks: [
        ['Zu welcher Uhrzeit, bitte?', 'في أي ساعة، من فضلك؟'],
        ['Wann soll der Zug fahren?', 'متى يجب أن ينطلق القطار؟'],
      ],
      match: NUMBER,
      reactions: [['Es gibt einen Zug um {number} Uhr.', 'هناك قطار في الساعة {number}.']],
      hint: ['Um acht Uhr, bitte.', 'في الساعة الثامنة، من فضلك.'],
    }),
    step({
      id: 'ticket',
      asks: [
        ['Einfach oder hin und zurück?', 'ذهاب فقط أم ذهاب وعودة؟'],
        ['Möchten Sie eine Rückfahrkarte?', 'هل تريد تذكرة عودة؟'],
        ['Brauchen Sie nur eine einfache Fahrt?', 'هل تحتاج تذكرة ذهاب فقط؟'],
      ],
      reasks: [
        ['Einfach oder zurück, bitte?', 'ذهاب أم عودة، من فضلك؟'],
        ['Welche Fahrkarte möchten Sie?', 'أي تذكرة تريد؟'],
      ],
      match: keyword(['einfach', 'zurück', 'hin', 'rückfahrt']),
      keywords: ['einfach', 'zurück', 'hin'],
      reactions: [['Gut, das macht zwölf Euro.', 'حسناً، هذا اثنا عشر يورو.']],
      hint: ['Hin und zurück, bitte.', 'ذهاب وعودة، من فضلك.'],
    }),
    step(GOODBYE),
  ],
);

const trainFirstRide = script(
  'train_first_ride',
  'A1',
  { name: 'Herr Peters', role: 'conductor', gender: 'male', personality: 'ودود، يتحقق من التذاكر بهدوء' },
  'تجد مقعداً وتُظهر تذكرتك وتؤكّد وجهتك.',
  [
    step({
      id: 'seat',
      asks: [
        ['Hallo! Möchten Sie sitzen?', 'مرحباً! هل تريد الجلوس؟'],
        ['Guten Tag! Ist dieser Platz frei?', 'نهارك سعيد! هل هذا المقعد فارغ؟'],
        ['Suchen Sie einen Platz?', 'هل تبحث عن مقعد؟'],
      ],
      reasks: [
        ['Möchten Sie hier sitzen?', 'هل تريد الجلوس هنا؟'],
        ['Ist der Platz für Sie?', 'هل المقعد لك؟'],
      ],
      match: YESNO,
      reactions: [['Bitte, setzen Sie sich.', 'تفضّل، اجلس.']],
      hint: ['Ja, danke.', 'نعم، شكراً.'],
    }),
    step({
      id: 'ticket',
      asks: [
        ['Haben Sie eine Fahrkarte?', 'هل لديك تذكرة؟'],
        ['Können Sie mir bitte Ihre Fahrkarte zeigen?', 'هل يمكنك أن تُظهر تذكرتك من فضلك؟'],
        ['Ist die Fahrkarte für diese Strecke?', 'هل التذكرة لهذا الخط؟'],
      ],
      reasks: [
        ['Haben Sie eine Fahrkarte dabei?', 'هل لديك تذكرة معك؟'],
        ['Können Sie die Fahrkarte zeigen?', 'هل يمكنك إظهار التذكرة؟'],
      ],
      match: YESNO,
      reactions: [['Danke, alles gut.', 'شكراً، كل شيء جيد.']],
      hint: ['Ja, hier ist meine Fahrkarte.', 'نعم، هذه تذكرتي.'],
    }),
    step({
      id: 'destination',
      slot: 'city',
      asks: [
        ['Wohin fahren Sie?', 'إلى أين تسافر؟'],
        ['Was ist Ihr Ziel?', 'ما وجهتك؟'],
        ['Steigen Sie in Berlin aus?', 'هل تنزل في برلين؟'],
      ],
      reasks: [
        ['Zu welchem Bahnhof fahren Sie?', 'إلى أي محطة تسافر؟'],
        ['Wo möchten Sie aussteigen?', 'أين تريد أن تنزل؟'],
      ],
      match: { type: 'city' },
      reactions: [['Nach {city}! Gute Reise.', 'إلى {city}! رحلة سعيدة.']],
      hint: ['Ich fahre nach ___.', 'أسافر إلى ___.'],
    }),
    step(GOODBYE),
  ],
);

export const PILOT_SCRIPTS: readonly ScenarioScript[] = [
  firstGreetings,
  numbersAndPrices,
  cafeOrder,
  bakeryShopping,
  supermarketCheckout,
  restaurantBesonders,
  embassyAppointment,
  passUndDokumente,
  airportArrival,
  trainStation,
  trainFirstRide,
];
