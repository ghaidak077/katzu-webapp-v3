/**
 * B3 roster gate (docs/agent/CONTENT-GATE.md + the final B3 decisions).
 *
 * Asserts, over the whole scenario roster (module drafts + offline fixtures):
 *   - every scenario has 4 opener levels (a1..b2);
 *   - 6–10 starter phrases per scenario, contiguous sort_order;
 *   - the scenario's topic pool holds 15–40 vocabulary rows;
 *   - every pool word appears in a phrase or opener (no isolated vocabulary);
 *   - every scenario maps to >= 1 real grammar row via SCENARIO_GRAMMAR_IDS
 *     (the code-level scenario→grammar link — there is no schema column);
 *   - fixtures use the Sie register everywhere except friend_catchup (du);
 *   - no opener makes a certain claim about German bureaucracy, fees or rules.
 *
 * The additive seed layer is exercised against fake-indexeddb: it must add only
 * missing rows (ids >= 2000) and never overwrite an existing row, even when the
 * existing row came from a simulated "D1 row" seeded first.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SCENARIO_GRAMMAR_IDS } from '@/lib/content/scenarioGrammar';
import { SCENARIO_CATEGORY_TO_TOPIC } from '@/lib/utils/scenarioVocab';

type Row = Record<string, unknown>;

const moduleFiles: { file: string; label: string }[] = [
  { file: 'docs/content/curriculum-30day-module1.json', label: 'module1' },
  { file: 'docs/content/curriculum-arrival-module2.json', label: 'module2' },
];

interface Scenario {
  id: string;
  title_de: string;
  title_ar: string;
  ai_persona: string;
  category: string;
  initial_message_a1: string;
  initial_message_a2: string;
  initial_message_b1: string;
  initial_message_b2: string;
}

interface Draft {
  scenarios: Scenario[];
  vocabulary: Row[];
  starter_phrases: Row[];
  grammar: Row[];
}

function loadDraft(file: string): Draft {
  return JSON.parse(readFileSync(path.resolve(file), 'utf8')) as Draft;
}

const drafts = moduleFiles.map((entry) => ({ ...entry, draft: loadDraft(entry.file) }));
const allScenarios: { scenario: Scenario; source: string }[] = drafts.flatMap((entry) =>
  entry.draft.scenarios.map((s) => ({ scenario: s, source: entry.label })),
);

// The offline fixture openers (src/lib/db/katzuDb.ts), asserted for register and
// claim safety. Kept as literals on purpose: a fixture edit that breaks register
// should fail here, not silently pass.
const FIXTURE_OPENERS: Record<string, string[]> = {
  cafe_order: [
    'Hallo! Willkommen im Katzu Café. Was möchten Sie trinken?',
    'Guten Tag! Schön, dass Sie da sind. Möchten Sie die Getränkekarte sehen oder wissen Sie schon, was Sie möchten?',
    'Hallo! Schönen Nachmittag. Wir haben heute frischen Apfelkuchen und tolle Kaffeespezialitäten. Darf ich Ihnen schon etwas bringen?',
    'Herzlich willkommen! Nehmen Sie gerne Platz. Kann ich Ihnen vielleicht eine Empfehlung aus unserer Spezialitätenröstung aussprechen?',
  ],
  landlord_followup: [
    'Guten Tag. Was kann ich für Sie tun?',
    'Guten Tag. Haben Sie einen Termin, oder geht es um etwas Dringendes?',
    'Guten Tag. Sie haben gesagt, die Heizung ist kaputt? Dann schauen wir, wann ich vorbeikommen kann.',
    'Guten Tag. Zu Ihrer Frage zum Mietvertrag und zur Kaution: Am besten lesen wir die Stelle gemeinsam durch. Wann passt es Ihnen?',
  ],
  friend_catchup: [
    'Hallo! Schön, dich zu sehen!',
    'Na, wie geht es dir? Erzähl mal!',
    'Was machst du am Wochenende? Hast du Zeit für einen Kaffee?',
    'Lass uns zusammen essen gehen. Wie wäre es, wenn wir uns morgen treffen?',
  ],
};

const BUREAUCRATIC_CLAIM_PATTERNS: RegExp[] = [
  /ist in Deutschland Pflicht/i,
  /muss man .* innerhalb/i,
  /beträgt .* Euro/i,
  /drei Monatsmieten/i,
  /drei Nettokaltmieten/i,
  /sechs Monate(?!n)/i,
  /versicherungspflichtig/i,
  /innerhalb von \d+ (Tagen|Wochen)/i,
  /kauf(en|t) automatisch/i,
];

const wordsFor = (draft: Draft, topic: string) => draft.vocabulary.filter((v) => v.topic === topic);
const phrasesFor = (draft: Draft, scenarioId: string) =>
  draft.starter_phrases.filter((p) => p.scenario_id === scenarioId);

describe('arrival roster gate (module drafts)', () => {
  it('module drafts parse and hold 5–8 scenarios', () => {
    expect(allScenarios.length).toBeGreaterThanOrEqual(5);
    const ids = allScenarios.map((entry) => entry.scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(allScenarios.map((e) => [e.scenario.id, e.scenario, e.source] as const))(
    '%s: 4 openers, 6–10 phrases, pool in range, grammar link',
    (id, scenario, source) => {
      // The draft that owns this scenario: both module drafts are gated, so the
      // assertions can never be satisfied by the other module's rows.
      const draft = drafts.find((entry) => entry.label === source)!.draft;

      // 4 opener levels
      for (const key of ['initial_message_a1', 'initial_message_a2', 'initial_message_b1', 'initial_message_b2'] as const) {
        expect(typeof scenario[key]).toBe('string');
        expect((scenario[key] as string).trim().length).toBeGreaterThan(0);
      }

      // category resolves to a topic that has a pool
      const topic = SCENARIO_CATEGORY_TO_TOPIC[scenario.category];
      expect(topic, `${id}: category ${scenario.category} must resolve`).toBeTruthy();
      const pool = wordsFor(draft, topic);
      expect(pool.length).toBeGreaterThanOrEqual(15);
      expect(pool.length).toBeLessThanOrEqual(40);

      // 6–10 phrases, contiguous sort_order, every pool word covered
      const phrases = phrasesFor(draft, id);
      expect(phrases.length).toBeGreaterThanOrEqual(6);
      expect(phrases.length).toBeLessThanOrEqual(10);
      const orders = phrases.map((p) => p.sort_order as number).sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, i) => i + 1));

      // >= 1 grammar row per scenario, via the code-level map

      // >= 1 grammar row per scenario, via the code-level map
      const grammarIds = SCENARIO_GRAMMAR_IDS[id];
      expect(Array.isArray(grammarIds)).toBe(true);
      expect(grammarIds!.length).toBeGreaterThanOrEqual(1);
      const draftGrammarIds = new Set(draft.grammar.map((g) => g.id));
      for (const gid of grammarIds!) {
        expect(draftGrammarIds.has(gid), `grammar id ${gid} must exist in the draft`).toBe(true);
      }

      // register: Sie everywhere except the friend scenario
      const allOpeners = (['initial_message_a1', 'initial_message_a2', 'initial_message_b1', 'initial_message_b2'] as const)
        .map((k) => scenario[k] as string)
        .join(' ');
      if (id === 'friend_catchup') {
        expect(allOpeners).not.toMatch(/\bSie\b/);
      } else {
        expect(allOpeners).not.toMatch(/\bdich\b|\bdir\b|\bdu\b/);
      }

      // no certain bureaucracy claims
      for (const pattern of BUREAUCRATIC_CLAIM_PATTERNS) {
        expect(allOpeners).not.toMatch(pattern);
      }
    },
  );

  it.each(drafts.map((d) => [d.label, d.draft] as const))(
    '%s: no isolated vocabulary — every pool word appears in some phrase or opener of its topic',
    (_label, draft) => {
    // The pool is shared per topic (airport+station share travel, bakery+friend
    // share food), so the roadmap rule is topic-level: each word must have a
    // natural home in at least one phrase or opener of any scenario reading
    // that pool — never only inside a quiz.
    const scenariosByTopic = new Map<string, Scenario[]>();
    for (const scenario of draft.scenarios) {
      const topic = SCENARIO_CATEGORY_TO_TOPIC[scenario.category];
      scenariosByTopic.set(topic, [...(scenariosByTopic.get(topic) ?? []), scenario]);
    }
    for (const [topic, scenarios] of scenariosByTopic) {
      const coverage = [
        ...draft.starter_phrases
          .filter((p) => scenarios.some((s) => s.id === p.scenario_id))
          .map((p) => String(p.german)),
        ...scenarios.flatMap((s) =>
          (['initial_message_a1', 'initial_message_a2', 'initial_message_b1', 'initial_message_b2'] as const).map(
            (k) => s[k] as string,
          ),
        ),
      ]
        .join(' \n ')
        .toLowerCase();
      for (const word of wordsFor(draft, topic)) {
        const headword = String(word.german).replace(/^(der|die|das)\s+/, '').toLowerCase();
        // Exact form or an inflected one (kosten → kostet, tropfen → tropft):
        // the stem without the final -en/-n/-t must appear either way.
        const stem = headword.length > 5 ? headword.slice(0, -2) : headword;
        const covered = coverage.includes(headword) || coverage.includes(stem);
        expect(covered, `pool word "${word.german}" appears in no phrase or opener`).toBe(true);
      }
    }
  });

  it('fixture opener copies stay in register and claim-safe (fixtures mirror module2)', () => {
    // The additive top-up fixtures must match the module2 openers verbatim so the
    // two content sources cannot drift apart.
    const draft = loadDraft('docs/content/curriculum-arrival-module2.json');
    for (const s of draft.scenarios) {
      const fixture = FIXTURE_OPENERS[s.id];
      if (!fixture) continue;
      expect(fixture).toEqual([
        s.initial_message_a1,
        s.initial_message_a2,
        s.initial_message_b1,
        s.initial_message_b2,
      ]);
    }
  });
});

// --- additive seed layer ----------------------------------------------------

describe('additive seed layer (ids >= 2000, never overwrites)', () => {
  it('adds the two new scenarios, phrases and vocab on a fresh database', async () => {
    const { seedArrivalTopUps, db } = await import('@/lib/db/katzuDb');
    await seedArrivalTopUps();

    const landlord = await db.scenarios.get('landlord_followup');
    const friend = await db.scenarios.get('friend_catchup');
    expect(landlord?.ai_persona).toBe('Vermieter katze');
    expect(friend?.ai_persona).toBe('Freundin katze');

    const phrases = await db.starter_phrases.where('scenario_id').equals('landlord_followup').toArray();
    expect(phrases.length).toBe(6);
    const friendPhrases = await db.starter_phrases.where('scenario_id').equals('friend_catchup').toArray();
    expect(friendPhrases.length).toBe(6);

    const topupVocab = await db.vocabulary.where('id').between(2000, 2999).toArray();
    expect(topupVocab.length).toBe(16);
  });

  it('never overwrites an existing row, even one simulating a D1-authoritative row', async () => {
    const { seedArrivalTopUps, db } = await import('@/lib/db/katzuDb');
    await seedArrivalTopUps();

    // Simulate a D1 row that arrived earlier with the same id but different text.
    const d1Copy = {
      id: 'landlord_followup',
      title_de: 'D1 Original',
      title_ar: 'أصلي',
      ai_persona: 'Vermieter katze',
      category: 'housing',
      icon: 'home',
      initial_message_a1: 'D1 opener',
      initial_message_a2: 'D1 a2',
      initial_message_b1: 'D1 b1',
      initial_message_b2: 'D1 b2',
    };
    await db.scenarios.put(d1Copy);

    await seedArrivalTopUps();

    const after = await db.scenarios.get('landlord_followup');
    expect(after?.title_de).toBe('D1 Original');

    // Phrase ids >= 2000 are also never rewritten.
    const phrase = await db.starter_phrases.get(2001);
    expect(phrase?.german).toBe('Bei mir ist die Heizung kaputt.');
  });

  it('is idempotent: a second run writes nothing new', async () => {
    const { seedArrivalTopUps, db } = await import('@/lib/db/katzuDb');
    await seedArrivalTopUps();
    const countAfterFirst = await db.vocabulary.count();
    await seedArrivalTopUps();
    expect(await db.vocabulary.count()).toBe(countAfterFirst);
    expect(await db.scenarios.count()).toBe(2);
  });
});
